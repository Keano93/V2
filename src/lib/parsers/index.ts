import { parseDiary } from "./diary";
import { looksLikePastedEmail, parseEml, parsePastedEmails } from "./email";
import { extractPdfText } from "./pdf";
import type { ParseResult, SourceKind } from "./types";
import { looksLikeWhatsApp, parseWhatsApp } from "./whatsapp";

export * from "./types";

export interface ParseInput {
  /** "auto" guesses from the file name and contents. */
  kind: SourceKind | "auto";
  filename?: string;
  text?: string;
  bytes?: Uint8Array;
  dateOrder?: "DMY" | "MDY";
}

export interface ParsedSource extends ParseResult {
  kind: SourceKind;
  rawText: string;
}

export function guessKind(filename: string | undefined, text: string): SourceKind {
  const name = (filename ?? "").toLowerCase();
  if (name.endsWith(".eml")) return "email";
  if (looksLikeWhatsApp(text)) return "whatsapp";
  if (looksLikePastedEmail(text)) return "email";
  if (/minute|meeting/.test(name) || /^\s*(minutes of|meeting (no|number|minutes))/im.test(text.slice(0, 500))) {
    return "minutes";
  }
  return "diary";
}

export async function parseSource(input: ParseInput): Promise<ParsedSource> {
  const name = (input.filename ?? "").toLowerCase();
  let text = input.text ?? "";
  if (!text && input.bytes) {
    text = name.endsWith(".pdf")
      ? await extractPdfText(input.bytes)
      : new TextDecoder("utf-8").decode(input.bytes);
  }
  const kind = input.kind === "auto" ? guessKind(input.filename, text) : input.kind;

  let result: ParseResult;
  switch (kind) {
    case "whatsapp":
      result = parseWhatsApp(text, { dateOrder: input.dateOrder });
      break;
    case "email":
      result =
        name.endsWith(".eml") || /^(received|return-path|mime-version|message-id):/im.test(text.slice(0, 2000))
          ? await parseEml(input.bytes ? Buffer.from(input.bytes) : text)
          : parsePastedEmails(text);
      break;
    case "diary":
    case "minutes":
      result = parseDiary(text, { kind });
      break;
  }
  return { ...result, kind, rawText: text };
}
