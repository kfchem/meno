/**
 * *Read as structure* (docs/PDF.md, *Stage 5*): the figure in a box drawn on
 * a PDF's page, or a picture cut out of one - its lines read by Meno, or,
 * where it is a picture, the picture by the plugin that reads them - or any
 * picture on the page, read as a structure - with a scheme's arrows, "+"
 * signs and words, where the figure has them - and put on the page beside
 * the PDF or the picture - clear of what lies there - as one step,
 * selected; the view taking it in where it lies out of view.
 */
import type { EditorStore } from "../store";
import type { PictureItem } from "../store/types";
import { styleOf } from "../../../../lib/chem/style";
import { pageBoxes } from "../utils/freePlace";
import { placedBeside, readBox, readPicture } from "../utils/figures";

type Region = { x0: number; y0: number; x1: number; y1: number };

/** Where a figure is: its PDF, its page and its box there, in points from the page's top left; or a picture on the page, all of it. */
export type FigureSource = { sha256: string; page: number; box: [number, number, number, number] } | { picture: Pick<PictureItem, "sha256" | "media"> };

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
  ui: { working: (what: string | null) => void; say: (why: string | null) => void },
): Promise<void> {
  ui.working("picture" in source ? "Reading the picture…" : "Reading the figure…");
  ui.say(null);
  try {
    const read = "picture" in source ? await readPicture(source.picture) : await readBox(source.sha256, source.page, source.box, ui.working);
    if ("none" in read) {
      ui.say(read.none);
      return;
    }
    const st = store.getState();
    // (clear of all there is on the page - structures, words, arrows, pictures, PDFs, sheets, molecules in 3D - as what Open puts down is)
    const style = styleOf(st.docStyle);
    const placed = placedBeside(read, region, pageBoxes(st, style), style);
    // (selected and shown - the view moved to take it in, where the column or the view's edge hides it: modelSlice `putRead`)
    store.getState().putRead(placed.model, placed.scheme);
  } catch (e: unknown) {
    ui.say(`The figure could not be read: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    ui.working(null);
  }
}
