// npm run eval:extraction  -> precision / recall of extracted needs vs data/seed/answer-key.json
// Scores whatever is currently in the database (rules or Claude), by (note, theme) and speaker attribution.
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";

interface Key { noteId: string; needs: { theme: string; contactId: string }[] }

async function main() {
  const key: Key[] = JSON.parse(readFileSync("data/seed/answer-key.json", "utf8"));
  const needs = await prisma.need.findMany();
  const got = new Map<string, { theme: string; contactId: string | null; extractor: string }[]>();
  for (const n of needs) (got.get(n.sourceId) ?? got.set(n.sourceId, []).get(n.sourceId)!).push(n);

  let tp = 0, fp = 0, fn = 0, speakerOk = 0;
  const misses: string[] = [];
  for (const k of key) {
    const g = got.get(k.noteId) ?? [];
    for (const want of k.needs) {
      const hit = g.find((x) => x.theme === want.theme);
      if (hit) { tp++; if (hit.contactId === want.contactId) speakerOk++; }
      else { fn++; misses.push(`MISS ${k.noteId} ${want.theme}`); }
    }
    for (const x of g) if (!k.needs.some((w) => w.theme === x.theme)) { fp++; misses.push(`EXTRA ${k.noteId} ${x.theme}`); }
  }
  const extractors = [...new Set(needs.map((n) => n.extractor))].join(", ");
  const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
  console.log(`Extractor(s): ${extractors}`);
  console.log(`Precision ${(p * 100).toFixed(1)}%  Recall ${(r * 100).toFixed(1)}%  F1 ${((2 * p * r) / (p + r || 1) * 100).toFixed(1)}%  Speaker attribution ${((speakerOk / (tp || 1)) * 100).toFixed(1)}%`);
  if (process.argv.includes("--verbose")) misses.forEach((m) => console.log("  " + m));
}
main().finally(() => prisma.$disconnect());
