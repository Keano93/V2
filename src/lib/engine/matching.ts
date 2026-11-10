// Matching engine: links each customer need to the product capabilities that solve it.
//
// confidence = 0.60 * themeScore    (need theme is one the capability addresses: 1, else 0)
//            + 0.30 * textScore     (TF-IDF cosine of need wording vs capability wording, scaled to 0..1)
//            + 0.10 * personaScore  (the person who raised it is someone the capability is built for)
//
// A shared theme alone gives 0.6; good wording overlap and the right persona take it towards 1.
// With no shared theme the ceiling is 0.4, which is below the opportunity threshold, so a text-only
// match can show up as a weak signal but cannot create an opportunity on its own.
import { themeLabel } from "../taxonomy";
import { cosine, TfIdf } from "./text";
import type { CapabilityIn, MatchOut, NeedIn } from "./types";

export const MATCH_WEIGHTS = { theme: 0.6, text: 0.3, persona: 0.1 } as const;
export const MIN_MATCH_CONFIDENCE = 0.3;
/** Cosine values for short texts are small; this is the cosine treated as a "perfect" wording match. */
const TEXT_SCALE = 0.35;

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

export function matchNeeds(needs: NeedIn[], caps: CapabilityIn[]): MatchOut[] {
  const needText = (n: NeedIn) => `${n.summary}. ${n.quote}`;
  const capText = (c: CapabilityIn) => `${c.title}. ${c.description}`;
  const tfidf = new TfIdf([...needs.map(needText), ...caps.map(capText)]);
  const capVecs = caps.map((c) => tfidf.vector(capText(c)));

  const out: MatchOut[] = [];
  for (const n of needs) {
    const nv = tfidf.vector(needText(n));
    caps.forEach((c, i) => {
      const themeScore = c.themes.includes(n.theme) ? 1 : 0;
      const textScore = Math.min(1, cosine(nv, capVecs[i]) / TEXT_SCALE);
      const personaScore = n.personaId && c.personas.includes(n.personaId) ? 1 : 0;
      const confidence =
        MATCH_WEIGHTS.theme * themeScore + MATCH_WEIGHTS.text * textScore + MATCH_WEIGHTS.persona * personaScore;
      if (confidence < MIN_MATCH_CONFIDENCE) return;
      const relation = c.isNew && c.releasedAt > n.raisedAt ? "new_release_after_need" : "existing_capability";
      const why: string[] = [];
      if (themeScore) why.push(`solves "${themeLabel(n.theme)}"`);
      if (textScore >= 0.3) why.push(`wording overlap ${Math.round(textScore * 100)}%`);
      if (personaScore) why.push("built for the persona who raised it");
      if (relation === "new_release_after_need") why.push("shipped after the need was raised");
      out.push({
        needId: n.id,
        capabilityId: c.id,
        confidence: round(confidence),
        themeScore,
        textScore: round(textScore),
        personaScore,
        relation,
        rationale: why.join("; "),
      });
    });
  }
  return out;
}
