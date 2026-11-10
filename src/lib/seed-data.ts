import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SourceKind } from "./parsers";

export const SEED_DIR = path.join(process.cwd(), "data", "seed");

export interface SeedProject {
  key: string;
  name: string;
  reference: string;
  client: string;
  ourRole: string;
  contractType: string;
  shutdownStart?: string;
  shutdownEnd?: string;
  files: { path: string; kind: SourceKind }[];
}

export interface AnswerKey {
  events: {
    id: string;
    project: string;
    type: string;
    acceptTypes: string[];
    awarenessDate: string;
    summary: string;
    evidence: { file: string; contains: string }[];
  }[];
  traps: { id: string; project: string; why: string; file: string; contains: string }[];
}

export async function loadSeedProjects(): Promise<SeedProject[]> {
  const raw = await readFile(path.join(SEED_DIR, "projects.json"), "utf8");
  return (JSON.parse(raw) as { projects: SeedProject[] }).projects;
}

export async function loadAnswerKey(): Promise<AnswerKey> {
  return JSON.parse(await readFile(path.join(SEED_DIR, "answer-key.json"), "utf8")) as AnswerKey;
}

export async function readSeedFile(relPath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(SEED_DIR, relPath)));
}
