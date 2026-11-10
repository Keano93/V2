import { simpleParser, type AddressObject } from "mailparser";
import { parseLooseDate } from "../time";
import { cleanText, type ParsedMessage, type ParseResult } from "./types";

/**
 * Email parsing.
 *
 * - parseEml: a raw RFC 822 .eml file. The top message comes from the real headers;
 *   any quoted reply chain in the body is split out into further messages.
 * - parsePastedEmails: text copied out of Outlook/Gmail, which may hold several
 *   emails, each introduced by a header block (From/Sent/To/Subject) or an
 *   "On <date>, <name> wrote:" line.
 */

const HEADER_KEYS = ["from", "sent", "date", "to", "cc", "bcc", "subject", "importance", "attachments"];
const HEADER_LINE_RE = new RegExp(`^\\s*(${HEADER_KEYS.join("|")})\\s*:\\s*(.*)$`, "i");
const WROTE_RE = /^\s*On (.+) wrote:\s*$/i;
const SEPARATOR_RE = /^\s*(-{2,}\s*(original message|forwarded message)\s*-{2,}|_{5,})\s*$/i;

/** Split "Tue, 6 Oct 2026 at 09:14, Aoife Kinsella <a@b.ie>" into date and sender parts. */
function splitWroteLine(inner: string): { date: string; from: string } | null {
  const parts = inner.split(", ");
  for (let k = parts.length - 1; k >= 1; k--) {
    const date = parts.slice(0, k).join(", ");
    if (parseLooseDate(date)) return { date, from: parts.slice(k).join(", ") };
  }
  return null;
}

function stripQuotePrefix(line: string): string {
  return line.replace(/^(\s*>)+ ?/, "");
}

/** Reduce "Aoife Kinsella <aoife@example.ie>" to "Aoife Kinsella"; keep bare addresses. */
export function displayName(from: string): string {
  const s = from.trim().replace(/^"|"$/g, "");
  const m = s.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/);
  if (m) return m[1].trim() || m[2].trim();
  const bracket = s.match(/^\[?([^\]]+?)\]?\s*\[mailto:[^\]]+\]$/i);
  if (bracket) return bracket[1].trim();
  return s;
}

interface Block {
  headers: Record<string, string>;
  body: string[];
  startLine: number;
}

function isHeaderBlockStart(lines: string[], i: number): boolean {
  if (!/^\s*from\s*:/i.test(stripQuotePrefix(lines[i]))) return false;
  // A "From:" line only starts an email if a Sent/Date line follows closely.
  for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
    if (/^\s*(sent|date)\s*:/i.test(stripQuotePrefix(lines[j]))) return true;
  }
  return false;
}

function splitBlocks(text: string): Block[] {
  const lines = cleanText(text).split("\n").map(stripQuotePrefix);
  const blocks: Block[] = [];
  let current: Block | null = null;
  let inHeaders = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SEPARATOR_RE.test(line)) continue;

    if (isHeaderBlockStart(lines, i)) {
      current = { headers: {}, body: [], startLine: i + 1 };
      blocks.push(current);
      inHeaders = true;
    }
    const wroteMatch = line.match(WROTE_RE);
    const wrote = wroteMatch ? splitWroteLine(wroteMatch[1]) : null;
    if (wrote) {
      current = {
        headers: { date: wrote.date, from: wrote.from },
        body: [],
        startLine: i + 1,
      };
      blocks.push(current);
      inHeaders = false;
      continue;
    }
    if (!current) {
      current = { headers: {}, body: [], startLine: i + 1 };
      blocks.push(current);
    }
    if (inHeaders) {
      const h = line.match(HEADER_LINE_RE);
      if (h) {
        current.headers[h[1].toLowerCase()] = h[2].trim();
        continue;
      }
      if (!line.trim()) {
        inHeaders = false;
        continue;
      }
      inHeaders = false; // first non-header line starts the body
    }
    current.body.push(line);
  }
  return blocks;
}

function tidyBody(lines: string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function blocksToMessages(blocks: Block[], warnings: string[], fallback?: ParsedMessage): ParsedMessage[] {
  const out: ParsedMessage[] = [];
  for (const b of blocks) {
    const body = tidyBody(b.body);
    if (!body && !b.headers.subject) continue;
    const dateStr = b.headers.sent ?? b.headers.date;
    const parsed = dateStr ? parseLooseDate(dateStr) : null;
    if (!parsed && !fallback) {
      warnings.push(
        `Email at line ${b.startLine}: could not read the date${dateStr ? ` "${dateStr}"` : ""}; skipped.`,
      );
      continue;
    }
    out.push({
      sender: b.headers.from ? displayName(b.headers.from) : (fallback?.sender ?? "Unknown sender"),
      sentAt: parsed?.date ?? fallback!.sentAt,
      timePrecision: parsed?.precision ?? "datetime",
      subject: b.headers.subject ?? fallback?.subject,
      body,
    });
  }
  return out;
}

export function looksLikePastedEmail(text: string): boolean {
  const lines = cleanText(text).split("\n");
  return lines.some((_, i) => isHeaderBlockStart(lines, i));
}

export function parsePastedEmails(text: string): ParseResult {
  const warnings: string[] = [];
  const blocks = splitBlocks(text).filter((b) => Object.keys(b.headers).length > 0 || tidyBody(b.body));
  const headerless = blocks.filter((b) => Object.keys(b.headers).length === 0);
  if (headerless.length > 0) {
    warnings.push("Some text had no email headers (From/Sent) and was skipped.");
  }
  const messages = blocksToMessages(
    blocks.filter((b) => Object.keys(b.headers).length > 0),
    warnings,
  );
  if (messages.length === 0) warnings.push("No emails found. Include the From/Sent/Subject headers when pasting.");
  return { messages, warnings };
}

function firstAddress(addr: AddressObject | AddressObject[] | undefined): string {
  const a = Array.isArray(addr) ? addr[0] : addr;
  const v = a?.value?.[0];
  if (!v) return "Unknown sender";
  return v.name || v.address || "Unknown sender";
}

export async function parseEml(raw: string | Buffer): Promise<ParseResult> {
  const warnings: string[] = [];
  const mail = await simpleParser(raw);
  const bodyText = mail.text ?? (mail.html ? String(mail.html).replace(/<[^>]+>/g, " ") : "");
  if (!mail.date) warnings.push("Email has no Date header; used the upload time.");
  const top: ParsedMessage = {
    sender: firstAddress(mail.from),
    sentAt: mail.date ?? new Date(),
    timePrecision: "datetime",
    subject: mail.subject,
    body: "",
  };

  // The body may contain the quoted history; split it the same way as pasted text.
  const blocks = splitBlocks(bodyText);
  const [first, ...rest] = blocks;
  top.body = first && Object.keys(first.headers).length === 0 ? tidyBody(first.body) : "";
  const quoted = blocksToMessages(
    first && Object.keys(first.headers).length === 0 ? rest : blocks,
    warnings,
    top,
  );
  if (quoted.length > 0) warnings.push(`${quoted.length} quoted earlier email(s) split out of the reply chain.`);
  return { messages: [top, ...quoted], warnings };
}
