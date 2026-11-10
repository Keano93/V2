import { EVENT_TYPE_LABELS, type EventType } from "@/lib/events";

const TYPE_STYLES: Record<string, string> = {
  change: "bg-indigo-100 text-indigo-800",
  delay: "bg-rose-100 text-rose-800",
  instruction: "bg-teal-100 text-teal-800",
  access: "bg-amber-100 text-amber-800",
  late_information: "bg-fuchsia-100 text-fuchsia-800",
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_STYLES[type] ?? "bg-slate-100"}`}>
      {EVENT_TYPE_LABELS[type as EventType] ?? type}
    </span>
  );
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.75 ? "text-emerald-700" : value >= 0.5 ? "text-amber-700" : "text-slate-500";
  return <span className={`text-xs font-medium ${tone}`}>{pct}% confidence</span>;
}
