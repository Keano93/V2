export type SourceKind = "whatsapp" | "email" | "diary" | "minutes";
export const SOURCE_KINDS: SourceKind[] = ["whatsapp", "email", "diary", "minutes"];

export interface ParsedMessage {
  sender: string;
  sentAt: Date;
  timePrecision: "datetime" | "date";
  subject?: string;
  body: string;
}

export interface ParseResult {
  messages: ParsedMessage[];
  warnings: string[];
}

/** Strip invisible direction marks and odd spaces that WhatsApp and Outlook insert. */
export function cleanText(text: string): string {
  return text
    .replace(/^﻿/, "")
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/[   ]/g, " ")
    .replace(/\r\n?/g, "\n");
}
