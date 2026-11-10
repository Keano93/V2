import { DateTime } from "luxon";

/** All local times in this app are interpreted as Irish time. */
export const IRISH_TZ = "Europe/Dublin";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

/** Convert Irish local date/time parts to a UTC Date. Returns null if the date is invalid (e.g. 31/02). */
export function irishLocalToDate(p: LocalParts): Date | null {
  const dt = DateTime.fromObject(
    {
      year: p.year,
      month: p.month,
      day: p.day,
      hour: p.hour ?? 0,
      minute: p.minute ?? 0,
      second: p.second ?? 0,
    },
    { zone: IRISH_TZ },
  );
  return dt.isValid ? dt.toJSDate() : null;
}

export function normaliseYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/** Convert a 12-hour clock reading to 24-hour. `ampm` may be "am", "p.m.", "PM" etc. */
export function to24h(hour: number, ampm?: string | null): number {
  if (!ampm) return hour;
  const pm = /p/i.test(ampm);
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

export interface LooseDateResult {
  date: Date;
  precision: "datetime" | "date";
}

const TIME_RE = String.raw`(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?`;
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

/**
 * Parse a date string as it commonly appears in Irish emails, diaries and minutes.
 * The whole string must be a date (optionally with a time), so sentences that merely
 * contain a date are rejected. Numeric dates are read day-first (DD/MM/YYYY).
 */
export function parseLooseDate(input: string): LooseDateResult | null {
  const raw = input.trim();
  if (!raw) return null;

  // RFC 2822 ("Tue, 6 Oct 2026 09:14:00 +0100") and ISO 8601 carry their own offsets.
  const rfc = DateTime.fromRFC2822(raw);
  if (rfc.isValid) return { date: rfc.toJSDate(), precision: "datetime" };
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const iso = DateTime.fromISO(raw, { zone: IRISH_TZ });
    if (iso.isValid) {
      return { date: iso.toJSDate(), precision: raw.length > 10 ? "datetime" : "date" };
    }
  }

  const s = raw
    .toLowerCase()
    .replace(/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|nesday|rsday|urday)?\b\.?,?/g, " ")
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bat\b/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const withTime = (parts: LocalParts, m: RegExpMatchArray, offset: number): LooseDateResult | null => {
    const hasTime = m[offset] !== undefined;
    if (hasTime) {
      parts.hour = to24h(Number(m[offset]), m[offset + 3]);
      parts.minute = Number(m[offset + 1]);
      parts.second = m[offset + 2] ? Number(m[offset + 2]) : 0;
    } else {
      // Date-only entries are pinned to midday so they never slip a day across DST/UTC.
      parts.hour = 12;
    }
    const date = irishLocalToDate(parts);
    return date ? { date, precision: hasTime ? "datetime" : "date" } : null;
  };

  // 6 October 2026 [10:12]
  let m = s.match(new RegExp(`^(\\d{1,2}) (${MONTH_NAMES})\\.? (\\d{4})(?: ${TIME_RE})?$`));
  if (m) {
    return withTime({ day: Number(m[1]), month: MONTHS[m[2]], year: Number(m[3]) }, m, 4);
  }
  // October 6 2026 [10:12]
  m = s.match(new RegExp(`^(${MONTH_NAMES})\\.? (\\d{1,2}) (\\d{4})(?: ${TIME_RE})?$`));
  if (m) {
    return withTime({ day: Number(m[2]), month: MONTHS[m[1]], year: Number(m[3]) }, m, 4);
  }
  // 06/10/2026 [10:12] (day-first)
  m = s.match(new RegExp(`^(\\d{1,2})[/.\\-](\\d{1,2})[/.\\-](\\d{2,4})(?: ${TIME_RE})?$`));
  if (m) {
    return withTime(
      { day: Number(m[1]), month: Number(m[2]), year: normaliseYear(Number(m[3])) },
      m,
      4,
    );
  }
  return null;
}

/** Format a Date for display in Irish local time. */
export function formatIrish(date: Date, precision: "datetime" | "date" = "datetime"): string {
  const dt = DateTime.fromJSDate(date, { zone: IRISH_TZ });
  return precision === "date" ? dt.toFormat("ccc d LLL yyyy") : dt.toFormat("ccc d LLL yyyy, HH:mm");
}
