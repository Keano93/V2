// Enablement: foundation pack + account context + short quiz, suggested only when the rep needs it.
//
// Headstart does not author foundation content (the customer's enablement team does; the seed ships
// hypothetical sample content). What Headstart adds is the layer on top: why this account, what they
// said, what to show them, who to talk to, and quiz questions about this specific opportunity.
//
// Everything in this file is pure and deterministic so the same opportunity always produces the same
// quiz, which lets the server grade an attempt without storing the quiz it handed out.
import { fmtDate } from "./dates";
import { themeLabel, THEMES } from "./taxonomy";

export const DEFAULT_PASS_MARK = 80;
export const QUIZ_FOUNDATION_QUESTIONS = 3;

// ---------- types ----------
export interface FoundationQuestion {
  id: string;
  themes: string[];
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
}
export interface FoundationSection { heading: string; points: string[] }
export interface FoundationModuleIn {
  id: string;
  productId: string;
  title: string;
  version: string;
  updatedAt: Date;
  minutes: number;
  sections: FoundationSection[];
  questions: FoundationQuestion[];
  passMark: number | null;
  isSample: boolean;
}
export interface AttemptIn { score: number; passed: boolean; attemptedAt: Date; passMark: number }

export interface PackNeed { id: string; theme: string; quote: string; label: string; contactId: string | null; personaId: string | null; raisedAt: Date }
export interface PackCapability { id: string; title: string; description: string; themes: string[]; personas: string[]; packaging: string; addOnName: string | null; upliftPct: number | null; isNew: boolean; releasedAt: Date; releaseName: string; productId: string }
export interface PackContact { id: string; name: string; title: string; personaId: string | null }

export interface PackInput {
  opportunity: { id: string; title: string; type: string; value: number; whyNow: string; headline: string; productId: string; productName: string };
  account: { id: string; name: string; owner: string; segment: string };
  footprint: string;
  needs: PackNeed[];
  capabilities: PackCapability[];
  contacts: PackContact[];
  productPersonas: string[];
  /** Titles of every capability in the catalogue, for quiz distractors. */
  allCapabilityTitles: string[];
}

export type RecommendationKind = "foundation" | "retake" | "refresher" | "none";
export interface Recommendation { recommended: boolean; kind: RecommendationKind; reason: string }

export const PERSONA_NAME: Record<string, string> = {
  head_of_support: "Head of Support",
  support_ops: "Support Ops",
  knowledge_lead: "Knowledge Lead",
  it_admin: "IT & Security",
};

