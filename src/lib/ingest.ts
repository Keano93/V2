// Ingestion: the single path for getting data into Headstart, whether it comes from seed files,
// a CSV/JSON upload (POST /api/import) or, later, live integrations.
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { extractCapabilities, extractNeeds, type ExtractorName } from "./extract";
import type { PersonaId } from "./taxonomy";

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const dateish = z.union([z.string(), z.date()]).transform((v) => new Date(v));
const num = z.union([z.number(), z.string()]).transform(Number);
const list = z.union([z.array(z.string()), z.string()]).transform((v) =>
  Array.isArray(v) ? v : v.split(/[;|]/).map((s) => s.trim()).filter(Boolean),
);

// ---------- Schemas (also the documented upload format) ----------
export const ContactRow = z.object({
  id: z.string(),
  accountId: z.string().optional(),
  name: z.string(),
  title: z.string(),
  email: z.string().default(""),
  persona: z.string().nullable().optional(),
});
export const OwnershipRow = z.object({
  accountId: z.string().optional(),
  product: z.string(),
  seats: num,
  activeSeats: num,
  arr: num,
  addOns: list.default([]),
  since: dateish,
});
export const AccountRow = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().default(""),
  industry: z.string().default(""),
  segment: z.enum(["SMB", "Mid-Market", "Enterprise"]),
  region: z.string().default(""),
  team: z.string(),
  owner: z.string(),
  employees: num,
  agents: num,
  contractStart: dateish,
  renewalDate: dateish,
  contacts: z.array(ContactRow).default([]),
  ownership: z.array(OwnershipRow).default([]),
});
export const NoteRow = z.object({
  id: z.string().optional(),
  accountId: z.string(),
  kind: z.enum(["call_note", "cs_note", "support_ticket", "account_plan"]),
  title: z.string(),
  date: dateish,
  author: z.string().optional(),
  contactId: z.string().nullable().optional(),
  body: z.string(),
});
export const ReleaseRow = z.object({
  id: z.string().optional(),
  productId: z.string(),
  version: z.string().optional(),
  date: dateish,
  title: z.string().optional(),
  body: z.string(),
  kind: z.enum(["release_note", "product_doc"]).default("release_note"),
});

export type AccountRowT = z.infer<typeof AccountRow>;

// ---------- Writers ----------
export async function upsertAccounts(db: PrismaClient, rows: unknown[]): Promise<number> {
  for (const raw of rows) {
    const a = AccountRow.parse(raw);
    const data = {
      name: a.name, domain: a.domain, industry: a.industry, segment: a.segment, region: a.region, team: a.team,
      owner: a.owner, employees: a.employees, agents: a.agents, contractStart: a.contractStart, renewalDate: a.renewalDate,
    };
    await db.account.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data });
    if (a.contacts.length) await upsertContacts(db, a.contacts.map((c) => ({ ...c, accountId: a.id })));
    if (a.ownership.length) await upsertOwnership(db, a.ownership.map((o) => ({ ...o, accountId: a.id })));
  }
  return rows.length;
}

export async function upsertContacts(db: PrismaClient, rows: unknown[]): Promise<number> {
  for (const raw of rows) {
    const c = ContactRow.parse(raw);
    if (!c.accountId) throw new Error(`contact ${c.id}: accountId is required`);
    const data = { accountId: c.accountId, name: c.name, title: c.title, email: c.email, personaId: c.persona ?? null };
    await db.contact.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
  }
  return rows.length;
}

export async function upsertOwnership(db: PrismaClient, rows: unknown[]): Promise<number> {
  for (const raw of rows) {
    const o = OwnershipRow.parse(raw);
    if (!o.accountId) throw new Error(`ownership for ${o.product}: accountId is required`);
    const data = { seats: o.seats, activeSeats: o.activeSeats, arr: o.arr, addOns: o.addOns, since: o.since };
    await db.ownership.upsert({
      where: { accountId_productId: { accountId: o.accountId, productId: o.product } },
      create: { accountId: o.accountId, productId: o.product, ...data },
      update: data,
    });
  }
  return rows.length;
}

