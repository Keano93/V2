import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteSource } from "@/app/actions";
import { Card, KindBadge, inputClass } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatIrish } from "@/lib/time";
import { IngestForm } from "./ingest-form";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; q?: string; source?: string }>;
}) {
  const { id } = await params;
  const { kind, q, source } = await searchParams;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      contractType: true,
      sources: { orderBy: { uploadedAt: "asc" }, include: { _count: { select: { messages: true } } } },
    },
  });
  if (!project) notFound();

  const messages = await prisma.message.findMany({
    where: {
      projectId: id,
      ...(kind ? { sourceKind: kind } : {}),
      ...(source ? { sourceId: source } : {}),
      ...(q ? { OR: [{ body: { contains: q } }, { sender: { contains: q } }, { subject: { contains: q } }] } : {}),
    },
    orderBy: [{ sentAt: "asc" }, { ordinal: "asc" }],
    include: { source: { select: { filename: true } } },
  });
  const total = await prisma.message.count({ where: { projectId: id } });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-slate-500 hover:text-slate-800">
          ← Projects
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{project.name}</h1>
        <p className="text-sm text-slate-600">
          {[project.reference, project.client, project.ourRole].filter(Boolean).join(" · ")}
        </p>
        <p className="text-sm text-slate-600">Contract: {project.contractType.name}</p>
      </div>

      <Card title="Import communications">
        <IngestForm projectId={project.id} />
      </Card>

      <Card title={`Sources (${project.sources.length})`}>
        {project.sources.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing imported yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2">Source</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Messages</th>
                <th className="pb-2">Warnings</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {project.sources.map((s) => {
                const warnings: string[] = s.warnings ? JSON.parse(s.warnings) : [];
                return (
                  <tr key={s.id} className="border-t border-slate-100 align-top">
                    <td className="py-1.5">
                      <Link href={`?source=${s.id}`} className="hover:underline">
                        {s.filename ?? "Untitled"}
                      </Link>
                    </td>
                    <td className="py-1.5">
                      <KindBadge kind={s.kind} />
                    </td>
                    <td className="py-1.5">{s._count.messages}</td>
                    <td className="py-1.5 text-xs text-amber-800">{warnings.join(" ")}</td>
                    <td className="py-1.5 text-right">
                      <form action={deleteSource}>
                        <input type="hidden" name="sourceId" value={s.id} />
                        <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={`Messages (${messages.length} of ${total})`}>
        <form className="mb-4 flex flex-wrap gap-2">
          <select name="kind" defaultValue={kind ?? ""} className={`${inputClass} w-40`}>
            <option value="">All types</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="diary">Site diary</option>
            <option value="minutes">Minutes</option>
          </select>
          <input name="q" defaultValue={q ?? ""} placeholder="Search text or sender" className={`${inputClass} w-64`} />
          <button className="rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50">Filter</button>
          {(kind || q || source) && (
            <Link href={`/projects/${id}`} className="self-center text-sm text-slate-500 hover:text-slate-800">
              Clear
            </Link>
          )}
        </form>
        <ol className="divide-y divide-slate-100">
          {messages.map((m) => (
            <li key={m.id} id={`m-${m.id}`} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <KindBadge kind={m.sourceKind} />
                <span className="font-medium text-slate-800">{m.sender}</span>
                <span>{formatIrish(m.sentAt, m.timePrecision as "date" | "datetime")}</span>
                <Link href={`/messages/${m.id}`} className="ml-auto hover:text-slate-800">
                  {m.source.filename} ↗
                </Link>
              </div>
              {m.subject && <div className="mt-1 text-xs font-medium text-slate-600">{m.subject}</div>}
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{m.body}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
