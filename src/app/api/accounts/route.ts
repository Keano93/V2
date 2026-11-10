import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { filtersFromSearchParams, listAccounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const accounts = await listAccounts(prisma, filtersFromSearchParams(new URL(req.url).searchParams));
  return ok({ count: accounts.length, accounts });
});
