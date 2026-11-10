/**
 * Measure detection accuracy against the seed answer key.
 *
 *   npm run eval                         AI detector (uses cached results; calls the API for misses)
 *   npm run eval -- --detector baseline  keyword baseline, no API key needed
 *   npm run eval -- --cache-only         AI detector, never call the API
 *   npm run eval -- --min-confidence 0.5 ignore detections below a confidence score
 *
 * Does not touch the review queue: detections are scored in memory.
 * Writes a JSON report to eval-results/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { CacheMissError, detectionModel, hasApiKey } from "../src/lib/detection/ai";
import { detect, type Detector } from "../src/lib/detection/run";
import { scoreDetections, type Detected, type GoldEvent, type Trap } from "../src/lib/eval";
import { loadAnswerKey, loadSeedProjects } from "../src/lib/seed-data";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: fine for the baseline detector
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

async function main() {
  const detector = (arg("detector") ?? "ai") as Detector;
  const minConfidence = Number(arg("min-confidence") ?? 0);
  const cacheOnly = process.argv.includes("--cache-only");
  if (detector === "ai" && !hasApiKey() && !cacheOnly) {
    console.log("No ANTHROPIC_API_KEY in .env: using cached AI results only.\n");
  }

  const key = await loadAnswerKey();
  const seedProjects = await loadSeedProjects();
  const allDetected: Detected[] = [];
  const allGold: GoldEvent[] = [];
  const allTraps: Trap[] = [];
  const titles = new Map<string, string>();
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheHits = 0;
  let batches = 0;

  for (const sp of seedProjects) {
    const project = await prisma.project.findFirst({ where: { reference: sp.reference } });
    if (!project) throw new Error(`Seed project ${sp.reference} not found. Run \`npm run seed\` first.`);
    const messages = await prisma.message.findMany({
      where: { projectId: project.id },
      include: { source: { select: { filename: true } } },
    });
    const find = (file: string, contains: string) =>
      messages.filter((m) => m.source.filename === file && m.body.includes(contains)).map((m) => m.id);

    for (const g of key.events.filter((e) => e.project === sp.key)) {
      allGold.push({
        id: g.id,
        type: g.type,
        acceptTypes: g.acceptTypes,
        awarenessDate: g.awarenessDate,
        messageIds: new Set(g.evidence.flatMap((ev) => find(ev.file, ev.contains))),
      });
      titles.set(g.id, g.summary);
    }
    for (const t of key.traps.filter((x) => x.project === sp.key)) {
      for (const id of find(t.file, t.contains)) allTraps.push({ id: t.id, messageId: id });
    }

    console.log(`Detecting: ${sp.name} (${messages.length} messages)…`);
    const result = await detect(project.id, detector, {
      cacheOnly: cacheOnly || (detector === "ai" && !hasApiKey()),
      onProgress: (m) => console.log(`  ${m}`),
    });
    batches += result.stats.batches;
    cacheHits += result.stats.cacheHits;
    tokensIn += result.stats.inputTokens;
    tokensOut += result.stats.outputTokens;
    for (const c of result.candidates) {
      if (c.confidence < minConfidence) continue;
      allDetected.push({
        index: allDetected.length,
        eventType: c.eventType,
        title: c.title,
        awarenessDate: c.awarenessDate,
        messageIds: c.messageIds,
        confidence: c.confidence,
      });
    }
  }

  const r = scoreDetections(allDetected, allGold, allTraps);
  const label = detector === "ai" ? `AI (${detectionModel()})` : "Keyword baseline (not AI)";
  console.log(`\n=== Detection accuracy: ${label} ===`);
  if (minConfidence) console.log(`Ignoring detections with confidence < ${minConfidence}`);
  console.log(`Known events:        ${r.gold}`);
  console.log(`Detected events:     ${r.detected}`);
  console.log(`  correct:           ${r.truePositives.length}`);
  console.log(`  duplicates:        ${r.duplicates.length}`);
  console.log(`  false positives:   ${r.falsePositives.length}  (traps hit: ${r.trapsFlagged.length}/${new Set(allTraps.map((t) => t.id)).size})`);
  console.log(`Precision:           ${pct(r.precision)}`);
  console.log(`Recall:              ${pct(r.recall)}`);
  console.log(`F1:                  ${pct(r.f1)}`);
  console.log(`Type correct:        ${pct(r.typeAccuracy)} of matched`);
  console.log(`Awareness date ±1d:  ${pct(r.datesWithinOneDay)} of matched`);
  if (detector === "ai") {
    console.log(`API batches:         ${batches} (${cacheHits} from cache), ${tokensIn} input / ${tokensOut} output tokens billed this run`);
  }

  if (r.missed.length) {
    console.log("\nMissed:");
    for (const g of r.missed) console.log(`  ${g.id} [${g.type}] ${titles.get(g.id)}`);
  }
  if (r.falsePositives.length) {
    console.log("\nFalse positives:");
    for (const f of r.falsePositives) {
      console.log(`  [${f.detected.eventType}] ${f.detected.title}${f.trapIds.length ? `  <- trap ${f.trapIds.join(", ")}` : ""}`);
    }
  }
  if (r.truePositives.some((t) => !t.typeOk || (t.dateErrorDays !== null && Math.abs(t.dateErrorDays) > 1))) {
    console.log("\nMatched, but type or date off:");
    for (const t of r.truePositives) {
      const dateOff = t.dateErrorDays !== null && Math.abs(t.dateErrorDays) > 1;
      if (t.typeOk && !dateOff) continue;
      console.log(
        `  ${t.gold.id}: ${!t.typeOk ? `type ${t.detected.eventType} (expected ${t.gold.type}) ` : ""}${dateOff ? `date ${t.detected.awarenessDate} (expected ${t.gold.awarenessDate})` : ""}`,
      );
    }
  }

  mkdirSync("eval-results", { recursive: true });
  const out = `eval-results/latest-${detector}.json`;
  writeFileSync(
    out,
    JSON.stringify(
      {
        detector: label,
        runAt: new Date().toISOString(),
        minConfidence,
        summary: {
          precision: r.precision,
          recall: r.recall,
          f1: r.f1,
          typeAccuracy: r.typeAccuracy,
          datesWithinOneDay: r.datesWithinOneDay,
          detected: r.detected,
          gold: r.gold,
          duplicates: r.duplicates.length,
          falsePositives: r.falsePositives.length,
        },
        missed: r.missed.map((g) => g.id),
        falsePositives: r.falsePositives.map((f) => ({ ...f.detected, trapIds: f.trapIds })),
        matched: r.truePositives.map((t) => ({ gold: t.gold.id, detected: t.detected.title, typeOk: t.typeOk, dateErrorDays: t.dateErrorDays })),
      },
      null,
      2,
    ),
  );
  console.log(`\nFull report: ${out}`);
}

main()
  .catch((e) => {
    if (e instanceof CacheMissError) {
      console.error(`\n${e.message}\nAdd ANTHROPIC_API_KEY to .env to run the AI detector, or try --detector baseline.`);
      process.exit(2);
    }
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
