# Headstart V2

**Your product got better. Your customers don't know yet.**

Headstart is the expansion engine for B2B SaaS. It builds a live map of what each customer **needs** and what the product **can do**, then surfaces white-space opportunities, each with a € value, a "why now" and the evidence behind it. Built for the CRO; the metric is net revenue retention.

> **Status: Phase 1 of 6.** This covers the data model, seed data, extraction, the matching and white-space engines, and the headless API with a CLI. The UI is a placeholder page. The CRO view, rep cards, Mimir, the product view and Slack push come in later phases (see [Roadmap](#roadmap)).

---

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev            # first run: creates .env and the SQLite DB, loads seed data, extracts, runs the engines
open http://localhost:3000
```

Ranked opportunities in the terminal:

```bash
npm run opportunities                         # top 20
npm run opportunities -- --limit 50 --evidence
npm run opportunities -- --segment Enterprise --team DACH --product insights --type add_on
npm run opportunities -- --adoption --json    # include adoption plays, JSON output
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Set up if needed, then start the app and API on :3000 |
| `npm run load` | Reset the DB and reload seed data, then extract and run the engines |
| `npm run engine` | Extract any new documents and recompute matches and opportunities (`-- --re-extract` to redo all extraction) |
| `npm run opportunities` | Print ranked opportunities (filters above) |
| `npm run eval:extraction` | Precision and recall of extracted needs against the seed answer key |
| `npm run seed:generate` | Regenerate `data/seed/` (deterministic, so the same seed gives the same files) |
| `npm test` | Unit tests for the engines, extractors and CSV parser |
| `npm run typecheck` | TypeScript check |

### Configuration (`.env`, created from `.env.example`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `file:./headstart.db` | SQLite file. Set the Prisma provider to `postgresql` for production |
| `ANTHROPIC_API_KEY` | empty | Enables Claude extraction. **Never commit it**; `.env` is git-ignored |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model used for extraction |
| `ANTHROPIC_EFFORT` | `low` | `low` / `medium` / `high` |
| `HEADSTART_EXTRACTOR` | `auto` | `auto` (Claude if a key is set, else rules), `claude` or `rules` |
| `HEADSTART_TODAY` | `2026-11-10` | Pins "today" for timing maths so the seeded demo stays stable. Leave it empty in production |
| `HEADSTART_API_TOKEN` | unset | If set, every `/api/*` call except `/api/health` needs `Authorization: Bearer <token>` |

---

## Architecture

```
INPUTS                         THE MAP                                   OUTPUTS (all read the same API)
call / CS notes, tickets,  ─►  Need (account, persona, date, quote)  ─┐
account plans                                                         ├─► Match (confidence 0-1 + evidence)
release notes, docs        ─►  Capability (product, persona, pkg)   ─┘          │
account footprint          ─►  Account · Contact · Ownership ───────────► White-space engine
                                                                                │
                                                       Opportunity (€, score, why now) + Evidence
                                                                                │
                                         /api/*  ──►  CRO view · Rep cards · Mimir · Product view · Slack
```

* **Everything reads from the map.** The engines are pure functions (`src/lib/engine/`), with no I/O, so they are easy to test and reason about. `runEngine()` loads the map from the DB, computes, and persists Matches, Opportunities and Evidence.
* **Headless first.** UI, CLI, Slack and future integrations all go through `src/lib/queries.ts` and the `/api/*` routes, so every consumer sees the same numbers.
* **Stack:** Next.js 15 (App Router route handlers as the API), TypeScript, Prisma + SQLite, `@anthropic-ai/sdk`, zod, vitest.

### Data model (`prisma/schema.prisma`)

| Entity | What it is |
| --- | --- |
| **Account** | Customer: segment, team, owner, agents (the seat basis), contract and renewal dates |
| Contact | A person at the account, tagged with a **Persona** |
| Ownership | The account's footprint per **Product**: seats, active seats, ARR, add-ons owned |
| SourceDoc | Any raw text: call note, CS note, support ticket, account plan, release note, product doc |
| **Need** | A customer pain extracted from a SourceDoc: theme, persona, contact, date, severity, **verbatim quote** |
| **Capability** | Something a product can do, from docs (baseline) or release notes (new): themes, personas, packaging (core / included / add-on + uplift), **verbatim source line** |
| Match | Need ↔ Capability link with confidence and its components |
| **Opportunity** | Ranked, valued play for an account × product: type, €, scores, why now, status |
| **Evidence** | The quotes, release lines, footprint and timing behind an opportunity |
| ExtractionCache | Cached Claude outputs keyed by content hash |

Needs and capabilities share one controlled vocabulary, the **needs taxonomy** (`src/lib/taxonomy.ts`, 20 themes such as `manual_routing`, `sla_visibility` and `data_residency`). That shared vocabulary is what makes matching explainable.

---

## Seed data (`data/seed/`)

The seed is fictional and deterministic (`npm run seed:generate`). **Lumio** is a mid-size SaaS company selling a customer-service platform in Europe. The seed contains:

* **5 products:** Desk (core, everyone owns it), Knowledge, Insights, Automate, Voice. Add-ons: Insights Pro, Desk Shield, EU Data Residency, Automate Copilot.
* **4 personas:** Head of Customer Support, Support Operations Manager, Knowledge & Enablement Lead, IT & Security Admin.
* **50 accounts** with realistic footprints: €3.5M ARR, SMB / Mid-Market / Enterprise, 4 sales teams, 8 reps, 2–4 contacts each, seat utilisation, add-ons and renewal dates.
* **150 notes** (calls, CS check-ins, support tickets, account plans) spread from Nov 2025 to Nov 2026. Most pains are raised in the first two notes, i.e. months before the releases that solve them. About 20% are paraphrased with no taxonomy keywords, to test extraction honestly.
* **10 release notes** (Mar–Oct 2026) and 5 product docs. Most releases solve pains customers raised months earlier: Smart Routing, Auto-translate, SLA Breach Predictor, SCIM/SSO, Audit log, Call summaries, EU data residency, AI Reply Drafts, Virtual Agent 24/7, Workforce forecasting, Freshness alerts, Gap finder, Salesforce 360 sync.
* `answer-key.json` records which needs each note really contains, for the extraction eval.

On the seed, Phase 1 currently produces **91 revenue opportunities (€1.29M unclaimed) across all 50 accounts**, plus 11 adoption plays. **71 of those opportunities are triggered by a release that shipped after the customer raised the need.**

---

## Extraction

Notes become Needs and release notes / docs become Capabilities (`src/lib/extract/`).

* **Claude extractor** (`claude.ts`) uses structured outputs (zod schema), so every result is constrained to the taxonomy theme ids and persona ids. Two guards keep the evidence honest:
  * Each need's `quote` must appear **verbatim** in the source, otherwise it is dropped. Claude cannot invent evidence.
  * The speaker is resolved to a known contact, and from that contact to a persona.

  The prompt also enables server-side refusal fallback and prompt caching on the (stable) taxonomy system prompt.
* **Rule extractor** (`rules.ts`) is the no-key fallback and the baseline: word-boundary keyword hits on the taxonomy, sentence-level quotes, and speaker attribution by contact name. It cannot handle paraphrase.
* **Cache** (`cache.ts`): every Claude result is stored under `sha256(kind | prompt version | model | input)`, both in the `ExtractionCache` table and in `data/cache/extractions.json`. That file is meant to be committed, so a fresh clone or demo machine never re-calls the API. Documents are only re-extracted when their content changes.
* **Eval**: `npm run eval:extraction` scores whatever is in the DB against the answer key. Rules currently score **precision 100%, recall 84.5%**, because they miss the paraphrased pains.

> **To populate the Claude cache** (not done yet: the build sandbox had no API key): put `ANTHROPIC_API_KEY` in `.env`, run `npm run engine -- --re-extract` and then `npm run eval:extraction`, and commit `data/cache/extractions.json`. That is about 165 small calls, made once.

---

## How scoring works

### 1. Matching: need ↔ capability (`src/lib/engine/matching.ts`)

For every need and every capability:

```
confidence = 0.60 × theme    (1 if the capability addresses the need's taxonomy theme, else 0)
           + 0.30 × text     (TF-IDF cosine of the need's words vs the capability's words, scaled to 0–1)
           + 0.10 × persona  (1 if the person who raised it is someone the capability is built for)
```

* A shared theme alone gives **0.60**. Good wording overlap and the right persona take it towards **1.0**.
* Without a shared theme the ceiling is **0.40**. Such a match can appear as a weak signal, but on its own it can never create an opportunity.
* Matches below **0.30** are discarded.
* Each match records its `relation`: **`new_release_after_need`** when the capability shipped in a release *after* the customer raised the need (the "your product got better" moment), otherwise `existing_capability`.
* Evidence kept for each match: the customer quote, plus the release-note or doc line.

### 2. White space: opportunities per account × product (`src/lib/engine/whitespace.ts`)

For each account, the matched needs are grouped by the product of the matching capability. What the account owns decides the play:

| Type | When | € value |
| --- | --- | --- |
| **cross_sell** | Account doesn't own the product; its needs match the product's capabilities | `agents × seatRatio × list price × segment discount`, plus the add-on uplift if an add-on capability is what solves the need |
| **add_on** | Owns the product; a paid add-on (usually from a new release) solves an open need; add-on not yet owned | `owned seats × list price × discount × uplift %` |
| **seat_expansion** | Owns the product, utilisation ≥ 85%, unlicensed agents, and matched needs | `unlicensed seats × list price × discount` |
| **adoption** | Owns what already solves the need (included or core capability) | €0 new ARR; records the **ARR protected** (NRR defence). Shown separately and not counted in "unclaimed" |

Segment discount: SMB 1.0, Mid-Market 0.9, Enterprise 0.8.

Each opportunity gets three 0–1 scores:

* **Fit**: a probability-style OR over the best match per need theme, `1 − Π(1 − best_confidence)`, plus +0.05 for each repeat mention of the same theme (max +0.10). Two solid needs beat one. **An opportunity only exists if fit ≥ 0.55**, i.e. at least one themed match.
* **Persona**: 0.5 if the account has a contact whose persona the product or capability targets (a buyer is present), plus 0.5 × the share of matched needs raised by a target persona (the right people feel the pain). A low score is useful: it tells the rep to find the right contact.
* **Timing**: the strongest of three signals:
  * **New release after the need:** 1.0 if it shipped ≤ 60 days ago, decaying to 0.5 at a year (floor 0.4).
  * **Renewal:** within 90 days 0.8, within 180 days 0.6.
  * **Recency of the latest mention:** ≤ 60 days 0.6, ≤ 180 days 0.45, otherwise 0.3.

```
score          = 0.5 × fit + 0.2 × persona + 0.3 × timing
weighted value = € value × score                   ← ranking key
adoption rank  = ARR protected × 0.15 × score      (so adoption plays slot in sensibly)
```

**Why now** is written from the strongest trigger, for example:
> *Virtual Agent 24/7 shipped in Lumio Automate 3.2 on 25 Aug 2026 (3 months ago), 2 months after Kate Costa (Head of Support) said: "Customers in APAC get no answers overnight because we only staff office hours".*
>
> *EU data residency shipped in Lumio Desk 9.3 on 4 Aug 2026 (3 months ago), 5 months after Hugo Berg (Head of Support) said: "Data residency is a blocker for our public-sector customers". Renewal in 152 days.*

The **white-space map** marks each account × product cell as `owned` (with an `expansion` flag if there is an add-on or seat play on top), `opportunity` or `not_relevant`. **€ unclaimed** is the sum of the € values of open revenue opportunities, i.e. not weighted. The score-weighted total is reported alongside it.

Every weight and threshold is a named constant at the top of `matching.ts` and `whitespace.ts`, so tuning is a one-line change and the tests show the effect.

Opportunity IDs are deterministic (`opp_<account>_<product>_<type>[_<add-on>]`). A status a rep sets (`in_progress`, `won`, `dismissed`…) therefore survives engine re-runs.

---

## API (headless)

All responses are JSON. Filters combine freely.

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness and counts |
| `GET /api/whitespace?segment=&team=&owner=&product=` | **€ unclaimed** summary, by type and product, plus the accounts × products matrix and filter options |
| `GET /api/opportunities?segment=&team=&owner=&product=&type=&account=&status=&includeAdoption=true&limit=` | Ranked opportunities with scores, why now and evidence |
| `GET /api/opportunities/:id` | One opportunity |
| `PATCH /api/opportunities/:id` `{"status":"in_progress"}` | Set status (`open`, `in_progress`, `won`, `lost`, `dismissed`) |
| `GET /api/accounts?…` | Accounts with ARR, unclaimed € and opportunity count |
| `GET /api/accounts/:id` | Account brief data: footprint, contacts, needs (with quotes) and opportunities |
| `GET /api/needs?account=&theme=&status=` | Needs and the capabilities they matched |
| `GET /api/capabilities?product=&new=true` | Capabilities and how many needs each one matched |
| `GET /api/taxonomy` | The needs taxonomy |
| `POST /api/import?type=…&run=true` | Upload CSV (`text/csv`) or JSON rows. `type` is `accounts`, `contacts`, `ownership`, `notes` or `releases`. By default, new documents are extracted and opportunities recomputed |
| `POST /api/engine/run` `{"reExtract":false}` | Extract pending documents and recompute |

### Upload formats

Field names follow the zod schemas in `src/lib/ingest.ts`. In CSV, list fields such as `addOns` use `;`.

```csv
# type=notes
accountId,kind,title,date,author,contactId,body
acc_003,call_note,Check-in call,2026-11-05,Aoife Brennan,acc_003_c4,"Zoe said: ""We could not forecast the spike."""

# type=releases   (bullets like "- **Title**: description. Built for …. Available in the X add-on (+N% …).")
productId,version,date,body

# type=accounts / contacts / ownership
id,name,segment,team,owner,employees,agents,contractStart,renewalDate,…
id,accountId,name,title,email,persona
accountId,product,seats,activeSeats,arr,addOns,since
```

Notes and releases are keyed by content: re-uploading an identical document is a no-op, and an edited one is re-extracted.

---

## Project layout

```
prisma/schema.prisma          data model
data/seed/                    generated demo data (JSON + markdown)
data/cache/extractions.json   committed Claude extraction cache (created on first Claude run)
scripts/                      generate-seed, load, run-engine, opportunities, eval-extraction
src/lib/taxonomy.ts           needs taxonomy shared by extractors and matcher
src/lib/extract/              Claude + rule extractors, cache
src/lib/engine/               matching, white-space, persistence runner (pure engines + run.ts)
src/lib/ingest.ts             upserts, CSV parsing, pending-extraction loop
src/lib/queries.ts            read model used by API, CLI, UI
src/app/api/                  headless API routes
tests/                        vitest unit tests
```

## Roadmap

1. ✅ Data model, seed data, matching and white-space engines, ranked-opportunity script and API
2. CRO view: "€X unclaimed in your base" plus an accounts × products heatmap, filterable by segment, product and team
3. Rep view: collapsed opportunity cards per account (need, capability, why now, evidence), which expand for detail
4. Mimir actions: draft outreach, account brief, enablement foundation pack with a quiz (adjustable pass mark, default 80%)
5. Product view: unmet needs ranked by revenue at stake
6. Slack push of new opportunities

Not yet: live CRM or support-tool integrations (CSV/JSON upload stands in for them for now). Dropped from earlier versions: ramp plans as the headline, and the Events feature.
