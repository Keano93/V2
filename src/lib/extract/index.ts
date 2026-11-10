import type { PrismaClient } from "@prisma/client";
import { cacheKey, getCached, putCached } from "./cache";
import { claudeModel, extractCapabilitiesClaude, extractNeedsClaude, PROMPT_VERSION } from "./claude";
import { extractCapabilitiesRules, extractNeedsRules } from "./rules";
import type { CapabilitySource, ExtractedCapability, ExtractedNeed, ExtractorName, NeedSource } from "./types";

export * from "./types";

/** auto = Claude when a key is configured, otherwise rules. Cached Claude results are always reused. */
export function configuredExtractor(): "auto" | ExtractorName {
  const v = process.env.HEADSTART_EXTRACTOR;
  return v === "claude" || v === "rules" ? v : "auto";
}
const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

async function withCache<S, T>(
  db: PrismaClient,
  kind: "needs" | "capabilities",
  input: string,
  src: S,
  viaClaude: (s: S) => Promise<T[]>,
  viaRules: (s: S) => T[],
): Promise<{ items: T[]; extractor: ExtractorName; cached: boolean }> {
  const mode = configuredExtractor();
  if (mode === "rules") return { items: viaRules(src), extractor: "rules", cached: false };
  const key = cacheKey(kind, PROMPT_VERSION, claudeModel(), input);
  const hit = await getCached<T[]>(db, key);
  if (hit) return { items: hit, extractor: "claude", cached: true };
  if (mode === "claude" || hasKey()) {
    try {
      const items = await viaClaude(src);
      await putCached(db, key, kind, claudeModel(), items);
      return { items, extractor: "claude", cached: false };
    } catch (err) {
      if (mode === "claude") throw err;
      console.warn(`[extract] Claude failed (${(err as Error).message}); using rules for this document.`);
    }
  }
  return { items: viaRules(src), extractor: "rules", cached: false };
}

export function extractNeeds(db: PrismaClient, src: NeedSource) {
  const input = JSON.stringify({ t: src.title, b: src.body, c: src.contacts.map((c) => [c.name, c.title]) });
  return withCache<NeedSource, ExtractedNeed>(db, "needs", input, src, extractNeedsClaude, extractNeedsRules);
}

export function extractCapabilities(db: PrismaClient, src: CapabilitySource) {
  const input = JSON.stringify({ p: src.productId, b: src.body });
  return withCache<CapabilitySource, ExtractedCapability>(db, "capabilities", input, src, extractCapabilitiesClaude, extractCapabilitiesRules);
}
