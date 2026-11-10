/**
 * Run detection for one or all projects and put the results in the review queue.
 *   npm run detect                       all projects, AI detector
 *   npm run detect -- --detector baseline
 *   npm run detect -- --project KNS-2026-014
 */
import { prisma } from "../src/lib/db";
import { runDetection, type Detector } from "../src/lib/detection/run";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const detector = (arg("detector") ?? "ai") as Detector;
  const ref = arg("project");
  const projects = await prisma.project.findMany({ where: ref ? { reference: ref } : {} });
  for (const p of projects) {
    console.log(`${p.name}:`);
    const r = await runDetection(p.id, detector, { onProgress: (m) => console.log(`  ${m}`) });
    console.log(`  ${r.events} events for review${r.skipped ? ` (${r.skipped} skipped: already reviewed)` : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
