/**
 * Seed the database with placeholder contract rules and the two synthetic projects.
 *
 *   npx tsx prisma/seed.ts            reset seed projects and reload them
 *   npx tsx prisma/seed.ts --if-empty only load projects if there are none yet
 *
 * Contract types and rules are created if missing but never overwritten,
 * so edits made in the app survive a re-seed.
 */
import { DEFAULT_CONTRACT_TYPES } from "../src/lib/contracts/defaults";
import { prisma } from "../src/lib/db";
import { ingestSource } from "../src/lib/ingest";
import { loadSeedProjects, readSeedFile } from "../src/lib/seed-data";

async function seedContractTypes() {
  for (const ct of DEFAULT_CONTRACT_TYPES) {
    const row = await prisma.contractType.upsert({
      where: { key: ct.key },
      update: {},
      create: { key: ct.key, name: ct.name, description: ct.description },
    });
    for (const rule of ct.rules) {
      await prisma.noticeRule.upsert({
        where: { contractTypeId_eventType: { contractTypeId: row.id, eventType: rule.eventType } },
        update: {},
        create: { ...rule, contractTypeId: row.id, verified: false },
      });
    }
  }
}

async function seedProjects() {
  const projects = await loadSeedProjects();
  for (const p of projects) {
    await prisma.project.deleteMany({ where: { reference: p.reference } });
    const contractType = await prisma.contractType.findUniqueOrThrow({ where: { key: p.contractType } });
    const project = await prisma.project.create({
      data: {
        name: p.name,
        reference: p.reference,
        client: p.client,
        ourRole: p.ourRole,
        contractTypeId: contractType.id,
        shutdownStart: p.shutdownStart ?? null,
        shutdownEnd: p.shutdownEnd ?? null,
      },
    });
    let total = 0;
    for (const f of p.files) {
      const result = await ingestSource(project.id, {
        kind: f.kind,
        filename: f.path,
        bytes: await readSeedFile(f.path),
      });
      total += result.created;
      for (const w of result.warnings) console.warn(`  ${f.path}: ${w}`);
    }
    console.log(`Seeded ${p.name}: ${total} messages from ${p.files.length} files`);
  }
}

async function main() {
  await seedContractTypes();
  if (process.argv.includes("--if-empty") && (await prisma.project.count()) > 0) {
    console.log("Database already has projects; skipping seed (run `npm run seed` to reload).");
    return;
  }
  await seedProjects();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
