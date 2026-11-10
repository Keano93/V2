# Notice Guard (MVP)

Finds notifiable events (changes, delays, instructions, access problems, late information) buried in
WhatsApp chats, emails, site diaries and meeting minutes on Irish construction projects, and tracks the
contractual notice deadline for each one so the entitlement isn't lost.

> **Synthetic data only.** All projects, companies and people in `data/seed` are fictional.
> **Contract notice periods are placeholders** marked "VERIFY". They are not legal advice and must be
> checked against the actual contract before relying on them.

## Setup

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

`npm run dev` does everything on first run: creates `.env` from `.env.example`, creates the SQLite
database, applies migrations and loads the two seed projects (only if the database is empty).
Then open http://localhost:3000.

To enable AI detection, put your key in `.env` and restart:

```
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-opus-5-5"   # any Claude model id
ANTHROPIC_EFFORT="medium"           # low | medium | high
```

`.env` is git-ignored. Never commit a real key. The key is only read by the Anthropic SDK and is never logged.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Set up (if needed) and start the app |
| `npm test` | Unit tests |
| `npm run eval` | Measure AI detection precision/recall against the seed answer key |
| `npm run eval -- --detector baseline` | Same, using the keyword baseline (no API key needed) |
| `npm run detect` | Run AI detection on all projects and fill the review queue (`--detector baseline`, `--project <ref>`) |
| `npm run seed` | Reload the two seed projects (keeps edited contract rules) |
| `npm run db:reset` | Wipe the database and re-seed from scratch |
| `npx tsx scripts/dump-messages.ts [kind]` | Print parsed messages (debugging) |

## What's built so far

**Slice 1: parsing and seed data**

- Projects with a contract type (PWC-style, RIAI, NEC, bespoke subcontract), each with placeholder notice rules.
- Import by file upload or paste:
  - WhatsApp `.txt` exports, Android and iOS formats, 12/24-hour clocks, multi-line messages, system lines
    and media placeholders. Dates are read day-first unless the file proves otherwise.
  - Emails: `.eml` files, or text pasted from Outlook/Gmail. Reply chains are split into separate messages.
  - Site diaries and minutes: `.txt` or `.pdf`. Split by date heading, then by paragraph, bullet or numbered item.
- All times are treated as Irish local time (Europe/Dublin), including the clock change.
- Re-importing the same content is skipped (duplicates are detected per project).
- Every message links to a page showing it in context in its original source.

**Slice 2: detection and eval**

- **AI detection** (`src/lib/detection/`). Each project's messages, from every source, are put in time order
  and sent to Claude in batches (up to 150 messages per request). The model returns structured JSON:
  event type, title, summary, why it's notifiable, awareness date, supporting message ids, an exact quote
  and a confidence score. One event mentioned across WhatsApp, email and the diary comes back as one event.
  Events found in earlier batches are passed to later ones so they can be extended rather than duplicated.
- **Quote check.** Every quote is checked against the original message text. If it can't be found, the
  event shows "quote not found in source".
- **Caching.** Each response is stored in the `DetectionCache` table, keyed by a hash of the model, effort,
  prompt version and exact prompt text. Re-running on unchanged messages costs nothing. Adding new messages
  re-runs only the batch they land in and the batches after it.
- **Keyword baseline** (`--detector baseline`, or the button in the app). A simple rules-based detector,
  clearly labelled as not AI, so the pipeline works without a key and the AI has something to beat.
- **Re-running** replaces unreviewed events. Events a person has confirmed or dismissed are kept.
- **Eval** (`npm run eval`). Runs detection in memory (the review queue is untouched) and scores it against
  `data/seed/answer-key.json`. A detection matches a known event when their evidence messages overlap. Reports
  precision, recall, F1, duplicates, false positives (and which traps were hit), event-type accuracy and
  awareness-date accuracy. Writes the full result to `eval-results/latest-<detector>.json`.

Baseline result on the seed data: precision 26%, recall 100% (57 flags for 15 events: 35 duplicates and
7 false positives, including 4 of the 14 traps). The AI eval needs an API key to run.

## Seed data

`data/seed/` has two fictional projects, 148 messages in total:

- **Kilbrack National School extension**: public-sector, PWC-style main contract (we are the main contractor).
- **Project Halcyon DC2 data centre**: M&E package under a bespoke subcontract (we are the M&E subcontractor).

`data/seed/answer-key.json` lists the 15 genuine notifiable events and 14 false-positive traps,
with the messages that evidence each one. It is used by the accuracy eval (slice 2).
`data/samples/sample-site-diary.pdf` is a small PDF to try the upload with.

## Project layout

```
prisma/schema.prisma      data model
prisma/seed.ts            seed loader
src/lib/parsers/          WhatsApp, email, diary/minutes and PDF parsers
src/lib/ingest.ts         parse + dedupe + store
src/lib/contracts/        placeholder contract notice rules
src/app/                  Next.js pages and server actions
data/seed/                synthetic dataset and answer key
tests/                    Vitest unit tests
```
