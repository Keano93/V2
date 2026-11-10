import { describe, expect, it } from "vitest";
import { parseSource, type ParsedMessage } from "@/lib/parsers";
import { loadAnswerKey, loadSeedProjects, readSeedFile } from "@/lib/seed-data";

/** Parses every seed file and checks the answer key points at real messages. */
describe("seed data", async () => {
  const projects = await loadSeedProjects();
  const key = await loadAnswerKey();
  const byFile = new Map<string, ParsedMessage[]>();
  for (const p of projects) {
    for (const f of p.files) {
      const parsed = await parseSource({ kind: f.kind, filename: f.path, bytes: await readSeedFile(f.path) });
      byFile.set(f.path, parsed.messages);
    }
  }
  const all = [...byFile.values()].flat();
  const find = (file: string, contains: string) =>
    (byFile.get(file) ?? []).filter((m) => m.body.includes(contains));

  it("has about 150 messages across both projects", () => {
    expect(all.length).toBeGreaterThanOrEqual(140);
    expect(all.length).toBeLessThanOrEqual(170);
  });

  it("has 15 known events and some traps", () => {
    expect(key.events).toHaveLength(15);
    expect(key.traps.length).toBeGreaterThanOrEqual(10);
  });

  it.each(key.events.flatMap((e) => e.evidence.map((ev) => [e.id, ev.file, ev.contains])))(
    "%s evidence in %s: %s",
    (_id, file, contains) => {
      expect(find(file, contains)).toHaveLength(1);
    },
  );

  it.each(key.traps.map((t) => [t.id, t.file, t.contains]))("trap %s in %s: %s", (_id, file, contains) => {
    expect(find(file, contains)).toHaveLength(1);
  });

  it("every message has a sender and a valid date", () => {
    for (const m of all) {
      expect(m.sender).toBeTruthy();
      expect(Number.isNaN(m.sentAt.getTime())).toBe(false);
    }
  });
});
