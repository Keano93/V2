import Link from "next/link";
import { createProject } from "@/app/actions";
import { buttonClass, Card, inputClass } from "@/components/ui";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [projects, contractTypes] = await Promise.all([
    prisma.project.findMany({
      orderBy: { createdAt: "asc" },
      include: { contractType: true, _count: { select: { messages: true, sources: true } } },
    }),
    prisma.contractType.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Projects</h1>

      <div className="grid gap-3">
        {projects.length === 0 && <p className="text-sm text-slate-500">No projects yet.</p>}
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-slate-500">{p.reference}</span>
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {p.contractType.name} · {p.ourRole ?? "Role not set"}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {p._count.messages} messages from {p._count.sources} sources
            </div>
          </Link>
        ))}
      </div>

      <Card title="New project">
        <form action={createProject} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Project name *</span>
            <input name="name" required className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Contract type *</span>
            <select name="contractTypeId" required className={inputClass}>
              {contractTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Reference</span>
            <input name="reference" className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Client / employer</span>
            <input name="client" className={inputClass} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Our role</span>
            <input name="ourRole" placeholder="e.g. Main contractor, M&E subcontractor" className={inputClass} />
          </label>
          <div className="sm:col-span-2">
            <button className={buttonClass}>Create project</button>
          </div>
        </form>
      </Card>
    </div>
  );
}
