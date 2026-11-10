// Tiny, dependency-free TF-IDF + cosine similarity. Used as the "does the wording line up" signal in matching.

const STOP = new Set(
  "a an and are as at be but by can do for from has have i in into is it its just me more my no not of on or our so that the their them then there they this to too up us was we what when which who will with you your all any every get been also out over than only one two each new".split(" "),
);

export function stem(w: string): string {
  return w
    .replace(/(ies)$/, "y")
    .replace(/(ing|ed|es|s)$/, "")
    .replace(/(.)\1$/, "$1");
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9/\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem)
    .filter((w) => w.length > 2);
}

export class TfIdf {
  private df = new Map<string, number>();
  private n = 0;

  constructor(docs: string[]) {
    for (const d of docs) {
      this.n++;
      for (const t of new Set(tokenize(d))) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
  }

  vector(text: string): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v = new Map<string, number>();
    for (const [t, f] of tf) v.set(t, f * Math.log(1 + this.n / (1 + (this.df.get(t) ?? 0))));
    return v;
  }
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [t, x] of a) {
    na += x * x;
    const y = b.get(t);
    if (y) dot += x * y;
  }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
