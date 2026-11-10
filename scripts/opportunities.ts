// npm run opportunities [-- --limit 20 --segment Enterprise --team DACH --product insights --type add_on --json --evidence]
import { prisma } from "../src/lib/db";
import { listOpportunities, whitespaceMap, type OpportunityFilters } from "../src/lib/queries";

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");

async function main() {
  const f: OpportunityFilters = {
    segment: arg("segment"), team: arg("team"), product: arg("product"), type: arg("type"), accountId: arg("account"),
    owner: arg("owner"), includeAdoption: args.includes("--adoption"), limit: Number(arg("limit") ?? 20),
  };
  const [opps, map] = await Promise.all([listOpportunities(prisma, f), whitespaceMap(prisma, { ...f, limit: undefined })]);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ summary: map.summary, opportunities: opps }, null, 2));
    return;
  }
  const s = map.summary;
  console.log(`\n${eur(s.unclaimed)} unclaimed in your base · ${s.opportunityCount} opportunities across ${s.accountsWithOpportunities} accounts · ${eur(s.weighted)} score-weighted\n`);
  for (const o of opps) {
    console.log(`#${o.rank}  ${o.account.name}  ·  ${o.title}  ·  ${o.type === "adoption" ? `protects ${eur(o.arrProtected)}` : eur(o.value)}  ·  score ${o.scores.overall} (fit ${o.scores.fit} / persona ${o.scores.persona} / timing ${o.scores.timing})`);
    console.log(`    ${o.headline}`);
    console.log(`    Why now: ${o.whyNow}`);
    if (args.includes("--evidence")) {
      for (const e of o.evidence.filter((e) => e.kind === "need_quote" || e.kind === "release_line")) {
        console.log(`      ${e.kind === "need_quote" ? "❝" : "⚙"} ${e.text.slice(0, 140)}  [${e.label}${e.confidence != null ? ` · conf ${e.confidence}` : ""}]`);
      }
    }
    console.log();
  }
}
main().finally(() => prisma.$disconnect());
