// npm run load            -> reset DB and load seed data, extract, run engines
// tsx scripts/load.ts --if-empty   -> only if there are no accounts yet (used by `npm run dev`)
import { prisma } from "../src/lib/db";
import { loadSeed } from "../src/lib/seed/load";

async function main() {
  if (process.argv.includes("--if-empty") && (await prisma.account.count()) > 0) return;
  await loadSeed(prisma);
}
main().finally(() => prisma.$disconnect());
