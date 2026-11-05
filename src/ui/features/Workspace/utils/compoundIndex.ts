/**
 * A PDF's compounds by their numbers (docs/PDF.md, *A compound's number*):
 * each number set by a structure in its figures (./pageStructures
 * `compoundLabelsOf`), and where each structure so numbered lies - its page,
 * its figure and its key there. Kept as its figures are read: by the pointer
 * on one, and through the whole PDF in idle time (`indexPdf`), a page at a
 * time, never holding up what is shown. A number set by more than one
 * structure - a compound drawn again in a later scheme - keeps each, in the
 * order of the pages.
 */
import { whenIdle } from "../../../../lib/core/idle";
import type { Box } from "../../../../lib/pdf/figures";
import type { CompoundLabel } from "./pageStructures";

/** Where a structure numbered so lies: its page, its figure's box there, its key in that figure, and where its number is set. */
export type LabelPlace = { page: number; figure: Box; key: string; box: Box };

type Index = {
  /** Each number's structures, by its text as `labelText` writes it. */
  places: Map<string, LabelPlace[]>;
  /** The figures whose numbers are in it: by page, then figure box. */
  read: Set<string>;
  /** The pages gone through whole. */
  pages: Set<number>;
  /** How many pages it has, once it is being gone through. */
  of?: number;
};

const indexes = new Map<string, Index>();
const indexOf = (sha256: string): Index => indexes.get(sha256) ?? indexes.set(sha256, { places: new Map(), read: new Set(), pages: new Set() }).get(sha256)!;

/** A figure's numbers, read: kept in its PDF's index, once - a figure read again adds nothing. */
export function labelsRead(sha256: string, page: number, figure: Box, labels: readonly CompoundLabel[]): void {
  const ix = indexOf(sha256);
  const id = `${page}:${figure.join(",")}`;
  if (ix.read.has(id)) return;
  ix.read.add(id);
  for (const l of labels) {
    const list = ix.places.get(l.label) ?? ix.places.set(l.label, []).get(l.label)!;
    list.push({ page, figure, key: l.key, box: l.box });
    list.sort((a, b) => a.page - b.page || a.figure[1] - b.figure[1] || a.figure[0] - b.figure[0]);
  }
}

/** The structures a number is set by in a PDF, as far as its figures have been read, in the order of its pages: none where none is. */
export function labelPlaces(sha256: string, label: string): readonly LabelPlace[] {
  return indexes.get(sha256)?.places.get(label) ?? [];
}

/** Whether a PDF's every page has been gone through for its numbers. */
export function indexWhole(sha256: string): boolean {
  const ix = indexes.get(sha256);
  return !!ix && ix.of != null && ix.pages.size >= ix.of;
}

/** A page's figures read, as the column reads them: each figure's box and its numbers - none where its page cannot be read. */
export type PageLabels = (page: number) => Promise<{ figure: Box; labels: CompoundLabel[] }[] | null>;

const going = new Map<string, Promise<void>>();

/**
 * Every page of a PDF gone through for its compounds' numbers, in idle time:
 * one page, then the window's next idle moment, then the next - each page's
 * figures read as the column reads them (`readPage`), kept in the index. Once
 * for a PDF: asked again while it goes, the same; a page that could not be
 * read is left, and gone through again the next time it is asked.
 */
export function indexPdf(sha256: string, pages: number, readPage: PageLabels, idle: (go: () => void) => void = whenIdle): Promise<void> {
  const ix = indexOf(sha256);
  ix.of = pages;
  const now = going.get(sha256);
  if (now) return now;
  const run = (async () => {
    for (let p = 0; p < pages; p++) {
      if (ix.pages.has(p)) continue;
      await new Promise<void>((go) => idle(go));
      const figures = await readPage(p).catch(() => null);
      if (!figures) continue;
      for (const f of figures) labelsRead(sha256, p, f.figure, f.labels);
      ix.pages.add(p);
    }
  })().finally(() => going.delete(sha256));
  going.set(sha256, run);
  return run;
}

/** A PDF's index forgotten: for tests, and for a PDF gone from the workspace. */
export function forgetIndex(sha256: string): void {
  indexes.delete(sha256);
}
