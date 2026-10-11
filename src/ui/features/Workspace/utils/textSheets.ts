/**
 * A text's sheet on the page (docs/PDF.md, *A text*): as large as its first
 * lines need, at the size they would be printed - Meno's monospaced type at
 * 9 points, a line every 12 - as wide as its longest line among them, up to
 * 80 letters, as tall as its first 40 lines; never smaller than a few
 * lines of 32 letters. Where it lies is its top left (`WorkspaceText.at`),
 * so that a text growing at its end grows down. A Markdown text's sheet
 * shows it formatted, as the column does, laid out as wide as a sheet's 80
 * letters, its first rows - its type as much smaller than the column's as
 * the sheet's monospaced type is.
 */
import { ICON_HEIGHT, ICON_NAME_PT, ICON_NAME_WIDTH, POINT } from "../../../../lib/pdf/layout";
import { isMarkdown, readMarkdown } from "../../../../lib/text/markdown";
import { layOut, PAD_FOOT, PAD_X, type Laid } from "../../TextEditor/markdownLayout";
import { measureText, typeVersion } from "../../TextEditor/markdownType";
import { FONT_PX } from "../../TextEditor/linePictures";

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

/** A text's sheet: how wide and tall, in world units, and the lines it shows - each cut to what it holds across - or, Markdown, its rows formatted. */
export type TextSheet = { w: number; h: number; lines: string[]; cols: number; md?: MarkdownSheet };

/** A Markdown text's sheet: the text laid out, how many of its rows it shows, and how large a pixel of the layout is on the page. */
export type MarkdownSheet = { laid: Laid; rows: number; scale: number };

/** A pixel of the column's type in points on a sheet: its monospaced 14 pixels the sheet's 9 points. */
export const SHEET_PT_PER_PX = SHEET_TYPE_PT / FONT_PX;
/** How wide a Markdown text is laid out for its sheet, in the column's pixels: a sheet's 80 letters, and its margins. */
export const SHEET_MD_PX = Math.round((SHEET_MOST_COLS * SHEET_LETTER * SHEET_TYPE_PT) / SHEET_PT_PER_PX) + 2 * PAD_X;

/** A line as a sheet shows it: its tabs as spaces to the next stop, cut to `cols` letters. */
function shownLine(line: string, cols: number): string {
  let out = "";
  let col = 0;
  for (const ch of line) {
    if (col >= cols) break;
    if (ch === "\t") {
      const n = Math.min(TAB - (col % TAB), cols - col);
      out += " ".repeat(n);
      col += n;
    } else {
      out += ch;
      col++;
    }
  }
  return out;
}

/** How many letters a line takes across, its tabs to their stops. */
function lettersAcross(line: string): number {
  let col = 0;
  for (const ch of line) col += ch === "\t" ? TAB - (col % TAB) : 1;
  return col;
}

const sheets = new Map<string, TextSheet>();
const MOST_SHEETS = 64;

/** The sheet a text lies on, on the page: a Markdown text's, by its name, formatted. */
export function sheetOf(text: string, name = ""): TextSheet {
  const md = isMarkdown(name);
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
  let rows = 0;
  let foot = 0;
  for (const r of laid.rows) {
    if (r.y + r.h > most - PAD_FOOT) break;
    rows++;
    foot = r.y + r.h;
  }
  const h = Math.max(least, Math.min(laid.height, foot + PAD_FOOT));
  const scale = SHEET_PT_PER_PX * POINT;
  return { w: SHEET_MD_PX * scale, h: h * scale, lines: [], cols: SHEET_MOST_COLS, md: { laid, rows, scale } };
}

/** A text's sheet, its lines as they are written. */
function plainSheet(text: string): TextSheet {
  const all = text.split("\n");
  // (a last line ending the text's last line is none)
  if (all.length > 1 && all[all.length - 1] === "") all.pop();
  const first = all.slice(0, SHEET_MOST_LINES);
  const cols = Math.min(SHEET_MOST_COLS, Math.max(SHEET_LEAST_COLS, ...first.map(lettersAcross)));
  const rows = Math.max(SHEET_LEAST_LINES, first.length);
  const wPt = cols * SHEET_LETTER * SHEET_TYPE_PT + 2 * SHEET_PAD_PT;
  const hPt = rows * SHEET_LINE_PT + 2 * SHEET_PAD_PT;
  return { w: wPt * POINT, h: hPt * POINT, lines: first.map((l) => shownLine(l, cols)), cols };
}

/** Where a sheet lies on the page: left, right, foot and top. */
export function sheetBox(at: { x: number; y: number }, s: Pick<TextSheet, "w" | "h">): { x0: number; x1: number; y0: number; y1: number } {
  return { x0: at.x, x1: at.x + s.w, y0: at.y - s.h, y1: at.y };
}

/** A sheet's middle, where it lies at `at`: what a box or a lasso takes it by. */
export function sheetMiddle(at: { x: number; y: number }, text: string, name = ""): { x: number; y: number } {
  const s = sheetOf(text, name);
  return { x: at.x + s.w / 2, y: at.y - s.h / 2 };
}

/**
 * How much smaller than its sheet a text made an icon is drawn, about its
 * middle: its longer side as long as a PDF's icon is tall (lib/pdf/layout
 * `ICON_HEIGHT`) - a few lines wide, a long log tall.
 */
export function iconScaleOf(s: Pick<TextSheet, "w" | "h">): number {
  return Math.min(ICON_HEIGHT / Math.max(s.w, s.h), 1);
}

/** A sheet as it is drawn made `k` times its size about its middle - an icon's, or one on its way to being one. */
export function sheetBoxAt(at: { x: number; y: number }, s: Pick<TextSheet, "w" | "h">, k: number): { x0: number; x1: number; y0: number; y1: number } {
  const cx = at.x + s.w / 2;
  const cy = at.y - s.h / 2;
  return { x0: cx - (k * s.w) / 2, x1: cx + (k * s.w) / 2, y0: cy - (k * s.h) / 2, y1: cy + (k * s.h) / 2 };
}

/** Where a text's sheet lies on the page as it is drawn: made an icon, or full size. */
export function drawnSheetBox(t: { at?: { x: number; y: number }; text: string; name?: string; icon?: true }): { x0: number; x1: number; y0: number; y1: number } | null {
  if (!t.at) return null;
  const s = sheetOf(t.text, t.name);
  return sheetBoxAt(t.at, s, t.icon ? iconScaleOf(s) : 1);
}

/** The room a sheet takes on the page: as it is drawn, and made an icon, its name's under it too - as a PDF's (lib/pdf/layout `pdfRoom`). */
export function sheetRoom(t: { at?: { x: number; y: number }; text: string; name?: string; icon?: true }): { x0: number; x1: number; y0: number; y1: number } | null {
  const b = drawnSheetBox(t);
  if (!b || !t.icon) return b;
  const mx = (b.x0 + b.x1) / 2;
  return { x0: Math.min(b.x0, mx - ICON_NAME_WIDTH / 2), x1: Math.max(b.x1, mx + ICON_NAME_WIDTH / 2), y0: b.y0 - 3 * ICON_NAME_PT * POINT, y1: b.y1 };
}
