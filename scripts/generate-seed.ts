/**
 * Deterministic seed-data generator for the Headstart demo.
 *
 * Writes human-readable files to data/seed/:
 *   company.json, personas.json, products.json, accounts.json (footprint + contacts),
 *   notes.json (~150 call / CS / ticket / account-plan notes),
 *   releases/*.md (10 release notes), product-docs/*.md (baseline capabilities),
 *   answer-key.json (which needs each note really contains, for extraction evals).
 *
 * Run: npm run seed:generate   (same seed => same files)
 * Everything here is fictional.
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import type { PersonaId } from "../src/lib/taxonomy";

const OUT = path.join(process.cwd(), "data", "seed");
const TODAY = new Date("2026-11-10T00:00:00Z");

// ---------- PRNG ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261110);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function weightedPick<T>(items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rand() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dateBetween = (a: string, b: string) =>
  new Date(new Date(a).getTime() + rand() * (new Date(b).getTime() - new Date(a).getTime()));
const fmtMonth = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

// ---------- Company, personas, products ----------
const company = {
  name: "Lumio",
  description:
    "Lumio is a fictional mid-size B2B SaaS company (≈€24M ARR) selling a customer-service platform to European mid-market and enterprise support teams. This demo workspace holds 50 of its customer accounts.",
  currency: "EUR",
};

const personas: { id: PersonaId; name: string; description: string; titles: string[] }[] = [
  {
    id: "head_of_support",
    name: "Head of Customer Support",
    description: "Owns the support budget, CSAT and headcount. Economic buyer for new products.",
    titles: ["Head of Customer Support", "VP Customer Experience", "Director of Support"],
  },
  {
    id: "support_ops",
    name: "Support Operations Manager",
    description: "Runs queues, workflows, SLAs and staffing. Feels efficiency pain daily.",
    titles: ["Support Operations Manager", "Support Team Lead", "CX Operations Lead"],
  },
  {
    id: "knowledge_lead",
    name: "Knowledge & Enablement Lead",
    description: "Owns the help centre, internal knowledge and agent onboarding.",
    titles: ["Knowledge Manager", "Support Enablement Lead", "Content & Self-Service Lead"],
  },
  {
    id: "it_admin",
    name: "IT & Security Admin",
    description: "Owns access, compliance and data protection. Can block or accelerate a deal.",
    titles: ["IT Systems Manager", "Head of IT", "Security & Compliance Lead"],
  },
];

const products = [
  { id: "desk", name: "Lumio Desk", sku: "LUM-DESK", tagline: "Shared inbox and ticketing for every channel.", pricePerSeat: 780, seatRatio: 1, personas: ["support_ops", "head_of_support", "it_admin"] },
  { id: "knowledge", name: "Lumio Knowledge", sku: "LUM-KNOW", tagline: "Help centre, self-service and internal knowledge.", pricePerSeat: 240, seatRatio: 1, personas: ["knowledge_lead", "head_of_support"] },
  { id: "insights", name: "Lumio Insights", sku: "LUM-INSI", tagline: "Analytics, SLA and workforce intelligence.", pricePerSeat: 300, seatRatio: 1, personas: ["head_of_support", "support_ops"] },
  { id: "automate", name: "Lumio Automate", sku: "LUM-AUTO", tagline: "Routing, workflows and AI assistance.", pricePerSeat: 420, seatRatio: 1, personas: ["support_ops"] },
  { id: "voice", name: "Lumio Voice", sku: "LUM-VOIC", tagline: "Cloud telephony built into Desk.", pricePerSeat: 540, seatRatio: 0.6, personas: ["head_of_support", "support_ops", "it_admin"] },
] as const;
type ProductId = (typeof products)[number]["id"];

// ---------- Product docs (baseline capabilities) ----------
const productDocs: Record<ProductId, string> = {
  desk: `# Lumio Desk: product overview

Lumio Desk is the core ticketing product. Every Lumio customer runs on Desk.

## Capabilities
- **Shared inbox & ticketing**: Turn email, chat and web forms into tickets in one shared inbox. Built for support teams. Core to Desk.
- **Roles & permissions**: Granular roles for agents, team leads and admins. Core to Desk.
`,
  knowledge: `# Lumio Knowledge: product overview

## Capabilities
- **Help centre & self-service portal**: Publish a branded help centre so customers find answers to repetitive how-to questions and password reset steps themselves, deflecting tickets. Built for knowledge managers and support leaders. Core to Knowledge.
- **Internal agent knowledge base**: A private knowledge base with guided onboarding paths so new agents ramp faster. Built for enablement leads. Core to Knowledge.
`,
  insights: `# Lumio Insights: product overview

## Capabilities
- **Standard reports & CSAT**: Out-of-the-box volume and backlog reports plus CSAT surveys with sentiment tagging. Built for support leaders. Core to Insights.
`,
  automate: `# Lumio Automate: product overview

## Capabilities
- **Workflow builder**: No-code rules for approvals, refunds and escalations, with Slack and email notifications. Built for support operations managers. Core to Automate.
`,
  voice: `# Lumio Voice: product overview

## Capabilities
- **Cloud telephony inside Desk**: Replace the separate phone system: every call is logged against the ticket, no swivel-chairing to a PBX. Built for support leaders and operations managers. Core to Voice.
`,
};

// ---------- Release notes (10) ----------
const releases: { file: string; product: ProductId; version: string; date: string; body: string }[] = [
  {
    file: "2026-03-10-automate-3.0.md", product: "automate", version: "3.0", date: "2026-03-10",
    body: `## What's new
- **Smart Routing**: AI reads every new ticket, detects intent, language and urgency, and handles triage and routing to the right queue and agent automatically. Built for support operations managers. Included in all Automate plans.
- **Approval chains**: Multi-step approval flows for refunds and goodwill credits, approved straight from Slack. Built for support operations managers. Included in all Automate plans.

## Fixes
- Faster rule evaluation on large rule sets.`,
  },
  {
    file: "2026-04-14-knowledge-2.4.md", product: "knowledge", version: "2.4", date: "2026-04-14",
    body: `## What's new
- **Auto-translate**: Publish every article in 32 languages automatically, with human review for key pages. Translation without the freelancer. Built for knowledge managers. Included in all Knowledge plans.

## Improvements
- New article editor with inline images.`,
  },
  {
    file: "2026-05-19-insights-5.0.md", product: "insights", version: "5.0", date: "2026-05-19",
    body: `## What's new
- **SLA Breach Predictor**: Warns team leads up to four hours before an SLA breach, so you act before the customer notices. Built for support operations managers. Available in the Insights Pro add-on (+30% of your Insights subscription).
- **Executive dashboards**: Scheduled, board-ready dashboard packs that replace the monthly spreadsheet. Built for support leaders. Available in the Insights Pro add-on (+30% of your Insights subscription).`,
  },
  {
    file: "2026-06-09-desk-9.2.md", product: "desk", version: "9.2", date: "2026-06-09",
    body: `## What's new
- **SCIM provisioning & SSO enforcement**: Sync users from Okta or Azure AD, enforce single sign-on and remove leavers automatically. Built for IT and security teams. Included in all Desk plans.
- **Audit log**: A tamper-proof audit log of every admin and ticket change, ready for SOC 2 and ISO 27001 auditors. Built for IT and security teams. Available in the Desk Shield add-on (+15% of your Desk subscription).`,
  },
  {
    file: "2026-07-07-voice-2.0.md", product: "voice", version: "2.0", date: "2026-07-07",
    body: `## What's new
- **Call recording with PCI redaction**: Record calls automatically and redact card numbers from recordings. Built for IT and security teams. Included in all Voice plans.
- **Call summaries**: Every call becomes a transcript and AI-written call notes on the ticket, so wrap-up time drops to seconds. Built for support operations managers. Included in all Voice plans.`,
  },
  {
    file: "2026-08-04-desk-9.3.md", product: "desk", version: "9.3", date: "2026-08-04",
    body: `## What's new
- **EU data residency**: Host all ticket data in our Frankfurt region so it is stored in the EU, with GDPR documentation for your DPO. Built for IT and security teams. Available in the EU Data Residency add-on (+20% of your Desk subscription).`,
  },
  {
    file: "2026-08-25-automate-3.2.md", product: "automate", version: "3.2", date: "2026-08-25",
    body: `## What's new
- **AI Reply Drafts**: Drafts a full, on-brand reply from your knowledge base so agents stop typing the same answers and handle time falls. Built for support operations managers. Available in the Automate Copilot add-on (+35% of your Automate subscription).
- **Virtual Agent 24/7**: Answers customers overnight and at weekends in chat and email, handing over to a human when needed. Built for support leaders. Available in the Automate Copilot add-on (+35% of your Automate subscription).`,
  },
  {
    file: "2026-09-15-insights-5.2.md", product: "insights", version: "5.2", date: "2026-09-15",
    body: `## What's new
- **Workforce forecasting**: Forecast ticket volume by hour and channel and build staffing rosters for every peak. Built for support operations managers. Available in the Insights Pro add-on (+30% of your Insights subscription).`,
  },
  {
    file: "2026-09-29-knowledge-2.6.md", product: "knowledge", version: "2.6", date: "2026-09-29",
    body: `## What's new
- **Content freshness alerts**: Flags stale and outdated articles when the product or the answers agents give change. Built for knowledge managers. Included in all Knowledge plans.
- **Gap finder**: Clusters tickets that have no article and tells you what to write next. Built for knowledge managers. Included in all Knowledge plans.`,
  },
  {
    file: "2026-10-20-desk-9.4.md", product: "desk", version: "9.4", date: "2026-10-20",
    body: `## What's new
- **Salesforce 360 sync**: Two-way sync between tickets and Salesforce accounts. No more copy and paste, and account managers see open tickets in the CRM. Built for support operations managers. Included in all Desk plans.`,
  },
];

// Which product (and add-on, if any) solves each theme: used only to bias which pains each account raises.
const SOLVED_BY: Record<string, { product: ProductId; addOn?: string }> = {
  manual_routing: { product: "automate" },
  approval_workflows: { product: "automate" },
  reply_drafting: { product: "automate", addOn: "Automate Copilot" },
  after_hours: { product: "automate", addOn: "Automate Copilot" },
  ticket_deflection: { product: "knowledge" },
  agent_onboarding: { product: "knowledge" },
  multilingual: { product: "knowledge" },
  stale_knowledge: { product: "knowledge" },
  knowledge_gaps: { product: "knowledge" },
  csat_insight: { product: "insights" },
  sla_visibility: { product: "insights", addOn: "Insights Pro" },
  exec_reporting: { product: "insights", addOn: "Insights Pro" },
  workforce_planning: { product: "insights", addOn: "Insights Pro" },
  phone_channel: { product: "voice" },
  call_compliance: { product: "voice" },
  voice_transcription: { product: "voice" },
  sso_provisioning: { product: "desk" },
  audit_trail: { product: "desk", addOn: "Desk Shield" },
  data_residency: { product: "desk", addOn: "EU Data Residency" },
  crm_sync: { product: "desk" },
};
const ADD_ONS: Record<ProductId, string[]> = {
  desk: ["Desk Shield", "EU Data Residency"],
  knowledge: [],
  insights: ["Insights Pro"],
  automate: ["Automate Copilot"],
  voice: [],
};

// ---------- Pain sentences (what customers actually say) ----------
const PAINS: Record<string, string[]> = {
  manual_routing: [
    "Every morning two of my leads spend the first hour doing triage, assigning tickets to the right queue by hand.",
    "Half our tickets land in the wrong queue and get bounced around before anyone picks them up.",
    "We basically have a full-time dispatcher whose only job is moving tickets to the right team.",
    "Routing is all manual, so urgent issues sit behind password questions.",
  ],
  ticket_deflection: [
    "Probably 40% of our volume is the same questions over and over: how to download an invoice, how to add a user.",
    "Password reset tickets alone eat a full agent's week.",
    "We'd love customers to answer the basic questions themselves instead of emailing us.",
    "Our agents are bored answering repetitive how-to tickets all day.",
  ],
  stale_knowledge: [
    "Half the help centre is out of date since the product redesign and nobody maintains it.",
    "Agents keep sending customers outdated articles with old screenshots.",
    "We have hundreds of stale articles and no way of knowing which ones are wrong.",
  ],
  multilingual: [
    "We just opened in Germany and France and can only support customers in English.",
    "Translating articles into Spanish and Italian is done by a freelancer and takes weeks.",
    "Customers keep asking for help in their own languages and we can't keep up.",
  ],
  agent_onboarding: [
    "It takes new agents three months to ramp because everything is tribal knowledge.",
    "We're hiring twelve people this spring and onboarding new hires is mostly shadowing.",
    "Training new starters eats my senior agents' time.",
  ],
  sla_visibility: [
    "We only find out we've breached an SLA after the fact, when the customer complains.",
    "Last quarter we missed our response targets for our top accounts and nobody saw it coming.",
    "I need an early warning before an SLA breach, not a red number at month end.",
  ],
  exec_reporting: [
    "Every month I spend two days pulling numbers into a spreadsheet for the board pack.",
    "Leadership keeps asking for a support dashboard and I'm building it by hand in Excel.",
    "Our monthly report is stitched together from five different exports.",
  ],
  csat_insight: [
    "CSAT dropped six points this quarter and we honestly don't know why.",
    "We survey customers but can't tell why customers are unhappy; it's just a number.",
    "I want to spot sentiment turning on an account before it becomes a detractor.",
  ],
  workforce_planning: [
    "We were badly understaffed during the January peak and overstaffed in August.",
    "Building the weekly rota is guesswork because we can't forecast ticket volume.",
    "I need to justify headcount to finance and I have no forecast to back it up.",
  ],
  phone_channel: [
    "Our phone system is completely separate, so calls aren't logged against the customer's tickets.",
    "Agents swivel between the PBX and the helpdesk all day.",
    "We run phone queues on an old telephony box nobody wants to touch.",
  ],
  call_compliance: [
    "Our compliance team wants every call recording kept for five years and we can't do that today.",
    "Agents sometimes hear card numbers over the phone and that's a PCI problem for us.",
    "We have to redact card details from recordings manually.",
  ],
  sso_provisioning: [
    "Leavers keep their helpdesk access for weeks because offboarding is manual.",
    "IT wants everything behind Okta with SCIM provisioning before we add more users.",
    "We can't enforce SSO on the helpdesk, which our security review flagged.",
  ],
  audit_trail: [
    "Our SOC 2 auditors asked who changed a ticket's priority and we had no audit log to show them.",
    "We need an audit trail we can hand over for ISO 27001 next spring.",
    "Auditors want evidence of admin changes and today it's screenshots.",
  ],
  data_residency: [
    "Legal says customer data has to be stored in the EU, and right now it sits on US servers.",
    "Data residency is a blocker for our public-sector customers.",
    "Our DPO keeps raising GDPR concerns about where ticket data is hosted.",
  ],
  crm_sync: [
    "Agents copy and paste account details from Salesforce into every ticket.",
    "Our CRM and helpdesk are constantly out of sync, so sales has no idea a key account is unhappy with us.",
    "Account managers can't see open support issues in Salesforce before their calls.",
  ],
  after_hours: [
    "Customers in APAC get no answers overnight because we only staff office hours.",
    "Weekend tickets pile up and Monday mornings are chaos.",
    "Two of our biggest customers asked about 24/7 coverage but we can't afford a night shift.",
  ],
  reply_drafting: [
    "Our handle time is creeping up because agents spend ages writing replies to complex tickets.",
    "Agents are typing the same paragraphs again and again; macros only go so far.",
    "If writing replies took half the time we wouldn't need to hire this year.",
  ],
  approval_workflows: [
    "Every refund over €500 needs an approval and agents spend days chasing managers on Slack.",
    "Escalations go out by email and get lost.",
    "Goodwill credits need two sign-offs and it's all done over email.",
  ],
  voice_transcription: [
    "Agents spend four minutes after every call writing up call notes.",
    "Wrap-up time is killing our phone capacity.",
    "Nobody can summarise calls consistently; half the notes just say 'customer called'.",
  ],
  knowledge_gaps: [
    "We genuinely don't know what to write next; there's no link between tickets and missing articles.",
    "I suspect there are big content gaps but I can't prove which articles we need.",
    "Agents answer things that have no article at all.",
  ],
};

// Paraphrased pains with none of the taxonomy keywords: the rule extractor misses these, Claude should not.
// ~20% of pain mentions use one, so the extraction eval measures something real.
const PARAPHRASES: Record<string, string> = {
  manual_routing: "Someone has to read every incoming email first and decide who should pick it up.",
  ticket_deflection: "Most of what comes in could be answered by a decent FAQ page.",
  stale_knowledge: "Our help pages still show the old menu from two versions ago.",
  multilingual: "Our new customers in Lyon and Munich keep getting replies they struggle to read.",
  agent_onboarding: "It's a quarter before a new starter can work without asking a colleague every five minutes.",
  sla_visibility: "By the time I see we've blown a response target, the customer has already escalated to their account manager.",
  exec_reporting: "Our COO wants one page of support numbers every Monday and it takes my lead half a day to build.",
  csat_insight: "Survey scores keep slipping and the comments don't tell us what to fix.",
  workforce_planning: "We never know how many people to put on shift for Black Friday.",
  phone_channel: "When someone rings us, the conversation isn't attached to anything in the helpdesk.",
  call_compliance: "The regulator expects us to keep conversations with policyholders and we have no way to do it properly.",
  sso_provisioning: "When someone leaves, IT has to remember to remove them from every tool by hand.",
  audit_trail: "Our external assessors want proof of every configuration change and we can't give it to them.",
  data_residency: "Our customer contracts say ticket data may not leave Europe.",
  crm_sync: "Our account managers walk into renewal meetings with no idea the customer has six open complaints.",
  after_hours: "Anyone who writes to us after 6pm on a Friday waits until Monday.",
  reply_drafting: "Our people spend most of each ticket composing the answer, not solving the problem.",
  approval_workflows: "Agents can't give money back without a manager's OK, and managers are never at their desks.",
  voice_transcription: "After hanging up, agents spend ages documenting what was discussed.",
  knowledge_gaps: "We write help content based on gut feel rather than what customers actually ask.",
};

const NOISE = [
  "Renewal paperwork is with their procurement team; no concerns on pricing so far.",
  "They mentioned the team is moving offices in Q1.",
  "Overall relationship is healthy and the champion is engaged.",
  "Asked for the updated invoice to be sent to accounts payable.",
  "Their CEO is speaking at our customer conference in spring.",
  "Mostly positive feedback on the new inbox layout.",
  "They have a new finance director starting next month.",
  "Usage looks steady across both sites.",
  "The team asked for a copy of our latest security whitepaper.",
  "Discussed the product roadmap at a high level.",
  "No open issues with us at the moment.",
  "Their budget cycle starts in October.",
  "They agreed to be a reference for a case study; their legal team is reviewing.",
  "Main contact will be on leave for two weeks in December.",
  "They are restructuring the team into regional pods.",
  "Good energy on the call; they want to see more of the product.",
];
const NEXT_STEPS = [
  "Send recap and book a follow-up in four weeks.",
  "Share the latest customer story from their industry.",
  "Loop in solutions engineering for a deeper session.",
  "Confirm attendees for the next QBR.",
  "Send pricing summary to procurement.",
];

// ---------- Accounts ----------
const ACCOUNTS: [string, string][] = [
  ["Harbourline Logistics", "Logistics"], ["Veltra Insurance", "Insurance"], ["Copperleaf Energy", "Energy"],
  ["Northgate Retail Group", "Retail"], ["Brightwell Health", "Healthcare"], ["Orrin Telecom", "Telecom"],
  ["Kestrel Payments", "Fintech"], ["Albavista Travel", "Travel"], ["Fennick Software", "Software"],
  ["Morrow & Vale Bank", "Banking"], ["Solstice Home", "E-commerce"], ["Tidewater Utilities", "Utilities"],
  ["Greyfield Education", "Education"], ["Pinecrest Hotels", "Hospitality"], ["Quayside Media", "Media"],
  ["Lindqvist Mobility", "Automotive"], ["Arden Pharma", "Pharma"], ["Corvid Security", "Software"],
  ["Halden Property", "Real estate"], ["Mistral Airways", "Travel"], ["Oakmere Foods", "Food & beverage"],
  ["Riverton Council Services", "Public sector"], ["Silverstrand Gaming", "Gaming"], ["Talbot & Reid Legal", "Professional services"],
  ["Umber Fashion", "E-commerce"], ["Valemont Insurance", "Insurance"], ["Wexley Rail", "Transport"],
  ["Ashgrove Clinics", "Healthcare"], ["Beacon Broadband", "Telecom"], ["Calder Fintech", "Fintech"],
  ["Dunmore Distillers", "Food & beverage"], ["Elmstead Housing", "Public sector"], ["Fjordline Ferries", "Transport"],
  ["Glenroe Outdoor", "Retail"], ["Hollis Analytics", "Software"], ["Ibex Engineering", "Manufacturing"],
  ["Juniper Lending", "Banking"], ["Kilnworth Ceramics", "Manufacturing"], ["Larchmont Learning", "Education"],
  ["Marlowe Subscriptions", "E-commerce"], ["Nettlebridge Water", "Utilities"], ["Ostara Wellness", "Healthcare"],
  ["Parkhurst Motors", "Automotive"], ["Quillon Pay", "Fintech"], ["Rookwood Events", "Hospitality"],
  ["Saltmarsh Shipping", "Logistics"], ["Thornbury Pensions", "Insurance"], ["Upland Grocers", "Retail"],
  ["Verity Cloud", "Software"], ["Wrenfield Charities", "Non-profit"],
];
const TEAMS: { team: string; region: string; owners: string[] }[] = [
  { team: "UK & Ireland", region: "UKI", owners: ["Aoife Brennan", "Tom Hargreaves"] },
  { team: "DACH", region: "DACH", owners: ["Lena Vogel", "Markus Feld"] },
  { team: "Nordics & Benelux", region: "NB", owners: ["Sanne de Wit", "Erik Lund"] },
  { team: "Southern Europe", region: "SEU", owners: ["Lucía Romero", "Marco Bassi"] },
];
const FIRST = ["Aisling", "Ben", "Clara", "Dev", "Elena", "Finn", "Grace", "Hugo", "Ines", "Jonas", "Kate", "Liam", "Maya", "Niall", "Olga", "Pieter", "Quinn", "Rosa", "Sam", "Tara", "Ulrich", "Vera", "Will", "Yara", "Zoe", "Ciaran", "Freya", "Matteo", "Nadia", "Oscar", "Priya", "Ruth", "Stefan", "Theo", "Ana", "Bram", "Chloe", "Dara", "Emil", "Fatima"];
const LAST = ["Murphy", "Schmidt", "Jansen", "Rossi", "Kelly", "Nilsson", "Garcia", "Byrne", "Weber", "Dubois", "Novak", "Walsh", "Larsen", "Costa", "Fischer", "Doyle", "Bakker", "Moreau", "Ryan", "Keller", "Lindgren", "Romano", "Brady", "Hoffmann", "Visser", "Lopez", "Quinn", "Berg", "Ferrari", "Nolan"];

const PRODUCT_P: Record<ProductId, number> = { desk: 1, knowledge: 0.5, insights: 0.42, automate: 0.34, voice: 0.26 };
const DISCOUNT: Record<string, number> = { SMB: 1, "Mid-Market": 0.9, Enterprise: 0.8 };

interface ContactOut { id: string; name: string; title: string; email: string; persona: PersonaId }
interface OwnershipOut { product: ProductId; seats: number; activeSeats: number; arr: number; addOns: string[]; since: string }
interface AccountOut {
  id: string; name: string; domain: string; industry: string; segment: string; region: string; team: string; owner: string;
  employees: number; agents: number; contractStart: string; renewalDate: string; contacts: ContactOut[]; ownership: OwnershipOut[];
}

const usedNames = new Set<string>();
function personName() {
  for (;;) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
}

const accounts: AccountOut[] = ACCOUNTS.map(([name, industry], i) => {
  const id = `acc_${String(i + 1).padStart(3, "0")}`;
  const sizeRoll = rand();
  const employees = sizeRoll < 0.3 ? int(80, 240) : sizeRoll < 0.78 ? int(260, 1900) : int(2100, 9000);
  const segment = employees < 250 ? "SMB" : employees < 2000 ? "Mid-Market" : "Enterprise";
  const agents = Math.max(6, Math.round(employees * between(0.025, 0.07)));
  const t = TEAMS[i % TEAMS.length];
  const domain = name.toLowerCase().replace(/&/g, "and").replace(/[^a-z]+/g, "") + ".example";
  const contractStart = dateBetween("2023-01-15", "2025-10-01");
  let renewal = new Date(contractStart);
  while (renewal <= TODAY) renewal = new Date(Date.UTC(renewal.getUTCFullYear() + 1, renewal.getUTCMonth(), renewal.getUTCDate()));

  // Contacts: always a support leader, then 1-3 more personas.
  const personaIds: PersonaId[] = ["head_of_support", ...shuffle<PersonaId>(["support_ops", "knowledge_lead", "it_admin"]).slice(0, int(1, 3))];
  const contacts: ContactOut[] = personaIds.map((p, j) => {
    const nm = personName();
    const persona = personas.find((x) => x.id === p)!;
    return {
      id: `${id}_c${j + 1}`, name: nm, title: pick(persona.titles), persona: p,
      email: nm.toLowerCase().replace(/[^a-z ]/g, "").replace(" ", ".") + "@" + domain,
    };
  });

  const bump = segment === "Enterprise" ? 0.18 : segment === "SMB" ? -0.12 : 0;
  const ownership: OwnershipOut[] = [];
  for (const p of products) {
    if (p.id !== "desk" && !chance(PRODUCT_P[p.id] + bump)) continue;
    const full = Math.round(agents * p.seatRatio);
    const seats = p.id === "desk" ? agents : Math.max(3, Math.round(full * (chance(0.35) ? between(0.45, 0.8) : 1)));
    const usage = chance(0.4) ? between(0.86, 0.99) : between(0.55, 0.85);
    const addOns = ADD_ONS[p.id].filter(() => chance(segment === "Enterprise" ? 0.22 : 0.08));
    const base = seats * p.pricePerSeat * DISCOUNT[segment];
    const upliftOf: Record<string, number> = { "Insights Pro": 0.3, "Desk Shield": 0.15, "EU Data Residency": 0.2, "Automate Copilot": 0.35 };
    const arr = Math.round(base * (1 + addOns.reduce((s, a) => s + upliftOf[a], 0)));
    const since = p.id === "desk" ? contractStart : dateBetween(iso(contractStart), "2025-12-31");
    ownership.push({ product: p.id, seats, activeSeats: Math.round(seats * usage), arr, addOns, since: iso(since) });
  }

  return {
    id, name, domain, industry, segment, region: t.region, team: t.team, owner: t.owners[Math.floor(i / 4) % 2],
    employees, agents, contractStart: iso(contractStart), renewalDate: iso(renewal), contacts, ownership,
  };
});

// ---------- Notes ----------
interface NoteOut {
  id: string; accountId: string; kind: "call_note" | "cs_note" | "support_ticket" | "account_plan";
  title: string; date: string; author: string; contactId: string; body: string;
}
interface AnswerKeyEntry { noteId: string; needs: { theme: string; contactId: string }[] }
const notes: NoteOut[] = [];
const answerKey: AnswerKeyEntry[] = [];
let ticketNo = 48210;

function themeWeight(acc: AccountOut, theme: string): number {
  const s = SOLVED_BY[theme];
  const own = acc.ownership.find((o) => o.product === s.product);
  if (!own) return 2.2; // pain the account can't solve with what it owns: white space
  if (s.addOn && !own.addOns.includes(s.addOn)) return 2;
  return 0.6;
}
function speakerFor(acc: AccountOut, theme: string, themesPersonas: Record<string, PersonaId[]>): ContactOut {
  const wanted = themesPersonas[theme];
  return acc.contacts.find((c) => wanted.includes(c.persona)) ?? acc.contacts[0];
}

// persona hints per theme (mirrors src/lib/taxonomy.ts; kept local so this script has no runtime deps)
const THEME_PERSONAS: Record<string, PersonaId[]> = {
  manual_routing: ["support_ops"], ticket_deflection: ["head_of_support", "knowledge_lead"], stale_knowledge: ["knowledge_lead"],
  multilingual: ["knowledge_lead", "head_of_support"], agent_onboarding: ["knowledge_lead", "support_ops"],
  sla_visibility: ["support_ops", "head_of_support"], exec_reporting: ["head_of_support"], csat_insight: ["head_of_support"],
  workforce_planning: ["support_ops"], phone_channel: ["head_of_support", "support_ops"], call_compliance: ["it_admin"],
  sso_provisioning: ["it_admin"], audit_trail: ["it_admin"], data_residency: ["it_admin"], crm_sync: ["support_ops"],
  after_hours: ["head_of_support"], reply_drafting: ["support_ops"], approval_workflows: ["support_ops"],
  voice_transcription: ["support_ops"], knowledge_gaps: ["knowledge_lead"],
};
const THEME_SUBJECT: Record<string, string> = {
  manual_routing: "Tickets ending up in the wrong team", ticket_deflection: "Can we reduce simple questions?",
  stale_knowledge: "Help centre content issues", multilingual: "Support in more countries",
  agent_onboarding: "Getting new team members productive", sla_visibility: "Missed targets last week",
  exec_reporting: "Monthly numbers for leadership", csat_insight: "Survey scores question",
  workforce_planning: "Planning for next season", phone_channel: "Phone setup question",
  call_compliance: "Compliance question about calls", sso_provisioning: "User access management",
  audit_trail: "Request for change history", data_residency: "Where is our data hosted?",
  crm_sync: "Integration question", after_hours: "Coverage outside business hours",
  reply_drafting: "Agent productivity", approval_workflows: "Process question on refunds",
  voice_transcription: "Phone team admin time", knowledge_gaps: "Content planning",
};

const WINDOWS: [string, string][] = [["2025-11-03", "2026-03-31"], ["2026-04-01", "2026-08-15"], ["2026-08-16", "2026-11-05"]];
const KIND_CYCLE: NoteOut["kind"][] = ["call_note", "cs_note", "support_ticket", "call_note", "account_plan", "cs_note", "call_note", "support_ticket"];

for (const acc of accounts) {
  const allThemes = Object.keys(PAINS);
  const nThemes = int(2, 4);
  const chosen: string[] = [];
  while (chosen.length < nThemes) {
    const t = weightedPick(allThemes.filter((x) => !chosen.includes(x)), (x) => themeWeight(acc, x));
    chosen.push(t);
  }
  // Spread themes across 3 notes; most pains raised in the first two (i.e. months before recent releases).
  const plan: string[][] = [[], [], []];
  chosen.forEach((t, k) => plan[k % 2 === 0 ? 0 : 1].push(t));
  if (chance(0.5)) plan[2].push(pick(chosen)); // a repeat mention, later
  if (chance(0.08)) plan[1] = []; // some notes carry no pain at all

  plan.forEach((themes, n) => {
    const kind = KIND_CYCLE[(notes.length + n) % KIND_CYCLE.length];
    const date = iso(dateBetween(...WINDOWS[n]));
    const id = `note_${String(notes.length + 1).padStart(3, "0")}`;
    const lead = acc.contacts[0];
    const speakers = themes.map((t) => speakerFor(acc, t, THEME_PERSONAS));
    const primary = speakers[0] ?? lead;
    const pains = themes.map((t) => (chance(0.2) ? PARAPHRASES[t] : pick(PAINS[t])));
    const noise = shuffle(NOISE).slice(0, 3);
    let title = "";
    let body = "";
    let author = acc.owner;

    if (kind === "call_note") {
      title = `${pick(["Discovery call", "Account review call", "Expansion call", "Check-in call"])}: ${acc.name}`;
      const attendees = [...new Set([lead, ...speakers])].map((c) => `${c.name} (${c.title})`).join(", ");
      const lines = [`Attendees: ${attendees}; ${acc.owner} (Lumio)`, "", noise[0]];
      themes.forEach((t, k) => lines.push(`${speakers[k].name.split(" ")[0]} (${speakers[k].title}) said: "${pains[k]}"`));
      lines.push(noise[1], "", `Next steps: ${pick(NEXT_STEPS)}`);
      body = lines.join("\n");
    } else if (kind === "cs_note") {
      author = `CSM for ${acc.team}`;
      title = `CS check-in: ${acc.name} (${fmtMonth(new Date(date))})`;
      const lines = [`Health: ${themes.length > 1 ? "Amber" : "Green"}. ${noise[0]}`];
      themes.forEach((t, k) => lines.push(`Raised by ${speakers[k].name}: ${pains[k]}`));
      lines.push(noise[1]);
      body = lines.join("\n");
    } else if (kind === "support_ticket") {
      author = primary.name;
      const subject = themes.length ? THEME_SUBJECT[themes[0]] : "Invoice copy";
      title = `Ticket #${ticketNo++}: ${subject}`;
      const lines = [`From: ${primary.name} <${primary.email}>`, "Priority: Normal", "", "Hi team,"];
      if (themes.length) {
        // Tickets come from one person; keep only the first pain so the speaker attribution is unambiguous.
        themes.splice(1);
        speakers.splice(1);
        lines.push(pains[0], "Is there anything in Lumio that could help with this?");
      } else {
        lines.push("Could you resend last quarter's invoice to our accounts payable team?");
      }
      lines.push("", "Thanks,", primary.name.split(" ")[0]);
      body = lines.join("\n");
    } else {
      title = `Account plan FY27: ${acc.name}`;
      const lines = [`Owner: ${acc.owner}`, `Goals: protect the renewal on ${acc.renewalDate} and grow the footprint.`, "", "Risks & pain points:"];
      themes.forEach((t, k) => lines.push(`- ${pains[k]} (${speakers[k].name}, ${speakers[k].title})`));
      if (!themes.length) lines.push(`- ${noise[2]}`);
      lines.push("", `Relationship: ${noise[0]}`);
      body = lines.join("\n");
    }

    notes.push({ id, accountId: acc.id, kind, title, date, author, contactId: primary.id, body });
    // dedupe themes in the key (a note never repeats a theme)
    const seen = new Set<string>();
    answerKey.push({
      noteId: id,
      needs: themes.flatMap((t, k) => (seen.has(t) ? [] : (seen.add(t), [{ theme: t, contactId: speakers[k].id }]))),
    });
  });
}

// ---------- Write ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "releases"), { recursive: true });
mkdirSync(path.join(OUT, "product-docs"), { recursive: true });
const write = (f: string, data: unknown) =>
  writeFileSync(path.join(OUT, f), typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n");

write("company.json", company);
write("personas.json", personas.map(({ titles, ...p }) => ({ ...p, exampleTitles: titles })));
write("products.json", products);
write("accounts.json", accounts);
write("notes.json", notes);
write("answer-key.json", answerKey);
for (const r of releases) {
  const p = products.find((x) => x.id === r.product)!;
  write(`releases/${r.file}`, `# ${p.name} ${r.version}: release notes\nReleased: ${r.date}\nProduct: ${r.product}\n\n${r.body}\n`);
}
for (const [pid, doc] of Object.entries(productDocs)) write(`product-docs/${pid}.md`, `${doc.trim()}\nProduct: ${pid}\n`);

const needCount = answerKey.reduce((s, a) => s + a.needs.length, 0);
console.log(`Wrote ${accounts.length} accounts, ${notes.length} notes (${needCount} needs in answer key), ${releases.length} release notes to data/seed/`);
