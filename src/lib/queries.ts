// Read model shared by the API routes, the CLI and (later) the UI and Slack push.
// Every consumer goes through these functions so they all see the same numbers.
import type { Prisma, PrismaClient } from "@prisma/client";
import { summarise } from "./engine/whitespace";
import type { CellStatus } from "./engine/types";
import { themeLabel } from "./taxonomy";

export interface OpportunityFilters {
  id?: string;
  segment?: string;
  team?: string;
  owner?: string;
  product?: string;
  type?: string;
  accountId?: string;
  status?: string;
  includeAdoption?: boolean;
  limit?: number;
}

export function filtersFromSearchParams(sp: URLSearchParams): OpportunityFilters {
  const get = (k: string) => sp.get(k) || undefined;
  const limit = sp.get("limit");
  return {
    segment: get("segment"),
    team: get("team"),
    owner: get("owner"),
    product: get("product"),
    type: get("type"),
    accountId: get("account"),
    status: get("status"),
    includeAdoption: sp.get("includeAdoption") === "true",
    limit: limit ? Math.max(1, Math.min(500, Number(limit))) : undefined,
  };
}

function accountWhere(f: OpportunityFilters): Prisma.AccountWhereInput {
  return {
    ...(f.segment && { segment: f.segment }),
    ...(f.team && { team: f.team }),
    ...(f.owner && { owner: f.owner }),
    ...(f.accountId && { id: f.accountId }),
  };
}

function opportunityWhere(f: OpportunityFilters): Prisma.OpportunityWhereInput {
  if (f.id) return { id: f.id };
  const types = f.type ? [f.type] : f.includeAdoption ? undefined : ["cross_sell", "add_on", "seat_expansion"];
  return {
    account: accountWhere(f),
    ...(f.product && { productId: f.product }),
    ...(types && { type: { in: types } }),
    ...(f.status ? { status: f.status } : { status: { notIn: ["dismissed", "lost"] } }),
  };
}

export async function listOpportunities(db: PrismaClient, f: OpportunityFilters = {}) {
  const rows = await db.opportunity.findMany({
    where: opportunityWhere(f),
    include: {
      account: { select: { id: true, name: true, segment: true, team: true, owner: true, renewalDate: true } },
      product: { select: { id: true, name: true } },
      evidence: { orderBy: { id: "asc" } },
    },
    orderBy: { rank: "asc" },
    take: f.limit,
  });
  return rows.map((o) => ({
    id: o.id,
    rank: o.rank,
    type: o.type,
    status: o.status,
    title: o.title,
    headline: o.headline,
    whyNow: o.whyNow,
    releaseDriven: o.releaseDriven,
    value: o.value,
    weightedValue: o.weightedValue,
    arrProtected: o.arrProtected,
    scores: { overall: o.score, fit: o.fitScore, persona: o.personaScore, timing: o.timingScore },
    account: o.account,
    product: o.product,
    capabilityIds: o.capabilityIds as string[],
    evidence: o.evidence.map((e) => ({
      kind: e.kind, label: e.label, text: e.text, confidence: e.confidence, date: e.date,
      sourceId: e.sourceId, needId: e.needId, capabilityId: e.capabilityId,
    })),
    computedAt: o.computedAt,
  }));
}

export type OpportunityDTO = Awaited<ReturnType<typeof listOpportunities>>[number];

