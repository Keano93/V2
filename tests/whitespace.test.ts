import { describe, expect, it } from "vitest";
import { matchNeeds } from "../src/lib/engine/matching";
import { computeWhitespace, SEGMENT_DISCOUNT, summarise } from "../src/lib/engine/whitespace";
import type { AccountIn, CapabilityIn, NeedIn } from "../src/lib/engine/types";
import { account, cap, d, need, products, TODAY } from "./fixtures";

function run(accounts: AccountIn[], needs: NeedIn[], caps: CapabilityIn[]) {
  const matches = matchNeeds(needs, caps);
  return computeWhitespace({ accounts, products, needs, capabilities: caps, matches, today: TODAY });
}

describe("white-space engine", () => {
  it("creates a cross-sell for an unowned product that solves an open need, valued at list × seats × discount", () => {
    const { opportunities, matrix } = run([account()], [need()], [cap()]);
    const o = opportunities.find((x) => x.type === "cross_sell")!;
    expect(o.productId).toBe("automate");
    expect(o.value).toBe(Math.round(40 * 420 * SEGMENT_DISCOUNT["Mid-Market"]));
    expect(o.whyNow).toContain("Smart Routing shipped in Lumio Automate 3.0");
    expect(o.evidence.some((e) => e.kind === "need_quote" && e.text.includes("triage"))).toBe(true);
    expect(o.evidence.some((e) => e.kind === "release_line")).toBe(true);
    expect(matrix.find((c) => c.productId === "automate")!.status).toBe("opportunity");
    expect(matrix.find((c) => c.productId === "desk")!.status).toBe("owned");
    expect(matrix.find((c) => c.productId === "insights")!.status).toBe("not_relevant");
  });

  it("adds add-on uplift to a cross-sell when an add-on capability is what solves the need", () => {
    const copilot = cap({ id: "cap_drafts", title: "AI Reply Drafts", themes: ["reply_drafting"], packaging: "add_on", addOnName: "Automate Copilot", upliftPct: 0.35, description: "Drafts replies so agents stop typing the same answers and handle time falls." });
    const n = need({ id: "n2", theme: "reply_drafting", quote: "Agents are typing the same paragraphs again and again; macros only go so far.", summary: "Slow reply writing" });
    const o = run([account()], [n], [copilot]).opportunities[0];
    expect(o.title).toContain("Automate Copilot");
    expect(o.value).toBe(Math.round(40 * 420 * 0.9 * 1.35));
  });

  it("creates an add-on opportunity on an owned product, valued as uplift on its base", () => {
    const shield = cap({
      id: "cap_audit", productId: "desk", title: "Audit log", themes: ["audit_trail"], personas: ["it_admin"], packaging: "add_on",
      addOnName: "Desk Shield", upliftPct: 0.15, releasedAt: d("2026-06-09"), releaseName: "Lumio Desk 9.2",
      description: "A tamper-proof audit log of every admin and ticket change, ready for SOC 2 auditors.",
    });
    const n = need({ theme: "audit_trail", quote: "Our SOC 2 auditors asked who changed a ticket's priority and we had no audit log.", personaId: null, contactId: null, summary: "Audit trail" });
    const { opportunities, matrix } = run([account()], [n], [shield]);
    const o = opportunities[0];
    expect(o.type).toBe("add_on");
    expect(o.value).toBe(Math.round(40 * 780 * 0.9 * 0.15));
    expect(matrix.find((c) => c.productId === "desk")).toMatchObject({ status: "owned", expansion: true });
  });

  it("does not sell an add-on the account already owns; it becomes adoption instead", () => {
    const shield = cap({ id: "cap_audit", productId: "desk", title: "Audit log", themes: ["audit_trail"], personas: ["it_admin"], packaging: "add_on", addOnName: "Desk Shield", upliftPct: 0.15, description: "Audit log for SOC 2 auditors." });
    const acc = account({ ownerships: [{ productId: "desk", seats: 40, activeSeats: 30, arr: 32000, addOns: ["Desk Shield"] }] });
    const n = need({ theme: "audit_trail", quote: "Our SOC 2 auditors asked for an audit log.", summary: "Audit trail" });
    const [o] = run([acc], [n], [shield]).opportunities;
    expect(o.type).toBe("adoption");
    expect(o.value).toBe(0);
    expect(o.arrProtected).toBe(32000);
  });

  it("suggests seat expansion only when the licensed team is near capacity", () => {
    const report = cap({ id: "cap_csat", productId: "insights", title: "Standard reports & CSAT", themes: ["csat_insight"], personas: ["head_of_support"], packaging: "core", isNew: false, releasedAt: d("2024-01-01"), description: "CSAT surveys with sentiment tagging." });
    const n = need({ theme: "csat_insight", quote: "CSAT dropped six points this quarter and we honestly don't know why.", personaId: "head_of_support", contactId: "c2", summary: "CSAT" });
    const busy = account({ ownerships: [{ productId: "desk", seats: 40, activeSeats: 40, arr: 1 }, { productId: "insights", seats: 20, activeSeats: 19, arr: 5400, addOns: [] }].map((o) => ({ addOns: [], ...o })) });
    const quiet = account({ ownerships: [{ productId: "desk", seats: 40, activeSeats: 40, arr: 1, addOns: [] }, { productId: "insights", seats: 20, activeSeats: 10, arr: 5400, addOns: [] }] });
    const busyOpp = run([busy], [n], [report]).opportunities[0];
    expect(busyOpp.type).toBe("seat_expansion");
    expect(busyOpp.value).toBe(Math.round(20 * 300 * 0.9));
    expect(busyOpp.whyNow).toMatch(/19\/20 Lumio Insights seats in use/);
    expect(run([quiet], [n], [report]).opportunities[0].type).toBe("adoption");
  });

  it("ranks fresher, better-fitting opportunities above stale ones of equal value", () => {
    const fresh = account({ id: "acc_fresh" });
    const stale = account({ id: "acc_stale", contacts: [] });
    const needs = [
      need({ id: "nf", accountId: "acc_fresh", raisedAt: d("2026-01-01") }),
      need({ id: "ns", accountId: "acc_stale", raisedAt: d("2026-06-01"), personaId: null, contactId: null }),
    ];
    const { opportunities } = run([stale, fresh], needs, [cap({ releasedAt: d("2026-10-01") })]);
    expect(opportunities.map((o) => o.accountId)).toEqual(["acc_fresh", "acc_stale"]);
    expect(opportunities[0].rank).toBe(1);
    expect(opportunities[0].timingScore).toBe(1);
  });

  it("summarises unclaimed value across revenue opportunities", () => {
    const { opportunities } = run([account()], [need()], [cap()]);
    const s = summarise(opportunities.filter((o) => o.type !== "adoption"));
    expect(s.unclaimed).toBe(opportunities[0].value);
    expect(s.opportunityCount).toBe(1);
    expect(s.byProduct.automate.count).toBe(1);
  });

  it("creates nothing when there are no needs", () => {
    const { opportunities, matrix } = run([account()], [], [cap()]);
    expect(opportunities).toHaveLength(0);
    expect(matrix.filter((c) => c.status === "opportunity")).toHaveLength(0);
  });
});
