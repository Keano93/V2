import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, handle, ok } from "@/lib/api";
import { runEngine } from "@/lib/engine/run";
import {
  extractPending, parseCsv, upsertAccounts, upsertContacts, upsertNotes, upsertOwnership, upsertReleases,
} from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TYPES = { accounts: upsertAccounts, contacts: upsertContacts, ownership: upsertOwnership, notes: upsertNotes, releases: upsertReleases } as const;
const Type = z.enum(Object.keys(TYPES) as [keyof typeof TYPES, ...(keyof typeof TYPES)[]]);

/**
 * POST /api/import?type=notes&run=true
 *   Content-Type: application/json  -> body is an array of rows, or { rows: [...] }
 *   Content-Type: text/csv          -> header row + rows (lists like addOns use ";" separators)
 * run=true (default) extracts the new documents and recomputes opportunities afterwards.
 */
export const POST = handle(async (req: Request) => {
  const url = new URL(req.url);
  const type = Type.safeParse(url.searchParams.get("type"));
  if (!type.success) return fail(400, `type must be one of: ${Object.keys(TYPES).join(", ")}`);
  const contentType = req.headers.get("content-type") ?? "";
  let rows: unknown[];
  if (contentType.includes("csv")) {
    rows = parseCsv(await req.text());
  } else {
    const body = await req.json();
    rows = Array.isArray(body) ? body : Array.isArray(body?.rows) ? body.rows : [];
  }
  if (!rows.length) return fail(400, "No rows found in the request body");
  const imported = await TYPES[type.data](prisma, rows);
  if (url.searchParams.get("run") === "false") return ok({ imported });
  const extraction = await extractPending(prisma);
  const run = await runEngine(prisma);
  return ok({ imported, extraction, summary: run.summary });
});
