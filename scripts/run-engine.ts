// npm run engine  -> extract any new documents, then recompute matches + opportunities
import { prisma } from "../src/lib/db";
import { runEngine } from "../src/lib/engine/run";
import { extractPending } from "../src/lib/ingest";

async function main() {
  const force = process.argv.includes("--re-extract");
  const ex = await extractPending(prisma, { force, log: console.log });
  console.log(`Extracted ${ex.documents} documents (${ex.needs} needs, ${ex.capabilities} capabilities).`);
  const run = await runEngine(prisma);
  console.log(`${run.matchCount} matches, ${run.summary.opportunityCount} revenue opportunities, €${run.summary.unclaimed.toLocaleString("en-GB")} unclaimed.`);
}
main().finally(() => prisma.$disconnect());