// ---------- deterministic randomness ----------
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: string) {
  let a = seedOf(seed);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(xs: T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- when to suggest it ----------
/**
 * Suggest the pack only when it's relevant:
 *  - the rep has never passed this product's foundation (or failed last time), or
 *  - they passed, but a capability in this opportunity shipped after they passed (refresher).
 */
export function recommend(rep: string, module: FoundationModuleIn, attempts: AttemptIn[], caps: PackCapability[]): Recommendation {
  const first = rep.split(" ")[0];
  const sorted = [...attempts].sort((a, b) => b.attemptedAt.getTime() - a.attemptedAt.getTime());
  const lastPass = sorted.find((a) => a.passed);
  if (!lastPass) {
    const lastFail = sorted[0];
    if (lastFail) {
      return {
        recommended: true, kind: "retake",
        reason: `${first} scored ${lastFail.score}% on ${module.title} on ${fmtDate(lastFail.attemptedAt)} (pass mark ${lastFail.passMark}%). Retake before this conversation.`,
      };
    }
    return { recommended: true, kind: "foundation", reason: `${first} hasn't completed ${module.title} yet.` };
  }
  const newer = caps.filter((c) => c.isNew && c.releasedAt > lastPass.attemptedAt).sort((a, b) => b.releasedAt.getTime() - a.releasedAt.getTime());
  if (newer.length) {
    const c = newer[0];
    return {
      recommended: true, kind: "refresher",
      reason: `${c.title} shipped in ${c.releaseName} on ${fmtDate(c.releasedAt)}, after ${first} passed ${module.title} on ${fmtDate(lastPass.attemptedAt)}. A quick refresher covers what's new.`,
    };
  }
  return {
    recommended: false, kind: "none",
    reason: `${first} passed ${module.title} on ${fmtDate(lastPass.attemptedAt)} (${lastPass.score}%) and it covers everything in this play. The pack is here as a refresher.`,
  };
}

// ---------- the context layer Headstart adds ----------
export interface ContextLayer {
  opener: string;
  whyNow: string;
  footprint: string;
  saidBy: { quote: string; label: string; theme: string }[];
  show: { need: string; capability: string; detail: string; packaging: string }[];
  talkTo: { name: string; title: string; persona: string; note: string }[];
  gaps: string[];
}

function packagingText(c: PackCapability): string {
  if (c.packaging === "add_on") return `${c.addOnName ?? "Add-on"}${c.upliftPct ? ` (+${Math.round(c.upliftPct * 100)}%)` : ""}`;
  if (c.packaging === "included") return "Included";
  return "Core";
}

/** The same sentence often turns up in several notes; show it once and say when it came up again. */
function dedupeQuotes(needs: PackNeed[]): ContextLayer["saidBy"] {
  const out = new Map<string, { quote: string; label: string; theme: string; again: Date[] }>();
  for (const n of [...needs].sort((a, b) => a.raisedAt.getTime() - b.raisedAt.getTime())) {
    const key = n.quote.trim().toLowerCase();
    const hit = out.get(key);
    if (hit) hit.again.push(n.raisedAt);
    else out.set(key, { quote: n.quote, label: n.label, theme: themeLabel(n.theme), again: [] });
  }
  return [...out.values()].map(({ again, ...q }) => ({
    ...q,
    label: again.length ? `${q.label} · raised again ${again.map(fmtDate).join(", ")}` : q.label,
  }));
}

export function buildContext(p: PackInput): ContextLayer {
  const byTheme = new Map<string, PackNeed>();
  for (const n of [...p.needs].sort((a, b) => a.raisedAt.getTime() - b.raisedAt.getTime())) if (!byTheme.has(n.theme)) byTheme.set(n.theme, n);
  const show = [...byTheme.values()].flatMap((n) => {
    const c = p.capabilities.find((x) => x.themes.includes(n.theme));
    return c ? [{ need: themeLabel(n.theme), capability: c.title, detail: c.description, packaging: packagingText(c) }] : [];
  });

  const target = new Set([...p.productPersonas, ...p.capabilities.flatMap((c) => c.personas)]);
  const raisedBy = new Map<string, string[]>();
  for (const n of p.needs) if (n.contactId) raisedBy.set(n.contactId, [...new Set([...(raisedBy.get(n.contactId) ?? []), themeLabel(n.theme).toLowerCase()])]);
  const talkTo = p.contacts
    .filter((c) => raisedBy.has(c.id) || (c.personaId && target.has(c.personaId)))
    .sort((a, b) => Number(raisedBy.has(b.id)) - Number(raisedBy.has(a.id)))
    .map((c) => ({
      name: c.name, title: c.title, persona: c.personaId ? PERSONA_NAME[c.personaId] ?? c.personaId : "",
      note: raisedBy.has(c.id) ? `Raised ${raisedBy.get(c.id)!.join(" and ")}.` : `${PERSONA_NAME[c.personaId!] ?? "This persona"} is a buyer for ${p.opportunity.productName}.`,
    }));
  const present = new Set(p.contacts.map((c) => c.personaId).filter(Boolean));
  const champion = talkTo[0]?.name.split(" ")[0];
  const gaps = [...target].filter((t) => !present.has(t)).map((t) =>
    `No ${PERSONA_NAME[t] ?? t} contact on file. ${champion ? `Ask ${champion} for an introduction.` : "Find one before the meeting."}`);

  const lead = [...byTheme.values()][0];
  const leadCap = lead ? p.capabilities.find((c) => c.themes.includes(lead.theme)) : undefined;
  const leadContact = lead?.contactId ? p.contacts.find((c) => c.id === lead.contactId) : undefined;
  const opener = lead && leadCap
    ? `${leadContact ? leadContact.name.split(" ")[0] + ", w" : "W"}hen we spoke on ${fmtDate(lead.raisedAt)} you said “${lead.quote.replace(/[.!?]+$/, "")}”. ${leadCap.isNew && leadCap.releasedAt > lead.raisedAt ? `Since then we've shipped ${leadCap.title}` : `${leadCap.title} in ${p.opportunity.productName} is built for exactly that`}. Worth 20 minutes to show you?`
    : `Suggested opener: ${p.opportunity.headline}.`;

  return {
    opener,
    whyNow: p.opportunity.whyNow,
    footprint: p.footprint,
    saidBy: dedupeQuotes(p.needs),
    show,
    talkTo,
    gaps,
  };
}

// ---------- quiz ----------
export interface QuizQuestion { id: string; source: "foundation" | "account"; prompt: string; options: string[]; answer: number; explain: string }
export type PublicQuizQuestion = Omit<QuizQuestion, "answer" | "explain">;

function contextQuestions(p: PackInput, r: () => number): QuizQuestion[] {
  const qs: QuizQuestion[] = [];
  const lead = [...p.needs].sort((a, b) => a.raisedAt.getTime() - b.raisedAt.getTime())[0];
  if (!lead) return qs;
  const contact = lead.contactId ? p.contacts.find((c) => c.id === lead.contactId) : undefined;
  const who = contact ? `${contact.name} (${contact.title})` : `the customer`;
  const raised = new Set(p.needs.map((n) => n.theme));
  const wrongThemes = shuffled(THEMES.filter((t) => !raised.has(t.id)), r).slice(0, 3).map((t) => t.label);
  const right = themeLabel(lead.theme);
  const opts1 = shuffled([right, ...wrongThemes], r);
  qs.push({
    id: "ctx1", source: "account",
    prompt: `What problem did ${who} at ${p.account.name} raise?`,
    options: opts1, answer: opts1.indexOf(right),
    explain: `On ${fmtDate(lead.raisedAt)}: “${lead.quote}”`,
  });
  const cap = p.capabilities.find((c) => c.themes.includes(lead.theme));
  if (cap) {
    const ownTitles = new Set(p.capabilities.map((c) => c.title));
    const wrongCaps = shuffled([...new Set(p.allCapabilityTitles)].filter((t) => !ownTitles.has(t)), r).slice(0, 3);
    const opts2 = shuffled([cap.title, ...wrongCaps], r);
    qs.push({
      id: "ctx2", source: "account",
      prompt: `Which capability do you lead with for that problem?`,
      options: opts2, answer: opts2.indexOf(cap.title),
      explain: `${cap.title} (${cap.releaseName}, ${packagingText(cap)}): ${cap.description}`,
    });
  }
  return qs;
}

/** 3 foundation questions (most relevant to this play first) + up to 2 about this account. Deterministic per opportunity. */
export function buildQuiz(module: FoundationModuleIn, p: PackInput): QuizQuestion[] {
  const r = rng(`${p.opportunity.id}|${module.id}|${module.version}`);
  const themes = new Set([...p.needs.map((n) => n.theme), ...p.capabilities.flatMap((c) => c.themes)]);
  const ranked = [...module.questions].sort((a, b) => {
    const ra = a.themes.some((t) => themes.has(t)) ? 0 : 1;
    const rb = b.themes.some((t) => themes.has(t)) ? 0 : 1;
    return ra - rb || module.questions.indexOf(a) - module.questions.indexOf(b);
  });
  const foundation = ranked.slice(0, QUIZ_FOUNDATION_QUESTIONS).map((q): QuizQuestion => {
    const order = shuffled(q.options.map((_, i) => i), r);
    return {
      id: `f_${q.id}`, source: "foundation", prompt: q.prompt,
      options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer), explain: q.explain,
    };
  });
  return [...foundation, ...contextQuestions(p, r)];
}

export function publicQuiz(qs: QuizQuestion[]): PublicQuizQuestion[] {
  return qs.map(({ answer: _a, explain: _e, ...rest }) => rest);
}

export interface GradeResult {
  score: number; correct: number; total: number; passMark: number; passed: boolean;
  results: { id: string; correct: boolean; chosen: number | null; answer: number; explain: string }[];
}

export function grade(qs: QuizQuestion[], answers: Record<string, number>, passMark: number): GradeResult {
  const results = qs.map((q) => {
    const chosen = Number.isInteger(answers[q.id]) ? answers[q.id] : null;
    return { id: q.id, correct: chosen === q.answer, chosen, answer: q.answer, explain: q.explain };
  });
  const correct = results.filter((x) => x.correct).length;
  const score = qs.length ? Math.round((correct / qs.length) * 100) : 0;
  return { score, correct, total: qs.length, passMark, passed: score >= passMark, results };
}
