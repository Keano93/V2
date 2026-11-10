import { prisma } from "@/lib/db";
import { fail, handle, ok } from "@/lib/api";
import { accountDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const account = await accountDetail(prisma, id);
  return account ? ok(account) : fail(404, "Account not found");
});
