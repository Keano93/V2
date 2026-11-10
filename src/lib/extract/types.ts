import type { PersonaId } from "../taxonomy";

export interface ContactRef {
  id: string;
  name: string;
  title: string;
  personaId: PersonaId | null;
}

/** A note / ticket / plan to extract needs from. */
export interface NeedSource {
  id: string;
  kind: string;
  title: string;
  body: string;
  date: Date;
  accountName: string;
  contactId: string | null; // primary author / requester
  contacts: ContactRef[];
}

export interface ExtractedNeed {
  theme: string; // taxonomy id or "other"
  summary: string;
  quote: string; // verbatim substring of the source body
  contactId: string | null;
  personaId: PersonaId | null;
  severity: 1 | 2 | 3;
}

/** A release note or product doc to extract capabilities from. */
export interface CapabilitySource {
  id: string;
  kind: string; // release_note | product_doc
  title: string;
  body: string;
  productId: string;
  date: Date;
}

export interface ExtractedCapability {
  title: string;
  description: string;
  themes: string[];
  personas: PersonaId[];
  packaging: "core" | "included" | "add_on";
  addOnName: string | null;
  upliftPct: number | null; // 0.3 = +30%
  sourceLine: string; // verbatim line from the doc
}

export type ExtractorName = "claude" | "rules";
