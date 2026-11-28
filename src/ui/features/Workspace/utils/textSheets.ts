/**
 * A text's sheet on the page (docs/PDF.md, *A text*): as large as its first
 * lines need, at the size they would be printed - Meno's monospaced type at
 * 9 points, a line every 12 - as wide as its longest line among them, up to
 * 80 letters, as tall as its first 40 lines - a longer text's first 39,
 * and a last line saying how many more it has; never smaller than a few
 * lines of 32 letters. Where it lies is its top left (`WorkspaceText.at`),
 * so that a text growing at its end grows down. A Markdown text's sheet
 * shows it formatted, as the column does, laid out as wide as a sheet's 80
 * letters, its first rows - its type as much smaller than the column's as
 * the sheet's monospaced type is.
 */
import { ICON_HEIGHT, ICON_NAME_PT, ICON_NAME_WIDTH, POINT, pointOf, scaleOf } from "../../../../lib/pdf/layout";
import { readMarkdown } from "../../../../lib/text/markdown";
import { layOut, PAD_FOOT, PAD_X, type Laid } from "../../TextEditor/markdownLayout";
import { measureText, typeVersion } from "../../TextEditor/markdownType";
import { FONT_PX } from "../../TextEditor/linePictures";
import { pageLength } from "./pageScale";

/** The type on a sheet: its size, and a line's, in points; how wide a letter is, as a share of the size (IBM Plex Mono's 600 units in 1000). */
export const SHEET_TYPE_PT = 9;
export const SHEET_LINE_PT = 12;
export const SHEET_LETTER = 0.6;
/** How far in from a sheet's edges its lines lie, in points. */
export const SHEET_PAD_PT = 12;
/** How many letters across a sheet holds at most and at least, and how many lines. */
export const SHEET_MOST_COLS = 80;
export const SHEET_LEAST_COLS = 32;
export const SHEET_MOST_LINES = 40;
export const SHEET_LEAST_LINES = 3;
/** How many letters apart a tab's stops are, on a sheet as in the column. */
const TAB = 4;

/**
 * A text's sheet: how wide and tall, in world units, and the lines it shows
 * - each cut to what it holds across - or, Markdown, its rows formatted;
 * and, where the text goes on past it, where in the text the first line
 * it does not show begins (`more`), and how many of the lines it shows are
 * cut short at its right edge (`cut`) - and the line it ends in then,
 * saying how many of the text's lines are not on it (`rest`), where its
 * words begin, across from the sheet's left, and its middle down from its top.
 */
export type TextSheet = { w: number; h: number; lines: string[]; cols: number; md?: MarkdownSheet; more?: number; cut?: number; rest?: { lines: number; x: number; y: number } };

/** The words of a sheet's last line where its text goes on past it: how many of its lines are not on it. */
export const restWords = (lines: number): string => `${lines} more line${lines === 1 ? "" : "s"}`;

/** How many lines a text has, a last line's end ending none. */
const linesOf = (text: string): number => text.split("\n").length - (text.endsWith("\n") && text.length > 0 ? 1 : 0);

/** A Markdown text's sheet: the text laid out, how many of its rows it shows, and how large a pixel of the layout is on the page. */
export type MarkdownSheet = { laid: Laid; rows: number; scale: number };

/** A pixel of the column's type in points on a sheet: its monospaced 14 pixels the sheet's 9 points. */
export const SHEET_PT_PER_PX = SHEET_TYPE_PT / FONT_PX;
/** How wide a Markdown text is laid out for its sheet, in the column's pixels: a sheet's 80 letters, and its margins. */
export const SHEET_MD_PX = Math.round((SHEET_MOST_COLS * SHEET_LETTER * SHEET_TYPE_PT) / SHEET_PT_PER_PX) + 2 * PAD_X;

/**
 * A wide letter - Chinese, Japanese and Korean letters, and the full-width
 * forms - which the type a sheet's lines are set in takes from a fallback,
 * a whole em across where a letter of its own is 0.6 of one.
 */
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u;
/** How many of the monospaced type's letters a wide letter takes across: its em, and a twentieth of one to spare (1.05 / 0.6). */
const WIDE_ACROSS = 1.75;
/** How many letters across a letter takes: a wide one, `WIDE_ACROSS`. */
const across = (ch: string): number => (WIDE.test(ch) ? WIDE_ACROSS : 1);

/** A line as a sheet shows it: its tabs as spaces to the next stop, cut to `cols` letters - a wide letter that would not fit left off. */
function shownLine(line: string, cols: number): string {
  let out = "";
  let col = 0;
  for (const ch of line) {
    if (col >= cols) break;
    if (ch === "\t") {
      // (from the letter a wide one's part ends in)
      col = Math.ceil(col);
      const n = Math.min(TAB - (col % TAB), cols - col);
      out += " ".repeat(n);
      col += n;
    } else {
      const n = across(ch);
      if (col + n > cols) break;
      out += ch;
      col += n;
    }
  }
  return out;
}

