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
  /** In Plex Mono, Regular (`font-mono`): a log's line. */
  mono?: true;
  maxWidthPx?: number;
  z?: number;
  opacity?: number;
};

/** The family the app's HTML is set in (App.css `--font-sans`), its Japanese after it. */
const FAMILY = '"IBM Plex Sans", "IBM Plex Sans JP", sans-serif';
/** The app's monospaced family (App.css `--font-mono`), its Japanese after it. */
const MONO = '"IBM Plex Mono", "IBM Plex Sans JP", monospace';
/** Plex Mono's advance, every letter's, as a share of its size. */
const MONO_ADVANCE = 0.6;

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
export function textWidth(text: string, sizePx: number, weight: Weight = 400, mono?: boolean): number {
  const c = measurer();
  if (c && typeof c.measureText === "function") {
    c.font = mono ? `400 ${sizePx}px ${MONO}` : `${weight} ${sizePx}px ${FAMILY}`;
    const w = c.measureText(text).width;
    if (Number.isFinite(w) && (w > 0 || text.length === 0)) return w;
  }
  if (mono) return [...text].length * MONO_ADVANCE * sizePx;
  let w = 0;
  for (const ch of text) w += advanceIn(IBM_PLEX_SANS, ch);
  return w * sizePx;
}

const ELLIPSIS = "…";

/** `text`, cut with an ellipsis where it is wider than `maxWidthPx`: as many of its letters as fit before it. */
export function fitted(text: string, sizePx: number, weight: Weight, maxWidthPx?: number, mono?: boolean): string {
  if (maxWidthPx == null || textWidth(text, sizePx, weight, mono) <= maxWidthPx) return text;
  const letters = [...text];
  let lo = 0;
  let hi = letters.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(letters.slice(0, mid).join("") + ELLIPSIS, sizePx, weight, mono) <= maxWidthPx) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? letters.slice(0, lo).join("").trimEnd() + ELLIPSIS : ELLIPSIS;
}

/** Plex's capitals' height, as a share of its size: the middle a `baseline: "middle"` text is placed by. */
const CAP = IBM_PLEX_SANS.capHeight / IBM_PLEX_SANS.unitsPerEm;

/** Where `t` is drawn from - its first letter's baseline, in the page's units - what it says, cut to fit, and how large, in world units. */
export function placed(t: PageText): { text: string; x: number; y: number; size: number } {
  const weight = t.weight ?? 400;
  const text = fitted(t.text, t.sizePx, weight, t.maxWidthPx, t.mono);
  const w = pagePx(textWidth(text, t.sizePx, weight, t.mono));
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

/** A run that may be broken across lines (`wrapRuns`); `atomic`, never - a title cut to its most, as an inline block. */
export type WrapRun = Run & { atomic?: boolean };

/** One line of wrapped runs and how wide it is, in page pixels. */
export type WrappedLine = { runs: Run[]; width: number };

/**
 * Runs laid in lines no wider than `maxPx` page pixels, as HTML lays words
 * that may break anywhere (`overflow-wrap: anywhere`): broken after spaces
 * where they can be, and inside a word only where it is wider than a line by
 * itself; a run `atomic` kept whole. Each line's runs keep their colours;
 * the spaces a line breaks at are not drawn.
 */
export function wrapRuns(runs: readonly WrapRun[], sizePx: number, maxPx: number): WrappedLine[] {
  // (pieces a line may end after: each word with the spaces after it, an atomic run whole)
  const pieces: { run: Run; text: string; atomic: boolean }[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    if (r.atomic) pieces.push({ run: r, text: r.text, atomic: true });
    else for (const w of r.text.match(/\S*\s*/g) ?? []) if (w) pieces.push({ run: r, text: w, atomic: false });
  }
  const width = (t: string, r: Run) => textWidth(t, sizePx, r.weight ?? 400);
  const lines: { run: Run; text: string }[][] = [[]];
  let at = 0;
  const put = (run: Run, text: string) => {
    lines[lines.length - 1].push({ run, text });
    at += width(text, run);
  };
  const breakLine = () => {
    lines.push([]);
    at = 0;
  };
  for (const p of pieces) {
    const bare = p.text.trimEnd();
    if (at > 0 && at + width(bare, p.run) > maxPx + 1e-6) breakLine();
    if (!p.atomic && width(bare, p.run) > maxPx + 1e-6) {
      // (a word wider than a line: broken letter by letter where it runs out)
      for (const ch of p.text) {
        if (at > 0 && ch.trim() && at + width(ch, p.run) > maxPx + 1e-6) breakLine();
        put(p.run, ch);
      }
    } else put(p.run, p.text);
  }
  return lines
    .map((line) => {
      // (the same run's pieces in one, its spaces at the line's end left off)
      const joined: Run[] = [];
      for (const { run, text } of line) {
        const last = joined[joined.length - 1];
        if (last && last.color === run.color && (last.weight ?? 400) === (run.weight ?? 400)) last.text += text;
        else joined.push({ ...run, text });
      }
      const end = joined[joined.length - 1];
      if (end) end.text = end.text.trimEnd();
      const kept = joined.filter((r) => r.text.length > 0);
      return { runs: kept, width: widthOfRuns(kept, sizePx) };
    })
    .filter((l) => l.runs.length > 0);
}

/** Words in one colour laid in lines no wider than `maxPx` (`wrapRuns`): each line's words and width. */
export function wrapText(text: string, sizePx: number, maxPx: number, weight: Weight = 400): { text: string; width: number }[] {
  return wrapRuns([{ text, color: "", weight }], sizePx, maxPx).map((l) => ({ text: l.runs.map((r) => r.text).join(""), width: l.width }));
}

/** Where the alphabetic baseline of `sizePx` Plex stands below the top of a line `linePx` high, as CSS sets it: half the room its ascent and descent leave, then its ascent. */
export function baselineIn(linePx: number, sizePx: number): number {
  return (linePx - 1.3 * sizePx) / 2 + 1.025 * sizePx;
}
