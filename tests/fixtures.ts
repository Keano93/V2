import type { AccountIn, CapabilityIn, NeedIn, ProductIn } from "../src/lib/engine/types";

export const TODAY = new Date("2026-11-10T00:00:00Z");
export const d = (s: string) => new Date(`${s}T00:00:00Z`);

export const products: ProductIn[] = [
  { id: "desk", name: "Lumio Desk", pricePerSeat: 780, seatRatio: 1, personas: ["support_ops", "head_of_support", "it_admin"] },
  { id: "insights", name: "Lumio Insights", pricePerSeat: 300, seatRatio: 1, personas: ["head_of_support", "support_ops"] },
  { id: "automate", name: "Lumio Automate", pricePerSeat: 420, seatRatio: 1, personas: ["support_ops"] },
];

export function account(over: Partial<AccountIn> = {}): AccountIn {
  return {
    id: "acc_1", name: "Acme", segment: "Mid-Market", team: "DACH", owner: "Rep", agents: 40, renewalDate: d("2027-06-01"),
    contacts: [
      { id: "c1", name: "Ana Ops", title: "Support Operations Manager", personaId: "support_ops" },
      { id: "c2", name: "Ben Boss", title: "Head of Customer Support", personaId: "head_of_support" },
    ],
    ownerships: [{ productId: "desk", seats: 40, activeSeats: 30, arr: 28080, addOns: [] }],
    ...over,
  };
}

export function need(over: Partial<NeedIn> = {}): NeedIn {
  return {
    id: "n1", accountId: "acc_1", theme: "manual_routing", summary: "Manual ticket triage & routing",
    quote: "Every morning two of my leads spend the first hour doing triage, assigning tickets to the right queue by hand.",
    personaId: "support_ops", contactId: "c1", raisedAt: d("2026-01-15"), severity: 2, sourceId: "note_1", sourceKind: "call_note",
    ...over,
  };
}

export function cap(over: Partial<CapabilityIn> = {}): CapabilityIn {
  return {
    id: "cap_routing", productId: "automate", title: "Smart Routing",
    description: "AI reads every new ticket, detects intent, language and urgency, and handles triage and routing to the right queue and agent automatically.",
    themes: ["manual_routing"], personas: ["support_ops"], packaging: "included", addOnName: null, upliftPct: null,
    releasedAt: d("2026-03-10"), isNew: true, sourceLine: "Smart Routing: AI reads every new ticket…", sourceId: "rel_automate_3.0",
    releaseName: "Lumio Automate 3.0",
    ...over,
  };
}