/** How many letters a line takes across, its tabs to their stops, a wide letter `WIDE_ACROSS`. */
function lettersAcross(line: string): number {
  let col = 0;
  for (const ch of line) col = ch === "\t" ? Math.ceil(col) + TAB - (Math.ceil(col) % TAB) : col + across(ch);
  return col;
}

const sheets = new Map<string, TextSheet>();
const MOST_SHEETS = 64;

/**
 * The sheet a text lies on, on the page: a Markdown text's (`markdown`),
 * formatted - laid at `point` (lib/pdf/layout `pointOf`), ACS 1996's
 * unless it was laid at the workspace's own.
 */
export function sheetOf(text: string, markdown = false, point = POINT): TextSheet {
  const s = sheetAtAcs(text, markdown);
  if (point === POINT) return s;
  const f = point / POINT;
  return { ...s, w: s.w * f, h: s.h * f, ...(s.md ? { md: { ...s.md, scale: s.md.scale * f } } : {}), ...(s.rest ? { rest: { ...s.rest, x: s.rest.x * f, y: s.rest.y * f } } : {}) };
}

/** A text's own sheet, at the point it was laid at. */
export const sheetOfText = (t: { text: string; markdown?: true; point?: number }): TextSheet => sheetOf(t.text, !!t.markdown, pointOf(t));

/** The sheet at ACS 1996's point, kept for the texts asked about last. */
function sheetAtAcs(text: string, md: boolean): TextSheet {
  // (laid out again once the type has come)
  const key = `${md ? typeVersion() + 1 : 0}\u0000${text}`;
  const had = sheets.get(key);
  if (had) return had;
  const s = md ? markdownSheet(text) : plainSheet(text);
  if (sheets.size >= MOST_SHEETS) sheets.delete(sheets.keys().next().value!);
  sheets.set(key, s);
  return s;
}

/** A Markdown text's sheet: its first rows formatted, as many as a sheet's 40 lines' height holds - never fewer than a few lines' room. */
function markdownSheet(text: string): TextSheet {
  const most = (SHEET_MOST_LINES * SHEET_LINE_PT + 2 * SHEET_PAD_PT) / SHEET_PT_PER_PX;
  // (its first blocks alone, as many as fill it: a long text's sheet laid out as quickly as a short one's)
  const blocks = readMarkdown(text).blocks;
  let laid = layOut(blocks.slice(0, 8), SHEET_MD_PX, measureText);
  for (let n = 16; laid.height < most && n / 2 < blocks.length; n *= 2) laid = layOut(blocks.slice(0, n), SHEET_MD_PX, measureText);
  const least = (SHEET_LEAST_LINES * SHEET_LINE_PT + 2 * SHEET_PAD_PT) / SHEET_PT_PER_PX;
  // (the rows that fit - and where some do not, those that fit over a line left for saying so)
  const line = SHEET_LINE_PT / SHEET_PT_PER_PX;
  const fit = (room: number) => {
    let n = 0;
    let at = 0;
    for (const r of laid.rows) {
      if (r.y + r.h > room) break;
      n++;
      at = r.y + r.h;
    }
    return { n, at };
  };
  let { n: rows, at: foot } = fit(most - PAD_FOOT);
  const goesOn = rows < laid.rows.length;
  if (goesOn) ({ n: rows, at: foot } = fit(most - PAD_FOOT - line));
  const scale = SHEET_PT_PER_PX * POINT;
  // (where the first row it does not show begins in the text written: its first words', a table's row's too)
  const next = laid.rows[rows];
  const words = next?.pieces.map((p) => p.src).filter((at) => at >= 0) ?? [];
  const more = next ? (words.length ? Math.min(...words) : next.src) : undefined;
  const h = goesOn ? foot + line + PAD_FOOT : Math.max(least, Math.min(laid.height, foot + PAD_FOOT));
  const rest = more != null ? { lines: linesOf(text) - text.slice(0, more).split("\n").length + 1, x: PAD_X * scale, y: (foot + line / 2) * scale } : undefined;
  return { w: SHEET_MD_PX * scale, h: h * scale, lines: [], cols: SHEET_MOST_COLS, md: { laid, rows, scale }, ...(more != null ? { more, rest } : {}) };
}

/** A text's sheet, its lines as they are written. */
function plainSheet(text: string): TextSheet {
  const all = text.split("\n");
  // (a last line ending the text's last line is none)
  if (all.length > 1 && all[all.length - 1] === "") all.pop();
  // (a text longer than a sheet: its last line says how many are not on it)
  const goesOn = all.length > SHEET_MOST_LINES;
  const first = all.slice(0, goesOn ? SHEET_MOST_LINES - 1 : SHEET_MOST_LINES);
  const cols = Math.min(SHEET_MOST_COLS, Math.max(SHEET_LEAST_COLS, ...first.map((l) => Math.ceil(lettersAcross(l)))));
  const rows = goesOn ? SHEET_MOST_LINES : Math.max(SHEET_LEAST_LINES, first.length);
  const wPt = cols * SHEET_LETTER * SHEET_TYPE_PT + 2 * SHEET_PAD_PT;
  const hPt = rows * SHEET_LINE_PT + 2 * SHEET_PAD_PT;
  const more = goesOn ? first.reduce((at, l) => at + l.length + 1, 0) : undefined;
  const cut = first.filter((l) => lettersAcross(l) > cols).length;
  const rest = goesOn ? { lines: all.length - first.length, x: SHEET_PAD_PT * POINT, y: (SHEET_PAD_PT + (first.length + 0.5) * SHEET_LINE_PT) * POINT } : undefined;
  return { w: wPt * POINT, h: hPt * POINT, lines: first.map((l) => shownLine(l, cols)), cols, ...(more != null ? { more, rest } : {}), ...(cut ? { cut } : {}) };
}

