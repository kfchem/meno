/**
 * What a single press on a PDF's page begins (docs/PDF.md, *Text*, *Taking
 * things out*): words selected, from the letter it is on - or beside, or in
 * a line's band, the white between a table's rows among it - or a box drawn,
 * where it is in a figure or on no words. In a figure, a line of text - a
 * table's row, a sentence, `LONG_LINE` letters or more - is words, while a
 * label is the figure's.
 */
import type { Box } from "./figures";
import { letterInBand, letterNear, lineOfLetter, LONG_LINE, type PageText } from "./text";

export type Press = { begins: "words"; letter: number } | { begins: "box" };

export function pressOn(t: PageText | null, figure: Box | null, x: number, y: number): Press {
  const letter = t ? (letterNear(t, x, y) ?? letterInBand(t, x, y)?.letter ?? null) : null;
  if (letter == null) return { begins: "box" };
  const line = lineOfLetter(t!, letter);
  const prose = !!line && line.end - line.start >= LONG_LINE;
  return figure && !prose ? { begins: "box" } : { begins: "words", letter };
}
