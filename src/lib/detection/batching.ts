import type { DetectionMessage } from "./types";

export interface BatchOptions {
  /** Upper bound on messages per request. */
  maxMessages?: number;
  /** Rough upper bound on characters of message text per request (~4 chars per token). */
  maxChars?: number;
}

/**
 * Split a project's messages (already in time order) into consecutive batches.
 *
 * All sources are interleaved chronologically so that a WhatsApp message, the email
 * that follows it and the diary entry that records it land in the same batch, which
 * lets the model group them into one event. Events that straddle a batch boundary are
 * handled by passing earlier events forward (see prompt.ts), not by overlapping batches.
 */
export function makeBatches<T extends Pick<DetectionMessage, "body" | "subject">>(
  messages: T[],
  { maxMessages = 150, maxChars = 80_000 }: BatchOptions = {},
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  for (const m of messages) {
    const size = m.body.length + (m.subject?.length ?? 0) + 60;
    if (current.length > 0 && (current.length >= maxMessages || chars + size > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(m);
    chars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
