/**
 * Where a PDF's pages lie in the column (docs/PDF.md, *In the column*): one
 * under another, at one scale - the widest as wide as the column at 1, its
 * margins aside - each in the middle, in CSS pixels from the top left of
 * all of them.
 *
 * Where the column is read is kept in pages (`at`), not pixels, so that it
 * stays on the same words as the column is made wider or narrower: 2.5 is
 * half way down the third page's place, which runs from just above its top
 * to just above the next one's.
 */
import { fingersStep, type Pt } from "../input/pinch";

/** The margin round the pages and the gap between them, in CSS pixels. */
export const COLUMN_MARGIN = 12;
export const COLUMN_GAP = 10;

/** A page in the column: its top left, width and height. */
export type ColumnPage = { x: number; y: number; w: number; h: number };

/** The pages in the column, how wide and tall all of them are, and the CSS pixels a point. */
export type ColumnLayout = { pages: ColumnPage[]; width: number; height: number; scale: number };

/** The pages, of these sizes in points, in a column this wide, at this size. */
export function columnLayout(sizes: readonly (readonly [number, number])[], width: number, zoom: number): ColumnLayout {
  const widest = Math.max(1, ...sizes.map(([w]) => w));
  const scale = (Math.max(40, width - 2 * COLUMN_MARGIN) * zoom) / widest;
  const width_ = Math.max(width, widest * scale + 2 * COLUMN_MARGIN);
  const pages: ColumnPage[] = [];
  let y = COLUMN_MARGIN;
  for (const [w, h] of sizes) {
    const pw = w * scale;
    const ph = h * scale;
    pages.push({ x: (width_ - pw) / 2, y, w: pw, h: ph });
    y += ph + COLUMN_GAP;
  }
  return { pages, width: width_, height: y - COLUMN_GAP + COLUMN_MARGIN, scale };
}

/** Where page `i`'s place begins: the top of all of them, for the first; just above its top, for the rest. */
const placeTop = (l: ColumnLayout, i: number) => (i <= 0 ? 0 : i >= l.pages.length ? l.height : l.pages[i].y - COLUMN_GAP / 2);

/** How far down, in CSS pixels, the column is when it is read `at` this many pages. */
export function topOf(l: ColumnLayout, at: number): number {
  if (!l.pages.length) return 0;
  const i = Math.min(Math.max(0, Math.floor(at)), l.pages.length - 1);
  const f = Math.min(Math.max(0, at - i), 1);
  return placeTop(l, i) + f * (placeTop(l, i + 1) - placeTop(l, i));
}

/** How many pages down the column is read, being `top` CSS pixels down. */
export function atOf(l: ColumnLayout, top: number): number {
  const n = l.pages.length;
  if (!n) return 0;
  let i = 0;
  while (i < n - 1 && top >= placeTop(l, i + 1)) i++;
  const a = placeTop(l, i);
  const b = placeTop(l, i + 1);
  // (short of the next page's place, as the loop leaves it - or past the last's end, at its end)
  return i + Math.min(Math.max(0, (top - a) / Math.max(1e-6, b - a)), i === n - 1 ? 0.999 : 1);
}

/** How far the column can be read down, `tall` CSS pixels of it seen. */
export const deepest = (l: ColumnLayout, tall: number) => Math.max(0, l.height - tall);

/** The page most in view, the column `top` CSS pixels down and `tall` of it seen - the first of those most in view. */
export function pageInView(l: ColumnLayout, top: number, tall: number): number {
  let best = 0;
  let most = -1;
  l.pages.forEach((p, i) => {
    const seen = Math.min(p.y + p.h, top + tall) - Math.max(p.y, top);
    if (seen > most + 0.5) {
      most = seen;
      best = i;
    }
  });
  return best;
}

/** The pages in view, the column `top` CSS pixels down and `tall` of it seen - and those `beyond` CSS pixels beyond, to be ready. */
export function pagesInView(l: ColumnLayout, top: number, tall: number, beyond = 0): number[] {
  const out: number[] = [];
  l.pages.forEach((p, i) => {
    if (p.y + p.h >= top - beyond && p.y <= top + tall + beyond) out.push(i);
  });
  return out;
}

/** A point in the column, as where it lies on a page: which, and how far across and down it, 0 to 1 - the nearest page's, off them. */
export function pointOn(l: ColumnLayout, x: number, y: number): { page: number; u: number; v: number } {
  let page = 0;
  let near = Infinity;
  l.pages.forEach((p, i) => {
    const d = y < p.y ? p.y - y : y > p.y + p.h ? y - p.y - p.h : 0;
    if (d < near) {
      near = d;
      page = i;
    }
  });
  const p = l.pages[page];
  return p ? { page, u: (x - p.x) / p.w, v: (y - p.y) / p.h } : { page: 0, u: 0, v: 0 };
}

/** Where on the column a point on a page lies. */
export function pointOf(l: ColumnLayout, at: { page: number; u: number; v: number }): { x: number; y: number } {
  const p = l.pages[Math.min(Math.max(0, at.page), l.pages.length - 1)];
  return p ? { x: p.x + at.u * p.w, y: p.y + at.v * p.h } : { x: 0, y: 0 };
}

/** The page, if any, a point in the column lies on. */
export function pageUnder(l: ColumnLayout, x: number, y: number): number | null {
  const i = l.pages.findIndex((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
  return i < 0 ? null : i;
}

/** What is seen of the column: how large its pages are (1: the widest as wide as the column), and how far down and across what is seen begins, in CSS pixels. */
export type ColumnView = { zoom: number; top: number; left: number };

/** How far down and across what is seen may begin, at a layout, `width` wide and `tall` of it seen: kept within the pages. */
export function keptWithin(l: ColumnLayout, width: number, tall: number, top: number, left: number): { top: number; left: number } {
  return { top: Math.min(Math.max(0, top), deepest(l, tall)), left: Math.min(Math.max(0, left), Math.max(0, l.width - width)) };
}

/**
 * The column after two fingers went from `a0` and `b0` to `a1` and `b1`
 * (CSS pixels on what is read of it, `width` wide and `tall` seen), from
 * `view`: as much larger as they spread apart, or smaller as they close,
 * within `least` and `most` - and moved so that the point of a page that
 * lay midway between them lies midway between them still, kept within the
 * pages. Two fingers moving together move it and zoom nothing.
 *
 * Worked out from where the fingers were when they came down, not step by
 * step, so that a pinch out and back in comes back to where it began.
 */
export function pinchedColumn(
  sizes: readonly (readonly [number, number])[],
  width: number,
  tall: number,
  view: ColumnView,
  fingers: { a0: Pt; b0: Pt; a1: Pt; b1: Pt },
  least: number,
  most: number,
): ColumnView {
  const { scale, from, to } = fingersStep(fingers.a0, fingers.b0, fingers.a1, fingers.b1);
  const zoom = Math.min(most, Math.max(least, view.zoom * scale));
  const held = pointOn(columnLayout(sizes, width, view.zoom), view.left + from.x, view.top + from.y);
  const l = columnLayout(sizes, width, zoom);
  const p = pointOf(l, held);
  return { zoom, ...keptWithin(l, width, tall, p.y - to.y, p.x - to.x) };
}
