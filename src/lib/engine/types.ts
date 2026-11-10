// Plain domain shapes the engines work on. Kept free of Prisma so the engines are pure and unit-testable.

export interface ContactIn {
  id: string;
  name: string;
  title: string;
  personaId: string | null;
}

export interface OwnershipIn {
  productId: string;
  seats: number;
  activeSeats: number;
  arr: number;
  addOns: string[];
}

export interface AccountIn {
  id: string;
  name: string;
  segment: string;
  team: string;
  owner: string;
  agents: number;
  renewalDate: Date;
  contacts: ContactIn[];
  ownerships: OwnershipIn[];
}

export interface ProductIn {
  id: string;
  name: string;
  pricePerSeat: number;
  seatRatio: number;
  personas: string[];
}

export interface NeedIn {
  id: string;
  accountId: string;
  theme: string;
  summary: string;
  quote: string;
  personaId: string | null;
  contactId: string | null;
  raisedAt: Date;
  severity: number;
  sourceId: string;
  sourceKind: string;
}

export interface CapabilityIn {
  id: string;
  productId: string;
  title: string;
  description: string;
  themes: string[];
  personas: string[];
  packaging: "core" | "included" | "add_on";
  addOnName: string | null;
  upliftPct: number | null;
  releasedAt: Date;
  isNew: boolean;
  sourceLine: string;
  sourceId: string;
  releaseName: string; // e.g. "Lumio Automate 3.0" or "Lumio Desk docs"
}

export interface MatchOut {
  needId: string;
  capabilityId: string;
  confidence: number;
  themeScore: number;
  textScore: number;
  personaScore: number;
  relation: "new_release_after_need" | "existing_capability";
  rationale: string;
}

export type OpportunityType = "cross_sell" | "add_on" | "seat_expansion" | "adoption";

export interface EvidenceOut {
  kind: "need_quote" | "release_line" | "footprint" | "timing";
  text: string;
  label: string;
  sourceId?: string;
  needId?: string;
  capabilityId?: string;
  confidence?: number;
  date?: Date;
}

export interface OpportunityOut {
  id: string;
  accountId: string;
  productId: string;
  type: OpportunityType;
  title: string;
  headline: string;
  value: number;
  arrProtected: number;
  fitScore: number;
  personaScore: number;
  timingScore: number;
  score: number;
  weightedValue: number;
  priority: number;
  rank: number;
  whyNow: string;
  capabilityIds: string[];
  needIds: string[];
  evidence: EvidenceOut[];
}

export type CellStatus = "owned" | "opportunity" | "not_relevant";

export interface MatrixCell {
  accountId: string;
  productId: string;
  status: CellStatus;
  expansion: boolean; // owned, with an add-on / seat opportunity on top
  value: number;
  opportunityIds: string[];
}
