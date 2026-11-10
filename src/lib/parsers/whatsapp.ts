import { irishLocalToDate, normaliseYear, to24h } from "../time";
import { cleanText, type ParsedMessage, type ParseResult } from "./types";

/**
 * Parser for WhatsApp "Export chat" .txt files.
 *
 * Handles both export styles:
 *   Android: 06/10/2026, 09:14 - Tomás Byrne: message
 *   iOS:     [06/10/2026, 09:14:22] Tomás Byrne: message
 * plus 2-digit years, 12-hour clocks ("9:14 am"), multi-line messages,
 * system lines (joins, encryption notice) and media placeholders.
 *
 * Exports carry no timezone; times are read as Irish local time.
 * Dates are day-first unless the file proves otherwise (a first number > 12),
 * or the caller passes dateOrder: "MDY".
 */

const DATE = String.raw`(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})`;
const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([aApP]\.?\s?[mM]\.?)?`;
const ANDROID_RE = new RegExp(`^${DATE},?\\s+${TIME}\\s+[-–]\\s+([\\s\\S]*)$`);
const IOS_RE = new RegExp(`^\\[${DATE},?\\s+${TIME}\\]\\s+([\\s\\S]*)$`);

const NAME = String.raw`[A-ZÀ-ſ][\p{L}'’.-]*(?: [A-ZÀ-ſ][\p{L}'’.-]*){0,3}`;

/** System notices. In iOS exports these appear as "<group name>: <notice>". */
const SYSTEM_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /created (this )?group/i,
  /changed (the subject|this group's icon|the group description|their phone number)/i,
  /joined using this group's invite link/i,
  /^you were added/i,
  /disappearing messages/i,
  /security code (changed|with)/i,
];
/** Membership notices. Only checked for iOS exports: on Android these never have a colon. */
const IOS_MEMBERSHIP_PATTERNS = [
  new RegExp(`^${NAME} (added|removed) ${NAME}(?:(?:, | and )${NAME})*$`, "u"),
  new RegExp(`^${NAME} left$`, "u"),
];

const MEDIA_RE =
  /^(<media omitted>|<attached: [^>]+>|(image|video|audio|document|sticker|gif|contact card) omitted|.+ \(file attached\))$/i;

export interface WhatsAppOptions {
  dateOrder?: "DMY" | "MDY";
}

interface Header {
  a: number;
  b: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
  ampm?: string;
  ios: boolean;
  rest: string;
}

function matchHeader(line: string): Header | null {
  const iosMatch = line.match(IOS_RE);
  const m = iosMatch ?? line.match(ANDROID_RE);
  if (!m) return null;
  return {
    a: Number(m[1]),
    b: Number(m[2]),
    year: normaliseYear(Number(m[3])),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
    ampm: m[7],
    ios: Boolean(iosMatch),
    rest: m[8],
  };
}

export function looksLikeWhatsApp(text: string): boolean {
  const lines = cleanText(text).split("\n").slice(0, 20);
  return lines.filter((l) => matchHeader(l)).length >= 2;
}

export function parseWhatsApp(text: string, options: WhatsAppOptions = {}): ParseResult {
  const warnings: string[] = [];
  const lines = cleanText(text).split("\n");

  // First pass: group lines into raw entries (header + continuation lines).
  const entries: { header: Header; lines: string[]; lineNo: number }[] = [];
  let orphanLines = 0;
  lines.forEach((line, i) => {
    const header = matchHeader(line);
    if (header) {
      entries.push({ header, lines: [header.rest], lineNo: i + 1 });
    } else if (entries.length > 0) {
      entries[entries.length - 1].lines.push(line);
    } else if (line.trim()) {
      orphanLines++;
    }
  });
  if (orphanLines > 0) {
    warnings.push(`${orphanLines} line(s) before the first timestamp were ignored.`);
  }
  if (entries.length === 0) {
    warnings.push("No WhatsApp messages found. Is this an exported chat (.txt)?");
    return { messages: [], warnings };
  }

  // Work out date order from the evidence in the file.
  let order = options.dateOrder ?? "DMY";
  if (!options.dateOrder) {
    if (entries.some((e) => e.header.a > 12)) order = "DMY";
    else if (entries.some((e) => e.header.b > 12)) order = "MDY";
  }

  const messages: ParsedMessage[] = [];
  for (const { header, lines: entryLines, lineNo } of entries) {
    const full = entryLines.join("\n").replace(/\s+$/, "");
    const sep = full.indexOf(": ");
    // Android system lines have no "sender: " prefix; iOS ones are prefixed with the group name.
    const afterSep = full.slice(sep + 2);
    if (
      sep === -1 ||
      SYSTEM_PATTERNS.some((re) => re.test(afterSep)) ||
      (header.ios && IOS_MEMBERSHIP_PATTERNS.some((re) => re.test(afterSep)))
    ) {
      continue;
    }
    const sender = full.slice(0, sep).trim();
    let body = full.slice(sep + 2).trim();
    if (!sender || sender.length > 80) {
      continue;
    }
    if (MEDIA_RE.test(body)) body = `[Media: ${body.replace(/[<>]/g, "")}]`;

    const day = order === "DMY" ? header.a : header.b;
    const month = order === "DMY" ? header.b : header.a;
    const sentAt = irishLocalToDate({
      year: header.year,
      month,
      day,
      hour: to24h(header.hour, header.ampm),
      minute: header.minute,
      second: header.second,
    });
    if (!sentAt) {
      warnings.push(`Line ${lineNo}: invalid date ${header.a}/${header.b}/${header.year}; message skipped.`);
      continue;
    }
    messages.push({ sender, sentAt, timePrecision: "datetime", body });
  }
  return { messages, warnings };
}
