// One opportunity: the play, its evidence, and the enablement pack (Phase 4 slice, pulled forward).
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnablementPanel } from "@/components/enablement-panel";
import { prisma } from "@/lib/db";
import { getPack } from "@/lib/enablement-db";
import { eur, TYPE_LABEL } from "@/lib/format";
import { listOpportunities } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rep?: string }> }) {
  const { id } = await params;
  const { rep } = await searchParams;
  const [[o], pack] = await Promise.all([listOpportunities(prisma, { id }), getPack(prisma, id, rep)]);
  if (!o) notFound();
  const quotes = o.evidence.filter((e) => e.kind === "need_quote");
  const lines = o.evidence.filter((e) => e.kind === "release_line");
  return (
    <main className="page narrow">
      <p className="eyebrow"><Link href="/">Overview</Link> · {o.account.name} · {o.account.segment} · {o.account.owner}</p>
      <div className="opp-head">
        <h1>{o.title}</h1>
        <div className="opp-head-value">{o.type === "adoption" ? `protects ${eur(o.arrProtected)}` : eur(o.value)}<small>{TYPE_LABEL[o.type]} · score {o.scores.overall.toFixed(2)}</small></div>
      </div>
      <p className="lede">{o.headline}</p>
      <p className="why">{o.whyNow}</p>

      {pack && pack.available ? <EnablementPanel opportunityId={o.id} pack={pack} /> : <section className="card"><p className="muted">{pack?.reason ?? "No enablement for this play."}</p></section>}

      <section className="card" style={{ marginTop: 12 }}>
        <h2>Evidence</h2>
        <h4>What the customer said</h4>
        {quotes.map((e, i) => <figure key={i} className="quote"><q>{e.text}</q><span className="src">{e.label}{e.confidence != null ? ` · match ${Math.round(e.confidence * 100)}%` : ""}</span></figure>)}
        <h4>What the product can do</h4>
        {lines.map((e, i) => <div key={i} className="rel">{e.text}<span className="src">{e.label}</span></div>)}
      </section>
    </main>
  );
}
