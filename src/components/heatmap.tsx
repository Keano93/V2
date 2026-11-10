"use client";

import { useEffect, useState } from "react";
import { bucketOf, eur, eurShort, TYPE_LABEL } from "@/lib/format";
import type { WhitespaceMapDTO } from "@/lib/queries";

type Row = WhitespaceMapDTO["rows"][number];
type Cell = Row["cells"][number];

interface Tip { x: number; y: number; row: Row; cell: Cell; product: string }

function CellView({ cell }: { cell: Cell }) {
  if (cell.status === "opportunity") {
    return <div className={`cell b${bucketOf(cell.value)}`}>{eurShort(cell.value)}</div>;
  }
  if (cell.status === "owned") {
    return (
      <div className={`cell owned${cell.expansion ? " expansion" : ""}`}>
        {cell.expansion ? <span className="plus">+{eurShort(cell.value)}</span> : <span className="check" aria-hidden>✓</span>}
      </div>
    );
  }
  return <div className="cell none" aria-label="Not relevant">·</div>;
}

function statusText(cell: Cell): string {
  if (cell.status === "opportunity") return "Not owned · opportunity";
  if (cell.status === "owned") return cell.expansion ? "Owned · expansion available" : "Owned";
  return "Not owned · no matched needs";
}

export function Heatmap({ data }: { data: WhitespaceMapDTO }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!data.rows.length) return <div className="empty">No accounts match these filters.</div>;

  const productName = (id: string) => data.products.find((p) => p.id === id)?.name ?? id;
  const opps = selected
    ? selected.cells.flatMap((c) => c.opportunities).sort((a, b) => a.rank - b.rank)
    : [];

  return (
    <>
      <div className="map-scroll">
        <table className="map">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col" className="num">ARR</th>
              {data.products.map((p) => (
                <th key={p.id} scope="col" className="prod">{p.name.replace(/^Lumio /, "")}</th>
              ))}
              <th scope="col" className="num">Unclaimed</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={row.account.id}
                onClick={() => setSelected(row)}
                aria-selected={selected?.account.id === row.account.id}
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelected(row))}
              >
                <td className="acct">
                  <div className="acct-name">{row.account.name}</div>
                  <div className="acct-meta">{row.account.segment} · {row.account.team} · {row.account.owner}</div>
                </td>
                <td className="num">{eurShort(row.account.arr)}</td>
                {row.cells.map((cell) => (
                  <td
                    key={cell.productId}
                    onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, row, cell, product: productName(cell.productId) })}
                    onMouseLeave={() => setTip(null)}
                    aria-label={`${productName(cell.productId)}: ${statusText(cell)}${cell.value ? `, ${eur(cell.value)}` : ""}`}
                  >
                    <CellView cell={cell} />
                  </td>
                ))}
                <td className="num unclaimed">{row.unclaimed ? eurShort(row.unclaimed) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tip && (
        <div className="tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 336), top: tip.y + 16 }} role="tooltip">
          <div className="t-title">{tip.row.account.name} · {tip.product}</div>
          <div className="t-row">{statusText(tip.cell)}{tip.cell.value ? <> · <b>{eur(tip.cell.value)}</b></> : null}</div>
          {tip.cell.opportunities.slice(0, 2).map((o) => (
            <div key={o.id} className="t-row" style={{ marginTop: 6 }}>
              <b>{o.title}</b>
              <div>{o.headline}</div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${selected.account.name} opportunities`}>
            <div className="drawer-head">
              <button className="drawer-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
              <h3>{selected.account.name}</h3>
              <div className="meta">{selected.account.segment} · {selected.account.team} · {selected.account.owner}</div>
              <div className="kpis">
                <div>Current ARR<b>{eur(selected.account.arr)}</b></div>
                <div>Unclaimed<b>{eur(selected.unclaimed)}</b></div>
                <div>Plays<b>{opps.length}</b></div>
              </div>
            </div>
            <div className="drawer-body">
              {opps.length === 0 && <div className="empty">No open opportunities for this account.</div>}
              {opps.map((o) => (
                <div className="opp" key={o.id}>
                  <div className="opp-top">
                    <div className="opp-title">{o.title}</div>
                    <div className="opp-value">{o.type === "adoption" ? `protects ${eurShort(o.arrProtected)}` : eur(o.value)}</div>
                  </div>
                  <span className="opp-tag">{TYPE_LABEL[o.type] ?? o.type} · score {o.score.toFixed(2)}</span>
                  <div className="opp-headline">{o.headline}</div>
                  <div className="opp-why">{o.whyNow}</div>
                </div>
              ))}
            </div>
            <div className="drawer-foot">Full opportunity cards with evidence arrive in the Rep view (Phase 3).</div>
          </aside>
        </>
      )}
    </>
  );
}
