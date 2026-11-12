/**
 * The structures of a PDF's figures as the pointer comes over them (docs/PDF.md,
 * *Structures picked from a PDF*): a figure read the first time it is
 * pointed at - drawn as the app's reader gives it (`pdf_figure`), read with
 * all of its page outside it beside it (./pageStructures) - and kept, so
 * that each later point is found at once.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Box } from "../../../../lib/figure/drawn";
import { timed } from "../../../../lib/core/frameProbe";
import { whenCalm } from "../../../../lib/core/calm";
import { figuresHad, figuresOn, objectsHad } from "../../../../lib/pdf/figures";
import type { PdfStructurePick } from "../store/types";
import { textHad } from "../../../../lib/pdf/text";
import type { CompoundLabel, PageStructure } from "./pageStructures";
import { labelsRead, type PageLabels } from "./compoundIndex";
import { figureReadOff } from "./structuresOff";
import type { FigureStructures } from "./structuresRead";

export type { FigureStructures } from "./structuresRead";

const had = new Map<string, FigureStructures | "asked">();
/** Those waiting for a figure being read (`figureStructuresOn`, and the pointer on a figure): each told what it read as, or none where it could not be read. */
const waiting = new Map<string, ((read: FigureStructures | null) => void)[]>();
const tell = (key: string, read: FigureStructures | null) => {
  for (const w of waiting.get(key) ?? []) w(read);
  waiting.delete(key);
};
/** Those that asked for a figure while it was being read, to be told once it has (`came`, a set: the pointer asks again at every move). */
const told = new Map<string, Set<() => void>>();
/** Figures asked for in the background and not begun - waiting for the hands to rest - each with what begins it at once, for the pointer on it. */
const hurried = new Map<string, () => void>();

/**
 * The structures of figure `k` of a page, if they have been read - asked for,
 * the first time, and `came` called once they have. None where the page's
 * objects are not known yet, or out of the app.
 *
 * Read in a worker, never on the thread the drawing runs on (./structuresOff),
 * the figure's bytes unpacked there too. Asked for by the pointer on it
 * (`urgent`, the default) it is read at once, in the worker kept for that; asked
 * for to be read ahead (`urgent` false) it waits for the hands to rest
 * (lib/core/calm) - and is read at once, should the pointer come to it meanwhile.
 */
export function figureStructuresHad(sha256: string, page: number, figures: readonly Box[], k: number, came: () => void = () => {}, urgent = true): FigureStructures | null {
  const key = `${sha256}:${page}:${k}`;
  const h = had.get(key);
  if (h && h !== "asked") return h;
  const objects = objectsHad(sha256, page);
  if (h) {
    // (being read already, or waiting for the hands to rest: the pointer on it begins it now)
    if (urgent) {
      hurried.get(key)?.();
      (told.get(key) ?? told.set(key, new Set()).get(key)!).add(came);
    }
    return null;
  }
  if (!objects || !isTauri()) return null;
  had.set(key, "asked");
  let begun = false;
  const begin = (now: boolean) => {
    if (begun) return;
    begun = true;
    hurried.delete(key);
    invoke<ArrayBuffer>("pdf_figure_raw", { sha: sha256, page, box: figures[k] })
      .then((drawn) => figureReadOff({ objects, text: textHad(sha256, page), figures: [...figures], k, drawn, sha256, page }, now))
      .then((figure) => {
        had.set(key, figure);
        // (its compounds' numbers, for the PDF's index of them: ./compoundIndex)
        timed("labelsRead", () => labelsRead(sha256, page, figures[k], figure.labels), 0);
        timed("figure came()", () => came(), 0);
        for (const c of told.get(key) ?? []) c();
        told.delete(key);
        tell(key, figure);
      })
      .catch(() => {
        had.delete(key);
        told.delete(key);
        tell(key, null);
      });
  };
  if (urgent) begin(true);
  else {
    const off = whenCalm(() => begin(false));
    hurried.set(key, () => {
      off();
      begin(true);
    });
  }
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
  // (read ahead, in the background: the pointer on it, should it come, takes it first)
  const now = figureStructuresHad(sha256, page, figures, k, undefined, false);
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
