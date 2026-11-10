import { parseLooseDate, type LooseDateResult } from "../time";
import { cleanText, type ParsedMessage, type ParseResult } from "./types";

/**
 * Parser for site diaries and meeting minutes (plain text, or text extracted from a PDF).
 *
 * The document is split into dated sections. A line counts as a date heading when it is
 * (after an optional label such as "Date:" or "Site Diary –") nothing but a date.
 * Within a section each paragraph, bullet or numbered item becomes one message.
 * The author comes from a "Prepared by:" / "Minutes by:" style line, if present.
 */

const AUTHOR_RE = /^\s*(prepared by|author|recorded by|completed by|minutes by|minuted by|minute taker)\s*:\s*(.+)$/i;
const SKIP_RE =
  /^\s*(attendees|present|apologies|distribution|circulation|location|venue|project|contract|page \d+|ref(erence)?|job no\.?)\s*[:\-–]/i;
const ITEM_START_RE = /^\s*(?:[-•*▪]\s+|\d+(?:\.\d+)*[.)]?\s+|\(?[a-z]\)\s+)/i;

export interface DiaryOptions {
  kind: "diary" | "minutes";
  /** Used when the document names no author. */
  defaultAuthor?: string;
}

function asDateHeading(line: string): LooseDateResult | null {
  const t = line.trim();
  if (!t || t.length > 80) return null;
  const direct = parseLooseDate(t);
  if (direct) return direct;
  // "Date: 06/10/2026", "Site Diary – Tuesday 6 October 2026", "Meeting date: 15 Oct 2026 at 10:00"
  const m = t.match(/^[^:\-–]{1,40}[:\-–]\s*(.+)$/);
  return m ? parseLooseDate(m[1]) : null;
}

export function parseDiary(text: string, options: DiaryOptions): ParseResult {
  const warnings: string[] = [];
  const lines = cleanText(text).split("\n");

  let author: string | undefined;
  for (const line of lines) {
    const m = line.match(AUTHOR_RE);
    if (m) {
      author = m[2].trim();
      break;
    }
  }
  const title = lines.find((l) => l.trim())?.trim();
  const sender =
    author ?? options.defaultAuthor ?? (options.kind === "minutes" ? "Meeting minutes" : "Site diary");

  const messages: ParsedMessage[] = [];
  let currentDate: LooseDateResult | null = null;
  let buffer: string[] = [];
  let undatedLines = 0;

  const flush = () => {
    // Drop bullet markers ("- ", "• ") but keep numbering, which minutes refer to.
    const body = buffer.join("\n").replace(/^[-•*▪]\s+/, "").trim();
    buffer = [];
    if (!body) return;
    if (!currentDate) {
      undatedLines++;
      return;
    }
    messages.push({
      sender,
      sentAt: currentDate.date,
      timePrecision: currentDate.precision,
      subject: options.kind === "minutes" ? title : undefined,
      body,
    });
  };

  for (const line of lines) {
    const heading = asDateHeading(line);
    if (heading) {
      flush();
      currentDate = heading;
      continue;
    }
    if (AUTHOR_RE.test(line) || SKIP_RE.test(line)) {
      flush();
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (ITEM_START_RE.test(line)) flush();
    if (!currentDate) {
      // Title and preamble before the first date heading are not messages.
      continue;
    }
    buffer.push(line.trim());
  }
  flush();

  if (!messages.length) {
    warnings.push(
      "No dated entries found. Add a date heading (e.g. \"Date: 06/10/2026\") above each day's entries.",
    );
  }
  if (undatedLines > 0) warnings.push(`${undatedLines} undated paragraph(s) were skipped.`);
  return { messages, warnings };
}
