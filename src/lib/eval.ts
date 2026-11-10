/**
 * Scoring detected events against the seed answer key.
 *
 * A detected event matches a known event when their evidence messages overlap. Matching
 * is one-to-one (largest overlap first). A second detection of an already-matched event
 * is a "duplicate": it costs precision because a reviewer has to deal with it twice.
 */
export interface GoldEvent {
  id: string;
  type: string;
  acceptTypes: string[];
  awarenessDate: string;
  messageIds: Set<string>;
}

export interface Trap {
  id: string;
  messageId: string;
}

export interface Detected {
  index: number;
  eventType: string;
  title: string;
  awarenessDate: string;
  messageIds: string[];
  confidence: number;
}

export interface EvalReport {
  detected: number;
  gold: number;
  truePositives: { detected: Detected; gold: GoldEvent; typeOk: boolean; dateErrorDays: number | null }[];
  duplicates: { detected: Detected; gold: GoldEvent }[];
  falsePositives: { detected: Detected; trapIds: string[] }[];
  missed: GoldEvent[];
  precision: number;
  recall: number;
  f1: number;
  typeAccuracy: number;
  datesWithinOneDay: number;
  trapsFlagged: string[];
}

function daysBetween(a: string, b: string): number | null {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((da - db) / 86_400_000);
}

export function scoreDetections(detected: Detected[], gold: GoldEvent[], traps: Trap[]): EvalReport {
  const pairs: { d: Detected; g: GoldEvent; overlap: number }[] = [];
  for (const d of detected) {
    for (const g of gold) {
      const overlap = d.messageIds.filter((id) => g.messageIds.has(id)).length;
      if (overlap > 0) pairs.push({ d, g, overlap });
    }
  }
  pairs.sort((a, b) => b.overlap - a.overlap || b.d.confidence - a.d.confidence);

  const matchedD = new Set<number>();
  const matchedG = new Set<string>();
  const truePositives: EvalReport["truePositives"] = [];
  for (const { d, g } of pairs) {
    if (matchedD.has(d.index) || matchedG.has(g.id)) continue;
    matchedD.add(d.index);
    matchedG.add(g.id);
    const dateError = daysBetween(d.awarenessDate, g.awarenessDate);
    truePositives.push({
      detected: d,
      gold: g,
      typeOk: d.eventType === g.type || g.acceptTypes.includes(d.eventType),
      dateErrorDays: dateError,
    });
  }

  const duplicates: EvalReport["duplicates"] = [];
  const falsePositives: EvalReport["falsePositives"] = [];
  for (const d of detected) {
    if (matchedD.has(d.index)) continue;
    const overlapping = pairs.find((p) => p.d.index === d.index);
    if (overlapping) {
      duplicates.push({ detected: d, gold: overlapping.g });
    } else {
      falsePositives.push({
        detected: d,
        trapIds: traps.filter((t) => d.messageIds.includes(t.messageId)).map((t) => t.id),
      });
    }
  }

  const precision = detected.length ? truePositives.length / detected.length : 0;
  const recall = gold.length ? truePositives.length / gold.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const tp = truePositives.length || 1;
  return {
    detected: detected.length,
    gold: gold.length,
    truePositives,
    duplicates,
    falsePositives,
    missed: gold.filter((g) => !matchedG.has(g.id)),
    precision,
    recall,
    f1,
    typeAccuracy: truePositives.filter((t) => t.typeOk).length / tp,
    datesWithinOneDay:
      truePositives.filter((t) => t.dateErrorDays !== null && Math.abs(t.dateErrorDays) <= 1).length / tp,
    trapsFlagged: [...new Set(falsePositives.flatMap((f) => f.trapIds))],
  };
}
