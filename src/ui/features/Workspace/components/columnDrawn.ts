/**
 * What the canvas draws in the column's pass (PdfColumn): a PDF's pages, or
 * a text's sheet, under the column's see-through body (docs/PDF.md, *One
 * canvas*).
 *
 * Open, it draws what the column's chosen tab names, and nothing it showed
 * before: a PDF read there and then left for a text draws the text, its
 * place kept by the column's reader for when its tab is chosen again.
 * Shutting, it goes on drawing what it last showed as it slides away.
 */

/** What the column shows, as the canvas needs it. */
export type ColumnShows = {
  /** The column is open. */
  open: boolean;
  /** How much of the canvas's width the column covers now, in CSS pixels. */
  cover: number;
  /** The PDF shown, if one is. */
  pdf: number | null;
  /** That PDF is read there (it is among those whose tabs are along the column's top). */
  pdfRead: boolean;
  /** The text last chosen. */
  text: number | null;
};

/** What was last drawn while the column was open: drawn on as it shuts. */
export type ColumnLast = { pdf: number | null; text: number | null };

/**
 * The PDF and the text the column's pass draws, and what it is to draw as
 * it shuts from now: `last` as it is kept.
 */
export function columnDrawn(now: ColumnShows, last: ColumnLast): { pdf: number | null; text: number | null; last: ColumnLast } {
  if (now.open) {
    // (as the column's body has it - TextColumn: a PDF shown only while it is read there, a text where none is)
    const pdf = now.pdfRead ? now.pdf : null;
    const text = pdf == null ? now.text : null;
    return { pdf, text, last: { pdf, text } };
  }
  const sliding = now.cover > 0.5;
  return { pdf: sliding ? last.pdf : null, text: sliding && last.pdf == null ? last.text : null, last };
}
