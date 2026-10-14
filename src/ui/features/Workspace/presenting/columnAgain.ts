import type { EditorState } from "../store/types";

/** The column as a talk found it: open or shut, the PDF or the text it showed, and how much of the canvas it covered (CSS pixels). */
export type ColumnWas = { open: boolean; pdf: number | null; text: number | null; cover: number };

/** What the column opens on again as a talk ends: the PDF or the text it showed, where that is there still - nothing where it was shut, or that is gone. */
export function columnAgain(st: Pick<EditorState, "pdfs" | "texts">, was: ColumnWas): { pdf: number } | { text: number } | null {
  if (!was.open) return null;
  if (was.pdf != null && st.pdfs.some((p) => p.id === was.pdf)) return { pdf: was.pdf };
  if (was.text != null && st.texts.some((t) => t.id === was.text)) return { text: was.text };
  return null;
}

/**
 * The column opened again on it, as a talk ends - shown in it, not read
 * again: a PDF read again flies from its place on the page into the column,
 * and the view goes with it (PdfColumn), away from the slide the talk ends at.
 */
export function openColumnAgain(st: Pick<EditorState, "showPdf" | "showText">, on: { pdf: number } | { text: number }): void {
  if ("pdf" in on) st.showPdf(on.pdf);
  else st.showText(on.text);
}
