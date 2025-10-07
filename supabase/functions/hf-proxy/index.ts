import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createToolRuntime } from "./tool-runtime.ts";
import { normalizeChatContent } from "./tools/shared.ts";

const HF_TOKEN = Deno.env.get("HF_TOKEN");
if (!HF_TOKEN) {
  throw new Error("HF_TOKEN environment variable is missing. Set it via `supabase secrets set HF_TOKEN=...`");
}

const HF_API_URL = "https://api-inference.huggingface.co/models";
const HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions";

const { buildToolDefinitions, runTool } = createToolRuntime({
  hfToken: HF_TOKEN,
  hfApiUrl: HF_API_URL,
  hfKeywordModel: "smallllm/keyword-extractor"
});

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const { modelId, inputs, parameters, messages } = await req.json();
    const trimmedModelId = typeof modelId === "string" ? modelId.trim() : "";

    if (!trimmedModelId) {
      return new Response(JSON.stringify({ error: "modelId is required" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    if (Array.isArray(messages) && messages.length > 0) {
      return await forwardToRouterWithTools(trimmedModelId, messages, parameters);
    }

    if (typeof inputs === "string" && inputs.trim().length > 0) {
      return await forwardToInference(trimmedModelId, inputs, parameters);
    }

    return new Response(JSON.stringify({ error: "Either messages or inputs must be provided" }), {
      status: 400,
      headers: corsHeaders
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Unexpected server error" }), {
      status: 500,
      headers: corsHeaders
    });
  }
});

function defaultParameters(modelId: string) {
  if (modelId.startsWith("openai/gpt-oss")) {
    return {
      provider: {
        name: "openai",
        args: {
          model: "gpt-4o-mini",
          temperature: 0.7
        }
      }
    };
  }
  return {
    max_tokens: 512,
    max_new_tokens: 512,
    temperature: 0.7
  };
}

async function forwardToRouterWithTools(modelId: string, messages: unknown, parameters: unknown) {
  const normalizedMessages = normalizeMessages(messages);
  if (!normalizedMessages.length) {
    return jsonError("messages must be an array of { role, content }", 400);
  }

  const params = normalizeChatParameters(parameters, modelId);
  const tools = buildToolDefinitions();

  let conversation = [...normalizedMessages];
  const steps: Array<Record<string, unknown>> = [];

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const payload: Record<string, unknown> = {
      model: modelId,
      messages: conversation,
      tools,
      tool_choice: "auto"
    };

    if (typeof params.temperature === "number") {
      payload.temperature = params.temperature;
    }
    if (typeof params.max_tokens === "number") {
      payload.max_tokens = params.max_tokens;
    }
    const provider = (params as { provider?: unknown }).provider;
    if (provider !== undefined) {
      payload.provider = provider;
    }

    const routerResponse = await fetch(HF_ROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!routerResponse.ok) {
      const errorText = await routerResponse.text();
      return jsonError(errorText || "Router request failed", routerResponse.status);
    }

    const routerData = await routerResponse.json();
    const choice = Array.isArray(routerData?.choices) ? routerData.choices[0] : null;
    const message = choice?.message;
    if (!message) {
      return jsonError("Router returned no message", 502);
    }

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (!toolCalls.length) {
      const reply = normalizeChatContent(message.content) || "";
      return jsonSuccess({ reply, steps });
    }

    conversation.push(message);

    for (const call of toolCalls) {
      const name = call?.function?.name;
      const id = call?.id ?? crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = parseJson(call?.function?.arguments) ?? {};
      } catch (error) {
        const failure = {
          tool: name ?? "unknown",
          success: false,
          status: "failed",
          error: "Invalid JSON arguments",
          rawArguments: call?.function?.arguments ?? null
        };
        steps.push(failure);
        conversation.push({
          role: "tool",
          tool_call_id: id,
          content: JSON.stringify(failure)
        });
        continue;
      }

      try {
        steps.push({
          tool: name ?? "unknown",
          success: null,
          status: "started",
          arguments: parsedArgs
        });
        const result = await runTool(name, parsedArgs);
        steps.push({
          tool: name ?? "unknown",
          success: true,
          status: "completed",
          arguments: parsedArgs,
          result
        });
        conversation.push({
          role: "tool",
          tool_call_id: id,
          content: JSON.stringify(result)
        });
      } catch (error) {
        const failure = {
          tool: name ?? "unknown",
          success: false,
          status: "failed",
          arguments: parsedArgs,
          error: error instanceof Error ? error.message : String(error)
        };
        steps.push(failure);
        conversation.push({
          role: "tool",
          tool_call_id: id,
          content: JSON.stringify(failure)
        });
      }
    }
  }

  return jsonError("Exceeded maximum tool iterations", 504);
}

async function forwardToInference(modelId: string, inputs: string, parameters: unknown) {
  const params = normalizeGenerateParameters(parameters, modelId);
  const body: Record<string, unknown> = {
    inputs
  };

  if (params) {
    body.parameters = params;
  }

  const response = await fetch(`${HF_API_URL}/${encodeURIComponent(modelId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    return jsonError(errorText || "Upstream error", response.status);
  }

  const data = await response.text();
  return jsonSuccess({ reply: data, steps: [] });
}

function normalizeMessages(input: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return null;
      }

      const role = typeof (candidate as { role?: unknown }).role === "string" ? (candidate as { role: string }).role : "";
      const rawContent = (candidate as { content?: unknown }).content;
      const content = typeof rawContent === "string" ? rawContent : "";

      if (!role || !content) {
        return null;
      }

      return { role, content };
    })
    .filter((item): item is { role: string; content: string } => Boolean(item));
}

function normalizeChatParameters(parameters: unknown, modelId: string) {
  const defaults = defaultParameters(modelId);
  const merged = {
    ...defaults,
    ...(typeof parameters === "object" && parameters !== null ? parameters : {})
  } as Record<string, unknown>;

  if (merged.max_tokens === undefined && typeof merged.max_new_tokens === "number") {
    merged.max_tokens = merged.max_new_tokens;
  }

  if (typeof merged.temperature === "string") {
    const parsed = Number(merged.temperature);
    if (!Number.isNaN(parsed)) {
      merged.temperature = parsed;
    }
  }

  return merged;
}

function normalizeGenerateParameters(parameters: unknown, modelId: string) {
  const defaults = defaultParameters(modelId);
  const merged = {
    ...defaults,
    ...(typeof parameters === "object" && parameters !== null ? parameters : {})
  } as Record<string, unknown>;

  if (merged.max_new_tokens === undefined && typeof merged.max_tokens === "number") {
    merged.max_new_tokens = merged.max_tokens;
  }

  const result: Record<string, unknown> = {};

  if (typeof merged.max_new_tokens === "number") {
    result.max_new_tokens = merged.max_new_tokens;
  }
  if (typeof merged.temperature === "number") {
    result.temperature = merged.temperature;
  }
  const provider = (merged as { provider?: unknown }).provider;
  if (provider !== undefined) {
    result.provider = provider;
  }

  return Object.keys(result).length ? result : null;
}

function jsonSuccess(payload: Record<string, unknown>, contentType?: string | null) {
  const headers = { ...corsHeaders };
  headers["Content-Type"] = contentType ?? "application/json; charset=utf-8";
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers
  });
}

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders
  });
}

function parseJson(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}
