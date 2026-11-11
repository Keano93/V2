import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { getPassMark, setPassMark } from "@/lib/enablement-db";

export const dynamic = "force-dynamic";

export const GET = handle(async () => ok({ enablement: { passMark: await getPassMark(prisma) } }));

const Body = z.object({ enablement: z.object({ passMark: z.number().min(0).max(100) }) });

// PUT /api/settings  { "enablement": { "passMark": 80 } }
export const PUT = handle(async (req: Request) => {
  const body = Body.parse(await req.json());
  return ok({ enablement: { passMark: await setPassMark(prisma, body.enablement.passMark) } });
});
