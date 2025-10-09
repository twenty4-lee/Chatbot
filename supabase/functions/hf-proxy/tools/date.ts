const TIME_ZONE = "Asia/Seoul";
const HOLIDAY_ENDPOINT = "https://date.nager.at/api/v3/PublicHolidays";

const KST_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const KST_WEEKDAY_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  weekday: "long"
});

const WEEKDAY_INDEX_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "short"
});

const WEEKEND_NAMES = new Set(["토요일", "일요일"]);

interface HolidayRecord {
  date?: string;
  localName?: string;
  name?: string;
  types?: Array<string>;
}

const holidayCache = new Map<number, Array<HolidayRecord>>();

function extractKstDateParts(date: Date) {
  const parts = KST_DATE_FORMAT.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? NaN);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? NaN);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? NaN);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw new Error("Failed to format current date for Asia/Seoul");
  }
  return {
    isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    day
  };
}

function computeWeekdayInfo(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00+09:00`);
  const weekdayName = KST_WEEKDAY_FORMAT.format(date);
  const weekdayKey = WEEKDAY_INDEX_FORMAT.format(date);
  const indexMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  const weekdayIndex = indexMap[weekdayKey];
  if (typeof weekdayIndex !== "number") {
    throw new Error(`Unsupported weekday key: ${weekdayKey}`);
  }
  return {
    weekdayName,
    weekdayIndex,
    isWeekend: WEEKEND_NAMES.has(weekdayName)
  };
}

async function fetchHolidaysForYear(year: number) {
  if (holidayCache.has(year)) {
    return holidayCache.get(year)!;
  }

  const response = await fetch(`${HOLIDAY_ENDPOINT}/${year}/KR`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to fetch public holidays from date.nager.at");
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Unexpected response format from date.nager.at");
  }

  holidayCache.set(year, data as Array<HolidayRecord>);
  return holidayCache.get(year)!;
}

export function createDateTool() {
  async function execute(_args: Record<string, unknown>) {
    const now = new Date();
    const { isoDate, year, month, day } = extractKstDateParts(now);
    const { weekdayName, weekdayIndex, isWeekend } = computeWeekdayInfo(isoDate);

    try {
      const holidays = await fetchHolidaysForYear(year);
      const matches = holidays.filter((entry) => entry?.date === isoDate);
      const holidayNames = matches
        .map((entry) => entry?.localName ?? entry?.name)
        .filter((name): name is string => typeof name === "string" && name.length > 0);
      const isPublicHoliday = holidayNames.length > 0;

      return {
        source: "date.nager.at",
        time_zone: TIME_ZONE,
        iso_date: isoDate,
        year,
        month,
        day,
        weekday: weekdayName,
        weekday_index: weekdayIndex,
        is_weekend: isWeekend,
        is_public_holiday: isPublicHoliday,
        holidays: holidayNames,
        is_business_day: !isWeekend && !isPublicHoliday
      };
    } catch (error) {
      return {
        source: "local_fallback",
        time_zone: TIME_ZONE,
        iso_date: isoDate,
        year,
        month,
        day,
        weekday: weekdayName,
        weekday_index: weekdayIndex,
        is_weekend: isWeekend,
        is_public_holiday: false,
        holidays: [],
        is_business_day: !isWeekend,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const definition = {
    type: "function" as const,
    function: {
      name: "fetch_current_date",
      description: "한국 표준시 기준 오늘 날짜와 영업일 여부를 반환합니다.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  };

  return { definition, execute };
}

