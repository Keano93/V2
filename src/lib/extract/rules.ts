// Rule-based extractor: the no-API-key fallback and the baseline we measure Claude against.
// It is deliberately simple: keyword hits on the shared taxonomy, sentence-level quotes, and
// speaker attribution by contact name. It does NOT understand paraphrase; Claude does.
import { PERSONA_IDS, THEMES, type PersonaId } from "../taxonomy";
import type { CapabilitySource, ContactRef, ExtractedCapability, ExtractedNeed, NeedSource } from "./types";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const KEYWORD_RES = THEMES.map((t) => ({
  id: t.id,
  res: t.keywords.map((k) => new RegExp(`(?<![\\w-])${escape(k)}(?![\\w-])`, "i")),
}));

/** Theme ids hit by a piece of text, best first (by number of distinct keyword hits). */
export function themesIn(text: string): { id: string; hits: number }[] {
  return KEYWORD_RES.map(({ id, res }) => ({ id, hits: res.filter((r) => r.test(text)).length }))
    .filter((t) => t.hits > 0)
    .sort((a, b) => b.hits - a.hits);
}

const HEADER = /^(attendees|from|priority|owner|goals|next steps|relationship|subject|to|cc)\s*:/i;
const SEVERE = /\b(blocker|killing|problem|chaos|badly|can't|cannot|lost|flagged)\b/i;

interface Segment {
  text: string;
  line: string;
}

/** Pull candidate "what the customer said" segments out of a note. */
function segments(body: string): Segment[] {
  const out: Segment[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || HEADER.test(line)) continue;
    const quoted = line.match(/said:\s*"(.+)"\s*$/i);
    if (quoted) { out.push({ text: quoted[1], line }); continue; }
    const raised = line.match(/^raised by [^:]+:\s*(.+)$/i);
    if (raised) { out.push({ text: raised[1], line }); continue; }
    const bullet = line.match(/^[-*]\s+(.+?)(\s+\([^)]*\))?$/);
    if (bullet) { out.push({ text: bullet[1], line }); continue; }
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z])/)) out.push({ text: s.replace(/^health:\s*\w+\.\s*/i, ""), line });
  }
  return out;
}

function speaker(line: string, contacts: ContactRef[], fallbackId: string | null): ContactRef | null {
  const byFull = contacts.find((c) => line.includes(c.name));
  if (byFull) return byFull;
  const byFirst = contacts.find((c) => new RegExp(`\\b${escape(c.name.split(" ")[0])}\\b`).test(line));
  if (byFirst) return byFirst;
  return contacts.find((c) => c.id === fallbackId) ?? null;
}

export function extractNeedsRules(src: NeedSource): ExtractedNeed[] {
  const seen = new Set<string>();
  const needs: ExtractedNeed[] = [];
  for (const seg of segments(src.body)) {
    const [best] = themesIn(seg.text);
    if (!best || seen.has(best.id)) continue;
    seen.add(best.id);
    const who = speaker(seg.line, src.contacts, src.contactId);
    const theme = THEMES.find((t) => t.id === best.id)!;
    needs.push({
      theme: best.id,
      summary: theme.label,
      quote: seg.text,
      contactId: who?.id ?? null,
      personaId: who?.personaId ?? null,
      severity: SEVERE.test(seg.text) ? 3 : 2,
    });
  }
  return needs;
}

const PERSONA_PHRASES: [RegExp, PersonaId[]][] = [
  [/support operations|operations managers|team leads/i, ["support_ops"]],
  [/support leaders|heads? of support|cx leaders/i, ["head_of_support"]],
  [/knowledge managers|enablement/i, ["knowledge_lead"]],
  [/\bit\b|security teams/i, ["it_admin"]],
  [/support teams/i, ["support_ops", "head_of_support"]],
];

export function extractCapabilitiesRules(src: CapabilitySource): ExtractedCapability[] {
  const caps: ExtractedCapability[] = [];
  for (const raw of src.body.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/^[-*]\s+\*\*(.+?)\*\*\s*:\s*(.+)$/);
    if (!m) continue;
    const [, title, rest] = m;
    const builtFor = rest.match(/Built for ([^.]+)\./i)?.[1] ?? "";
    const description = rest.replace(/\s*Built for [^.]+\.\s*/i, " ").replace(/\s*(Included in|Available in|Core to)[^.]*(\.[^.]*\))?\.?\s*$/i, "").trim();
    const personas = new Set<PersonaId>();
    for (const [re, ps] of PERSONA_PHRASES) if (re.test(builtFor)) ps.forEach((p) => personas.add(p));
    const themes = themesIn(`${title} ${description}`).map((t) => t.id);
    if (personas.size === 0) {
      for (const t of themes) THEMES.find((x) => x.id === t)!.personas.forEach((p) => personas.add(p));
    }
    const addOn = rest.match(/Available in the (.+?) add-on(?:\s*\(\+(\d+)%[^)]*\))?/i);
    caps.push({
      title,
      description,
      themes,
      personas: [...personas].filter((p) => PERSONA_IDS.includes(p)),
      packaging: addOn ? "add_on" : /core to/i.test(rest) ? "core" : "included",
      addOnName: addOn ? addOn[1] : null,
      upliftPct: addOn?.[2] ? Number(addOn[2]) / 100 : null,
      sourceLine: `${title}: ${rest}`,
    });
  }
  return caps;
}
