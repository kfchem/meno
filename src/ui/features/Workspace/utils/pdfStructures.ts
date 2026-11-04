/**
 * The structures of a PDF's figures as the pointer comes over them (docs/PDF.md,
 * *Structures picked from a PDF*): a figure read the first time it is
 * pointed at - drawn as the app's reader gives it (`pdf_figure`), read with
 * all of its page outside it beside it (./pageStructures) - and kept, so
 * that each later point is found at once.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Box, FigureDrawn } from "../../../../lib/figure/drawn";
import { figuresHad, figuresOn, objectsHad } from "../../../../lib/pdf/figures";
import type { PdfStructurePick } from "../store/types";
import { textHad, type PageText } from "../../../../lib/pdf/text";
import { pageStructuresOf, type CompoundLabel, type PageMarks, type PageStructure } from "./pageStructures";
import { labelsRead, type PageLabels } from "./compoundIndex";

/** One figure's structures, what else it has drawn, and the compounds' numbers by its structures. */
export type FigureStructures = { structures: PageStructure[]; marks: PageMarks; labels: CompoundLabel[] };

const had = new Map<string, FigureStructures | "asked">();
/** Those waiting for a figure being read (`figureStructuresOn`): each told what it read as, or none where it could not be read. */
const waiting = new Map<string, ((read: FigureStructures | null) => void)[]>();
const tell = (key: string, read: FigureStructures | null) => {
  for (const w of waiting.get(key) ?? []) w(read);
  waiting.delete(key);
};

/** The words a box of a page holds, as its letters say. */
function wordsIn(t: PageText | null, box: Box): string {
  if (!t) return "";
  let out = "";
  for (let i = 0; i < t.codes.length; i++) {
    const [a, b, c, d] = [t.boxes[i * 4], t.boxes[i * 4 + 1], t.boxes[i * 4 + 2], t.boxes[i * 4 + 3]];
    if (c > a && (a + c) / 2 >= box[0] && (a + c) / 2 <= box[2] && (b + d) / 2 >= box[1] && (b + d) / 2 <= box[3]) out += String.fromCodePoint(t.codes[i]);
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * The structures of figure `k` of a page (its box among `figures`), if they
 * have been read - asked for, the first time, and `came` called once they
 * have. None where the page's objects are not known yet, or out of the app.
 */
export function figureStructuresHad(sha256: string, page: number, figures: readonly Box[], k: number, came: () => void = () => {}): FigureStructures | null {
  const key = `${sha256}:${page}:${k}`;
  const h = had.get(key);
  if (h && h !== "asked") return h;
  const objects = objectsHad(sha256, page);
  if (h || !objects || !isTauri()) return null;
  had.set(key, "asked");
  invoke<FigureDrawn>("pdf_figure", { sha: sha256, page, box: figures[k] })
    .then((drawn) => {
      const t = textHad(sha256, page);
      const read = pageStructuresOf({ objects, wordsIn: (b) => wordsIn(t, b) }, figures, (j) => (j === k ? drawn : null), sha256, page);
      const figure = { structures: read.structures, marks: read.marks[0] ?? { segments: [], points: [], boxes: [] }, labels: read.labels };
      had.set(key, figure);
      // (its compounds' numbers, for the PDF's index of them: ./compoundIndex)
      labelsRead(sha256, page, figures[k], read.labels);
      came();
      tell(key, figure);
    })
    .catch(() => {
      had.delete(key);
      tell(key, null);
    });
  return null;
}

/** Which of a page's figures a box is, among those worked out: none where they are not, or it is none of them. */
export function figureIndex(sha256: string, page: number, box: Box): number {
  const figures = figuresHad(sha256, page) ?? [];
  return figures.findIndex((f) => f.every((v, i) => Math.abs(v - box[i]) < 0.01));
}

/** A structure picked, as it was read: none where its figure has not been read, or holds it no more. */
export function pickedStructure(sha256: string, pick: Pick<PdfStructurePick, "page" | "figure" | "key">): PageStructure | null {
  const figures = figuresHad(sha256, pick.page);
  const k = figures ? figureIndex(sha256, pick.page, pick.figure) : -1;
  if (!figures || k < 0) return null;
  const read = figureStructuresHad(sha256, pick.page, figures, k);
  return read?.structures.find((s) => s.key === pick.key) ?? null;
}

/** The structures of figure `k` of a page once they have been read: as `figureStructuresHad` reads them, waited for; none where they cannot be. */
export function figureStructuresOn(sha256: string, page: number, figures: readonly Box[], k: number): Promise<FigureStructures | null> {
  const now = figureStructuresHad(sha256, page, figures, k);
  if (now) return Promise.resolve(now);
  // (none to wait for: its page's objects not known, or out of the app)
  if (!objectsHad(sha256, page) || !isTauri()) return Promise.resolve(null);
  // (being read - asked for now, or before by the pointer on it: told when it has been, or could not be)
  const key = `${sha256}:${page}:${k}`;
  return new Promise((done) => (waiting.get(key) ?? waiting.set(key, []).get(key)!).push(done));
}

/** A PDF's pages read for their compounds' numbers, as the column reads them (./compoundIndex `indexPdf`): each page's figures, read ahead, and each figure's structures. */
export const pdfPageLabels =
  (sha256: string): PageLabels =>
  async (page) => {
    const figures = await figuresOn(sha256, page, true);
    const out: { figure: Box; labels: CompoundLabel[] }[] = [];
    for (let k = 0; k < figures.length; k++) {
      const read = await figureStructuresOn(sha256, page, figures, k);
      if (!read) return null;
      out.push({ figure: figures[k], labels: read.labels });
    }
    return out;
  };
