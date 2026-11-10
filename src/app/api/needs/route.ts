import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { listNeeds } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/needs?account=&theme=&status=open
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const needs = await listNeeds(prisma, {
    accountId: sp.get("account") ?? undefined, theme: sp.get("theme") ?? undefined, status: sp.get("status") ?? undefined,
  });
  return ok({ count: needs.length, needs });
});
