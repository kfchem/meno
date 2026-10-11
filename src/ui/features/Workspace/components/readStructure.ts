/**
 * *Read as structure* (docs/PDF.md, *Stage 5*): the figure in a box drawn on
 * a PDF's page, or a picture cut out of one, read as a structure and put on
 * the page beside the PDF or the picture - clear of what lies there - as one
 * step, selected; the view taking it in where it lies out of view.
 */
import type { EditorStore } from "../store";
import type { PictureItem } from "../store/types";
import { pdfRoom } from "../../../../lib/pdf/layout";
import { takenOnPage } from "../chem/make3d";
import { placedBeside, readBox } from "../utils/figures";

type Region = { x0: number; y0: number; x1: number; y1: number };

/** Where a figure is: its PDF, its page and its box there, in points from the page's top left. */
export type FigureSource = { sha256: string; page: number; box: [number, number, number, number] };

/** What the page around a picture takes, turned as it is. */
export function pictureRegion(p: Pick<PictureItem, "x" | "y" | "w" | "h" | "turn">): Region {
  const c = Math.abs(Math.cos(p.turn ?? 0));
  const s = Math.abs(Math.sin(p.turn ?? 0));
  const hw = (p.w * c + p.h * s) / 2;
  const hh = (p.w * s + p.h * c) / 2;
  return { x0: p.x - hw, x1: p.x + hw, y0: p.y - hh, y1: p.y + hh };
}

/**
 * A figure read and its structure put beside `region` - the PDF's or the
 * picture's - saying what it is doing, and why nothing came of it where
 * nothing did.
 */
export async function readStructure(
  store: EditorStore,
  source: FigureSource,
  region: Region,
  ui: { working: (what: string | null) => void; say: (why: string | null) => void; view: () => Region | null; fit: () => void },
): Promise<void> {
  ui.working("Reading the figure…");
  ui.say(null);
  try {
    const read = await readBox(source.sha256, source.page, source.box);
    if ("none" in read) {
      ui.say(read.none);
      return;
    }
    const st = store.getState();
    const taken: Region[] = [...takenOnPage(st, []), ...st.pictures.map(pictureRegion), ...st.pdfs.map(pdfRoom)];
    const placed = placedBeside(read, region, taken);
    store.getState().putRead(placed);
    // (beyond the view, the view takes it in)
    const view = ui.view();
    if (view && placed.atoms.some((a) => a.x < view.x0 || a.x > view.x1 || a.y < view.y0 || a.y > view.y1)) ui.fit();
  } catch (e: unknown) {
    ui.say(`The figure could not be read: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    ui.working(null);
  }
}
