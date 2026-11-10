import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { runEngine } from "@/lib/engine/run";
import { extractPending } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ reExtract: z.boolean().default(false) }).default({ reExtract: false });

// POST /api/engine/run  { "reExtract": false }  -> extract new documents, recompute matches + opportunities
export const POST = handle(async (req: Request) => {
  const text = await req.text();
  const { reExtract } = Body.parse(text ? JSON.parse(text) : undefined);
  const extraction = await extractPending(prisma, { force: reExtract });
  const run = await runEngine(prisma);
  return ok({ extraction, matches: run.matchCount, summary: run.summary });
});
