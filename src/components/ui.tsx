import type { ReactNode } from "react";

const KIND_STYLES: Record<string, string> = {
  whatsapp: "bg-emerald-100 text-emerald-800",
  email: "bg-sky-100 text-sky-800",
  diary: "bg-violet-100 text-violet-800",
  minutes: "bg-orange-100 text-orange-800",
};

const KIND_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  diary: "Site diary",
  minutes: "Minutes",
};

export function KindBadge({ kind }: { kind: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${KIND_STYLES[kind] ?? "bg-slate-100"}`}>
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
export const buttonClass =
  "inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";