/** Where a sheet lies on the page: left, right, foot and top. */
export function sheetBox(at: { x: number; y: number }, s: Pick<TextSheet, "w" | "h">): { x0: number; x1: number; y0: number; y1: number } {
  return { x0: at.x, x1: at.x + s.w, y0: at.y - s.h, y1: at.y };
}

/** A sheet's middle, where it lies at `at`: what a box or a lasso takes it by. */
export function sheetMiddle(at: { x: number; y: number }, text: string, markdown = false, point = POINT): { x: number; y: number } {
  const s = sheetOf(text, markdown, point);
  return { x: at.x + s.w / 2, y: at.y - s.h / 2 };
}

/**
 * How much smaller than its sheet a text made an icon is drawn, about its
 * middle: its longer side as long as a PDF's icon is tall (lib/pdf/layout
 * `ICON_HEIGHT`) - a few lines wide, a long log tall.
 */
export function iconScaleOf(s: Pick<TextSheet, "w" | "h">, scale = 1): number {
  return Math.min((ICON_HEIGHT * scale) / Math.max(s.w, s.h), 1);
}

/** A sheet as it is drawn made `k` times its size about its middle - an icon's, or one on its way to being one. */
export function sheetBoxAt(at: { x: number; y: number }, s: Pick<TextSheet, "w" | "h">, k: number): { x0: number; x1: number; y0: number; y1: number } {
  const cx = at.x + s.w / 2;
  const cy = at.y - s.h / 2;
  return { x0: cx - (k * s.w) / 2, x1: cx + (k * s.w) / 2, y0: cy - (k * s.h) / 2, y1: cy + (k * s.h) / 2 };
}

/** Where a text's sheet lies on the page as it is drawn: made an icon, or full size. */
export function drawnSheetBox(t: { at?: { x: number; y: number }; text: string; markdown?: true; icon?: true; point?: number }): { x0: number; x1: number; y0: number; y1: number } | null {
  if (!t.at) return null;
  const s = sheetOfText(t);
  return sheetBoxAt(t.at, s, t.icon ? iconScaleOf(s, scaleOf(t)) : 1);
}

/**
 * A sheet's name under it, full size (components/TextSheets2D): its type and
 * its gap under the sheet in page pixels - as large on the page at every
 * zoom, as all on it - and as wide as the sheet, or this many page pixels
 * where that is less.
 */
const SHEET_NAME_PX = 12;
const SHEET_NAME_GAP_PX = 14;
const SHEET_NAME_LEAST_PX = 120;

/**
 * A full-size sheet's name under its drawn box `b`, in world units, the same
 * at every zoom: its type's size, its gap under the sheet and how wide it
 * may be - as components/TextSheets2D draws it - and the room it takes
 * there (`room`): from the sheet's foot, its gap and a line of its type
 * down; from the sheet's left, as wide as it may be. The built document's
 * layout counts that room (scripts/document/build).
 */
export function sheetNameRoom(b: { x0: number; x1: number; y0: number }): {
  size: number;
  gap: number;
  width: number;
  room: { x0: number; x1: number; y0: number; y1: number };
} {
  const size = pageLength(SHEET_NAME_PX);
  const gap = pageLength(SHEET_NAME_GAP_PX);
  const width = Math.max(pageLength(SHEET_NAME_LEAST_PX), b.x1 - b.x0);
  return { size, gap, width, room: { x0: b.x0, x1: b.x0 + width, y0: b.y0 - gap - 1.2 * size, y1: b.y0 } };
}

/** The room a sheet takes on the page: as it is drawn, and made an icon, its name's under it too - as a PDF's (lib/pdf/layout `pdfRoom`). */
export function sheetRoom(t: { at?: { x: number; y: number }; text: string; markdown?: true; icon?: true; point?: number }): { x0: number; x1: number; y0: number; y1: number } | null {
  const b = drawnSheetBox(t);
  if (!b || !t.icon) return b;
  const mx = (b.x0 + b.x1) / 2;
  const name = ICON_NAME_WIDTH * scaleOf(t);
  return { x0: Math.min(b.x0, mx - name / 2), x1: Math.max(b.x1, mx + name / 2), y0: b.y0 - 3 * ICON_NAME_PT * pointOf(t), y1: b.y1 };
}
