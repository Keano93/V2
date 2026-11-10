// Loads the map from the database, runs matching + white-space, and persists Matches, Opportunities and Evidence.
import type { PrismaClient } from "@prisma/client";
import { today as getToday } from "../dates";
import { matchNeeds } from "./matching";
import type { AccountIn, CapabilityIn, NeedIn, ProductIn } from "./types";
import { computeWhitespace, summarise, type WhitespaceResult, type WhitespaceSummary } from "./whitespace";

export * from "./types";

export async function loadEngineInput(db: PrismaClient) {
  const [accounts, products, needs, caps] = await Promise.all([
    db.account.findMany({ include: { contacts: true, ownerships: true }, orderBy: { id: "asc" } }),
    db.product.findMany({ orderBy: { id: "asc" } }),
    db.need.findMany({ where: { status: "open" }, include: { source: true }, orderBy: { id: "asc" } }),
    db.capability.findMany({ include: { source: true, product: true }, orderBy: { id: "asc" } }),
  ]);
  const accountsIn: AccountIn[] = accounts.map((a) => ({
    id: a.id, name: a.name, segment: a.segment, team: a.team, owner: a.owner, agents: a.agents, renewalDate: a.renewalDate,
    contacts: a.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, personaId: c.personaId })),
    ownerships: a.ownerships.map((o) => ({
      productId: o.productId, seats: o.seats, activeSeats: o.activeSeats, arr: o.arr, addOns: o.addOns as string[],
    })),
  }));
  const productsIn: ProductIn[] = products.map((p) => ({
    id: p.id, name: p.name, pricePerSeat: p.pricePerSeat, seatRatio: p.seatRatio, personas: p.personas as string[],
  }));
  const needsIn: NeedIn[] = needs.map((n) => ({
    id: n.id, accountId: n.accountId, theme: n.theme, summary: n.summary, quote: n.quote, personaId: n.personaId,
    contactId: n.contactId, raisedAt: n.raisedAt, severity: n.severity, sourceId: n.sourceId, sourceKind: n.source.kind,
  }));
  const capsIn: CapabilityIn[] = caps.map((c) => ({
    id: c.id, productId: c.productId, title: c.title, description: c.description, themes: c.themes as string[],
    personas: c.personas as string[], packaging: c.packaging as CapabilityIn["packaging"], addOnName: c.addOnName,
    upliftPct: c.upliftPct, releasedAt: c.releasedAt, isNew: c.isNew, sourceLine: c.sourceLine, sourceId: c.sourceId,
    releaseName: c.isNew ? `${c.product.name} ${c.source.version ?? ""}`.trim() : `${c.product.name} product docs`,
  }));
  return { accounts: accountsIn, products: productsIn, needs: needsIn, capabilities: capsIn };
}

export interface EngineRun extends WhitespaceResult {
  matchCount: number;
  summary: WhitespaceSummary;
}

/** Pure computation over current DB state (no writes). */
export async function computeFromDb(db: PrismaClient, today = getToday()): Promise<EngineRun & { input: Awaited<ReturnType<typeof loadEngineInput>>; matches: ReturnType<typeof matchNeeds> }> {
  const input = await loadEngineInput(db);
  const matches = matchNeeds(input.needs, input.capabilities);
  const ws = computeWhitespace({ ...input, matches, today });
  return { ...ws, matches, matchCount: matches.length, summary: summarise(ws.opportunities.filter((o) => o.type !== "adoption")), input };
}

/** Recompute and persist. Keeps the status of opportunities a rep already acted on. */
export async function runEngine(db: PrismaClient, today = getToday()): Promise<EngineRun> {
  const run = await computeFromDb(db, today);
  const previous = new Map((await db.opportunity.findMany({ select: { id: true, status: true } })).map((o) => [o.id, o.status]));
  const computedAt = new Date();

  await db.$transaction(async (tx) => {
    await tx.match.deleteMany({});
    await tx.evidence.deleteMany({});
    await tx.opportunity.deleteMany({});
    await tx.match.createMany({ data: run.matches });
    for (const o of run.opportunities) {
      await tx.opportunity.create({
        data: {
          id: o.id, accountId: o.accountId, productId: o.productId, type: o.type, title: o.title, value: o.value,
          arrProtected: o.arrProtected, fitScore: o.fitScore, personaScore: o.personaScore, timingScore: o.timingScore,
          score: o.score, weightedValue: o.weightedValue, rank: o.rank, whyNow: o.whyNow, headline: o.headline,
          capabilityIds: o.capabilityIds, status: previous.get(o.id) ?? "open", computedAt,
          evidence: { create: o.evidence.map((e) => ({ ...e })) },
        },
      });
    }
  }, { timeout: 60_000 });

  return { opportunities: run.opportunities, matrix: run.matrix, matchCount: run.matchCount, summary: run.summary };
}
