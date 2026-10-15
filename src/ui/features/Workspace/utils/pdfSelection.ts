/**
 * Words selected in a PDF (docs/PDF.md, *Text*): the selection's ends in
 * order, what of each page it takes, and its words as they are copied -
 * across pages, a page's end read as a space.
 */
import { textOf, wordBoxesBetween, wordsBetween } from "../../../../lib/pdf/text";
import type { PlacedPage, PlacedWord } from "../../../../lib/io/coordinates";
import type { PdfBox, PdfItem, WordPlace, PdfSelection } from "../store/types";

/** Whether a place between a PDF's letters is before another, or at it. */
export const placeBefore = (a: WordPlace, b: WordPlace) => a.page < b.page || (a.page === b.page && a.at <= b.at);

/** A selection's ends, the first first. */
export function ordered(sel: PdfSelection): { from: WordPlace; to: WordPlace } {
  return placeBefore(sel.anchor, sel.focus) ? { from: sel.anchor, to: sel.focus } : { from: sel.focus, to: sel.anchor };
}

/** Whether a selection takes any letter. */
export const selects = (sel: PdfSelection | null): sel is PdfSelection =>
  !!sel && (sel.anchor.page !== sel.focus.page || sel.anchor.at !== sel.focus.at);

/** What of a page, `n` letters long, a selection takes: its first letter and the one after its last - none, nothing. */
export function onPage(sel: PdfSelection, page: number, n: number): [number, number] | null {
  const { from, to } = ordered(sel);
  if (page < from.page || page > to.page) return null;
  const a = page === from.page ? from.at : 0;
  const b = page === to.page ? to.at : n;
  return b > a ? [a, b] : null;
}

/** A selection's words, as they are copied. */
export async function selectedWords(sel: PdfSelection, pdf: Pick<PdfItem, "sha256">): Promise<string> {
  const { from, to } = ordered(sel);
  const parts: string[] = [];
  for (let page = from.page; page <= to.page; page++) {
    const t = await textOf(pdf.sha256, page);
    const range = onPage(sel, page, t.codes.length);
    if (range) parts.push(wordsBetween(t, range[0], range[1]));
  }
  return parts.filter(Boolean).join(" ");
}

/** The words of a page from letter `a` to before `b`, each with the box round it; those not seen left out. */
function placedBetween(t: Awaited<ReturnType<typeof textOf>>, a: number, b: number): PlacedWord[] {
  const words = wordsBetween(t, a, b).split(/\s+/).filter(Boolean);
  const boxes = wordBoxesBetween(t, a, b);
  return words.flatMap((text, i) => (boxes[i] ? [{ text, box: boxes[i]! }] : []));
}

/** A selection's words, page by page, each where it lies, and each page's size: what coordinates are read from (lib/io/coordinates `textOfPages`). */
export async function selectedPlaced(sel: PdfSelection, pdf: Pick<PdfItem, "sha256" | "pages">): Promise<PlacedPage[]> {
  const { from, to } = ordered(sel);
  const out: PlacedPage[] = [];
  for (let page = from.page; page <= to.page; page++) {
    const t = await textOf(pdf.sha256, page);
    const range = onPage(sel, page, t.codes.length);
    const [width, height] = pdf.pages[page] ?? [0, 0];
    if (range) out.push({ words: placedBetween(t, range[0], range[1]), width, height });
  }
  return out;
}

/** The words within a box drawn on a PDF's page - their middles in it - each where it lies, and the page's size. */
export async function boxedPlaced(box: PdfBox, pdf: Pick<PdfItem, "sha256" | "pages">): Promise<PlacedPage[]> {
  const t = await textOf(pdf.sha256, box.page);
  const [x0, y0, x1, y1] = box.box;
  const inside = (w: PlacedWord) => {
    const cx = (w.box[0] + w.box[2]) / 2;
    const cy = (w.box[1] + w.box[3]) / 2;
    return cx >= Math.min(x0, x1) && cx <= Math.max(x0, x1) && cy >= Math.min(y0, y1) && cy <= Math.max(y0, y1);
  };
  const [width, height] = pdf.pages[box.page] ?? [0, 0];
  return [{ words: placedBetween(t, 0, t.codes.length).filter(inside), width, height }];
}
