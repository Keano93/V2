"use client";

import { useRouter } from "next/navigation";

interface Props {
  current: { segment?: string; team?: string; product?: string };
  segments: string[];
  teams: string[];
  products: { id: string; name: string }[];
}

/** Filters live in the URL, so every view is shareable and the API sees the same query. */
export function Filters({ current, segments, teams, products }: Props) {
  const router = useRouter();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(Object.entries(current).filter(([, v]) => v) as [string, string][]);
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.push(qs ? `/?${qs}` : "/", { scroll: false });
  };
  const active = Boolean(current.segment || current.team || current.product);
  return (
    <div className="filters" role="group" aria-label="Filters">
      <label>
        Segment
        <select value={current.segment ?? ""} onChange={(e) => set("segment", e.target.value)}>
          <option value="">All</option>
          {segments.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>
        Team
        <select value={current.team ?? ""} onChange={(e) => set("team", e.target.value)}>
          <option value="">All</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label>
        Product
        <select value={current.product ?? ""} onChange={(e) => set("product", e.target.value)}>
          <option value="">All</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {active && <a className="reset" href="/">Clear filters</a>}
    </div>
  );
}
