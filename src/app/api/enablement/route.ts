import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { enablementProgress } from "@/lib/enablement-db";

export const dynamic = "force-dynamic";

// GET /api/enablement?rep=  -> each rep's status per foundation module (current / refresher_due / failed / not_started)
export const GET = handle(async (req: Request) => {
  const rep = new URL(req.url).searchParams.get("rep") ?? undefined;
  return ok({ reps: await enablementProgress(prisma, rep) });
});
