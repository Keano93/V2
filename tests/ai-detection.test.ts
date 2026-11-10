import { describe, expect, it, vi } from "vitest";
import { detectWithClaude, type CacheStore } from "@/lib/detection/ai";
import { makeBatches } from "@/lib/detection/batching";
import type { DetectionResponse } from "@/lib/detection/prompt";
import { locateQuote } from "@/lib/detection/quotes";
import type { DetectionMessage } from "@/lib/detection/types";

const msg = (id: string, day: number, body: string): DetectionMessage => ({
  id,
  sentAt: new Date(`2026-10-${String(day).padStart(2, "0")}T09:00:00Z`),
  timePrecision: "datetime",
  sourceKind: "whatsapp",
  sender: "Gerry",
  subject: null,
  body,
  contentHash: id,
});

const project = { name: "Test", ourRole: "Main contractor", client: null, contractTypeName: "PWC" };

function memoryCache(): CacheStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k) => map.get(k) ?? null,
    set: async (k, e) => void map.set(k, e.response),
  };
}

const event = (over: Partial<DetectionResponse["events"][number]>): DetectionResponse["events"][number] => ({
  continues_event: null,
  event_type: "late_information",
  title: "RFI-014 overdue",
  summary: "Connection details late.",
  why_notifiable: "Design information is the employer's risk.",
  awareness_date: "2026-10-01",
  message_ids: ["M1"],
  quote_message_id: "M1",
  quote: "RFI 14 still not back",
  confidence: 0.9,
  ...over,
});

describe("detectWithClaude (with a fake model)", () => {
  const messages = [
    msg("a", 1, "RFI 14 still not back, it was due yesterday."),
    msg("b", 2, "Lunch order is late again"),
    msg("c", 5, "Steel erectors sent home, still no connection details"),
  ];

  it("maps labels to message ids and verifies quotes", async () => {
    const callModel = vi.fn(async () => ({
      response: { events: [event({ message_ids: ["M1", "M3"] })] },
      inputTokens: 100,
      outputTokens: 50,
    }));
    const { candidates, stats } = await detectWithClaude(project, messages, { cache: memoryCache(), callModel });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].messageIds).toEqual(["a", "c"]);
    expect(candidates[0].quoteVerified).toBe(true);
    expect(candidates[0].quoteMessageId).toBe("a");
    expect(stats).toMatchObject({ batches: 1, cacheHits: 0, inputTokens: 100 });
  });

  it("flags quotes that are not in the messages", async () => {
    const callModel = async () => ({
      response: { events: [event({ quote: "the engineer has not responded" })] },
      inputTokens: 1,
      outputTokens: 1,
    });
    const { candidates } = await detectWithClaude(project, messages, { cache: memoryCache(), callModel });
    expect(candidates[0].quoteVerified).toBe(false);
  });

  it("uses the cache on a second run instead of calling the model", async () => {
    const cache = memoryCache();
    const callModel = vi.fn(async () => ({ response: { events: [event({})] }, inputTokens: 1, outputTokens: 1 }));
    await detectWithClaude(project, messages, { cache, callModel });
    const second = await detectWithClaude(project, messages, { cache, callModel });
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(second.stats.cacheHits).toBe(1);
    expect(second.candidates).toHaveLength(1);
  });

  it("throws in cache-only mode when nothing is cached", async () => {
    await expect(detectWithClaude(project, messages, { cache: memoryCache(), cacheOnly: true })).rejects.toThrow(
      /No cached result/,
    );
  });

  it("merges continuations across batches and passes earlier events forward", async () => {
    const many = Array.from({ length: 200 }, (_, i) => msg(`m${i}`, 1 + (i % 28), `message ${i}`));
    const prompts: string[] = [];
    const callModel = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return prompts.length === 1
        ? { response: { events: [event({ message_ids: ["M2"], quote: "message 1", quote_message_id: "M2" })] }, inputTokens: 1, outputTokens: 1 }
        : { response: { events: [event({ continues_event: "E1", message_ids: ["M190"], awareness_date: "2026-09-30" })] }, inputTokens: 1, outputTokens: 1 };
    });
    const { candidates } = await detectWithClaude(project, many, { cache: memoryCache(), callModel });
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(prompts[1]).toContain("E1 [late_information] RFI-014 overdue");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].messageIds).toEqual(["m1", "m189"]);
    expect(candidates[0].awarenessDate).toBe("2026-09-30");
  });
});

describe("makeBatches", () => {
  it("splits by message count and size", () => {
    const items = Array.from({ length: 10 }, () => ({ body: "x".repeat(100), subject: null }));
    expect(makeBatches(items, { maxMessages: 4 }).map((b) => b.length)).toEqual([4, 4, 2]);
    expect(makeBatches(items, { maxChars: 500 }).map((b) => b.length)).toEqual([3, 3, 3, 1]);
  });
});

describe("locateQuote", () => {
  it("ignores case, whitespace and curly quotes", () => {
    expect(locateQuote("can’t   start", "x", [{ id: "x", body: "We CAN'T start\nthe drainage" }])).toBe("x");
  });
  it("finds the quote in another supporting message", () => {
    expect(locateQuote("hello", "x", [{ id: "x", body: "nope" }, { id: "y", body: "well hello there" }])).toBe("y");
  });
});
