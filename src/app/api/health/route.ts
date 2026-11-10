import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const [accounts, needs, capabilities, opportunities] = await Promise.all([
    prisma.account.count(), prisma.need.count(), prisma.capability.count(), prisma.opportunity.count(),
  ]);
  return ok({ status: "ok", counts: { accounts, needs, capabilities, opportunities } });
});
