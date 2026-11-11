import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, handle, ok } from "@/lib/api";
import { submitAttempt } from "@/lib/enablement-db";

export const dynamic = "force-dynamic";

const Body = z.object({ rep: z.string().optional(), answers: z.record(z.string(), z.number().int()) });

// POST /api/opportunities/:id/enablement/attempts  { "rep": "Lena Vogel", "answers": { "f_a1": 2, "ctx1": 0 } }
// -> { score, passed, passMark, results: [{ id, correct, answer, explain }] }  and records the attempt
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = Body.parse(await req.json());
  const result = await submitAttempt(prisma, id, body.answers, body.rep);
  return result ? ok(result) : fail(404, "Opportunity or foundation content not found");
});
