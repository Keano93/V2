// Loads data/seed/* into the database, then extracts and runs the engines.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { runEngine } from "../engine/run";
import { extractPending, upsertAccounts, upsertNotes, upsertReleases } from "../ingest";

const SEED = path.join(process.cwd(), "data", "seed");
const json = (f: string) => JSON.parse(readFileSync(path.join(SEED, f), "utf8"));

function parseMarkdownDoc(file: string, kind: "release_note" | "product_doc") {
  const body = readFileSync(file, "utf8");
  const productId = body.match(/^Product:\s*(\S+)/m)?.[1];
  if (!productId) throw new Error(`${file}: missing "Product:" line`);
  const released = body.match(/^Released:\s*(\S+)/m)?.[1];
  const version = body.match(/^#\s*.+?\s(\d+(?:\.\d+)*):/m)?.[1];
  return {
    kind,
    productId,
    version: kind === "product_doc" ? "docs" : version,
    // Baseline capabilities pre-date every note in the demo.
    date: released ?? "2024-01-01",
    title: body.split("\n")[0].replace(/^#\s*/, ""),
    body,
  };
}

export async function loadSeed(db: PrismaClient, log: (m: string) => void = console.log) {
  log("Resetting database…");
  // Order matters for FKs.
  await db.evidence.deleteMany();
  await db.opportunity.deleteMany();
  await db.match.deleteMany();
  await db.need.deleteMany();
  await db.capability.deleteMany();
  await db.sourceDoc.deleteMany();
  await db.ownership.deleteMany();
  await db.contact.deleteMany();
  await db.account.deleteMany();
  await db.product.deleteMany();
  await db.persona.deleteMany();

  for (const p of json("personas.json")) {
    await db.persona.create({ data: { id: p.id, name: p.name, description: p.description } });
  }
  for (const p of json("products.json")) {
    await db.product.create({
      data: { id: p.id, name: p.name, sku: p.sku, tagline: p.tagline, pricePerSeat: p.pricePerSeat, seatRatio: p.seatRatio, personas: p.personas },
    });
  }
  const accounts = json("accounts.json");
  await upsertAccounts(db, accounts);
  const notes = json("notes.json");
  await upsertNotes(db, notes);
  const docs = [
    ...readdirSync(path.join(SEED, "product-docs")).map((f) => parseMarkdownDoc(path.join(SEED, "product-docs", f), "product_doc")),
    ...readdirSync(path.join(SEED, "releases")).map((f) => parseMarkdownDoc(path.join(SEED, "releases", f), "release_note")),
  ];
  await upsertReleases(db, docs);
  log(`Loaded ${accounts.length} accounts, ${notes.length} notes, ${docs.length} release notes / product docs.`);

  log("Extracting needs and capabilities…");
  const ex = await extractPending(db, { log });
  log(
    `  ${ex.needs} needs, ${ex.capabilities} capabilities from ${ex.documents} documents ` +
      `(claude: ${ex.byExtractor.claude} [${ex.cacheHits} from cache], rules: ${ex.byExtractor.rules})`,
  );

  log("Running matching + white-space engines…");
  const run = await runEngine(db);
  log(
    `  ${run.matchCount} need↔capability matches, ${run.summary.opportunityCount} revenue opportunities across ` +
      `${run.summary.accountsWithOpportunities} accounts, €${run.summary.unclaimed.toLocaleString("en-GB")} unclaimed.`,
  );
  return run;
}
