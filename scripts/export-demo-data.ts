// Exports the current map as compact JSON for the static click-through demo (docs/demo/headstart-demo.html).
// Usage: npx tsx scripts/export-demo-data.ts out.json
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { listOpportunities, whitespaceMap } from "../src/lib/queries";
async function main() {
  const map = await whitespaceMap(prisma, {});
  const opps = await listOpportunities(prisma, { includeAdoption: true });
  const accounts = map.rows.map((r) => ({ ...r.account, cells: r.cells.map((c) => ({ p: c.productId, s: c.status, x: c.expansion, ids: c.opportunityIds })) }));
  const o = opps.map((x) => ({
    id: x.id, rank: x.rank, type: x.type, title: x.title, headline: x.headline, whyNow: x.whyNow, releaseDriven: x.releaseDriven,
    value: x.value, weighted: x.weightedValue, arrProtected: x.arrProtected, scores: x.scores, accountId: x.account.id, productId: x.product.id,
    evidence: x.evidence.filter((e) => e.kind === "need_quote" || e.kind === "release_line" || e.kind === "footprint").map((e) => ({ k: e.kind, t: e.text, l: e.label, c: e.confidence })),
  }));
  writeFileSync(process.argv[2], JSON.stringify({ products: map.products, accounts, opps: o }));
}
main().finally(() => prisma.$disconnect());
