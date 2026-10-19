/**
 * What a press held still on a PDF does (docs/PDF.md, *Moving a stack*), as
 * a press held on any other thing on the page does: it takes hold of it and
 * selects it alone. At full size that is so on its rim, or anywhere on it
 * where its words are too small to read; elsewhere on it a hold selects its
 * words, or draws a box. An icon is taken hold of anywhere - a drag before
 * then moves it at once. One selected already stays with the rest: a drag
 * on an icon so moves the whole selection.
 */
export type PdfHold = "take" | "words" | null;

export function pdfHold(p: { icon?: boolean }, at: { rim: boolean; readable: boolean; selected: boolean }): PdfHold {
  if (p.icon) return at.selected ? null : "take";
  return at.rim || !at.readable ? "take" : "words";
}
