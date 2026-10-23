/**
 * What is marked on a PDF's page (docs/PDF.md, *Text*, *Search*): the words
 * selected, in Meno's light, and the places a search found, the one gone to
 * the stronger - the same on the stack and in the column - and where an
 * atom read from a figure there was drawn, while it is lit (*Stage 5*).
 */
import { COLORS } from "../../../theme/colors";
import { marksBetween, textHad } from "../../../../lib/pdf/text";
import type { EditorState, PdfFound, PdfItem, PdfSelection } from "../store/types";
import { onPage } from "../utils/pdfSelection";
import type { Mark } from "./pdfPictures";
import { spotMark } from "./figureTie";
import type { PageStructure } from "../utils/pageStructures";

/** How long a place shown is marked, in ms: held, then fading. */
export const FLASH_MS = 1800;
const FLASH_HOLD_MS = 700;
const FLASH = 0.5;

/** How marked a place shown is now: held a moment, then fading out. */
export function flashOf(start: number, now: number): number {
  const t = now - start;
  if (t < FLASH_HOLD_MS) return FLASH;
  return Math.max(0, FLASH * (1 - (t - FLASH_HOLD_MS) / (FLASH_MS - FLASH_HOLD_MS)));
}

/** How words selected are marked, places found, and a box drawn. */
const SELECTED = 0.3;
/** How a structure under the pointer is lit: less than one picked. */
const LIT = 0.24;
const BOX = 0.08;
export const FOUND_COLOR = "#d4a72c";
const FOUND = 0.3;
const FOUND_NOW = 0.6;

/** The marks on a page of a PDF - none until its letters have come, `came` called once they have. */
export function marksOn(
  pdf: Pick<PdfItem, "id" | "sha256">,
  page: number,
  sel: PdfSelection | null,
  found: readonly PdfFound[],
  now: PdfFound | null,
  came: () => void,
  flash: EditorState["pdfFlash"] = null,
  box: EditorState["pdfBox"] = null,
  structures: { lit: PageStructure | null; picked: readonly PageStructure[] } = { lit: null, picked: [] },
): Mark[] {
  const out: Mark[] = [];
  // (structures picked, and the one under the pointer: lit along their bonds and over their labels, as words are - docs/PDF.md, *Structures picked from a PDF*)
  for (const [s, o] of [...structures.picked.map((x) => [x, SELECTED] as const), ...(structures.lit && !structures.picked.includes(structures.lit) ? [[structures.lit, LIT] as const] : [])]) {
    out.push({ rects: s.labels, bars: s.bonds.map(([a, b]) => ({ a, b, w: s.reach * 1.5 })), color: COLORS.highlight, opacity: o });
  }
  // (an atom read from a figure here, lit: a ring where it was drawn)
  const spot = spotMark(pdf.sha256, page);
  if (spot) out.push(spot);
  // (a box drawn there, outlined, and a box shown, marked for a moment: no letters wanted)
  if (box?.id === pdf.id && box.page === page) out.push({ rects: [box.box], color: COLORS.highlight, opacity: BOX, edge: true });
  if (flash?.box && flash.id === pdf.id && flash.from.page === page) {
    const o = flashOf(flash.start, performance.now());
    if (o > 0) out.push({ rects: [flash.box], color: COLORS.highlight, opacity: o });
  }
  const mine = found.filter((f) => f.id === pdf.id && f.page === page);
  const selected = sel?.id === pdf.id ? sel : null;
  const shown = !flash?.box && flash?.id === pdf.id && page >= flash.from.page && page <= flash.to.page ? flash : null;
  if (!selected && !mine.length && !shown) return out;
  const t = textHad(pdf.sha256, page, came);
  if (!t) return out;
  const isNow = (f: PdfFound) => !!now && now.id === f.id && now.page === f.page && now.from === f.from;
  const others = mine.filter((f) => !isNow(f));
  if (others.length) out.push({ rects: others.flatMap((f) => marksBetween(t, f.from, f.to)), color: FOUND_COLOR, opacity: FOUND });
  const there = mine.find(isNow);
  if (there) out.push({ rects: marksBetween(t, there.from, there.to), color: FOUND_COLOR, opacity: FOUND_NOW });
  const range = selected ? onPage(selected, page, t.codes.length) : null;
  if (range) out.push({ rects: marksBetween(t, range[0], range[1]), color: COLORS.highlight, opacity: SELECTED });
  if (shown) {
    const a = page === shown.from.page ? shown.from.at : 0;
    const b = page === shown.to.page ? shown.to.at : t.codes.length;
    const o = flashOf(shown.start, performance.now());
    if (o > 0) out.push({ rects: marksBetween(t, a, b), color: COLORS.highlight, opacity: o });
  }
  return out;
}
