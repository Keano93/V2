import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { listCapabilities } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/capabilities?product=&new=true
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const isNew = sp.get("new");
  const capabilities = await listCapabilities(prisma, {
    productId: sp.get("product") ?? undefined, isNew: isNew === null ? undefined : isNew === "true",
  });
  return ok({ count: capabilities.length, capabilities });
});