/** Notes are keyed by content: re-uploading the same note is a no-op, an edited note is re-extracted. */
export async function upsertNotes(db: PrismaClient, rows: unknown[]): Promise<number> {
  for (const raw of rows) {
    const n = NoteRow.parse(raw);
    const contentHash = hash(n.title + "\n" + n.body);
    const id = n.id ?? `note_${hash(n.accountId + contentHash)}`;
    const existing = await db.sourceDoc.findUnique({ where: { id } });
    const data = {
      kind: n.kind, title: n.title, body: n.body, date: n.date, author: n.author ?? null,
      accountId: n.accountId, contactId: n.contactId ?? null, contentHash,
    };
    if (!existing) await db.sourceDoc.create({ data: { id, ...data } });
    else if (existing.contentHash !== contentHash) await db.sourceDoc.update({ where: { id }, data: { ...data, extractedAt: null } });
  }
  return rows.length;
}

export async function upsertReleases(db: PrismaClient, rows: unknown[]): Promise<number> {
  for (const raw of rows) {
    const r = ReleaseRow.parse(raw);
    const title = r.title ?? r.body.split("\n")[0].replace(/^#\s*/, "");
    const contentHash = hash(r.body);
    const id = r.id ?? `${r.kind === "product_doc" ? "doc" : "rel"}_${r.productId}_${r.version ?? contentHash}`;
    const existing = await db.sourceDoc.findUnique({ where: { id } });
    const data = { kind: r.kind, title, body: r.body, date: r.date, productId: r.productId, version: r.version ?? null, contentHash };
    if (!existing) await db.sourceDoc.create({ data: { id, ...data } });
    else if (existing.contentHash !== contentHash) await db.sourceDoc.update({ where: { id }, data: { ...data, extractedAt: null } });
  }
  return rows.length;
}

// ---------- Extraction ----------
export interface ExtractionStats {
  documents: number;
  needs: number;
  capabilities: number;
  byExtractor: Record<ExtractorName, number>;
  cacheHits: number;
}

/** Extract needs/capabilities from every SourceDoc that hasn't been extracted yet (or `force` for all). */
export async function extractPending(db: PrismaClient, opts: { force?: boolean; log?: (m: string) => void } = {}): Promise<ExtractionStats> {
  const docs = await db.sourceDoc.findMany({
    where: opts.force ? {} : { extractedAt: null },
    include: { account: { include: { contacts: true } } },
    orderBy: { id: "asc" },
  });
  const stats: ExtractionStats = { documents: 0, needs: 0, capabilities: 0, byExtractor: { claude: 0, rules: 0 }, cacheHits: 0 };

  for (const doc of docs) {
    if (doc.kind === "release_note" || doc.kind === "product_doc") {
      const res = await extractCapabilities(db, {
        id: doc.id, kind: doc.kind, title: doc.title, body: doc.body, productId: doc.productId!, date: doc.date,
      });
      await db.capability.deleteMany({ where: { sourceId: doc.id } });
      for (const [i, c] of res.items.entries()) {
        await db.capability.create({
          data: {
            id: `${doc.id}_cap${i + 1}`, productId: doc.productId!, sourceId: doc.id, title: c.title, description: c.description,
            themes: c.themes, personas: c.personas, packaging: c.packaging, addOnName: c.addOnName, upliftPct: c.upliftPct,
            releasedAt: doc.date, isNew: doc.kind === "release_note", sourceLine: c.sourceLine, extractor: res.extractor,
          },
        });
      }
      stats.capabilities += res.items.length;
      stats.byExtractor[res.extractor]++;
      if (res.cached) stats.cacheHits++;
    } else if (doc.account) {
      const contacts = doc.account.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, personaId: (c.personaId as PersonaId) ?? null }));
      const res = await extractNeeds(db, {
        id: doc.id, kind: doc.kind, title: doc.title, body: doc.body, date: doc.date,
        accountName: doc.account.name, contactId: doc.contactId, contacts,
      });
      await db.need.deleteMany({ where: { sourceId: doc.id } });
      for (const [i, n] of res.items.entries()) {
        await db.need.create({
          data: {
            id: `${doc.id}_n${i + 1}`, accountId: doc.account.id, sourceId: doc.id, contactId: n.contactId, personaId: n.personaId,
            theme: n.theme, summary: n.summary, quote: n.quote, severity: n.severity, raisedAt: doc.date, extractor: res.extractor,
          },
        });
      }
      stats.needs += res.items.length;
      stats.byExtractor[res.extractor]++;
      if (res.cached) stats.cacheHits++;
    }
    await db.sourceDoc.update({ where: { id: doc.id }, data: { extractedAt: new Date() } });
    stats.documents++;
    if (stats.documents % 25 === 0) opts.log?.(`  extracted ${stats.documents}/${docs.length} documents`);
  }
  return stats;
}

// ---------- CSV ----------
/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, newlines in quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [header, ...data] = rows;
  if (!header) return [];
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}
