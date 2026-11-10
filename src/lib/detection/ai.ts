import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { makeBatches } from "./batching";
import {
  DetectionResponseSchema,
  PROMPT_VERSION,
  renderUserPrompt,
  SYSTEM_PROMPT,
  type DetectionResponse,
  type PriorEvent,
} from "./prompt";
import { locateQuote } from "./quotes";
import type { CandidateEvent, DetectionMessage, DetectionResult, ProjectContext } from "./types";

export function detectionModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
}

function detectionEffort(): "low" | "medium" | "high" {
  const e = process.env.ANTHROPIC_EFFORT?.trim();
  return e === "low" || e === "high" ? e : "medium";
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export class CacheMissError extends Error {}

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, entry: { model: string; response: string; inputTokens: number; outputTokens: number }): Promise<void>;
}

/** Cache backed by the DetectionCache table. */
export const dbCache: CacheStore = {
  async get(key) {
    return (await prisma.detectionCache.findUnique({ where: { key } }))?.response ?? null;
  },
  async set(key, e) {
    await prisma.detectionCache.upsert({
      where: { key },
      update: {},
      create: { key, promptVersion: PROMPT_VERSION, ...e },
    });
  },
};

export type ModelCaller = (
  userPrompt: string,
) => Promise<{ response: DetectionResponse; inputTokens: number; outputTokens: number }>;

export interface AiDetectOptions {
  /** Only use cached responses; throw CacheMissError instead of calling the API. */
  cacheOnly?: boolean;
  onProgress?: (msg: string) => void;
  /** Overrides for tests. */
  cache?: CacheStore;
  callModel?: ModelCaller;
}

function cacheKey(model: string, effort: string, userPrompt: string): string {
  return createHash("sha256")
    .update([model, effort, PROMPT_VERSION, SYSTEM_PROMPT, userPrompt].join("\u0000"))
    .digest("hex");
}

async function callClaude(
  client: Anthropic,
  model: string,
  effort: "low" | "medium" | "high",
  userPrompt: string,
): Promise<{ response: DetectionResponse; inputTokens: number; outputTokens: number }> {
  const message = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    // On a safety decline the API re-runs the request on a suitable fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort, format: betaZodOutputFormat(DetectionResponseSchema) },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });
  if (message.stop_reason === "refusal") {
    throw new Error("The model declined to process this batch.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The model's answer was cut off (max_tokens). Try smaller batches.");
  }
  if (!message.parsed_output) {
    throw new Error("The model did not return valid JSON for this batch.");
  }
  return {
    response: message.parsed_output,
    inputTokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0),
    outputTokens: message.usage.output_tokens,
  };
}

/**
 * Run AI detection over a project's messages (in time order).
 *
 * Messages are labelled M1..Mn across the whole project and sent in chronological batches.
 * Events found in earlier batches are listed in later prompts so the model can attach new
 * evidence to them rather than duplicating. Each raw response is cached by a hash of the
 * model, effort, prompt version and exact prompt text.
 */
export async function detectWithClaude(
  project: ProjectContext,
  messages: DetectionMessage[],
  options: AiDetectOptions = {},
): Promise<DetectionResult> {
  const model = detectionModel();
  const effort = detectionEffort();
  const labelled = messages.map((message, i) => ({ label: `M${i + 1}`, message }));
  const byLabel = new Map(labelled.map((l) => [l.label, l.message]));
  const batches = makeBatches(labelled.map((l) => ({ ...l, body: l.message.body, subject: l.message.subject })));

  const stats = { batches: batches.length, cacheHits: 0, inputTokens: 0, outputTokens: 0 };
  const events: (CandidateEvent & { ref: string })[] = [];
  const cache = options.cache ?? dbCache;
  let client: Anthropic | null = null;
  const callModel: ModelCaller =
    options.callModel ??
    ((prompt) => {
      if (!hasApiKey()) throw new Error("ANTHROPIC_API_KEY is not set in .env, and there is no cached result.");
      client ??= new Anthropic();
      return callClaude(client, model, effort, prompt);
    });

  for (const [i, batch] of batches.entries()) {
    const prior: PriorEvent[] = events.map((e) => ({
      id: e.ref,
      eventType: e.eventType,
      title: e.title,
      awarenessDate: e.awarenessDate,
    }));
    const userPrompt = renderUserPrompt(project, batch, prior, i, batches.length);
    const key = cacheKey(model, effort, userPrompt);

    let response: DetectionResponse;
    const cached = await cache.get(key);
    if (cached) {
      stats.cacheHits++;
      response = DetectionResponseSchema.parse(JSON.parse(cached));
      options.onProgress?.(`Batch ${i + 1}/${batches.length}: cached`);
    } else {
      if (options.cacheOnly) throw new CacheMissError(`No cached result for batch ${i + 1} of "${project.name}".`);
      options.onProgress?.(`Batch ${i + 1}/${batches.length}: calling ${model}…`);
      const result = await callModel(userPrompt);
      response = result.response;
      stats.inputTokens += result.inputTokens;
      stats.outputTokens += result.outputTokens;
      await cache.set(key, {
        model,
        response: JSON.stringify(response),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    }

    for (const e of response.events) {
      const ids = e.message_ids.map((l) => byLabel.get(l)?.id).filter((x): x is string => Boolean(x));
      const existing = e.continues_event ? events.find((x) => x.ref === e.continues_event) : undefined;
      if (existing) {
        existing.messageIds = [...new Set([...existing.messageIds, ...ids])];
        if (e.awareness_date < existing.awarenessDate) existing.awarenessDate = e.awareness_date;
        continue;
      }
      const quoteMsg = byLabel.get(e.quote_message_id);
      const supporting = ids.map((id) => messages.find((m) => m.id === id)!).filter(Boolean);
      if (quoteMsg && !supporting.includes(quoteMsg)) supporting.push(quoteMsg);
      const located = locateQuote(e.quote, quoteMsg?.id ?? null, supporting);
      events.push({
        ref: `E${events.length + 1}`,
        eventType: e.event_type,
        title: e.title,
        summary: e.summary,
        reasoning: e.why_notifiable,
        awarenessDate: /^\d{4}-\d{2}-\d{2}$/.test(e.awareness_date) ? e.awareness_date : "",
        messageIds: supporting.map((m) => m.id),
        quote: e.quote,
        quoteMessageId: located ?? quoteMsg?.id ?? null,
        quoteVerified: Boolean(located),
        confidence: Math.min(1, Math.max(0, e.confidence)),
      });
    }
  }

  const candidates = events.map((e) => {
    const c: CandidateEvent & { ref?: string } = { ...e };
    delete c.ref;
    return c;
  });
  return { candidates, stats };
}
