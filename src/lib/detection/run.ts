import { DateTime } from "luxon";
import { prisma } from "../db";
import { IRISH_TZ } from "../time";
import { detectionModel, detectWithClaude, type AiDetectOptions } from "./ai";
import { detectWithBaseline } from "./baseline";
import { PROMPT_VERSION } from "./prompt";
import type { CandidateEvent, DetectionMessage, DetectionResult, ProjectContext } from "./types";

export type Detector = "ai" | "baseline";

export async function loadProjectForDetection(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { contractType: true },
  });
  const messages: DetectionMessage[] = await prisma.message.findMany({
    where: { projectId },
    orderBy: [{ sentAt: "asc" }, { sourceId: "asc" }, { ordinal: "asc" }],
    select: {
      id: true,
      sentAt: true,
      timePrecision: true,
      sourceKind: true,
      sender: true,
      subject: true,
      body: true,
      contentHash: true,
    },
  });
  const context: ProjectContext = {
    name: project.name,
    ourRole: project.ourRole,
    client: project.client,
    contractTypeName: project.contractType.name,
  };
  return { project, context, messages };
}

/** Run a detector without saving anything (used by the eval script). */
export async function detect(
  projectId: string,
  detector: Detector,
  options: AiDetectOptions = {},
): Promise<DetectionResult & { messages: DetectionMessage[] }> {
  const { context, messages } = await loadProjectForDetection(projectId);
  const result =
    detector === "ai" ? await detectWithClaude(context, messages, options) : detectWithBaseline(messages);
  return { ...result, messages };
}

/** Awareness date as a Date at midday Irish time; falls back to the earliest evidence. */
function awarenessToDate(c: CandidateEvent, messages: DetectionMessage[]): Date {
  const parsed = DateTime.fromISO(c.awarenessDate, { zone: IRISH_TZ });
  if (c.awarenessDate && parsed.isValid) return parsed.set({ hour: 12 }).toJSDate();
  const earliest = messages
    .filter((m) => c.messageIds.includes(m.id))
    .reduce<Date | null>((min, m) => (!min || m.sentAt < min ? m.sentAt : min), null);
  return DateTime.fromJSDate(earliest ?? new Date(), { zone: IRISH_TZ })
    .startOf("day")
    .set({ hour: 12 })
    .toJSDate();
}

/**
 * Run detection for a project and store the candidates for review.
 *
 * Unreviewed candidates from earlier runs are replaced. Events a person has already
 * confirmed or dismissed are kept, and new candidates whose evidence overlaps them are
 * skipped so the reviewer isn't asked about the same thing twice.
 */
export async function runDetection(projectId: string, detector: Detector, options: AiDetectOptions = {}) {
  const run = await prisma.detectionRun.create({
    data: {
      projectId,
      detector,
      status: "running",
      model: detector === "ai" ? detectionModel() : null,
      promptVersion: detector === "ai" ? PROMPT_VERSION : null,
    },
  });
  try {
    const { candidates, stats, messages } = await detect(projectId, detector, options);

    const reviewed = await prisma.event.findMany({
      where: { projectId, status: { in: ["confirmed", "dismissed"] } },
      select: { messages: { select: { messageId: true } } },
    });
    const reviewedMessageIds = new Set(reviewed.flatMap((e) => e.messages.map((m) => m.messageId)));
    const fresh = candidates.filter((c) => !c.messageIds.some((id) => reviewedMessageIds.has(id)));

    await prisma.$transaction([
      prisma.event.deleteMany({ where: { projectId, status: "pending_review" } }),
      ...fresh.map((c) =>
        prisma.event.create({
          data: {
            projectId,
            runId: run.id,
            origin: detector,
            eventType: c.eventType,
            title: c.title,
            summary: c.summary,
            reasoning: c.reasoning,
            awarenessDate: awarenessToDate(c, messages),
            quote: c.quote,
            quoteMessageId: c.quoteMessageId,
            quoteVerified: c.quoteVerified,
            confidence: c.confidence,
            messages: { create: c.messageIds.map((messageId) => ({ messageId })) },
          },
        }),
      ),
      prisma.detectionRun.update({
        where: { id: run.id },
        data: { status: "completed", finishedAt: new Date(), eventsFound: fresh.length, ...stats },
      }),
    ]);
    return { runId: run.id, events: fresh.length, skipped: candidates.length - fresh.length, stats };
  } catch (e) {
    await prisma.detectionRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
