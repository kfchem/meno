/**
 * The compound-number lens's reading of a page (docs/PDF.md, *A compound's
 * number*), the same in the column and on the canvas: the number mentioned
 * under a point of a page's letters, and its PDF's index begun the first
 * time the pointer is over it.
 */
import { letterAt, marksBetween, type PageText } from "../../../../lib/pdf/text";
import { indexPdf } from "./compoundIndex";
import { mentionAt } from "./compoundMentions";
import { pdfPageLabels } from "./pdfStructures";

/**
 * The compound's number mentioned under a point of a page (utils/compoundMentions) - every number of that shape with ⌥ (Alt)
 * held - and the box of its first line on the page, in points from the page's top left; or null.
 */
export function mentionUnder(t: PageText, x: number, y: number, any: boolean): { label: string; box: [number, number, number, number] } | null {
  const i = letterAt(t, x, y);
  const m = i != null ? mentionAt(t, i, any) : null;
  const box = m ? marksBetween(t, m.start, m.end)[0] : null;
  return m && box ? { label: m.label, box } : null;
}

/**
 * A box on a page - in points from its top left, as `mentionUnder` gives
 * one - on the canvas: its corners in the canvas's units, the page's sheet
 * standing centred at `sheet` (its y up), `unit` of its units a point.
 */
export function boxOnSheet(box: readonly [number, number, number, number], sheet: { x: number; y: number; w: number; h: number }, unit: number): { x0: number; y0: number; x1: number; y1: number } {
  const left = sheet.x - sheet.w / 2;
  const top = sheet.y + sheet.h / 2;
  return { x0: left + box[0] * unit, y0: top - box[1] * unit, x1: left + box[2] * unit, y1: top - box[3] * unit };
}

const indexed = new Set<string>();

/** A PDF's compounds' numbers read through in idle time, from the first time the pointer is over it: once a PDF. */
export function indexOnce(sha256: string, pages: number): void {
  if (indexed.has(sha256)) return;
  indexed.add(sha256);
  void indexPdf(sha256, pages, pdfPageLabels(sha256));
}
