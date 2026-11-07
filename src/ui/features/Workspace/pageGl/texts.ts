/**
 * Words on the page drawn by WebGL (docs/WORKSPACE.md, *Drawn by WebGL*): a
 * set's name, a chip's count, in the app's typeface, IBM Plex Sans - the same
 * files its HTML is set in - each placed by its anchor and cut with an
 * ellipsis past the width it is given. Here, how wide each is and where it
 * starts; `PageTexts` draws them, in batches (components/textBatch).
 */
import { advanceIn } from "../../../../lib/chem/labelFonts";
import { IBM_PLEX_SANS } from "../../../../lib/chem/fonts/ibmPlexSans";
import { pagePx } from "./units";

/** The weights drawn: Plex's Regular and Medium (`font-medium`), the two the page's sets, cards and chips are set in. */
export type Weight = 400 | 500;

/**
 * Words at `x`, `y` on the page (its units, y up): their `anchor` there - the
 * start, the middle or the end of the line - and the alphabetic baseline or
 * the capitals' middle (`baseline`); `sizePx` page pixels, sRGB `color`;
 * cut with an ellipsis past `maxWidthPx` page pixels.
 */
export type PageText = {
  key: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  baseline?: "alphabetic" | "middle";
  text: string;
  sizePx: number;
  color: string;
  weight?: Weight;
  maxWidthPx?: number;
  z?: number;
  opacity?: number;
};

/** The family the app's HTML is set in (App.css `--font-sans`), its Japanese after it. */
const FAMILY = '"IBM Plex Sans", "IBM Plex Sans JP", sans-serif';

let context: CanvasRenderingContext2D | null | undefined;
function measurer(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    try {
      context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    } catch {
      context = null;
    }
  }
  return context;
}

/**
 * How wide `text` is, `sizePx` page pixels high, in page pixels: as the
 * app's own text measures it, the typeface as its HTML has it loaded (any
 * script, either weight), so that a tab is as wide as what it says in the
 * same render it is drawn; or, with no canvas to measure by (a test), by
 * Plex's own advances (lib/chem/fonts/ibmPlexSans), a capital's for what it
 * lacks.
 */
export function textWidth(text: string, sizePx: number, weight: Weight = 400): number {
  const c = measurer();
  if (c && typeof c.measureText === "function") {
    c.font = `${weight} ${sizePx}px ${FAMILY}`;
    const w = c.measureText(text).width;
    if (Number.isFinite(w) && (w > 0 || text.length === 0)) return w;
  }
  let w = 0;
  for (const ch of text) w += advanceIn(IBM_PLEX_SANS, ch);
  return w * sizePx;
}

const ELLIPSIS = "…";

/** `text`, cut with an ellipsis where it is wider than `maxWidthPx`: as many of its letters as fit before it. */
export function fitted(text: string, sizePx: number, weight: Weight, maxWidthPx?: number): string {
  if (maxWidthPx == null || textWidth(text, sizePx, weight) <= maxWidthPx) return text;
  const letters = [...text];
  let lo = 0;
  let hi = letters.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(letters.slice(0, mid).join("") + ELLIPSIS, sizePx, weight) <= maxWidthPx) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? letters.slice(0, lo).join("").trimEnd() + ELLIPSIS : ELLIPSIS;
}

/** Plex's capitals' height, as a share of its size: the middle a `baseline: "middle"` text is placed by. */
const CAP = IBM_PLEX_SANS.capHeight / IBM_PLEX_SANS.unitsPerEm;

/** Where `t` is drawn from - its first letter's baseline, in the page's units - what it says, cut to fit, and how large, in world units. */
export function placed(t: PageText): { text: string; x: number; y: number; size: number } {
  const weight = t.weight ?? 400;
  const text = fitted(t.text, t.sizePx, weight, t.maxWidthPx);
  const w = pagePx(textWidth(text, t.sizePx, weight));
  const x = t.anchor === "start" ? t.x : t.anchor === "middle" ? t.x - w / 2 : t.x - w;
  const y = t.baseline === "middle" ? t.y - (pagePx(t.sizePx) * CAP) / 2 : t.y;
  return { text, x, y, size: pagePx(t.sizePx) };
}

/** A run of words in one line, its own colour and weight (`lineOf`). */
export type Run = { text: string; color: string; weight?: Weight };

/**
 * One line of runs, each its own colour and weight - a chip's "1 / 5 · Failed",
 * its count grey and its mark in the attention colour - as words on the page,
 * one after another from `x` by their widths, about `anchor`: keyed `key:0`,
 * `key:1`, ... Empty runs are left out.
 */
export function lineOf(key: string, x: number, y: number, anchor: PageText["anchor"], runs: readonly Run[], sizePx: number, more?: Pick<PageText, "baseline" | "z" | "opacity">): PageText[] {
  const shown = runs.filter((r) => r.text.length > 0);
  const widths = shown.map((r) => pagePx(textWidth(r.text, sizePx, r.weight ?? 400)));
  const whole = widths.reduce((a, w) => a + w, 0);
  let at = anchor === "start" ? x : anchor === "middle" ? x - whole / 2 : x - whole;
  return shown.map((r, i) => {
    const t: PageText = { key: `${key}:${i}`, x: at, y, anchor: "start", text: r.text, sizePx, color: r.color, ...(r.weight ? { weight: r.weight } : {}), ...more };
    at += widths[i];
    return t;
  });
}

/** How wide a line of runs is, in page pixels (`lineOf`). */
export function widthOfRuns(runs: readonly Run[], sizePx: number): number {
  return runs.reduce((a, r) => a + textWidth(r.text, sizePx, r.weight ?? 400), 0);
}
