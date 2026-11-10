import { createHash } from "node:crypto";
import { prisma } from "./db";
import { parseSource, type ParseInput, type SourceKind } from "./parsers";

export interface IngestResult {
  sourceId: string | null;
  kind: SourceKind;
  parsed: number;
  created: number;
  duplicates: number;
  warnings: string[];
}

export function messageHash(sender: string, sentAt: Date, body: string): string {
  return createHash("sha256")
    .update(`${sender.trim().toLowerCase()}|${sentAt.toISOString()}|${body.trim()}`)
    .digest("hex");
}

/**
 * Parse an uploaded or pasted source and store its messages against a project.
 * Messages already stored for the project (same sender, time and text) are skipped,
 * so re-uploading an export or a reply chain does not create duplicates.
 */
export async function ingestSource(projectId: string, input: ParseInput): Promise<IngestResult> {
  const parsed = await parseSource(input);
  const warnings = [...parsed.warnings];

  const withHashes = parsed.messages.map((m) => ({ ...m, contentHash: messageHash(m.sender, m.sentAt, m.body) }));
  const existing = new Set(
    (
      await prisma.message.findMany({
        where: { projectId, contentHash: { in: withHashes.map((m) => m.contentHash) } },
        select: { contentHash: true },
      })
    ).map((m) => m.contentHash),
  );
  const seen = new Set<string>();
  const fresh = withHashes.filter((m) => {
    if (existing.has(m.contentHash) || seen.has(m.contentHash)) return false;
    seen.add(m.contentHash);
    return true;
  });
  const duplicates = withHashes.length - fresh.length;
  if (duplicates > 0) warnings.push(`${duplicates} message(s) were already stored and were skipped.`);

  if (fresh.length === 0) {
    return { sourceId: null, kind: parsed.kind, parsed: parsed.messages.length, created: 0, duplicates, warnings };
  }

  const source = await prisma.source.create({
    data: {
      projectId,
      kind: parsed.kind,
      filename: input.filename ?? null,
      rawText: parsed.rawText,
      warnings: warnings.length ? JSON.stringify(warnings) : null,
      messages: {
        create: fresh.map((m, i) => ({
          projectId,
          sourceKind: parsed.kind,
          ordinal: i,
          sender: m.sender,
          sentAt: m.sentAt,
          timePrecision: m.timePrecision,
          subject: m.subject ?? null,
          body: m.body,
          contentHash: m.contentHash,
        })),
      },
    },
  });
  return {
    sourceId: source.id,
    kind: parsed.kind,
    parsed: parsed.messages.length,
    created: fresh.length,
    duplicates,
    warnings,
  };
}