export async function whitespaceMap(db: PrismaClient, f: OpportunityFilters = {}) {
  const [accounts, products, opps] = await Promise.all([
    db.account.findMany({
      where: accountWhere(f),
      include: { ownerships: { select: { productId: true, arr: true } } },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({ where: f.product ? { id: f.product } : {}, orderBy: [{ position: "asc" }, { id: "asc" }] }),
    db.opportunity.findMany({
      where: opportunityWhere({ ...f, type: undefined, includeAdoption: true, limit: undefined }),
      select: {
        id: true, accountId: true, productId: true, type: true, title: true, headline: true, whyNow: true, rank: true, releaseDriven: true,
        value: true, weightedValue: true, arrProtected: true, score: true,
      },
      orderBy: { rank: "asc" },
    }),
  ]);
  const revenue = opps.filter((o) => o.type !== "adoption");
  const rows = accounts.map((a) => {
    const cells = products.map((p) => {
      const owned = a.ownerships.some((o) => o.productId === p.id);
      const here = opps.filter((o) => o.accountId === a.id && o.productId === p.id);
      const rev = here.filter((o) => o.type !== "adoption");
      const status: CellStatus = owned ? "owned" : rev.length ? "opportunity" : "not_relevant";
      return {
        productId: p.id,
        status,
        expansion: owned && rev.length > 0,
        adoption: here.some((o) => o.type === "adoption"),
        value: rev.reduce((s, o) => s + o.value, 0),
        opportunityIds: here.map((o) => o.id),
        opportunities: here.map((o) => ({
          id: o.id, type: o.type, title: o.title, headline: o.headline, whyNow: o.whyNow, rank: o.rank,
          value: o.value, arrProtected: o.arrProtected, score: o.score,
        })),
      };
    });
    return {
      account: { id: a.id, name: a.name, segment: a.segment, team: a.team, owner: a.owner, arr: a.ownerships.reduce((s, o) => s + o.arr, 0) },
      unclaimed: cells.reduce((s, c) => s + c.value, 0),
      cells,
    };
  });
  return {
    summary: { ...summarise(revenue), baseArr: rows.reduce((s, r) => s + r.account.arr, 0), adoptionArrProtected: opps.reduce((s, o) => s + o.arrProtected, 0), adoptionCount: opps.length - revenue.length },
    releaseDriven: {
      count: revenue.filter((o) => o.releaseDriven).length,
      value: revenue.filter((o) => o.releaseDriven).reduce((s, o) => s + o.value, 0),
    },
    products: products.map((p) => ({ id: p.id, name: p.name })),
    rows: rows.sort((a, b) => b.unclaimed - a.unclaimed || a.account.name.localeCompare(b.account.name)),
  };
}

export type WhitespaceMapDTO = Awaited<ReturnType<typeof whitespaceMap>>;

export async function accountDetail(db: PrismaClient, id: string) {
  const a = await db.account.findUnique({
    where: { id },
    include: {
      contacts: { include: { persona: true } },
      ownerships: { include: { product: { select: { id: true, name: true } } } },
      needs: { include: { contact: true, source: { select: { id: true, kind: true, title: true, date: true } } }, orderBy: { raisedAt: "desc" } },
    },
  });
  if (!a) return null;
  const opportunities = await listOpportunities(db, { accountId: id, includeAdoption: true });
  return {
    id: a.id, name: a.name, domain: a.domain, industry: a.industry, segment: a.segment, region: a.region, team: a.team,
    owner: a.owner, employees: a.employees, agents: a.agents, contractStart: a.contractStart, renewalDate: a.renewalDate,
    arr: a.ownerships.reduce((s, o) => s + o.arr, 0),
    contacts: a.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, email: c.email, persona: c.persona?.name ?? null })),
    footprint: a.ownerships.map((o) => ({
      product: o.product, seats: o.seats, activeSeats: o.activeSeats, arr: o.arr, addOns: o.addOns as string[], since: o.since,
    })),
    needs: a.needs.map((n) => ({
      id: n.id, theme: n.theme, themeLabel: themeLabel(n.theme), summary: n.summary, quote: n.quote, severity: n.severity,
      raisedAt: n.raisedAt, status: n.status, contact: n.contact ? { id: n.contact.id, name: n.contact.name, title: n.contact.title } : null,
      personaId: n.personaId, source: n.source, extractor: n.extractor,
    })),
    opportunities,
  };
}

export async function listAccounts(db: PrismaClient, f: OpportunityFilters = {}) {
  const map = await whitespaceMap(db, f);
  return map.rows.map((r) => ({ ...r.account, unclaimed: r.unclaimed, opportunityCount: r.cells.reduce((s, c) => s + c.opportunityIds.length, 0) }));
}

export async function listNeeds(db: PrismaClient, q: { accountId?: string; theme?: string; status?: string } = {}) {
  const rows = await db.need.findMany({
    where: { ...(q.accountId && { accountId: q.accountId }), ...(q.theme && { theme: q.theme }), status: q.status ?? "open" },
    include: { account: { select: { id: true, name: true } }, matches: { orderBy: { confidence: "desc" }, include: { capability: { select: { id: true, title: true, productId: true } } } } },
    orderBy: { raisedAt: "desc" },
  });
  return rows.map((n) => ({
    id: n.id, account: n.account, theme: n.theme, themeLabel: themeLabel(n.theme), summary: n.summary, quote: n.quote,
    personaId: n.personaId, severity: n.severity, raisedAt: n.raisedAt, extractor: n.extractor, sourceId: n.sourceId,
    matches: n.matches.map((m) => ({ capability: m.capability, confidence: m.confidence, relation: m.relation, rationale: m.rationale })),
  }));
}

export async function listCapabilities(db: PrismaClient, q: { productId?: string; isNew?: boolean } = {}) {
  const rows = await db.capability.findMany({
    where: { ...(q.productId && { productId: q.productId }), ...(q.isNew !== undefined && { isNew: q.isNew }) },
    include: { product: { select: { id: true, name: true } }, source: { select: { id: true, title: true, version: true } }, _count: { select: { matches: true } } },
    orderBy: { releasedAt: "desc" },
  });
  return rows.map((c) => ({
    id: c.id, product: c.product, title: c.title, description: c.description, themes: c.themes as string[],
    personas: c.personas as string[], packaging: c.packaging, addOnName: c.addOnName, upliftPct: c.upliftPct,
    releasedAt: c.releasedAt, isNew: c.isNew, sourceLine: c.sourceLine, source: c.source, matchedNeeds: c._count.matches, extractor: c.extractor,
  }));
}
