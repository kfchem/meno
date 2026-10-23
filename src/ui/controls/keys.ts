/** How the keys move through Meno's own controls (src/ui/controls). */

/**
 * Where the lit row of an open list goes for a key: one up or down (held at
 * the ends), the first or the last, or the next whose name begins with a
 * letter typed - from the one after the lit one, round to the start. Null
 * for a key that moves nothing.
 */
export function nextLit(key: string, lit: number, labels: readonly string[]): number | null {
  const n = labels.length;
  if (!n) return null;
  if (key === "ArrowDown") return Math.min(n - 1, lit + 1);
  if (key === "ArrowUp") return Math.max(0, lit - 1);
  if (key === "Home" || key === "PageUp") return 0;
  if (key === "End" || key === "PageDown") return n - 1;
  if (key.length !== 1 || !/\S/.test(key)) return null;
  const k = key.toLowerCase();
  for (let step = 1; step <= n; step++) {
    const i = (lit + step) % n;
    if (labels[i].toLowerCase().startsWith(k)) return i;
  }
  return null;
}

/**
 * The choice an arrow key goes to in a radio group: the next or the one
 * before, round from the ends; the first or the last. Null for a key that
 * moves nothing.
 */
export function nextChoice(key: string, at: number, count: number): number | null {
  if (!count) return null;
  if (key === "ArrowDown" || key === "ArrowRight") return (at + 1) % count;
  if (key === "ArrowUp" || key === "ArrowLeft") return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
