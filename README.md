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

To enable AI detection (from slice 2), put your key in `.env`:

```
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-sonnet-5-5"
```

`.env` is git-ignored. Never commit a real key.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Set up (if needed) and start the app |
| `npm test` | Unit tests (parsers, seed data integrity) |
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
