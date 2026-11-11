import { describe, expect, it } from "vitest";
import { buildContext, buildQuiz, grade, publicQuiz, recommend, type FoundationModuleIn, type PackInput } from "../src/lib/enablement";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const module: FoundationModuleIn = {
  id: "fnd_automate", productId: "automate", title: "Lumio Automate foundations", version: "3.2", updatedAt: d("2026-08-25"),
  minutes: 10, passMark: null, isSample: true,
  sections: [{ heading: "What's new", points: ["Smart Routing"] }],
  questions: [
    { id: "a1", themes: ["manual_routing"], prompt: "Routing uses?", options: ["Rota", "Intent, language and urgency", "Keywords", "ARR"], answer: 1, explain: "Intent." },
    { id: "a2", themes: ["reply_drafting"], prompt: "Copilot has?", options: ["Routing", "Reply Drafts", "Builder", "All"], answer: 1, explain: "Drafts." },
    { id: "a3", themes: [], prompt: "Uplift?", options: ["15", "20", "30", "35"], answer: 3, explain: "35." },
    { id: "a4", themes: ["manual_routing"], prompt: "Routing ships in?", options: ["2.0", "3.0", "3.2", "4.0"], answer: 1, explain: "3.0." },
  ],
};

const input: PackInput = {
  opportunity: { id: "opp_1", title: "Cross-sell Lumio Automate", type: "cross_sell", value: 40000, whyNow: "Smart Routing shipped…", headline: "Routing → Smart Routing", productId: "automate", productName: "Lumio Automate" },
  account: { id: "acc_1", name: "Acme", owner: "Lena Vogel", segment: "Mid-Market" },
  footprint: "Owns Desk.",
  needs: [
    { id: "n1", theme: "manual_routing", quote: "Half our tickets land in the wrong queue.", label: "Call note · Kate", contactId: "c1", personaId: "head_of_support", raisedAt: d("2026-01-07") },
    { id: "n2", theme: "manual_routing", quote: "Half our tickets land in the wrong queue.", label: "CS note · Kate", contactId: "c1", personaId: "head_of_support", raisedAt: d("2026-05-01") },
  ],
  capabilities: [{
    id: "cap1", title: "Smart Routing", description: "Routes tickets.", themes: ["manual_routing"], personas: ["support_ops"],
    packaging: "included", addOnName: null, upliftPct: null, isNew: true, releasedAt: d("2026-03-10"), releaseName: "Lumio Automate 3.0", productId: "automate",
  }],
  contacts: [{ id: "c1", name: "Kate Costa", title: "Head of Customer Support", personaId: "head_of_support" }],
  productPersonas: ["support_ops"],
  allCapabilityTitles: ["Smart Routing", "Audit log", "Gap finder", "Call summaries", "AI Reply Drafts"],
};

describe("enablement recommendation", () => {
  const cap = input.capabilities;
  it("suggests the foundation when the rep has never taken it", () => {
    expect(recommend("Lena Vogel", module, [], cap)).toMatchObject({ recommended: true, kind: "foundation" });
  });
  it("suggests a retake after a failed attempt", () => {
    const r = recommend("Erik Lund", module, [{ score: 60, passed: false, passMark: 80, attemptedAt: d("2026-10-15") }], cap);
    expect(r.kind).toBe("retake");
    expect(r.reason).toContain("60%");
  });
  it("suggests a refresher when a capability in the play shipped after the rep passed", () => {
    const r = recommend("Tom Hargreaves", module, [{ score: 80, passed: true, passMark: 80, attemptedAt: d("2026-02-02") }], cap);
    expect(r).toMatchObject({ recommended: true, kind: "refresher" });
    expect(r.reason).toContain("Smart Routing");
  });
  it("does not push the pack on a rep who is current", () => {
    const r = recommend("Markus Feld", module, [{ score: 100, passed: true, passMark: 80, attemptedAt: d("2026-09-02") }], cap);
    expect(r).toMatchObject({ recommended: false, kind: "none" });
  });
});

describe("context layer", () => {
  it("quotes the customer once, names who to talk to, and flags missing personas", () => {
    const c = buildContext(input);
    expect(c.saidBy).toHaveLength(1);
    expect(c.saidBy[0].label).toContain("raised again");
    expect(c.show[0]).toMatchObject({ capability: "Smart Routing", packaging: "Included" });
    expect(c.talkTo[0].name).toBe("Kate Costa");
    expect(c.gaps.join(" ")).toMatch(/No Support Ops contact/);
    expect(c.opener).toContain("Since then we've shipped Smart Routing");
  });
});

describe("quiz", () => {
  it("leads with foundation questions relevant to the play, then adds account questions", () => {
    const q = buildQuiz(module, input);
    expect(q.map((x) => x.id)).toEqual(["f_a1", "f_a4", "f_a2", "ctx1", "ctx2"]);
    expect(q[3].options[q[3].answer]).toBe("Manual ticket triage & routing");
    expect(q[4].options[q[4].answer]).toBe("Smart Routing");
    expect(q[4].options).not.toContain(undefined);
  });
  it("is deterministic, so the server can grade without storing the quiz", () => {
    expect(buildQuiz(module, input)).toEqual(buildQuiz(module, input));
  });
  it("never sends answers to the client", () => {
    for (const q of publicQuiz(buildQuiz(module, input))) {
      expect(q).not.toHaveProperty("answer");
      expect(q).not.toHaveProperty("explain");
    }
  });
  it("grades against an adjustable pass mark", () => {
    const q = buildQuiz(module, input);
    const all = Object.fromEntries(q.map((x) => [x.id, x.answer]));
    const fourOfFive = { ...all, [q[0].id]: (q[0].answer + 1) % 4 };
    expect(grade(q, all, 80)).toMatchObject({ score: 100, passed: true });
    expect(grade(q, fourOfFive, 80)).toMatchObject({ score: 80, passed: true, correct: 4 });
    expect(grade(q, fourOfFive, 90)).toMatchObject({ passed: false });
    expect(grade(q, {}, 80)).toMatchObject({ score: 0, passed: false });
  });
});
