/**
 * How Quick Add's list of calculations goes (QuickAddCalculations): which
 * row is open, what a press on one does and what is remembered of it, and
 * where Up and Down go - each a plain function, so that each is tested.
 */

/** Which row the list opens with: who was opened last, where that is still among `ids`; the first otherwise - Meno's own. */
export function openFirst(remembered: unknown, ids: readonly string[]): string | undefined {
  return typeof remembered === "string" && ids.includes(remembered) ? remembered : ids[0];
}

/** What is open after a press on row `by`: none, where it was the one open; it, otherwise - one open at a time. */
export function openAfter(open: string | undefined, by: string): string | undefined {
  return open === by ? undefined : by;
}

/** Whether a press on `by` is remembered as who was opened last: only one that opens it - a row shut stays who was opened last. */
export function remembersPress(open: string | undefined, by: string): boolean {
  return open !== by;
}

/**
 * The row Up or Down goes to among `count` rows that take the keys, from
 * row `at` (-1: none has them): the first where none has; the one after or
 * before, stopping at either end; none where there are none.
 */
export function rowAfter(count: number, at: number, key: "ArrowUp" | "ArrowDown"): number | null {
  if (count <= 0) return null;
  if (at < 0) return 0;
  return Math.min(count - 1, Math.max(0, at + (key === "ArrowDown" ? 1 : -1)));
}

/** Whether a key pressed where `target` is goes to what is being typed there - a field, a text area, words edited in place - not to the list. */
export function typedIn(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || !!target.isContentEditable);
}

/** The rows Up and Down go through, in order: those that are not in a row shut (`shut`) nor turned off. */
export function keyRows<B extends { disabled: boolean }>(rows: readonly B[], shut: (row: B) => boolean): B[] {
  return rows.filter((b) => !shut(b) && !b.disabled);
}
