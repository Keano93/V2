"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ingestSource, type IngestResult } from "@/lib/ingest";
import { SOURCE_KINDS, type SourceKind } from "@/lib/parsers";

export async function createProject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const contractTypeId = String(formData.get("contractTypeId") ?? "");
  if (!name || !contractTypeId) throw new Error("Project name and contract type are required.");
  const project = await prisma.project.create({
    data: {
      name,
      contractTypeId,
      reference: String(formData.get("reference") ?? "").trim() || null,
      client: String(formData.get("client") ?? "").trim() || null,
      ourRole: String(formData.get("ourRole") ?? "").trim() || null,
    },
  });
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export interface IngestState {
  results: (IngestResult & { label: string; error?: string })[];
}

export async function ingestAction(_prev: IngestState, formData: FormData): Promise<IngestState> {
  const projectId = String(formData.get("projectId"));
  const kindRaw = String(formData.get("kind") ?? "auto");
  const kind = (SOURCE_KINDS as string[]).includes(kindRaw) ? (kindRaw as SourceKind) : "auto";
  const dateOrder = formData.get("dateOrder") === "MDY" ? "MDY" : undefined;
  const results: IngestState["results"] = [];

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    try {
      const r = await ingestSource(projectId, {
        kind,
        filename: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        dateOrder,
      });
      results.push({ ...r, label: file.name });
    } catch (e) {
      results.push(failed(file.name, e));
    }
  }

  const pasted = String(formData.get("pasted") ?? "");
  if (pasted.trim()) {
    try {
      const r = await ingestSource(projectId, { kind, text: pasted, filename: "Pasted text", dateOrder });
      results.push({ ...r, label: "Pasted text" });
    } catch (e) {
      results.push(failed("Pasted text", e));
    }
  }

  if (results.length === 0) {
    return { results: [failed("Nothing to import", new Error("Choose a file or paste some text."))] };
  }
  revalidatePath(`/projects/${projectId}`);
  return { results };
}

function failed(label: string, e: unknown) {
  return {
    label,
    sourceId: null,
    kind: "diary" as SourceKind,
    parsed: 0,
    created: 0,
    duplicates: 0,
    warnings: [],
    error: e instanceof Error ? e.message : String(e),
  };
}

export async function deleteSource(formData: FormData) {
  const id = String(formData.get("sourceId"));
  const source = await prisma.source.delete({ where: { id } });
  revalidatePath(`/projects/${source.projectId}`);
}
