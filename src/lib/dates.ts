/** "Today" for timing maths. Pinned via HEADSTART_TODAY so the seeded demo stays stable. */
export function today(): Date {
  const pinned = process.env.HEADSTART_TODAY;
  return pinned ? new Date(`${pinned}T00:00:00Z`) : new Date();
}

export const DAY = 86_400_000;

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function monthsAgoText(days: number): string {
  if (days < 45) return `${days} day${days === 1 ? "" : "s"}`;
  const m = Math.round(days / 30.4);
  return `${m} month${m === 1 ? "" : "s"}`;
}
