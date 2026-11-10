import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { filtersFromSearchParams, whitespaceMap } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/whitespace?segment=&team=&owner=&product=
// -> { summary: { unclaimed, weighted, ... }, products, rows: [{ account, unclaimed, cells: [{ productId, status, ... }] }] }
export const GET = handle(async (req: Request) => {
  const f = filtersFromSearchParams(new URL(req.url).searchParams);
  const [map, teams, segments] = await Promise.all([
    whitespaceMap(prisma, f),
    prisma.account.findMany({ distinct: ["team"], select: { team: true }, orderBy: { team: "asc" } }),
    prisma.account.findMany({ distinct: ["segment"], select: { segment: true }, orderBy: { segment: "asc" } }),
  ]);
  return ok({ ...map, filters: { teams: teams.map((t) => t.team), segments: segments.map((s) => s.segment) } });
});
