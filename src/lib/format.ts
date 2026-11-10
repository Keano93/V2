/** €1.29M, €38k, €950 */
export function eurShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `€${(n / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 10_000) return `€${Math.round(n / 1000)}k`;
  if (a >= 1000) return `€${(n / 1000).toFixed(1)}k`;
  return `€${Math.round(n)}`;
}

export function eur(n: number): string {
  return "€" + Math.round(n).toLocaleString("en-GB");
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export const TYPE_LABEL: Record<string, string> = {
  cross_sell: "Cross-sell",
  add_on: "Add-on",
  seat_expansion: "Seat expansion",
  adoption: "Adoption",
};

/** Value buckets for heatmap intensity (EUR). Kept in one place so legend and cells agree. */
export const VALUE_BUCKETS = [10_000, 25_000, 50_000] as const;
export function bucketOf(value: number): 1 | 2 | 3 | 4 {
  if (value < VALUE_BUCKETS[0]) return 1;
  if (value < VALUE_BUCKETS[1]) return 2;
  if (value < VALUE_BUCKETS[2]) return 3;
  return 4;
}
