const normalise = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Check the quote really appears in the message it is attributed to (ignoring whitespace,
 * case and curly quotes). If not, look for it in the other supporting messages.
 * Returns the id of the message containing it, or null if it can't be found anywhere.
 */
export function locateQuote(
  quote: string,
  preferredId: string | null,
  messages: { id: string; body: string }[],
): string | null {
  const q = normalise(quote).replace(/^\.\.\.|\.\.\.$/g, "").trim();
  if (q.length < 3) return null;
  const ordered = [
    ...messages.filter((m) => m.id === preferredId),
    ...messages.filter((m) => m.id !== preferredId),
  ];
  return ordered.find((m) => normalise(m.body).includes(q))?.id ?? null;
}
