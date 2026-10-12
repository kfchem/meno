/**
 * Writing by hand on a PDF's page (docs/PRESENTING.md, *Handwriting*): the
 * page a stroke begins on, and the way between the page's own points - from
 * its top left, as a PDF counts them - and where the page lies on the page
 * of the workspace, so that what is written on it goes wherever it goes.
 */
import { shownSheet, spreadPageAt, topSheet, type Sheet } from "../../../../lib/pdf/layout";
import type { PdfInk, PdfItem } from "../store/types";

type Pt = { x: number; y: number };

const onSheet = (s: Sheet, q: Pt) => Math.abs(q.x - s.x) <= s.w / 2 && Math.abs(q.y - s.y) <= s.h / 2;

/** The page of a PDF under `q` - the PDF put down last, on top - where it is drawn and how large it is in points; none off them all, or on one made an icon. */
export function pageUnder(pdfs: readonly PdfItem[], q: Pt): { pdf: number; page: number; sheet: Sheet; pt: readonly [number, number] } | null {
  for (let k = pdfs.length - 1; k >= 0; k--) {
    const p = pdfs[k];
    if (p.icon) continue;
    const page = p.spread ? spreadPageAt(p, q) : onSheet(topSheet(p), q) ? p.page : null;
    if (page == null) continue;
    const sheet = shownSheet(p, page);
    if (sheet) return { pdf: p.id, page, sheet, pt: p.pages[page] };
  }
  return null;
}

/** A point of the workspace's page as a point of a PDF's page lying at `sheet`, `pt` points large: in points from its top left. */
export function toPagePoint(sheet: Sheet, pt: readonly [number, number], q: Pt): Pt {
  const unit = sheet.w / pt[0];
  return { x: (q.x - (sheet.x - sheet.w / 2)) / unit, y: (sheet.y + sheet.h / 2 - q.y) / unit };
}

/** A stroke's points (x, y, pressure) moved from the workspace's page onto a PDF's page lying at `sheet`. */
export function pointsOnPage(sheet: Sheet, pt: readonly [number, number], points: readonly number[]): number[] {
  const out = points.slice();
  for (let i = 0; i + 1 < out.length; i += 3) {
    const p = toPagePoint(sheet, pt, { x: out[i], y: out[i + 1] });
    out[i] = p.x;
    out[i + 1] = p.y;
  }
  return out;
}

const byPage = new WeakMap<readonly PdfInk[], Map<number, PdfInk[]>>();

/** The writing on one page of a PDF - the same list each time, while its writing is unchanged, so that it is not drawn up again. */
export function inkOnPage(p: Pick<PdfItem, "inks">, page: number): readonly PdfInk[] | undefined {
  if (!p.inks?.length) return undefined;
  let m = byPage.get(p.inks);
  if (!m) {
    m = new Map();
    for (const k of p.inks) m.set(k.page, [...(m.get(k.page) ?? []), k]);
    byPage.set(p.inks, m);
  }
  return m.get(page);
}
