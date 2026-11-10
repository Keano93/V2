import { describe, expect, it } from "vitest";
import { scoreDetections, type Detected, type GoldEvent } from "@/lib/eval";

const gold: GoldEvent[] = [
  { id: "G1", type: "delay", acceptTypes: ["access"], awarenessDate: "2026-10-05", messageIds: new Set(["a", "b", "c"]) },
  { id: "G2", type: "change", acceptTypes: [], awarenessDate: "2026-10-14", messageIds: new Set(["d"]) },
  { id: "G3", type: "instruction", acceptTypes: [], awarenessDate: "2026-10-20", messageIds: new Set(["e"]) },
];
const det = (index: number, messageIds: string[], eventType = "delay", awarenessDate = "2026-10-05"): Detected => ({
  index, eventType, title: `D${index}`, awarenessDate, messageIds, confidence: 0.8,
});

describe("scoreDetections", () => {
  it("scores matches, duplicates, false positives and misses", () => {
    const r = scoreDetections(
      [
        det(0, ["a", "b"]), // matches G1
        det(1, ["c"]), // duplicate of G1
        det(2, ["d"], "instruction", "2026-10-16"), // matches G2, wrong type, 2 days late
        det(3, ["trap1"]), // false positive on a trap
      ],
      gold,
      [{ id: "T1", messageId: "trap1" }],
    );
    expect(r.truePositives.map((t) => t.gold.id).sort()).toEqual(["G1", "G2"]);
    expect(r.duplicates.map((d) => d.detected.index)).toEqual([1]);
    expect(r.falsePositives[0].trapIds).toEqual(["T1"]);
    expect(r.missed.map((g) => g.id)).toEqual(["G3"]);
    expect(r.precision).toBe(0.5);
    expect(r.recall).toBeCloseTo(2 / 3);
    expect(r.typeAccuracy).toBe(0.5);
    expect(r.datesWithinOneDay).toBe(0.5);
  });

  it("accepts alternative types", () => {
    const r = scoreDetections([det(0, ["a"], "access")], gold, []);
    expect(r.truePositives[0].typeOk).toBe(true);
  });

  it("prefers the detection with the largest overlap", () => {
    const r = scoreDetections([det(0, ["a"]), det(1, ["a", "b", "c"])], gold, []);
    expect(r.truePositives[0].detected.index).toBe(1);
    expect(r.duplicates[0].detected.index).toBe(0);
  });

  it("handles no detections", () => {
    const r = scoreDetections([], gold, []);
    expect(r.precision).toBe(0);
    expect(r.recall).toBe(0);
  });
});
