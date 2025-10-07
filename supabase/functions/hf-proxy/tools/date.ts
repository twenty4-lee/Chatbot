function parseDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createDateTool() {
  function execute(args: Record<string, unknown>) {
    const operation = typeof args.operation === "string" ? args.operation : "";
    const startDate = parseDate(args.start_date);
    if (!startDate) {
      throw new Error("start_date must be a valid date string");
    }

    if (operation === "difference") {
      const endDate = parseDate(args.end_date);
      if (!endDate) {
        throw new Error("end_date must be a valid date string for difference operation");
      }
      const diffMs = endDate.getTime() - startDate.getTime();
      const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
      return {
        operation: "difference",
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
        difference_in_days: days
      };
    }

    if (operation === "add") {
      const value = typeof args.value === "number" ? args.value : 0;
      const unit = typeof args.unit === "string" ? args.unit : "days";
      const result = new Date(startDate.getTime());
      if (unit === "weeks") {
        result.setDate(result.getDate() + value * 7);
      } else {
        result.setDate(result.getDate() + value);
      }
      return {
        operation: "add",
        start_date: startDate.toISOString().slice(0, 10),
        value,
        unit,
        result_date: result.toISOString().slice(0, 10)
      };
    }

    throw new Error(`Unsupported operation: ${operation}`);
  }

  const definition = {
    type: "function" as const,
    function: {
      name: "calculate_date",
      description: "날짜 차이 계산 또는 날짜 연산을 수행합니다.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["difference", "add"],
            description: "difference는 두 날짜 사이 일수 계산, add는 날짜에 기간을 더합니다."
          },
          start_date: {
            type: "string",
            description: "기준 날짜 (ISO 8601 형식 권장)",
            format: "date"
          },
          end_date: {
            type: "string",
            description: "operation이 difference인 경우 비교할 날짜",
            format: "date"
          },
          value: {
            type: "number",
            description: "기간 값 (operation이 add일 때)",
            minimum: -10000,
            maximum: 10000
          },
          unit: {
            type: "string",
            enum: ["days", "weeks"],
            description: "기간 단위 (현재 days와 weeks 지원)"
          }
        },
        required: ["operation", "start_date"],
        additionalProperties: false
      }
    }
  };

  return { definition, execute };
}
