// CRO view: "€X unclaimed in your base" + the white-space map (accounts × products).
import { Filters } from "@/components/filters";
import { Heatmap } from "@/components/heatmap";
import { prisma } from "@/lib/db";
import { eur, eurShort, pct, TYPE_LABEL, VALUE_BUCKETS } from "@/lib/format";
import { whitespaceMap } from "@/lib/queries";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function Bars({ items }: { items: { name: string; value: number; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">
      {items.map((i) => (
        <div key={i.name} style={{ display: "contents" }}>
          <div className="name">{i.name}</div>
          <div className="track" aria-hidden><div className="fill" style={{ width: `${(i.value / max) * 100}%` }} /></div>
          <div className="val">{eurShort(i.value)}<small>{i.count}</small></div>
        </div>
      ))}
    </div>
  );
}

export default async function CroView({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const current = { segment: one(sp.segment), team: one(sp.team), product: one(sp.product) };
  const [data, allProducts, teams, segments] = await Promise.all([
    whitespaceMap(prisma, current),
    prisma.product.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
    prisma.account.findMany({ distinct: ["team"], select: { team: true }, orderBy: { team: "asc" } }),
    prisma.account.findMany({ distinct: ["segment"], select: { segment: true } }),
  ]);
  const s = data.summary;
  const segOrder = ["SMB", "Mid-Market", "Enterprise"];

  const byProduct = data.products
    .map((p) => ({ name: p.name.replace(/^Lumio /, ""), value: s.byProduct[p.id]?.value ?? 0, count: s.byProduct[p.id]?.count ?? 0 }))
    .filter((i) => i.count > 0)
    .sort((a, b) => b.value - a.value);
  const byType = ["cross_sell", "add_on", "seat_expansion"]
    .map((t) => ({ name: TYPE_LABEL[t], value: s.byType[t]?.value ?? 0, count: s.byType[t]?.count ?? 0 }))
    .filter((i) => i.count > 0);
  const scope = [current.segment, current.team, allProducts.find((p) => p.id === current.product)?.name].filter(Boolean).join(" · ");

  return (
    <main className="page">
      <p className="eyebrow">Expansion overview{scope ? ` · ${scope}` : ""}</p>
      <h1 className="hero">
        <span className="hero-figure">{eurShort(s.unclaimed)}</span>
        <span className="hero-label">unclaimed in your base</span>
      </h1>
      <p className="hero-sub">
        Your product got better. Your customers don&apos;t know yet. {s.opportunityCount} expansion plays across{" "}
        {s.accountsWithOpportunities} accounts, matched from what customers told you to what you&apos;ve shipped.
      </p>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Potential uplift on current ARR</div>
          <div className="stat-value">+{pct(s.baseArr ? s.unclaimed / s.baseArr : 0)}</div>
          <div className="stat-note">on {eurShort(s.baseArr)} ARR in scope</div>
        </div>
        <div className="stat">
          <div className="stat-label">Score-weighted pipeline</div>
          <div className="stat-value">{eurShort(s.weighted)}</div>
          <div className="stat-note">value × fit, persona, timing</div>
        </div>
        <div className="stat">
          <div className="stat-label">Unlocked by new releases</div>
          <div className="stat-value">{eurShort(data.releaseDriven.value)}</div>
          <div className="stat-note">{data.releaseDriven.count} plays where a release solved a need raised earlier</div>
        </div>
        <div className="stat">
          <div className="stat-label">ARR to protect (adoption)</div>
          <div className="stat-value">{eurShort(s.adoptionArrProtected)}</div>
          <div className="stat-note">{s.adoptionCount} plays where they own the fix but haven&apos;t adopted it</div>
        </div>
      </div>

      <Filters
        current={current}
        segments={segments.map((x) => x.segment).sort((a, b) => segOrder.indexOf(a) - segOrder.indexOf(b))}
        teams={teams.map((t) => t.team)}
        products={allProducts}
      />

      <div className="grid-2">
        <section className="card" aria-labelledby="by-product">
          <h2 id="by-product">By product<small>€ unclaimed · plays</small></h2>
          {byProduct.length ? <Bars items={byProduct} /> : <div className="empty">Nothing in scope.</div>}
        </section>
        <section className="card" aria-labelledby="by-type">
          <h2 id="by-type">By play<small>€ unclaimed · plays</small></h2>
          {byType.length ? <Bars items={byType} /> : <div className="empty">Nothing in scope.</div>}
        </section>
      </div>

      <section className="card map-card" aria-labelledby="map-title">
        <div className="map-head">
          <h2 id="map-title">White-space map<small>{data.rows.length} accounts · click an account for its plays</small></h2>
          <div className="legend" aria-label="Legend">
            <span className="item"><span className="swatch owned" /> Owned ✓</span>
            <span className="item"><span className="swatch owned" style={{ boxShadow: "inset 3px 0 0 var(--brand-accent)" }} /> Owned + expansion</span>
            <span className="item">
              Opportunity
              <span className="ramp" aria-hidden>
                {[1, 2, 3, 4].map((b) => <span key={b} className="swatch" style={{ background: `var(--seq-${b})` }} />)}
              </span>
              {eurShort(0)}–{eurShort(VALUE_BUCKETS[2])}+
            </span>
            <span className="item"><span className="swatch none" /> Not relevant</span>
          </div>
        </div>
        <Heatmap data={data} />
      </section>
      <p className="eyebrow" style={{ marginTop: 16 }}>
        € unclaimed = estimated ARR of open cross-sell, add-on and seat-expansion plays ({eur(s.unclaimed)}). Adoption plays are tracked separately.
      </p>
    </main>
  );
}
