import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, handle, ok } from "@/lib/api";
import { listOpportunities } from "@/lib/queries";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const [found] = await listOpportunities(prisma, { id });
  return found ? ok(found) : fail(404, "Opportunity not found");
});

const Patch = z.object({ status: z.enum(["open", "in_progress", "won", "lost", "dismissed"]) });

// PATCH /api/opportunities/:id  { "status": "in_progress" }  (status survives engine re-runs)
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = Patch.parse(await req.json());
  const exists = await prisma.opportunity.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return fail(404, "Opportunity not found");
  const updated = await prisma.opportunity.update({ where: { id }, data: { status: body.status }, select: { id: true, status: true } });
  return ok(updated);
});
