// The needs taxonomy: a controlled vocabulary of customer problems ("jobs").
// Both extractors (Claude and rules) tag needs AND capabilities with these ids, which is what makes
// matching explainable. Add a theme here and both sides pick it up.

export type PersonaId = "head_of_support" | "support_ops" | "knowledge_lead" | "it_admin";

export const PERSONA_IDS: PersonaId[] = ["head_of_support", "support_ops", "knowledge_lead", "it_admin"];

export interface Theme {
  id: string;
  label: string;
  description: string;
  /** Lower-case phrases. Used by the rule-based extractor only. */
  keywords: string[];
  /** Personas who usually raise this need. */
  personas: PersonaId[];
}

export const THEMES: Theme[] = [
  {
    id: "manual_routing",
    label: "Manual ticket triage & routing",
    description: "Tickets are triaged or assigned by hand, land in the wrong queue, or wait for a dispatcher.",
    keywords: ["triage", "routing", "routed", "wrong queue", "assign tickets", "assigning tickets", "dispatcher", "re-assign", "reassign"],
    personas: ["support_ops"],
  },
  {
    id: "ticket_deflection",
    label: "Repetitive how-to tickets",
    description: "Agents spend time answering the same simple questions customers could solve themselves.",
    keywords: ["same questions", "repetitive", "password reset", "how-to", "how do i", "self-service", "self-serve", "deflect", "basic questions"],
    personas: ["head_of_support", "knowledge_lead"],
  },
  {
    id: "stale_knowledge",
    label: "Out-of-date knowledge base",
    description: "Help articles go stale; nobody knows which content is wrong or outdated.",
    keywords: ["out of date", "outdated", "stale", "old articles", "wrong article", "nobody maintains", "no one maintains", "obsolete"],
    personas: ["knowledge_lead"],
  },
  {
    id: "multilingual",
    label: "Multilingual support",
    description: "Customers need support or content in several languages; translation is manual or missing.",
    keywords: ["languages", "translate", "translating", "translation", "translations", "english", "german", "french", "spanish", "italian", "dutch", "localisation", "localization", "multilingual"],
    personas: ["knowledge_lead", "head_of_support"],
  },
  {
    id: "agent_onboarding",
    label: "Slow agent onboarding",
    description: "New agents take too long to become productive; tribal knowledge isn't written down.",
    keywords: ["new agents", "new hires", "onboarding new", "ramp", "tribal knowledge", "shadowing", "training new"],
    personas: ["knowledge_lead", "support_ops"],
  },
  {
    id: "sla_visibility",
    label: "SLA breaches found too late",
    description: "Teams only discover SLA breaches after the fact; no early warning.",
    keywords: ["sla", "slas", "breach", "breached", "missed our response", "response targets", "find out too late", "after the fact"],
    personas: ["support_ops", "head_of_support"],
  },
  {
    id: "exec_reporting",
    label: "Manual executive reporting",
    description: "Leadership reporting is assembled by hand in spreadsheets; no trusted dashboard.",
    keywords: ["board pack", "board report", "spreadsheet", "excel", "exports", "leadership", "monthly report", "dashboard", "exec"],
    personas: ["head_of_support"],
  },
  {
    id: "csat_insight",
    label: "No insight into CSAT drivers",
    description: "They measure CSAT/NPS but can't see why customers are unhappy or spot sentiment shifts.",
    keywords: ["csat", "nps", "satisfaction", "unhappy", "sentiment", "detractor", "why customers"],
    personas: ["head_of_support"],
  },
  {
    id: "workforce_planning",
    label: "Staffing & volume forecasting",
    description: "Hard to forecast ticket volume and staff the right number of agents for peaks.",
    keywords: ["staffing", "forecast", "forecasting", "rota", "rosters", "roster", "headcount", "peak", "seasonal", "understaffed", "overstaffed"],
    personas: ["support_ops"],
  },
  {
    id: "phone_channel",
    label: "Phone support in a separate tool",
    description: "Phone support runs in a separate system; calls aren't logged against tickets.",
    keywords: ["phone system", "telephony", "calls aren't logged", "calls are not logged", "separate phone", "pbx", "swivel", "phone queue", "phone lines"],
    personas: ["head_of_support", "support_ops"],
  },
  {
    id: "call_compliance",
    label: "Call recording & PCI compliance",
    description: "Calls must be recorded and card details redacted for compliance (PCI, FCA, etc.).",
    keywords: ["call recording", "record calls", "recordings", "pci", "card details", "card numbers", "redact", "redacted", "redaction", "compliance team"],
    personas: ["it_admin"],
  },
  {
    id: "sso_provisioning",
    label: "SSO & user provisioning",
    description: "User access is managed by hand; leavers keep access; SSO isn't enforced.",
    keywords: ["sso", "single sign-on", "scim", "okta", "azure ad", "entra", "provisioning", "leavers", "offboarding", "deprovision"],
    personas: ["it_admin"],
  },
  {
    id: "audit_trail",
    label: "Audit trail for compliance",
    description: "Auditors need evidence of who changed what; no exportable audit log.",
    keywords: ["audit log", "audit trail", "auditors", "soc 2", "soc2", "iso 27001", "who changed"],
    personas: ["it_admin"],
  },
  {
    id: "data_residency",
    label: "EU data residency",
    description: "Customer data must be stored in the EU for GDPR / customer contracts.",
    keywords: ["data residency", "hosted in the eu", "eu hosting", "stored in the eu", "gdpr", "us servers", "schrems", "eu data centre", "eu data center"],
    personas: ["it_admin"],
  },
  {
    id: "crm_sync",
    label: "CRM out of sync",
    description: "Support and CRM (e.g. Salesforce) are out of sync; agents copy data between tools.",
    keywords: ["salesforce", "crm", "copy and paste", "copy-paste", "out of sync", "account context", "hubspot"],
    personas: ["support_ops"],
  },
  {
    id: "after_hours",
    label: "No after-hours coverage",
    description: "Customers get no answers outside office hours or at weekends.",
    keywords: ["after hours", "out of hours", "overnight", "weekend", "weekends", "24/7", "night shift", "outside office hours", "chatbot"],
    personas: ["head_of_support"],
  },
  {
    id: "reply_drafting",
    label: "Slow reply writing",
    description: "Agents spend too long writing replies; handle time is high.",
    keywords: ["writing replies", "typing", "handle time", "aht", "draft", "macros", "canned responses", "response time"],
    personas: ["support_ops"],
  },
  {
    id: "approval_workflows",
    label: "Manual approvals & escalations",
    description: "Refunds, credits and escalations need approvals chased over email or chat.",
    keywords: ["approval", "approvals", "refund", "refunds", "credits", "escalation", "escalations", "chasing managers", "sign-off"],
    personas: ["support_ops"],
  },
  {
    id: "voice_transcription",
    label: "Call notes & wrap-up time",
    description: "Agents write up call notes by hand after every call; summaries are inconsistent.",
    keywords: ["call notes", "wrap-up", "wrap up", "after-call", "summarise calls", "summarize calls", "transcript", "transcripts", "transcription", "write up the call"],
    personas: ["support_ops"],
  },
  {
    id: "knowledge_gaps",
    label: "Unknown knowledge gaps",
    description: "They don't know which articles are missing; content isn't driven by ticket demand.",
    keywords: ["what to write", "missing articles", "content gaps", "gaps in", "which articles", "no article"],
    personas: ["knowledge_lead"],
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const THEME_BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export function themeLabel(id: string): string {
  return THEME_BY_ID.get(id)?.label ?? id;
}
