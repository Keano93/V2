// Phase 1 placeholder: the CRO view (Phase 2) replaces this page. It only proves the read model works end to end.
import { prisma } from "@/lib/db";
import { listOpportunities, whitespaceMap } from "@/lib/queries";

export const dynamic = "force-dynamic";
const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");

export default async function Home() {
  const [map, top] = await Promise.all([whitespaceMap(prisma), listOpportunities(prisma, { limit: 10 })]);
  return (
    <main style={{ maxWidth: 860, margin: "48px auto", padding: "0 16px" }}>
      <p style={{ color: "#666", margin: 0 }}>Headstart · Phase 1 (engine + API)</p>
      <h1 style={{ fontSize: 40, margin: "8px 0" }}>{eur(map.summary.unclaimed)} unclaimed in your base</h1>
      <p style={{ color: "#444" }}>
        {map.summary.opportunityCount} opportunities across {map.summary.accountsWithOpportunities} accounts ·{" "}
        {eur(map.summary.weighted)} score-weighted
      </p>
      <h2 style={{ fontSize: 18, marginTop: 32 }}>Top opportunities</h2>
      <ol style={{ paddingLeft: 20 }}>
        {top.map((o) => (
          <li key={o.id} style={{ marginBottom: 12 }}>
            <strong>{o.account.name}</strong> · {o.title} · {eur(o.value)}
            <div style={{ color: "#555", fontSize: 14 }}>{o.whyNow}</div>
          </li>
        ))}
      </ol>
      <p style={{ color: "#666", fontSize: 14, marginTop: 32 }}>
        API: <a href="/api/whitespace">/api/whitespace</a> · <a href="/api/opportunities?limit=20">/api/opportunities</a> ·{" "}
        <a href="/api/accounts">/api/accounts</a> · <a href="/api/needs">/api/needs</a> · <a href="/api/capabilities">/api/capabilities</a>
      </p>
    </main>
  );
}
