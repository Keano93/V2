import type { EventType } from "../events";

/** A stored message as the detectors see it. */
export interface DetectionMessage {
  id: string;
  sentAt: Date;
  timePrecision: string;
  sourceKind: string;
  sender: string;
  subject: string | null;
  body: string;
  contentHash: string;
}

export interface ProjectContext {
  name: string;
  ourRole: string | null;
  client: string | null;
  contractTypeName: string;
}

/** A potential notifiable event proposed by a detector, before human review. */
export interface CandidateEvent {
  eventType: EventType;
  title: string;
  summary: string;
  reasoning: string;
  /** Irish local calendar date, YYYY-MM-DD. */
  awarenessDate: string;
  messageIds: string[];
  quote: string;
  quoteMessageId: string | null;
  quoteVerified: boolean;
  confidence: number;
}

export interface DetectionStats {
  batches: number;
  cacheHits: number;
  inputTokens: number;
  outputTokens: number;
}

export interface DetectionResult {
  candidates: CandidateEvent[];
  stats: DetectionStats;
}
