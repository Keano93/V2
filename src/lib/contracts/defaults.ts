import type { EventType } from "../events";

/**
 * Starting notice rules for each contract type.
 *
 * EVERY VALUE HERE IS A PLACEHOLDER. They are rough starting points so the app can
 * be demonstrated, not statements of what any contract says. Each rule is stored with
 * verified = false and is shown as "VERIFY" until a person checks it against the
 * actual contract (including any amendments) and ticks it as verified.
 */
export interface DefaultRule {
  eventType: EventType;
  periodDays: number;
  dayBasis: "calendar" | "working";
  recipient: string;
  clauseRef: string;
}

export interface DefaultContractType {
  key: string;
  name: string;
  description: string;
  rules: DefaultRule[];
}

const all = (
  periodDays: number,
  dayBasis: "calendar" | "working",
  recipient: string,
  clauseRef: string,
): DefaultRule[] =>
  (["change", "delay", "instruction", "access", "late_information"] as const).map((eventType) => ({
    eventType,
    periodDays,
    dayBasis,
    recipient,
    clauseRef,
  }));

export const DEFAULT_CONTRACT_TYPES: DefaultContractType[] = [
  {
    key: "pwc",
    name: "Public Works Contract (PWC-style)",
    description: "Irish public works main contract. Placeholder rules: VERIFY against the actual form and schedule.",
    rules: all(20, "working", "Employer's Representative", "Clause [VERIFY]"),
  },
  {
    key: "riai",
    name: "RIAI Standard Form",
    description: "RIAI building contract. Placeholder rules: VERIFY against the actual form.",
    rules: all(14, "calendar", "Architect", "Clause [VERIFY]"),
  },
  {
    key: "nec",
    name: "NEC Engineering and Construction Contract",
    description: "NEC compensation-event style notices. Placeholder rules: VERIFY against the actual form and Z clauses.",
    rules: all(56, "calendar", "Project Manager", "Clause [VERIFY]"),
  },
  {
    key: "bespoke-sub",
    name: "Bespoke subcontract",
    description: "Main contractor's own subcontract terms. Placeholder rules: VERIFY against the signed subcontract.",
    rules: all(7, "calendar", "Main Contractor's Project Manager", "Clause [VERIFY]"),
  },
];
