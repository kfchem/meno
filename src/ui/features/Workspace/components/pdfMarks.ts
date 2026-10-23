/**
 * What is marked on a PDF's page (docs/PDF.md, *Text*, *Search*): the words
 * selected, in Meno's light, and the places a search found, the one gone to
 * the stronger - the same on the stack and in the column - and where an
 * atom read from a figure there was drawn, while it is lit (*Stage 5*).
 */
import { COLORS } from "../../../theme/colors";
import { DURATION, EASE, EASE_LEAVE, eased } from "../../../theme/motion";
import { marksBetween, textHad } from "../../../../lib/pdf/text";
import type { EditorState, PdfFound, PdfItem, PdfSelection } from "../store/types";
import { onPage } from "../utils/pdfSelection";
import type { Mark } from "./pdfPictures";
import { spotMark } from "./figureTie";
import type { PageStructure } from "../utils/pageStructures";
import { PICKED_POINTED_SHADE, POINTED_SHADE, SELECTION_SHADE } from "./selectionShade";

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
const BOX = 0.08;
export const FOUND_COLOR = "#d4a72c";
const FOUND = 0.3;
const FOUND_NOW = 0.6;

/** A structure's shade on its way: from one colour to another, since when, and whether it is going out of view. */
type Fading = { s: PageStructure; from: string; to: string; start: number; leaving: boolean };
const fading = new Map<string, Fading>();
const WHITE = COLORS.background;

/** A colour `u` of the way from one to another (#rrggbb). */
function mixed(a: string, b: string, u: number): string {
  const ch = (h: string, k: number) => parseInt(h.slice(1 + 2 * k, 3 + 2 * k), 16);
  return `#${[0, 1, 2].map((k) => Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * u).toString(16).padStart(2, "0")).join("")}`;
}

/** How far along a shade's way is: over DURATION.quick, eased in as the canvas's highlights come, out as they go. */
function along(f: Fading, now: number): number {
  return eased(f.leaving ? EASE_LEAVE : EASE, (now - f.start) / (DURATION.quick * 1000));
}

/**
 * The structures of a page shaded now, each in its colour as far as it has
 * come - from the page's white, or from the shade it had - and those let go
 * still going out of it, till they are gone; whether each is still moving.
 */
export function shadesNow(page: string, wanted: readonly (readonly [PageStructure, string])[], now: number): { s: PageStructure; color: { hex: string; moving: boolean } }[] {
  const at = (f: Fading) => mixed(f.from, f.to, along(f, now));
  const keys = new Set<string>();
  for (const [s, to] of wanted) {
    const key = `${page}:${s.key}`;
    keys.add(key);
    const f = fading.get(key);
    if (!f) fading.set(key, { s, from: WHITE, to, start: now, leaving: false });
    else if (f.to !== to || f.leaving) fading.set(key, { s, from: at(f), to, start: now, leaving: false });
  }
  const out: { s: PageStructure; color: { hex: string; moving: boolean } }[] = [];
  for (const [key, f] of fading) {
    if (!key.startsWith(`${page}:`)) continue;
    if (!keys.has(key) && !f.leaving) fading.set(key, { ...f, from: at(f), to: WHITE, start: now, leaving: true });
    const g = fading.get(key)!;
    const done = now - g.start >= DURATION.quick * 1000;
    if (g.leaving && done) {
      fading.delete(key);
      continue;
    }
    out.push({ s: g.s, color: { hex: at(g), moving: !done } });
  }
  return out;
}

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
  const same = (a: PageStructure, b: PageStructure | null) => !!b && a.key === b.key;
  const shaded = [...structures.picked.map((s) => [s, same(s, structures.lit) ? PICKED_POINTED_SHADE : SELECTION_SHADE] as const), ...(structures.lit && !structures.picked.some((s) => same(s, structures.lit)) ? [[structures.lit, POINTED_SHADE] as const] : [])];
  // (each coming into its shade, or going out of it, rather than at once: docs/PDF.md, as the canvas's selection does)
  const clock = performance.now();
  let moving = false;
  for (const { s, color } of shadesNow(`${pdf.id}:${page}`, shaded, clock)) {
    if (color.moving) moving = true;
    out.push({ rects: [], shade: { atoms: s.atoms, bonds: s.bonds, bond: s.reach * 3 }, color: color.hex, opacity: 1 });
  }
  if (moving) globalThis.requestAnimationFrame?.(came);
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
