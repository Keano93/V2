// Loads what the enablement logic needs from the database and records quiz attempts.
import type { PrismaClient } from "@prisma/client";
import {
  buildContext, buildQuiz, DEFAULT_PASS_MARK, grade, publicQuiz, recommend,
  type FoundationModuleIn, type PackCapability, type PackInput,
} from "./enablement";

const PASS_MARK_KEY = "enablement.passMark";

export async function getPassMark(db: PrismaClient): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: PASS_MARK_KEY } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : DEFAULT_PASS_MARK;
}

export async function setPassMark(db: PrismaClient, value: number): Promise<number> {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  await db.setting.upsert({ where: { key: PASS_MARK_KEY }, create: { key: PASS_MARK_KEY, value: String(v) }, update: { value: String(v) } });
  return v;
}

function toModule(m: {
  id: string; productId: string; title: string; version: string; updatedAt: Date; minutes: number;
  sections: unknown; questions: unknown; passMark: number | null; isSample: boolean;
}): FoundationModuleIn {
  return { ...m, sections: m.sections as FoundationModuleIn["sections"], questions: m.questions as FoundationModuleIn["questions"] };
}

async function packInput(db: PrismaClient, opportunityId: string): Promise<PackInput | null> {
  const opp = await db.opportunity.findUnique({
    where: { id: opportunityId },
    include: { evidence: true, product: true, account: { include: { contacts: true } } },
  });
  if (!opp) return null;
  const needIds = opp.evidence.filter((e) => e.kind === "need_quote" && e.needId).map((e) => e.needId!);
  const [needs, caps, allCaps] = await Promise.all([
    db.need.findMany({ where: { id: { in: needIds } } }),
    db.capability.findMany({ where: { id: { in: opp.capabilityIds as string[] } }, include: { source: true, product: true } }),
    db.capability.findMany({ select: { title: true } }),
  ]);
  const label = new Map(opp.evidence.filter((e) => e.needId).map((e) => [e.needId!, e.label]));
  const capabilities: PackCapability[] = caps.map((c) => ({
    id: c.id, title: c.title, description: c.description, themes: c.themes as string[], personas: c.personas as string[],
    packaging: c.packaging, addOnName: c.addOnName, upliftPct: c.upliftPct, isNew: c.isNew, releasedAt: c.releasedAt,
    releaseName: c.isNew ? `${c.product.name} ${c.source.version ?? ""}`.trim() : `${c.product.name} product docs`, productId: c.productId,
  }));
  return {
    opportunity: {
      id: opp.id, title: opp.title, type: opp.type, value: opp.value, whyNow: opp.whyNow, headline: opp.headline,
      productId: opp.productId, productName: opp.product.name,
    },
    account: { id: opp.account.id, name: opp.account.name, owner: opp.account.owner, segment: opp.account.segment },
    footprint: opp.evidence.find((e) => e.kind === "footprint")?.text ?? "",
    needs: needs.map((n) => ({ id: n.id, theme: n.theme, quote: n.quote, label: label.get(n.id) ?? "", contactId: n.contactId, personaId: n.personaId, raisedAt: n.raisedAt })),
    capabilities,
    contacts: opp.account.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, personaId: c.personaId })),
    productPersonas: opp.product.personas as string[],
    allCapabilityTitles: allCaps.map((c) => c.title),
  };
}

async function loadAll(db: PrismaClient, opportunityId: string, repArg?: string) {
  const input = await packInput(db, opportunityId);
  if (!input) return null;
  const row = await db.foundationModule.findFirst({ where: { productId: input.opportunity.productId } });
  if (!row) return { input, module: null as FoundationModuleIn | null, rep: repArg || input.account.owner, passMark: await getPassMark(db) };
  const module = toModule(row);
  const passMark = module.passMark ?? (await getPassMark(db));
  return { input, module, rep: repArg || input.account.owner, passMark };
}

/** The enablement pack for one opportunity, for one rep (defaults to the account owner). */
/** includeAnswers is for offline exports (the static demo) only; the API never sends answers. */
export async function getPack(db: PrismaClient, opportunityId: string, repArg?: string, opts: { includeAnswers?: boolean } = {}) {
  const all = await loadAll(db, opportunityId, repArg);
  if (!all) return null;
  const { input, module, rep, passMark } = all;
  if (!module) return { rep, available: false as const, reason: `No foundation content loaded for ${input.opportunity.productName}.` };
  const attempts = await db.repEnablement.findMany({ where: { rep, moduleId: module.id }, orderBy: { attemptedAt: "desc" } });
  const recommendation = recommend(rep, module, attempts, input.capabilities);
  const quiz = buildQuiz(module, input);
  return {
    available: true as const,
    rep,
    recommendation,
    passMark,
    foundation: {
      id: module.id, title: module.title, version: module.version, updatedAt: module.updatedAt, minutes: module.minutes,
      isSample: module.isSample, sections: module.sections,
    },
    context: buildContext(input),
    quiz: opts.includeAnswers ? quiz : publicQuiz(quiz),
    history: attempts.map((a) => ({ score: a.score, passed: a.passed, passMark: a.passMark, attemptedAt: a.attemptedAt })),
  };
}

/** Grade an attempt server-side (the quiz is regenerated deterministically) and record it. */
export async function submitAttempt(db: PrismaClient, opportunityId: string, answers: Record<string, number>, repArg?: string) {
  const all = await loadAll(db, opportunityId, repArg);
  if (!all || !all.module) return null;
  const { input, module, rep, passMark } = all;
  const result = grade(buildQuiz(module, input), answers, passMark);
  await db.repEnablement.create({
    data: { rep, moduleId: module.id, opportunityId, score: result.score, passMark, passed: result.passed, answers, attemptedAt: new Date() },
  });
  return { rep, module: { id: module.id, title: module.title }, ...result };
}

/** Rep × module status, for managers and for Slack pushes later. */
export async function enablementProgress(db: PrismaClient, repFilter?: string) {
  const [modules, attempts, owners] = await Promise.all([
    db.foundationModule.findMany({ orderBy: { id: "asc" } }),
    db.repEnablement.findMany({ where: repFilter ? { rep: repFilter } : {}, orderBy: { attemptedAt: "desc" } }),
    db.account.findMany({ distinct: ["owner"], select: { owner: true }, orderBy: { owner: "asc" } }),
  ]);
  const reps = repFilter ? [repFilter] : owners.map((o) => o.owner);
  return reps.map((rep) => ({
    rep,
    modules: modules.map((m) => {
      const mine = attempts.filter((a) => a.rep === rep && a.moduleId === m.id);
      const lastPass = mine.find((a) => a.passed);
      const status = lastPass ? (lastPass.attemptedAt < m.updatedAt ? "refresher_due" : "current") : mine.length ? "failed" : "not_started";
      return { moduleId: m.id, productId: m.productId, title: m.title, status, lastScore: mine[0]?.score ?? null, lastAttempt: mine[0]?.attemptedAt ?? null };
    }),
  }));
}
