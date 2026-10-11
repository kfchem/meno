/**
 * The place in a PDF's figure lit for an atom read from it (docs/PDF.md,
 * *Stage 5*): the atom under the pointer in the drawing, or the one whose
 * place in the figure is - ringed there as it is in the drawing, on the
 * PDF's stack, in the column and on a picture cut out of it alike, coming
 * and going as the drawing's ring does.
 */
import { ALPHA, COLORS } from "../../../theme/colors";
import type { FigureSpot, Model } from "../store/types";
import type { Mark } from "./pdfPictures";

/** How long the ring takes to come and go, in ms. */
const FADE_MS = 120;
/** How large the ring is, as a share of the figure's bond: clear of a label's letter, as a figure is read smaller than the drawing. */
const RING = 0.4;

type Shown = { spot: FigureSpot; to: 0 | 1; from: number; start: number };
let shown: Shown | null = null;

const levelOf = (s: Shown, now: number) => {
  const t = Math.min(1, (now - s.start) / FADE_MS);
  return s.from + (s.to - s.from) * t;
};
const same = (a: FigureSpot, b: FigureSpot) => a.sha256 === b.sha256 && a.page === b.page && a.x === b.x && a.y === b.y;

/** The atom whose place is to be lit: the one under the pointer in the drawing, or the one lit from its place. */
export function spotLit(model: Model, hovered: number | null, figureLit: number | null): FigureSpot | null {
  const id = hovered ?? figureLit;
  return id == null ? null : (model.atoms.find((a) => a.id === id)?.seen ?? null);
}

/** The place lit now - or none - its ring fading in from where it was, or out. */
export function lightSpot(spot: FigureSpot | null, now = performance.now()): void {
  if (spot && shown && same(shown.spot, spot) && shown.to === 1) return;
  if (!spot && (!shown || shown.to === 0)) return;
  const level = shown ? levelOf(shown, now) : 0;
  // (a new place comes up from nothing; the one left goes down from where it was)
  shown = spot ? { spot, to: 1, from: shown && same(shown.spot, spot) ? level : 0, start: now } : { ...shown!, to: 0, from: level, start: now };
}

/** Whether the ring is still coming or going: frames to be drawn. */
export function spotMoving(now = performance.now()): boolean {
  return !!shown && now - shown.start < FADE_MS + 40;
}

/** The ring lit on a PDF's page, if any: where, how large, in points from the page's top left, and how strong. */
export function spotOn(sha256: string, page: number, now = performance.now()): { x: number; y: number; r: number; level: number } | null {
  if (!shown || shown.spot.sha256 !== sha256 || shown.spot.page !== page) return null;
  const level = levelOf(shown, now);
  if (level <= 0) return null;
  const { x, y, bond } = shown.spot;
  return { x, y, r: RING * bond, level };
}

/** The ring as a mark on a PDF's page, drawn as the drawing's own is. */
export function spotMark(sha256: string, page: number, now = performance.now()): Mark | null {
  const s = spotOn(sha256, page, now);
  return s ? { rects: [[s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r]], color: COLORS.highlight, opacity: ALPHA.highlight * s.level, ring: true } : null;
}
