import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, KindBadge } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatIrish } from "@/lib/time";

export const dynamic = "force-dynamic";

/** A single message shown in the context of its original source. Audit trail links point here. */
export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const message = await prisma.message.findUnique({
    where: { id },
    include: { project: true, source: true },
  });
  if (!message) notFound();

  const context = await prisma.message.findMany({
    where: { sourceId: message.sourceId, ordinal: { gte: message.ordinal - 3, lte: message.ordinal + 3 } },
    orderBy: { ordinal: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${message.projectId}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← {message.project.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Original message</h1>
        <p className="text-sm text-slate-600">
          From <span className="font-medium">{message.source.filename ?? "pasted text"}</span>, imported{" "}
          {formatIrish(message.source.uploadedAt)}
        </p>
      </div>
      <Card title="In context">
        <ol className="divide-y divide-slate-100">
          {context.map((m) => (
            <li key={m.id} className={`px-2 py-2.5 ${m.id === message.id ? "rounded bg-yellow-50 ring-1 ring-yellow-300" : "opacity-70"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <KindBadge kind={m.sourceKind} />
                <span className="font-medium text-slate-800">{m.sender}</span>
                <span>{formatIrish(m.sentAt, m.timePrecision as "date" | "datetime")}</span>
              </div>
              {m.subject && <div className="mt-1 text-xs font-medium text-slate-600">{m.subject}</div>}
              <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
            </li>
          ))}
        </ol>
      </Card>
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Raw source text</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded border border-slate-200 bg-white p-3 text-xs whitespace-pre-wrap">
          {message.source.rawText}
        </pre>
      </details>
    </div>
  );
}
