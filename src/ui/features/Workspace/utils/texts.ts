/**
 * The texts a workspace holds (docs/WORKSPACE.md, *Texts*): which its
 * column shows as they come and go - or which PDF read there (docs/PDF.md)
 * - what a new one is called, and where Export suggests writing one.
 */
import type { LostText, PdfItem, WorkspaceText } from "../store/types";

/** The column's width as it first opens on a text, in CSS pixels. */
export const COLUMN_WIDTH = 440;
/** The least it may be dragged to, in CSS pixels, and the most, as a share of the canvas. */
export const COLUMN_NARROWEST = 260;
export const COLUMN_WIDEST = 0.85;
/** How much of the canvas it takes as a PDF is read in it, until it is dragged: most of it, a page being for reading. */
export const PDF_COLUMN_SHARE = 0.75;

/** How wide it first opens on a set's table (workflow/SetTableBody), in CSS pixels: its columns all seen, a name's and what worked its energy out a little cut. */
export const TABLE_COLUMN_WIDTH = 680;

/** How wide the column is, on a canvas `room` CSS pixels wide, showing a PDF, a set's table or a text: as it was dragged, or as it first opens - kept within its least and most. */
export function columnWidthFor(room: number, pdf: boolean | "table", dragged: number | null): number {
  const want = dragged ?? (pdf === "table" ? TABLE_COLUMN_WIDTH : pdf ? Math.round(room * PDF_COLUMN_SHARE) : COLUMN_WIDTH);
  return Math.min(Math.max(COLUMN_NARROWEST, room * COLUMN_WIDEST), Math.max(COLUMN_NARROWEST, want));
}
import { firstFreeBeside } from "../../../../lib/io/beside";

/** What a text that could not be read is said to be, by its name: in the column, and as its workspace opens. */
export const lostSaid = (name: string) => `${name} could not be read from the workspace.`;

/** What a text in the column is, as `shownText` follows it: its id, its words - none, one that could not be read - and whether it is read there. */
type InColumn = Pick<WorkspaceText, "id" | "reading"> & { text?: string };

/** The texts in the column, in its order: those it holds, and after them those that could not be read - each its id alone (`shownText`); the texts as they are, where there are none such. */
export function columnOf(texts: readonly WorkspaceText[], lost: readonly LostText[]): readonly InColumn[] {
  return lost.length ? [...texts, ...lost.map((t) => ({ id: t.id }))] : texts;
}

/**
 * The text the column shows once the texts are `after`, having been
 * `before` and showing `shown` - and whether it is to open, to show it: one
 * that has come - opened, or brought back by an undo - the last of them,
 * opening; else one whose words an undo or a redo changed while another was
 * shown, or none, opening; else the one shown, while it is there - gone,
 * the one now where it was, or none.
 */
export function shownText(
  before: readonly InColumn[],
  after: readonly InColumn[],
  shown: number | null,
): { shown: number | null; open?: true } {
  if (before === after) return { shown };
  // (those read in the column, its tabs: a sheet on the page not read there is none of them)
  before = before.filter((t) => t.reading !== false);
  after = after.filter((t) => t.reading !== false);
  const was = new Map(before.map((t) => [t.id, t]));
  const come = after.filter((t) => !was.has(t.id));
  if (come.length) return { shown: come[come.length - 1].id, open: true };
  const changed = after.filter((t) => was.get(t.id)!.text !== t.text);
  if (changed.length === 1 && changed[0].id !== shown) return { shown: changed[0].id, open: true };
  if (shown == null || after.some((t) => t.id === shown)) return { shown };
  if (!after.length) return { shown: null };
  const at = before.findIndex((t) => t.id === shown);
  return { shown: after[Math.min(Math.max(at, 0), after.length - 1)].id };
}

/**
 * The PDF the column shows once the PDFs are `after`, having been `before`
 * and showing `shown`, the texts going as `text` says - and whether it is to
 * open, to show it: none, where a text has come; one read there that has
 * come - brought back by an undo, or with a workspace - the last of them,
 * opening; else the one shown, while it is read there - read no longer, the
 * one read there now where it was among them; else none, where there is a
 * text to show; else the first read there, if any.
 */
export function shownPdf(
  before: readonly PdfItem[],
  after: readonly PdfItem[],
  shown: number | null,
  text: { shown: number | null; open?: true },
): { shown: number | null; open?: true } {
  if (text.open) return { shown: null };
  if (before !== after) {
    const was = new Set(before.map((p) => p.id));
    const come = after.filter((p) => !was.has(p.id) && p.reading);
    if (come.length) return { shown: come[come.length - 1].id, open: true };
  }
  if (shown != null && after.some((p) => p.id === shown && p.reading)) return { shown };
  const read = after.filter((p) => p.reading);
  const at = shown != null ? before.filter((p) => p.reading).findIndex((p) => p.id === shown) : -1;
  if (at >= 0 && read.length) return { shown: read[Math.min(at, read.length - 1)].id };
  if (text.shown != null) return { shown: null };
  return { shown: read[0]?.id ?? null };
}

/** What a new text is called: "Untitled.txt", or numbered from 2 where the workspace holds one so called. */
export function newTextName(texts: readonly Pick<WorkspaceText, "name">[]): string {
  const names = new Set(texts.map((t) => t.name.toLowerCase()));
  if (!names.has("untitled.txt")) return "Untitled.txt";
  let n = 2;
  while (names.has(`untitled-${n}.txt`)) n++;
  return `Untitled-${n}.txt`;
}

/**
 * Where Export suggests writing a text: never the file it was opened from
 * (docs/FILE-IO.md) - beside it, numbered from 2, the first name `taken`
 * does not say is there; one opened from nowhere Open said, by its name.
 */
export function textExportPath(
  text: Pick<WorkspaceText, "name" | "path">,
  taken: (path: string) => boolean = () => false,
): string {
  return text.path ? firstFreeBeside(text.path, taken) : text.name;
}
