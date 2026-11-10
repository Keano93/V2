// Claude extractor. Uses structured outputs so every result validates against the taxonomy,
// then verifies quotes against the source text so nothing invented ever becomes "evidence".
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PERSONA_IDS, THEMES, THEME_IDS, type PersonaId } from "../taxonomy";
import type { CapabilitySource, ExtractedCapability, ExtractedNeed, NeedSource } from "./types";

export const PROMPT_VERSION = "v1";

export function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
}
type Effort = "low" | "medium" | "high";
function effort(): Effort {
  const e = process.env.ANTHROPIC_EFFORT;
  return e === "medium" || e === "high" ? e : "low";
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY (or other SDK-supported credentials) from the environment. Never hard-code keys.
  client ??= new Anthropic();
  return client;
}

const TAXONOMY_TEXT = THEMES.map((t) => `- ${t.id}: ${t.label}. ${t.description}`).join("\n");
const PERSONA_TEXT = [
  "- head_of_support: Head of Customer Support / VP CX. Owns budget, CSAT, headcount.",
  "- support_ops: Support Operations Manager / team lead. Owns queues, workflows, SLAs, staffing.",
  "- knowledge_lead: Knowledge & Enablement Lead. Owns help centre, internal knowledge, onboarding.",
  "- it_admin: IT & Security Admin. Owns access, compliance, data protection.",
].join("\n");

const NEEDS_SYSTEM = `You extract customer needs (pain points) from B2B SaaS account notes for a revenue team.

A need is a problem, gap or desired outcome the CUSTOMER expressed. Ignore admin chatter (invoices, scheduling, relationship status) and anything the vendor said.

Tag each need with exactly one theme from this taxonomy (use "other" only if nothing fits):
${TAXONOMY_TEXT}

Personas:
${PERSONA_TEXT}

Rules:
- "quote" must be copied verbatim from the note: the shortest full sentence that shows the need. Do not paraphrase it.
- "summary" is one short line in your own words, from the customer's point of view.
- "contact_name" is the customer contact who expressed it, exactly as written in the note, or null if unclear.
- "persona" is that person's persona, inferred from their title.
- severity: 3 = blocker/urgent or explicitly costly, 2 = clear pain, 1 = nice to have.
- At most one need per theme per note. Return an empty list if there are none.`;

const CAPS_SYSTEM = `You extract product capabilities from B2B SaaS release notes and product docs.

A capability is something the product can now do for a customer. Skip bug fixes and cosmetic improvements.

Tag each capability with every theme from this taxonomy whose need it directly solves (it can be none):
${TAXONOMY_TEXT}

Personas:
${PERSONA_TEXT}

Rules:
- "source_line" must be copied verbatim from the document (the full line describing the capability).
- packaging: "core" if it is a baseline capability of the product, "included" if shipped at no extra cost, "add_on" if it requires a paid add-on.
- For add-ons give add_on_name and uplift_pct as a fraction of the product subscription (e.g. 0.3 for +30%), or null if not stated.`;

const NeedsSchema = z.object({
  needs: z.array(
    z.object({
      theme: z.enum(["other", ...THEME_IDS] as [string, ...string[]]),
      summary: z.string(),
      quote: z.string(),
      contact_name: z.string().nullable(),
      persona: z.enum(PERSONA_IDS as [PersonaId, ...PersonaId[]]).nullable(),
      severity: z.number().int(),
    }),
  ),
});

const CapsSchema = z.object({
  capabilities: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      themes: z.array(z.enum(THEME_IDS as [string, ...string[]])),
      personas: z.array(z.enum(PERSONA_IDS as [PersonaId, ...PersonaId[]])),
      packaging: z.enum(["core", "included", "add_on"]),
      add_on_name: z.string().nullable(),
      uplift_pct: z.number().nullable(),
      source_line: z.string(),
    }),
  ),
});

const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

async function call<T extends z.ZodType>(system: string, user: string, schema: T): Promise<z.infer<T>> {
  const response = await getClient().beta.messages.parse({
    model: claudeModel(),
    max_tokens: 16000,
    // Server-side fallback: if the model declines, the API retries on a fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Stable system prompt (taxonomy) first, cached across every extraction call.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { effort: effort(), format: betaZodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to extract from this document");
  if (response.stop_reason === "max_tokens") throw new Error("Claude output was cut off (max_tokens)");
  if (!response.parsed_output) throw new Error("Claude returned no parseable output");
  return response.parsed_output as z.infer<T>;
}

export async function extractNeedsClaude(src: NeedSource): Promise<ExtractedNeed[]> {
  const contacts = src.contacts.map((c) => `- ${c.name}, ${c.title}`).join("\n");
  const user = `Account: ${src.accountName}
Document type: ${src.kind}
Date: ${src.date.toISOString().slice(0, 10)}
Known contacts:
${contacts}

<note>
${src.title}
${src.body}
</note>`;
  const out = await call(NEEDS_SYSTEM, user, NeedsSchema);
  return postProcessNeeds(src, out.needs);
}

export type RawClaudeNeed = z.infer<typeof NeedsSchema>["needs"][number];

/** Keep only needs whose quote is really in the source; one per theme; map the speaker to a known contact. */
export function postProcessNeeds(src: NeedSource, raw: RawClaudeNeed[]): ExtractedNeed[] {
  const body = norm(`${src.title}\n${src.body}`);
  const seen = new Set<string>();
  return raw.flatMap((n): ExtractedNeed[] => {
    // Evidence must be real: drop anything whose quote isn't in the source.
    if (!n.quote.trim() || !body.includes(norm(n.quote)) || seen.has(n.theme)) return [];
    seen.add(n.theme);
    const name = n.contact_name ? norm(n.contact_name) : null;
    const contact = name
      ? src.contacts.find((c) => norm(c.name) === name || norm(c.name).split(" ")[0] === name)
      : src.contacts.find((c) => c.id === src.contactId);
    return [{
      theme: n.theme,
      summary: n.summary,
      quote: n.quote,
      contactId: contact?.id ?? null,
      personaId: contact?.personaId ?? n.persona ?? null,
      severity: Math.min(3, Math.max(1, Math.round(n.severity))) as 1 | 2 | 3,
    }];
  });
}

export async function extractCapabilitiesClaude(src: CapabilitySource): Promise<ExtractedCapability[]> {
  const user = `Product id: ${src.productId}
Document type: ${src.kind}

<document>
${src.body}
</document>`;
  const out = await call(CAPS_SYSTEM, user, CapsSchema);
  const body = norm(src.body);
  return out.capabilities.map((c) => ({
    title: c.title,
    description: c.description,
    themes: c.themes,
    personas: c.personas,
    packaging: c.packaging,
    addOnName: c.add_on_name,
    upliftPct: c.uplift_pct,
    // keep the verbatim line when Claude got it right; otherwise fall back to title+description
    sourceLine: body.includes(norm(c.source_line))
      ? c.source_line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "")
      : `${c.title}: ${c.description}`,
  }));
}
