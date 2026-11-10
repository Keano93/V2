import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { filtersFromSearchParams, listOpportunities } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/opportunities?segment=&team=&owner=&product=&type=&account=&status=&includeAdoption=true&limit=
export const GET = handle(async (req: Request) => {
  const f = filtersFromSearchParams(new URL(req.url).searchParams);
  const opportunities = await listOpportunities(prisma, f);
  return ok({ count: opportunities.length, opportunities });
});
