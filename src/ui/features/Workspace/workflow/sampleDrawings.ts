/**
 * The structures a large set's frame draws (setSummary `sampleOf`), drawn
 * in 2D by Meno's own engine as a molecule in 3D is drawn as a formula
 * (chem/make3d `drawnOf`): each one's heavy atoms wedged as it is in 3D by
 * the plugin that draws molecules, then laid out many at once (lib/layout
 * many, `layOutMany` and `arranged`: lined up on what they share) and each
 * read back against the molecule it was given - one that does not show it
 * as given says so, and one that could not be drawn says why, in its place.
 */
import type { ChemClient } from "../../../../lib/roles/client";
import { chemWorker } from "../../../../lib/roles/worker";
import type { DrawingStyle } from "../../../../lib/chem/style";
import { arranged } from "../../../../lib/layout/many";
import { emptyWorkspaceDocument, relayout } from "../document";
import { drawingSvg } from "../fileActions";
import type { Model, Molecule3D } from "../store/types";
import { drawnOf } from "../chem/make3d";
import { layoutJob, nextFree, relayoutFrom } from "../chem/engineLayout";
import { layOutMany } from "../chem/layOut";

/** One structure drawn: its picture as SVG and its size in px at the style's own size - and what it does not show as given (none where it shows the molecule given); or why it is not drawn. */
export type Cell = { svg: string; w: number; h: number; notAsGiven: string[] } | { why: string };

/** The space left between structures as they are lined up, in bonds. */
const GAP = 1.5;
/** How many structures stand in a row, as the frame draws them. */
const COLUMNS = 4;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A model as SVG in `style`, and its size in px. */
function pictured(model: Model, style: DrawingStyle): { svg: string; w: number; h: number } {
  const svg = drawingSvg(model, { aromaticEnabled: false, aromaticRings: {} }, style);
  const size = /^<svg[^>]*? width="([\d.e+-]+)" height="([\d.e+-]+)"/.exec(svg);
  return { svg, w: size ? Number(size[1]) : 0, h: size ? Number(size[2]) : 0 };
}

/** The molecules given - each at the frame given - drawn, in their order. */
export async function sampleDrawings(
  molecules: readonly { m: Pick<Molecule3D, "atoms" | "bonds" | "frames" | "bondsFrom">; frame: number }[],
  style: DrawingStyle,
  chem: Promise<ChemClient> = chemWorker("drawing"),
): Promise<Cell[]> {
  if (!molecules.length) return [];
  let client: ChemClient;
  try {
    client = await chem;
  } catch (e) {
    const why = message(e);
    return molecules.map(() => ({ why }));
  }
  // (each one's drawing, wedged as it is in 3D: one the plugin could not draw says why)
  const drawn: (Model | string)[] = [];
  for (const { m, frame } of molecules) {
    try {
      drawn.push((await drawnOf(client, m, frame)).drawn);
    } catch (e) {
      drawn.push(`It could not be drawn: ${message(e)}`);
    }
  }
  // (laid out all at once, those with bonds; a lone atom as it came)
  const which = drawn.flatMap((d, i) => (typeof d !== "string" && d.bonds.length ? [i] : []));
  const jobs = which.map((i) => layoutJob(drawn[i] as Model));
  const laid = await layOutMany(jobs.map((j) => j.input));
  const lined = arranged(
    jobs.map((j) => j.input),
    laid,
    { gap: GAP, columns: COLUMNS },
  );
  const placed = new Map(which.map((i, k) => [i, k]));
  return drawn.map((d, i): Cell => {
    if (typeof d === "string") return { why: d };
    const k = placed.get(i);
    if (k == null) return { ...pictured(d, style), notAsGiven: [] };
    const layout = lined.layouts[k];
    if (!layout) return { why: lined.notAsGiven[k].join("; ") || "It could not be laid out" };
    try {
      const change = relayoutFrom(d, d, jobs[k], layout, style);
      const model = relayout({ ...emptyWorkspaceDocument(), model: d, nextId: nextFree(d) }, change).model;
      return { ...pictured(model, style), notAsGiven: lined.notAsGiven[k] };
    } catch (e) {
      return { why: `It could not be laid out: ${message(e)}` };
    }
  });
}
