import { DateTime } from "luxon";
import { z } from "zod";
import { EVENT_TYPES } from "../events";
import { IRISH_TZ } from "../time";
import type { DetectionMessage, ProjectContext } from "./types";

/** Bump whenever the prompt or schema changes, so cached responses are not reused. */
export const PROMPT_VERSION = "detect-v1";

export const SYSTEM_PROMPT = `You review project communications for a contractor on Irish construction projects and flag potential notifiable events: things that may entitle the contractor to extra time or money, but only if a formal notice is issued within the contract's notice period.

Flag an event when the messages show something that is the other side's risk (the employer, the main contractor if we are a subcontractor, their designers, their other contractors, or utilities working under their arrangements). These are the event types:
- change: a change to the design, scope, specification or quantities (revised drawings or specs that alter the work, added or omitted items, client requests for something different).
- instruction: an instruction from the employer's or main contractor's side to do something, including verbal or WhatsApp instructions with "paperwork to follow".
- delay: work held up or disrupted by something outside our control, e.g. unforeseen ground conditions, an engineer telling us to stop and wait, work by the employer's other contractors or a utility not done in time, a preceding trade under the main contractor running late.
- access: site, area or work face not made available when it should have been, closures, refused or restricted access.
- late_information: drawings, details, RFI answers, schedules or decisions that we need from the other side and that are overdue or holding up work.

Do NOT flag:
- Our own risk: late deliveries from our own suppliers, our own ordering mistakes, our own defective work or rework, our own resequencing or working hours.
- Information that arrived on time, RFIs answered promptly, routine drawing issues that change nothing.
- Routine admin (valuations, payment applications, programmes we owe, labour histograms), health and safety procedure, social chat, people running late.
- Our own formal notices and correspondence are evidence, not separate events.

Grouping: one underlying event is often mentioned many times across WhatsApp, emails, diaries and minutes. Report it ONCE, listing every message that is evidence for it. Do not split one event into several, and do not merge different events just because they are the same type. If a message continues an event listed under "Events already found", return it with continues_event set to that event's id instead of creating a new one.

For each event give:
- awareness_date: the earliest date (YYYY-MM-DD, Irish time) on which the messages show we knew, or ought to have known, about it. For late information this is the day it became overdue or first held up work, not the day it was requested.
- quote: a short passage copied EXACTLY, character for character, from one message (quote_message_id), that best evidences the event. Do not paraphrase or join text from different messages.
- confidence: 0 to 1, how likely a contracts manager would agree this needs a notice. Use below 0.5 for borderline cases you still think a person should look at.
- why_notifiable: one sentence on why this is likely the other side's risk.

Write title and summary in plain English a commercial QS would use. Summary at most two sentences. Return an empty list if there are no events.`;

export const DetectionResponseSchema = z.object({
  events: z.array(
    z.object({
      continues_event: z.string().nullable(),
      event_type: z.enum(EVENT_TYPES),
      title: z.string(),
      summary: z.string(),
      why_notifiable: z.string(),
      awareness_date: z.string(),
      message_ids: z.array(z.string()),
      quote_message_id: z.string(),
      quote: z.string(),
      confidence: z.number(),
    }),
  ),
});
export type DetectionResponse = z.infer<typeof DetectionResponseSchema>;

const KIND_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  diary: "Site diary",
  minutes: "Minutes",
};

export function renderMessage(label: string, m: DetectionMessage): string {
  const dt = DateTime.fromJSDate(m.sentAt, { zone: IRISH_TZ });
  const when = m.timePrecision === "date" ? dt.toFormat("yyyy-MM-dd ccc") : dt.toFormat("yyyy-MM-dd ccc HH:mm");
  const subject = m.subject ? ` | Subject: ${m.subject}` : "";
  return `[${label}] ${when} | ${KIND_LABEL[m.sourceKind] ?? m.sourceKind} | ${m.sender}${subject}\n${m.body}`;
}

export interface PriorEvent {
  id: string; // "E1"
  eventType: string;
  title: string;
  awarenessDate: string;
}

export function renderUserPrompt(
  project: ProjectContext,
  batch: { label: string; message: DetectionMessage }[],
  prior: PriorEvent[],
  batchIndex: number,
  batchCount: number,
): string {
  const header = [
    `Project: ${project.name}`,
    `Our role: ${project.ourRole ?? "contractor"}`,
    project.client ? `Client / upstream party: ${project.client}` : null,
    `Contract: ${project.contractTypeName}`,
  ]
    .filter(Boolean)
    .join("\n");
  const priorText = prior.length
    ? prior.map((e) => `${e.id} [${e.eventType}] ${e.title} (aware ${e.awarenessDate})`).join("\n")
    : "None";
  const messages = batch.map(({ label, message }) => renderMessage(label, message)).join("\n\n");
  return `${header}

Events already found in earlier messages:
${priorText}

Messages (batch ${batchIndex + 1} of ${batchCount}, in time order):

${messages}`;
}
