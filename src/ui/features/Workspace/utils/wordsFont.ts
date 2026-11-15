import { WORDS_SIZE_RANGE, WORDS_SPACING_RANGE } from "../../../../lib/chem/captions";

/** A number typed, a comma as good as a point: within `range`, or null. */
function typedWithin(text: string, range: readonly [number, number]): number | null {
  const v = Number(text.trim().replace(",", "."));
  return text.trim() && Number.isFinite(v) && v >= range[0] && v <= range[1] ? v : null;
}

/** A size typed for words on the page, in points: 4 to 288, or null. */
export function parsePoints(text: string): number | null {
  return typedWithin(text, WORDS_SIZE_RANGE);
}

/** A line spacing typed, as a multiple of single spacing: 0.5 to 4, or null. */
export function parseSpacing(text: string): number | null {
  return typedWithin(text, WORDS_SPACING_RANGE);
}

/** Line spacing as the words are given it: single is none of their own. */
export function spacingFor(v: number): number | null {
  return v === 1 ? null : v;
}

/** A typeface picked for the words: the drawing's own is none of their own, so they follow the drawing's again. */
export function faceFor(picked: string, drawing: string): string | null {
  return picked === drawing ? null : picked;
}
