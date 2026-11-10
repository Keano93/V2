// Two-level cache for LLM extractions so the demo never re-calls Claude for the same input:
//   1. the ExtractionCache table (fast, per-database)
//   2. data/cache/extractions.json (committed to git, so a fresh clone needs no API key)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const FILE = path.join(process.cwd(), "data", "cache", "extractions.json");

interface FileEntry { kind: string; model: string; output: unknown; createdAt: string }
let fileCache: Record<string, FileEntry> | null = null;

function loadFile(): Record<string, FileEntry> {
  if (fileCache) return fileCache;
  fileCache = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  return fileCache!;
}

export function cacheKey(kind: string, promptVersion: string, model: string, input: string): string {
  return createHash("sha256").update(`${kind}|${promptVersion}|${model}|${input}`).digest("hex");
}

export async function getCached<T>(db: PrismaClient, key: string): Promise<T | null> {
  const row = await db.extractionCache.findUnique({ where: { key } });
  if (row) return row.output as T;
  const hit = loadFile()[key];
  if (hit) {
    await db.extractionCache.create({ data: { key, kind: hit.kind, model: hit.model, output: hit.output as object } });
    return hit.output as T;
  }
  return null;
}

export async function putCached(db: PrismaClient, key: string, kind: string, model: string, output: unknown): Promise<void> {
  await db.extractionCache.upsert({
    where: { key },
    create: { key, kind, model, output: output as object },
    update: { output: output as object, model },
  });
  const file = loadFile();
  file[key] = { kind, model, output, createdAt: new Date().toISOString() };
  mkdirSync(path.dirname(FILE), { recursive: true });
  // sorted keys => stable diffs
  const sorted = Object.fromEntries(Object.entries(file).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(FILE, JSON.stringify(sorted, null, 2) + "\n");
}
