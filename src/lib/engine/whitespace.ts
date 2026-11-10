// White-space engine: turns the need<->capability map into ranked, valued opportunities per account.
// See README "How scoring works" for the plain-English version of every number below.
import { daysBetween, fmtDate, monthsAgoText } from "../dates";
import { themeLabel } from "../taxonomy";
import { MIN_MATCH_CONFIDENCE } from "./matching";
import type {
  AccountIn, CapabilityIn, EvidenceOut, MatchOut, MatrixCell, NeedIn, OpportunityOut, OpportunityType, OwnershipIn, ProductIn,
} from "./types";

export const SCORE_WEIGHTS = { fit: 0.5, persona: 0.2, timing: 0.3 } as const;
/** An opportunity needs at least one solid need->capability match (a shared theme ≈ 0.6+) to qualify. */
export const MIN_FIT = 0.55;
/** Volume discount applied to list price by segment. */
export const SEGMENT_DISCOUNT: Record<string, number> = { SMB: 1, "Mid-Market": 0.9, Enterprise: 0.8 };
/** Adoption opportunities carry no new ARR; we treat ~15% of the ARR they protect as their priority value. */
export const ADOPTION_RETENTION_WEIGHT = 0.15;
/** Seat expansion requires real usage pressure. */
export const SEAT_UTILISATION_TRIGGER = 0.85;
const DEFAULT_UPLIFT = 0.2;

