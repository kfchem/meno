/**
 * The structures of a PDF's figures as the pointer comes over them (docs/PDF.md,
 * *Structures picked from a PDF*): a figure read the first time it is
 * pointed at - drawn as the app's reader gives it (`pdf_figure`), read with
 * all of its page outside it beside it (./pageStructures) - and kept, so
 * that each later point is found at once.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Box, FigureDrawn } from "../../../../lib/figure/drawn";
import { figuresHad, objectsHad } from "../../../../lib/pdf/figures";
import type { PdfStructurePick } from "../store/types";
import { textHad, type PageText } from "../../../../lib/pdf/text";
import { pageStructuresOf, type PageMarks, type PageStructure } from "./pageStructures";

/** One figure's structures and what else it has drawn. */
export type FigureStructures = { structures: PageStructure[]; marks: PageMarks };

const had = new Map<string, FigureStructures | "asked">();

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
      had.set(key, { structures: read.structures, marks: read.marks[0] ?? { segments: [], points: [], boxes: [] } });
      came();
    })
    .catch(() => had.delete(key));
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
