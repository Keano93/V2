import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteSource } from "@/app/actions";
import { Card, KindBadge, inputClass } from "@/components/ui";
import { prisma } from "@/lib/db";
import { Confidence, TypeBadge } from "@/components/event-bits";
import { hasApiKey } from "@/lib/detection/ai";
import { formatIrish } from "@/lib/time";
import { DetectForm } from "./detect-form";
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
  const [lastRun, events] = await Promise.all([
    prisma.detectionRun.findFirst({ where: { projectId: id }, orderBy: { startedAt: "desc" } }),
    prisma.event.findMany({
      where: { projectId: id },
      orderBy: [{ awarenessDate: "asc" }],
      include: {
        messages: {
          include: { message: { select: { id: true, sender: true, sentAt: true, sourceKind: true, timePrecision: true } } },
        },
      },
    }),
  ]);
  const flagged = new Set(events.flatMap((e) => e.messages.map((m) => m.messageId)));

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

      <Card title="Detect notifiable events">
        <DetectForm projectId={project.id} aiAvailable={hasApiKey()} />
        {lastRun && (
          <p className="mt-3 text-xs text-slate-500">
            Last run {formatIrish(lastRun.startedAt)}: {lastRun.detector === "ai" ? `AI (${lastRun.model})` : "keyword baseline"},{" "}
            {lastRun.status}
            {lastRun.status === "completed" && `, ${lastRun.eventsFound} events`}
            {lastRun.detector === "ai" &&
              lastRun.status === "completed" &&
              `, ${lastRun.batches} batch(es), ${lastRun.cacheHits} cached, ${lastRun.inputTokens + lastRun.outputTokens} tokens billed`}
            {lastRun.error && <span className="text-red-700"> ({lastRun.error})</span>}
          </p>
        )}
        {events.length > 0 && (
          <ul className="mt-4 space-y-3">
            {events.map((e) => (
              <li key={e.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={e.eventType} />
                  <span className="font-medium">{e.title}</span>
                  <span className="ml-auto text-xs text-slate-500">
                    Aware {formatIrish(e.awarenessDate, "date")} · <Confidence value={e.confidence} /> ·{" "}
                    {e.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{e.summary}</p>
                {e.reasoning && <p className="mt-1 text-xs text-slate-500">{e.reasoning}</p>}
                <blockquote className="mt-2 border-l-2 border-slate-300 pl-2 text-sm italic text-slate-700">
                  “{e.quote}”
                  {!e.quoteVerified && (
                    <span className="ml-2 not-italic text-xs font-medium text-red-700">quote not found in source</span>
                  )}
                </blockquote>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {e.messages
                    .sort((a, b) => a.message.sentAt.getTime() - b.message.sentAt.getTime())
                    .map(({ message: m }) => (
                      <a key={m.id} href={`/messages/${m.id}`} className="text-slate-500 hover:text-slate-900 hover:underline">
                        {m.sender.split(" (")[0]}, {formatIrish(m.sentAt, "date")} ↗
                      </a>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
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
                {flagged.has(m.id) && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">flagged</span>
                )}
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
