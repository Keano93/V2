import { describe, expect, it } from "vitest";
import { postProcessNeeds } from "../src/lib/extract/claude";
import { extractCapabilitiesRules, extractNeedsRules, themesIn } from "../src/lib/extract/rules";
import type { NeedSource } from "../src/lib/extract/types";
import { parseCsv } from "../src/lib/ingest";

const src: NeedSource = {
  id: "note_1", kind: "call_note", title: "Discovery call: Acme", date: new Date("2026-01-10"), accountName: "Acme", contactId: "c1",
  contacts: [
    { id: "c1", name: "Ana Ops", title: "Support Operations Manager", personaId: "support_ops" },
    { id: "c2", name: "Ivo Admin", title: "Head of IT", personaId: "it_admin" },
  ],
  body: [
    "Attendees: Ana Ops (Support Operations Manager), Ivo Admin (Head of IT); Rep (Lumio)",
    "Overall relationship is healthy and the champion is engaged.",
    'Ivo (Head of IT) said: "Leavers keep their helpdesk access for weeks because offboarding is manual."',
    'Ana (Support Operations Manager) said: "Half our tickets land in the wrong queue and get bounced around."',
    "Next steps: Send recap.",
  ].join("\n"),
};

describe("rule extractor", () => {
  it("matches keywords on word boundaries only", () => {
    expect(themesIn("Translating articles takes weeks").map((t) => t.id)).toContain("multilingual");
    expect(themesIn("Translating articles takes weeks").map((t) => t.id)).not.toContain("sla_visibility");
    expect(themesIn("chasing managers on Slack").map((t) => t.id)).not.toContain("sla_visibility");
  });

  it("extracts one need per pain, attributes the speaker and keeps the verbatim quote", () => {
    const needs = extractNeedsRules(src);
    expect(needs.map((n) => n.theme).sort()).toEqual(["manual_routing", "sso_provisioning"]);
    const sso = needs.find((n) => n.theme === "sso_provisioning")!;
    expect(sso.contactId).toBe("c2");
    expect(sso.personaId).toBe("it_admin");
    expect(src.body).toContain(sso.quote);
  });

  it("parses capabilities, packaging and add-on uplift from release notes", () => {
    const caps = extractCapabilitiesRules({
      id: "rel", kind: "release_note", title: "Insights 5.0", productId: "insights", date: new Date(),
      body: "- **SLA Breach Predictor**: Warns team leads up to four hours before an SLA breach. Built for support operations managers. Available in the Insights Pro add-on (+30% of your Insights subscription).\n- **Thing**: Included in all plans.",
    });
    expect(caps[0]).toMatchObject({ title: "SLA Breach Predictor", packaging: "add_on", addOnName: "Insights Pro", upliftPct: 0.3, personas: ["support_ops"] });
    expect(caps[0].themes).toContain("sla_visibility");
    expect(caps[1].packaging).toBe("included");
  });
});

describe("Claude post-processing", () => {
  const base = { summary: "s", persona: null, severity: 2 };
  it("drops needs whose quote is not in the source (no invented evidence)", () => {
    const out = postProcessNeeds(src, [
      { ...base, theme: "manual_routing", quote: "Half our tickets land in the wrong queue and get bounced around.", contact_name: "Ana Ops" },
      { ...base, theme: "data_residency", quote: "We need EU hosting.", contact_name: null },
    ]);
    expect(out.map((n) => n.theme)).toEqual(["manual_routing"]);
    expect(out[0].contactId).toBe("c1");
  });

  it("dedupes themes, resolves first names and clamps severity", () => {
    const out = postProcessNeeds(src, [
      { ...base, theme: "sso_provisioning", quote: "Leavers keep their helpdesk access for weeks because offboarding is manual.", contact_name: "Ivo", severity: 7 },
      { ...base, theme: "sso_provisioning", quote: "offboarding is manual", contact_name: "Ivo" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ contactId: "c2", personaId: "it_admin", severity: 3 });
  });
});

describe("CSV parser", () => {
  it("handles quotes, escaped quotes and embedded newlines", () => {
    const rows = parseCsv('id,body\n1,"Hello, ""world""\nline two"\n2,plain\n');
    expect(rows).toEqual([{ id: "1", body: 'Hello, "world"\nline two' }, { id: "2", body: "plain" }]);
  });
});