const PERSONA_LABEL: Record<string, string> = {
  head_of_support: "Head of Support",
  support_ops: "Support Ops",
  knowledge_lead: "Knowledge Lead",
  it_admin: "IT & Security",
};
const SOURCE_LABEL: Record<string, string> = {
  call_note: "Call note",
  cs_note: "CS note",
  support_ticket: "Support ticket",
  account_plan: "Account plan",
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const r0 = (x: number) => Math.round(x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const short = (s: string, n = 110) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export interface WhitespaceInput {
  accounts: AccountIn[];
  products: ProductIn[];
  needs: NeedIn[];
  capabilities: CapabilityIn[];
  matches: MatchOut[];
  today: Date;
}

export interface WhitespaceResult {
  opportunities: OpportunityOut[];
  matrix: MatrixCell[];
}

interface Hit {
  need: NeedIn;
  cap: CapabilityIn;
  match: MatchOut;
}

/** Fit: probability-style OR over the best match per theme, plus a small bonus for repeated mentions. */
export function fitScore(hits: Hit[]): number {
  const byTheme = new Map<string, { best: number; needs: Set<string> }>();
  for (const h of hits) {
    const t = byTheme.get(h.need.theme) ?? { best: 0, needs: new Set<string>() };
    t.best = Math.max(t.best, h.match.confidence);
    t.needs.add(h.need.id);
    byTheme.set(h.need.theme, t);
  }
  let miss = 1;
  for (const { best, needs } of byTheme.values()) {
    const repeatBonus = Math.min(0.1, 0.05 * (needs.size - 1));
    miss *= 1 - clamp01(best + repeatBonus);
  }
  return clamp01(1 - miss);
}

/** Persona fit: is the right buyer in the account (50%) and did the right people voice the needs (50%)? */
export function personaScore(account: AccountIn, product: ProductIn, hits: Hit[]): number {
  const target = new Set([...product.personas, ...hits.flatMap((h) => h.cap.personas)]);
  const present = account.contacts.some((c) => c.personaId && target.has(c.personaId)) ? 0.5 : 0;
  const needs = uniqueNeeds(hits);
  const voiced = needs.length ? needs.filter((n) => n.personaId && target.has(n.personaId)).length / needs.length : 0;
  return clamp01(present + 0.5 * voiced);
}

/** Timing: the strongest of (a) a release that shipped after the need, (b) an upcoming renewal, (c) a recent mention. */
export function timingScore(account: AccountIn, hits: Hit[], today: Date): { score: number; release?: Hit; renewalDays: number } {
  let best = 0;
  let release: Hit | undefined;
  for (const h of hits) {
    if (h.match.relation !== "new_release_after_need") continue;
    const age = daysBetween(h.cap.releasedAt, today);
    const s = age <= 60 ? 1 : Math.max(0.4, 1 - (0.5 * (age - 60)) / 305);
    if (s > best || (s === best && release && h.match.confidence > release.match.confidence)) {
      best = s;
      release = h;
    }
  }
  const renewalDays = daysBetween(today, account.renewalDate);
  const renewal = renewalDays >= 0 && renewalDays <= 90 ? 0.8 : renewalDays >= 0 && renewalDays <= 180 ? 0.6 : 0;
  const newest = Math.min(...hits.map((h) => daysBetween(h.need.raisedAt, today)));
  const recency = newest <= 60 ? 0.6 : newest <= 180 ? 0.45 : 0.3;
  return { score: Math.max(best, renewal, recency), release, renewalDays };
}

function uniqueNeeds(hits: Hit[]): NeedIn[] {
  return [...new Map(hits.map((h) => [h.need.id, h.need])).values()];
}

function contactLabel(account: AccountIn, n: NeedIn): string {
  const c = account.contacts.find((x) => x.id === n.contactId);
  const persona = n.personaId ? PERSONA_LABEL[n.personaId] ?? n.personaId : null;
  if (c) return `${c.name}${persona ? ` (${persona})` : ""}`;
  return persona ?? "the customer";
}

function buildWhyNow(account: AccountIn, hits: Hit[], timing: ReturnType<typeof timingScore>, today: Date, prefix?: string): string {
  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  if (timing.release) {
    const { need, cap } = timing.release;
    const shippedAgo = daysBetween(cap.releasedAt, today);
    const gap = daysBetween(need.raisedAt, cap.releasedAt);
    parts.push(
      `${cap.title} shipped in ${cap.releaseName} on ${fmtDate(cap.releasedAt)} (${monthsAgoText(shippedAgo)} ago), ` +
        `${monthsAgoText(gap)} after ${contactLabel(account, need)} said: “${short(need.quote.replace(/[.!?]+$/, ""), 90)}”`,
    );
  } else {
    const newest = [...hits].sort((a, b) => b.need.raisedAt.getTime() - a.need.raisedAt.getTime())[0];
    parts.push(
      `${contactLabel(account, newest.need)} raised “${themeLabel(newest.need.theme).toLowerCase()}” on ${fmtDate(newest.need.raisedAt)}` +
        ` and ${newest.cap.title} already solves it`,
    );
  }
  if (timing.renewalDays >= 0 && timing.renewalDays <= 180) parts.push(`renewal in ${timing.renewalDays} days`);
  const s = parts.join(". ").replace(/\.\s*renewal/, ". Renewal");
  return s.endsWith(".") ? s : s + ".";
}

/** "Need → capability", led by the need the why-now trigger is about, so card headline and why-now agree. */
function headline(hits: Hit[], lead?: Hit): string {
  const byTheme = new Map<string, Hit>();
  if (lead) byTheme.set(lead.need.theme, lead);
  for (const h of [...hits].sort((a, b) => b.match.confidence - a.match.confidence)) {
    if (!byTheme.has(h.need.theme)) byTheme.set(h.need.theme, h);
  }
  const top = [...byTheme.values()];
  const first = `${themeLabel(top[0].need.theme)} → ${top[0].cap.title}`;
  return top.length > 1 ? `${first} (+${top.length - 1} more need${top.length > 2 ? "s" : ""})` : first;
}

function evidenceFor(account: AccountIn, hits: Hit[], footprint: string, whyNow: string): EvidenceOut[] {
  const ev: EvidenceOut[] = [];
  const seenNeeds = new Set<string>();
  const seenCaps = new Set<string>();
  for (const h of [...hits].sort((a, b) => b.match.confidence - a.match.confidence)) {
    if (!seenNeeds.has(h.need.id)) {
      seenNeeds.add(h.need.id);
      ev.push({
        kind: "need_quote",
        text: h.need.quote,
        label: `${SOURCE_LABEL[h.need.sourceKind] ?? h.need.sourceKind} · ${contactLabel(account, h.need)} · ${fmtDate(h.need.raisedAt)}`,
        sourceId: h.need.sourceId,
        needId: h.need.id,
        capabilityId: h.cap.id,
        confidence: h.match.confidence,
        date: h.need.raisedAt,
      });
    }
    if (!seenCaps.has(h.cap.id)) {
      seenCaps.add(h.cap.id);
      ev.push({
        kind: "release_line",
        text: h.cap.sourceLine,
        label: h.cap.isNew ? `${h.cap.releaseName} · ${fmtDate(h.cap.releasedAt)}` : h.cap.releaseName,
        sourceId: h.cap.sourceId,
        capabilityId: h.cap.id,
        date: h.cap.releasedAt,
      });
    }
  }
  ev.push({ kind: "footprint", text: footprint, label: "Account footprint" });
  ev.push({ kind: "timing", text: whyNow, label: "Why now" });
  return ev;
}

function footprintText(account: AccountIn, products: ProductIn[]): string {
  const owned = account.ownerships
    .map((o) => {
      const p = products.find((x) => x.id === o.productId);
      const extra = o.addOns.length ? ` + ${o.addOns.join(", ")}` : "";
      return `${p?.name ?? o.productId} (${o.activeSeats}/${o.seats} seats${extra})`;
    })
    .join(", ");
  return `${account.segment}, ${account.agents} support agents. Owns ${owned}.`;
}

export function computeWhitespace(input: WhitespaceInput): WhitespaceResult {
  const { accounts, products, needs, capabilities, matches, today } = input;
  const needById = new Map(needs.map((n) => [n.id, n]));
  const capById = new Map(capabilities.map((c) => [c.id, c]));
  const hitsByAccount = new Map<string, Hit[]>();
  for (const m of matches) {
    if (m.confidence < MIN_MATCH_CONFIDENCE) continue;
    const need = needById.get(m.needId);
    const cap = capById.get(m.capabilityId);
    if (!need || !cap) continue;
    const list = hitsByAccount.get(need.accountId) ?? [];
    list.push({ need, cap, match: m });
    hitsByAccount.set(need.accountId, list);
  }

  const opportunities: OpportunityOut[] = [];
  const matrix: MatrixCell[] = [];

  for (const account of accounts) {
    const discount = SEGMENT_DISCOUNT[account.segment] ?? 1;
    const accountHits = hitsByAccount.get(account.id) ?? [];
    const footprint = footprintText(account, products);

    for (const product of products) {
      const own: OwnershipIn | undefined = account.ownerships.find((o) => o.productId === product.id);
      const hits = accountHits.filter((h) => h.cap.productId === product.id);
      const cellOpps: OpportunityOut[] = [];

      const make = (type: OpportunityType, subset: Hit[], value: number, arrProtected: number, title: string, idSuffix = "", whyPrefix?: string) => {
        if (!subset.length) return;
        const fit = fitScore(subset);
        if (fit < MIN_FIT) return;
        const persona = personaScore(account, product, subset);
        const timing = timingScore(account, subset, today);
        const score = SCORE_WEIGHTS.fit * fit + SCORE_WEIGHTS.persona * persona + SCORE_WEIGHTS.timing * timing.score;
        const weightedValue = value * score;
        const whyNow = buildWhyNow(account, subset, timing, today, whyPrefix);
        const opp: OpportunityOut = {
          id: `opp_${account.id}_${product.id}_${type}${idSuffix}`,
          accountId: account.id,
          productId: product.id,
          type,
          title,
          headline: headline(subset, timing.release),
          value: r0(value),
          arrProtected: r0(arrProtected),
          fitScore: r2(fit),
          personaScore: r2(persona),
          timingScore: r2(timing.score),
          score: r2(score),
          weightedValue: r0(weightedValue),
          priority: r0(type === "adoption" ? arrProtected * ADOPTION_RETENTION_WEIGHT * score : weightedValue),
          rank: 0,
          whyNow,
          releaseDriven: Boolean(timing.release),
          capabilityIds: [...new Set(subset.map((h) => h.cap.id))],
          needIds: [...new Set(subset.map((h) => h.need.id))],
          evidence: evidenceFor(account, subset, footprint, whyNow),
        };
        cellOpps.push(opp);
      };

      const fullSeats = Math.max(1, Math.round(account.agents * product.seatRatio));

      if (!own) {
        // Cross-sell: they don't own the product, but their needs map to it.
        const addOnUplift = new Map<string, number>();
        for (const h of hits) if (h.cap.packaging === "add_on" && h.cap.addOnName) addOnUplift.set(h.cap.addOnName, h.cap.upliftPct ?? DEFAULT_UPLIFT);
        const base = fullSeats * product.pricePerSeat * discount;
        const value = base * (1 + [...addOnUplift.values()].reduce((s, u) => s + u, 0));
        const withAddOns = addOnUplift.size ? ` (with ${[...addOnUplift.keys()].join(", ")})` : "";
        make("cross_sell", hits, value, 0, `Cross-sell ${product.name}${withAddOns}`);
      } else {
        const baseArr = own.seats * product.pricePerSeat * discount;
        // Add-on: a paid add-on (often from a new release) solves an open need.
        const addOnHits = hits.filter((h) => h.cap.packaging === "add_on" && h.cap.addOnName && !own.addOns.includes(h.cap.addOnName));
        for (const name of new Set(addOnHits.map((h) => h.cap.addOnName!))) {
          const subset = addOnHits.filter((h) => h.cap.addOnName === name);
          const uplift = subset[0].cap.upliftPct ?? DEFAULT_UPLIFT;
          make("add_on", subset, baseArr * uplift, 0, `${name} add-on`, `_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
        }
        // Everything they already have access to.
        const coveredHits = hits.filter((h) => !addOnHits.includes(h));
        const gap = fullSeats - own.seats;
        const utilisation = own.seats ? own.activeSeats / own.seats : 0;
        if (gap > 0 && utilisation >= SEAT_UTILISATION_TRIGGER && hits.length) {
          // Seat expansion: the licensed team is maxed out and unlicensed agents share the same needs.
          make(
            "seat_expansion", coveredHits.length ? coveredHits : hits, gap * product.pricePerSeat * discount, 0,
            `Expand ${product.name} by ${gap} seats`, "",
            `${own.activeSeats}/${own.seats} ${product.name} seats in use (${Math.round(utilisation * 100)}%) with ${gap} agents unlicensed`,
          );
        } else if (coveredHits.length) {
          // Adoption: they already own what solves the need. No new ARR, but it protects the renewal (NRR).
          const top = [...coveredHits].sort((a, b) => b.match.confidence - a.match.confidence)[0];
          make("adoption", coveredHits, 0, own.arr, `Drive adoption of ${top.cap.title}`);
        }
      }

      opportunities.push(...cellOpps);
      const revenue = cellOpps.filter((o) => o.type !== "adoption");
      matrix.push({
        accountId: account.id,
        productId: product.id,
        status: own ? "owned" : revenue.length ? "opportunity" : "not_relevant",
        expansion: Boolean(own) && revenue.length > 0,
        value: revenue.reduce((s, o) => s + o.value, 0),
        opportunityIds: cellOpps.map((o) => o.id),
      });
    }
  }

  opportunities.sort((a, b) => b.priority - a.priority || b.score - a.score || a.id.localeCompare(b.id));
  opportunities.forEach((o, i) => (o.rank = i + 1));
  return { opportunities, matrix };
}

export interface WhitespaceSummary {
  unclaimed: number; // sum of estimated ARR across revenue opportunities
  weighted: number; // sum of value * score
  arrProtected: number;
  opportunityCount: number;
  accountsWithOpportunities: number;
  byType: Record<string, { count: number; value: number }>;
  byProduct: Record<string, { count: number; value: number }>;
}

export function summarise(opps: { type: string; value: number; weightedValue: number; arrProtected: number; productId: string; accountId: string }[]): WhitespaceSummary {
  const byType: WhitespaceSummary["byType"] = {};
  const byProduct: WhitespaceSummary["byProduct"] = {};
  let unclaimed = 0;
  let weighted = 0;
  let arrProtected = 0;
  for (const o of opps) {
    (byType[o.type] ??= { count: 0, value: 0 }).count++;
    byType[o.type].value += o.value;
    (byProduct[o.productId] ??= { count: 0, value: 0 }).count++;
    byProduct[o.productId].value += o.value;
    unclaimed += o.value;
    weighted += o.weightedValue;
    arrProtected += o.arrProtected;
  }
  return {
    unclaimed: r0(unclaimed),
    weighted: r0(weighted),
    arrProtected: r0(arrProtected),
    opportunityCount: opps.length,
    accountsWithOpportunities: new Set(opps.map((o) => o.accountId)).size,
    byType,
    byProduct,
  };
}
