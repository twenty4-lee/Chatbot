export function createQueryTool() {
  function execute(args: Record<string, unknown>) {
    const query = typeof args.query === "string" ? args.query : "";
    return {
      status: "not_implemented",
      query,
      message: "업로드된 데이터 조회 기능은 아직 서버 저장소와 연결되어 있지 않습니다."
    };
  }

  const definition = {
    type: "function" as const,
    function: {
      name: "query_uploaded_data",
      description: "업로드된 데이터에서 정보를 조회합니다. (현재는 자리표시자입니다.)",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "조회할 키워드 또는 조건"
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  };

  return { definition, execute };
}
