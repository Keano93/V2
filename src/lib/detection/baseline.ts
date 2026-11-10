import { DateTime } from "luxon";
import type { EventType } from "../events";
import { IRISH_TZ } from "../time";
import type { CandidateEvent, DetectionMessage, DetectionResult } from "./types";

/**
 * Keyword baseline. NOT AI: a deliberately simple rule-based detector so that the
 * pipeline and eval can run without an API key, and so the AI has something to beat.
 * Each message that matches a rule becomes its own candidate event.
 */
const RULES: { type: EventType; re: RegExp; confidence: number }[] = [
  { type: "instruction", re: /\b(instruct(ed|ion)?|go ahead|proceed with|crack on|get going on it)\b/i, confidence: 0.6 },
  { type: "access", re: /\b(not released|refused( us)? access|won't let us|site (is )?closed|turned away|not available (until|till))\b/i, confidence: 0.6 },
  { type: "late_information", re: /\b(still (no|nothing|not back|waiting)|outstanding|overdue|no connection details|not received)\b/i, confidence: 0.5 },
  { type: "change", re: /\b(revised|rev [a-z0-9]+|additional|omit(ted)?|changed? (from|to)|extra over|that's a change)\b/i, confidence: 0.4 },
  { type: "delay", re: /\b(stood down|stopped|can't start|cannot (start|proceed)|hold (on|pending)|not (complete|finished)|idle|standing around|late)\b/i, confidence: 0.4 },
];

export function detectWithBaseline(messages: DetectionMessage[]): DetectionResult {
  const candidates: CandidateEvent[] = [];
  for (const m of messages) {
    const rule = RULES.find((r) => r.re.test(m.body));
    if (!rule) continue;
    const match = m.body.match(rule.re)!;
    const sentence =
      m.body
        .split(/(?<=[.!?])\s+|\n/)
        .find((s) => s.includes(match[0])) ?? m.body.slice(0, 160);
    candidates.push({
      eventType: rule.type,
      title: `Keyword match: "${match[0]}"`,
      summary: sentence.slice(0, 200),
      reasoning: "Matched a keyword rule (baseline detector, not AI).",
      awarenessDate: DateTime.fromJSDate(m.sentAt, { zone: IRISH_TZ }).toISODate()!,
      messageIds: [m.id],
      quote: sentence.trim(),
      quoteMessageId: m.id,
      quoteVerified: true,
      confidence: rule.confidence,
    });
  }
  return { candidates, stats: { batches: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0 } };
}
