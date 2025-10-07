const DEFAULT_KEYWORD_MODEL = "smallllm/keyword-extractor";

export function createKeywordTool(env: { hfToken: string; hfApiUrl: string; hfKeywordModel?: string }) {
  const hfToken = env.hfToken;
  const hfApiUrl = env.hfApiUrl;
  const hfKeywordModel = env.hfKeywordModel ?? DEFAULT_KEYWORD_MODEL;

  async function execute(args: Record<string, unknown>) {
    const text = typeof args.text === "string" ? args.text : "";
    const maxKeywords = typeof args.max_keywords === "number" ? Math.min(Math.max(Math.floor(args.max_keywords), 1), 20) : 5;
    if (!text) {
      throw new Error("text is required for keyword extraction");
    }

    const response = await fetch(`${hfApiUrl}/${encodeURIComponent(hfKeywordModel)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          top_k: maxKeywords
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Keyword extractor request failed");
    }

    const data = await response.json();
    const keywords: Array<string> = Array.isArray(data)
      ? data.flatMap((entry) => {
          if (typeof entry === "string") {
            return [entry];
          }
          if (entry && typeof entry === "object" && typeof (entry as { keyword?: unknown }).keyword === "string") {
            return [(entry as { keyword: string }).keyword];
          }
          return [];
        })
      : [];

    return {
      keywords: keywords.slice(0, maxKeywords)
    };
  }

  const definition = {
    type: "function" as const,
    function: {
      name: "extract_keywords",
      description: "주어진 텍스트에서 핵심 키워드를 추출합니다.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "키워드를 추출할 대상 문장"
          },
          max_keywords: {
            type: "integer",
            description: "추출할 최대 키워드 수",
            minimum: 1,
            maximum: 20
          }
        },
        required: ["text"],
        additionalProperties: false
      }
    }
  };

  return { definition, execute };
}
