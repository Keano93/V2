import { describe, expect, it } from "vitest";
import { matchNeeds, MIN_MATCH_CONFIDENCE } from "../src/lib/engine/matching";
import { cap, d, need } from "./fixtures";

describe("matching engine", () => {
  it("scores a same-theme, right-persona, well-worded match highly", () => {
    const [m] = matchNeeds([need()], [cap()]);
    expect(m.themeScore).toBe(1);
    expect(m.personaScore).toBe(1);
    expect(m.confidence).toBeGreaterThan(0.8);
    expect(m.confidence).toBeLessThanOrEqual(1);
  });

  it("flags capabilities that shipped after the need was raised", () => {
    const [after] = matchNeeds([need({ raisedAt: d("2026-01-15") })], [cap({ releasedAt: d("2026-03-10") })]);
    expect(after.relation).toBe("new_release_after_need");
    const [before] = matchNeeds([need({ raisedAt: d("2026-05-01") })], [cap({ releasedAt: d("2026-03-10") })]);
    expect(before.relation).toBe("existing_capability");
    const [baseline] = matchNeeds([need()], [cap({ isNew: false, releasedAt: d("2024-01-01") })]);
    expect(baseline.relation).toBe("existing_capability");
  });

  it("never lets a match without a shared theme reach opportunity strength", () => {
    const ms = matchNeeds([need({ theme: "exec_reporting" })], [cap()]);
    for (const m of ms) {
      expect(m.themeScore).toBe(0);
      expect(m.confidence).toBeLessThanOrEqual(0.4);
    }
  });

  it("drops weak matches below the threshold", () => {
    const ms = matchNeeds(
      [need({ theme: "data_residency", quote: "Legal says customer data has to be stored in the EU.", summary: "EU data", personaId: "it_admin" })],
      [cap()],
    );
    expect(ms.every((m) => m.confidence >= MIN_MATCH_CONFIDENCE)).toBe(true);
    expect(ms).toHaveLength(0);
  });

  it("persona mismatch lowers but does not kill a themed match", () => {
    const [m] = matchNeeds([need({ personaId: "it_admin" })], [cap()]);
    expect(m.personaScore).toBe(0);
    expect(m.confidence).toBeGreaterThanOrEqual(0.6);
  });
});
