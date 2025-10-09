import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.48.0?dts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DATA_BUCKET = Deno.env.get("DATA_BUCKET") ?? Deno.env.get("DATA_BUCKET_NAME") ?? "Chatbot";
const SHEETJS_MODULE_URL = "https://cdn.sheetjs.com/xlsx-latest/xlsx.mjs";

type SheetModule = typeof import("https://cdn.sheetjs.com/xlsx-latest/xlsx.mjs");

let supabaseClient: SupabaseClient | null = null;
let sheetModulePromise: Promise<SheetModule> | null = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    },
    db: {
      schema: "public"
    }
  });
}

async function loadSheetModule() {
  if (!sheetModulePromise) {
    sheetModulePromise = import(SHEETJS_MODULE_URL);
  }
  return await sheetModulePromise;
}

function ensureSupabase() {
  if (!supabaseClient) {
    throw new Error("Supabase client is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets.");
  }
  return supabaseClient;
}

interface QueryArgs {
  entry_id?: unknown;
  user_id?: unknown;
  max_rows?: unknown;
  query?: unknown;
}

export function createQueryTool() {
  async function execute(rawArgs: Record<string, unknown>) {
    const args = rawArgs as QueryArgs;
    const entryId = typeof args.entry_id === "string" ? args.entry_id.trim() : "";
    const userId = typeof args.user_id === "string" ? args.user_id.trim() : "";
    const search = typeof args.query === "string" ? args.query.trim() : "";
    const maxRowsRaw = typeof args.max_rows === "number" ? args.max_rows : Number(args.max_rows);
    const maxRows = Number.isFinite(maxRowsRaw) && maxRowsRaw > 0 ? Math.min(Math.floor(maxRowsRaw), 200) : 20;

    if (!entryId) {
      throw new Error("entry_id must be provided to query uploaded data");
    }
    if (!userId) {
      throw new Error("user_id must be provided to ensure data isolation");
    }

    const supabase = ensureSupabase();

    const { data: entry, error: entryError } = await supabase
      .from("data_entries")
      .select("id, user_id, name, size, mime, storage_path, created_at")
      .eq("id", entryId)
      .single();

    if (entryError) {
      throw new Error(`데이터 정보를 불러오지 못했습니다: ${entryError.message}`);
    }
    if (!entry) {
      throw new Error("요청한 데이터를 찾을 수 없습니다.");
    }
    if (entry.user_id !== userId) {
      throw new Error("해당 데이터에 접근할 권한이 없습니다.");
    }

    const storagePath = entry.storage_path;
    if (!storagePath) {
      throw new Error("데이터에 연결된 파일 경로가 없습니다.");
    }

    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(DATA_BUCKET)
      .download(storagePath);

    if (downloadError) {
      throw new Error(`파일을 다운로드하지 못했습니다: ${downloadError.message}`);
    }
    if (!fileData) {
      throw new Error("파일 데이터를 읽을 수 없습니다.");
    }

    const buffer = await fileData.arrayBuffer();
    const XLSX = await loadSheetModule();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) {
      throw new Error("엑셀 파일에 시트가 없습니다.");
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const rows: Array<Array<unknown>> = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    const headerRow = rows[0] ?? [];
    const dataRows = rows.length > 0 ? rows.slice(1) : rows;
    const normalizedQuery = search.toLocaleLowerCase();
    const filteredRows = normalizedQuery
      ? dataRows.filter((row) =>
          row.some((cell) =>
            typeof cell === "string" ? cell.toLocaleLowerCase().includes(normalizedQuery) : false
          )
        )
      : dataRows;

    const limitedRows = filteredRows.slice(0, maxRows);
    const totalDataRows = dataRows.length;

    return {
      entry: {
        id: entry.id,
        name: entry.name,
        size: entry.size,
        mime: entry.mime,
        uploaded_at: entry.created_at
      },
      bucket: DATA_BUCKET,
      sheet: firstSheetName,
      total_rows: totalDataRows,
      matched_rows: filteredRows.length,
      returned_rows: limitedRows.length,
      headers: headerRow,
      rows: limitedRows,
      query: search || null
    };
  }

  const definition = {
    type: "function" as const,
    function: {
      name: "query_uploaded_data",
      description: "Supabase에 업로드된 엑셀 데이터에서 행을 조회합니다.",
      parameters: {
        type: "object",
        properties: {
          entry_id: {
            type: "string",
            description: "`data_entries.id` 값"
          },
          user_id: {
            type: "string",
            description: "현재 로그인한 사용자의 UUID"
          },
          query: {
            type: "string",
            description: "행을 필터링할 키워드. 비워두면 상위 행을 그대로 반환합니다."
          },
          max_rows: {
            type: "integer",
            description: "최대 반환 행 수 (1~200)",
            minimum: 1,
            maximum: 200
          }
        },
        required: ["entry_id", "user_id"],
        additionalProperties: false
      }
    }
  };

  return { definition, execute };
}
