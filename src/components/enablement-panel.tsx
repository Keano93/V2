"use client";

import { useState } from "react";
import type { getPack } from "@/lib/enablement-db";

type Pack = Extract<NonNullable<Awaited<ReturnType<typeof getPack>>>, { available: true }>;
interface Result { score: number; passed: boolean; passMark: number; correct: number; total: number; results: { id: string; correct: boolean; answer: number; explain: string }[] }

export function EnablementPanel({ opportunityId, pack }: { opportunityId: string; pack: Pack }) {
  const [open, setOpen] = useState(pack.recommendation.recommended);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passMark, setPassMark] = useState(pack.passMark);
  const [savedMark, setSavedMark] = useState(pack.passMark);
  const first = pack.rep.split(" ")[0];
  const c = pack.context;
  const answered = pack.quiz.every((q) => answers[q.id] !== undefined);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/enablement/attempts`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rep: pack.rep, answers }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? "Couldn't grade the quiz");
      setResult(await res.json());
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function saveMark() {
    const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enablement: { passMark } }) });
    if (res.ok) setSavedMark((await res.json()).enablement.passMark);
  }

  return (
    <section className="card enable" aria-labelledby="enable-title">
      <div className={`enable-banner ${pack.recommendation.recommended ? "suggested" : ""}`}>
        <div>
          <div className="enable-kicker">{pack.recommendation.recommended ? "Mimir suggests" : "Enablement"}</div>
          <h2 id="enable-title">
            {pack.recommendation.kind === "refresher" ? `Refresher for ${first}` : pack.recommendation.kind === "retake" ? `Retake for ${first}` : pack.recommendation.recommended ? `Enablement pack for ${first}` : `${first} is up to date`}
          </h2>
          <p>{pack.recommendation.reason}</p>
        </div>
        <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide pack" : "Open pack"}</button>
      </div>

      {open && (
        <div className="enable-body">
          <details open>
            <summary>This account <span className="muted">added by Headstart</span></summary>
            <div className="enable-sec">
              <h4>Suggested opener</h4>
              <p className="opener">{c.opener}</p>
              <h4>What they told us</h4>
              {c.saidBy.map((q, i) => <figure key={i} className="quote"><q>{q.quote}</q><span className="src">{q.label}</span></figure>)}
              <h4>What to show them</h4>
              <ul className="plain">{c.show.map((s, i) => <li key={i}><b>{s.capability}</b> <span className="chip">{s.packaging}</span> for {s.need.toLowerCase()}. <span className="muted">{s.detail}</span></li>)}</ul>
              <h4>Who to talk to</h4>
              <ul className="plain">
                {c.talkTo.map((t, i) => <li key={i}><b>{t.name}</b>, {t.title}. <span className="muted">{t.note}</span></li>)}
                {c.gaps.map((g, i) => <li key={`g${i}`} className="gap">{g}</li>)}
              </ul>
            </div>
          </details>

          <details>
            <summary>{pack.foundation.title} <span className="muted">v{pack.foundation.version} · {pack.foundation.minutes} min</span>
              {pack.foundation.isSample && <span className="chip sample">Sample content</span>}</summary>
            <div className="enable-sec">
              {pack.foundation.isSample && <p className="muted small">Hypothetical foundation content for the demo. Replace it with your approved enablement; Headstart adds the account layer on top.</p>}
              {pack.foundation.sections.map((s) => (
                <div key={s.heading}><h4>{s.heading}</h4><ul className="plain">{s.points.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
              ))}
            </div>
          </details>

          <details open={pack.recommendation.recommended}>
            <summary>Quiz <span className="muted">{pack.quiz.length} questions · pass mark {savedMark}%</span></summary>
            <div className="enable-sec">
              {pack.quiz.map((q, qi) => {
                const r = result?.results.find((x) => x.id === q.id);
                return (
                  <fieldset key={q.id} className={`q ${r ? (r.correct ? "right" : "wrong") : ""}`} disabled={!!result}>
                    <legend><span className="muted">{qi + 1}.</span> {q.prompt} {q.source === "account" && <span className="chip">this account</span>}</legend>
                    {q.options.map((o, oi) => (
                      <label key={oi} className={`opt ${r && oi === r.answer ? "is-answer" : ""}`}>
                        <input type="radio" name={q.id} id={`${q.id}-${oi}`} checked={answers[q.id] === oi} onChange={() => setAnswers({ ...answers, [q.id]: oi })} />
                        {o}
                      </label>
                    ))}
                    {r && <p className="explain">{r.correct ? "Correct. " : "Not quite. "}{r.explain}</p>}
                  </fieldset>
                );
              })}
              {error && <p className="error">{error}</p>}
              {result ? (
                <div className={`result ${result.passed ? "pass" : "fail"}`}>
                  <span><b>{result.passed ? "Passed" : "Not passed yet"}</b>: {result.score}% ({result.correct}/{result.total}), pass mark {result.passMark}%. Recorded for {first}.</span>
                  <button className="btn ghost" onClick={() => { setResult(null); setAnswers({}); }}>Try again</button>
                </div>
              ) : (
                <button className="btn primary" disabled={!answered || busy} onClick={submit}>{busy ? "Checking…" : answered ? "Submit answers" : "Answer every question to submit"}</button>
              )}
              <div className="passmark">
                <label htmlFor="passmark">Pass mark for all quizzes</label>
                <input id="passmark" type="number" min={0} max={100} step={5} value={passMark} onChange={(e) => setPassMark(Number(e.target.value))} />%
                <button className="btn ghost" onClick={saveMark} disabled={passMark === savedMark}>Save</button>
              </div>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
