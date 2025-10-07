const GLOSSARY: Array<{ term: string; definition: string }> = [
  { term: "LLM", definition: "대규모 언어 모델(Large Language Model)을 의미합니다." },
  { term: "Supabase", definition: "PostgreSQL 기반 백엔드 서비스를 제공하는 BaaS 플랫폼입니다." },
  { term: "Edge Function", definition: "Supabase의 서버리스 함수 실행 환경으로, Deno 런타임에서 동작합니다." }
];

export function createGlossaryTool() {
  function execute(args: Record<string, unknown>) {
    const term = typeof args.term === "string" ? args.term.trim().toLowerCase() : "";
    if (!term) {
      throw new Error("term is required for glossary lookup");
    }
    const matches = GLOSSARY.filter((entry) => entry.term.toLowerCase().includes(term));
    return {
      matches,
      count: matches.length
    };
  }

  const definition = {
    type: "function" as const,
    function: {
      name: "lookup_glossary",
      description: "사전에 정의된 용어 설명을 검색합니다.",
      parameters: {
        type: "object",
        properties: {
          term: {
            type: "string",
            description: "찾고자 하는 용어 또는 키워드"
          }
        },
        required: ["term"],
        additionalProperties: false
      }
    }
  };

  return { definition, execute };
}
