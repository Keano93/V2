import { prisma } from "@/lib/db";
import { fail, handle, ok } from "@/lib/api";
import { getPack } from "@/lib/enablement-db";

export const dynamic = "force-dynamic";

// GET /api/opportunities/:id/enablement?rep=Lena%20Vogel
// -> { recommendation, passMark, foundation, context, quiz (no answers), history }
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const rep = new URL(req.url).searchParams.get("rep") ?? undefined;
  const pack = await getPack(prisma, id, rep);
  return pack ? ok(pack) : fail(404, "Opportunity not found");
});
