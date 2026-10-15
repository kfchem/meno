/**
 * The style files opened and waiting to be asked about (docs/FILE-IO.md,
 * *What a .meno holds*): several opened at once - dropped together, say -
 * are each asked about in turn, in the order they came, none lost.
 */

/** The files waiting, with one more come in. */
export function withAsked<T>(waiting: readonly T[], file: T): T[] {
  return [...waiting, file];
}

/** The files waiting, the first answered: the next is asked about. */
export function afterAnswer<T>(waiting: readonly T[]): T[] {
  return waiting.slice(1);
}
