/**
 * The selection as an input (docs/WORKFLOWS.md, *An input: a set from the
 * selection*): where it holds whole structures or molecules in 3D - a few
 * atoms of a structure make no input - the frame a set round it takes:
 * clear of what it holds as it is drawn, its labels and frames chips
 * included, with room for its name above it.
 */
import type { Style3D } from "../../../../lib/chem/style3d";
import { labelBox, labelSetOf, pxToWorld, type Layout, type LayoutOptions } from "../../../../lib/chem/layout2d";
import type { Model, Molecule3D, Turn3D } from "../store/types";
import { lookOf, poseOf, seenBounds, solidOf } from "../utils/molecule3d";
import { framesOf, structuresOf, type Frame } from "./entries";
import { SET_PAD, SET_TOP, CHIP } from "./look";

/** Whether a molecule in 3D shows a frames chip below it (Molecule3DView): it has frames, or a calculation it was read from. */
export const hasChip = (m: Pick<Molecule3D, "frames" | "calc">) => framesOf(m) > 1 || !!m.calc;

/**
 * How far each labelled atom's label reaches on the page, by the atom's id,
 * as the drawing lays it out (`layout`, from `atoms` in that order, under
 * `opts`): OH hangs well to the right of its O.
 */
export function labelReach(layout: Pick<Layout, "texts" | "zoom">, atoms: readonly { id: number }[], opts: LayoutOptions): Map<number, Frame> {
  const size = opts.units === "world" ? opts.fontPx : pxToWorld(opts.fontPx, layout.zoom);
  const set = labelSetOf(opts);
  const out = new Map<number, Frame>();
  for (const t of layout.texts) {
    const id = t.atom != null ? atoms[t.atom]?.id : undefined;
    if (id == null) continue;
    const b = labelBox(t, size, set);
    out.set(id, { x0: t.x - b.left, x1: t.x + b.right, y0: t.y - b.bottom, y1: t.y + b.top });
  }
  return out;
}

export function selectionFrame(
  model: Model,
  atoms: ReadonlySet<number>,
  molecules: readonly Molecule3D[],
  sel3d: ReadonlySet<number>,
  style: Style3D,
  turns: Record<number, Turn3D>,
  frames: Record<number, number>,
  labels: ReadonlyMap<number, Frame> = new Map(),
): Frame | null {
  if (!atoms.size && !sel3d.size) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  if (atoms.size) {
    const byId = new Map(model.atoms.map((a) => [a.id, a]));
    for (const part of structuresOf(model)) {
      const n = part.filter((id) => atoms.has(id)).length;
      if (n === 0) continue;
      if (n < part.length) return null;
      for (const id of part) {
        const a = byId.get(id)!;
        const l = labels.get(id);
        xs.push(Math.min(a.x, l?.x0 ?? a.x) - SET_PAD, Math.max(a.x, l?.x1 ?? a.x) + SET_PAD);
        ys.push(Math.min(a.y, l?.y0 ?? a.y) - SET_PAD, Math.max(a.y, l?.y1 ?? a.y) + SET_PAD);
      }
    }
  }
  for (const m of molecules) {
    if (!sel3d.has(m.id)) continue;
    const b = seenBounds(poseOf(m, solidOf(m, style), lookOf(m), turns[m.id], frames[m.id]));
    // (and its frames chip below it, where it has one)
    const chip = hasChip(m) ? CHIP : 0;
    xs.push(b.minX - SET_PAD, b.maxX + SET_PAD);
    ys.push(b.minY - SET_PAD - chip, b.maxY + SET_PAD);
  }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) + SET_TOP - SET_PAD };
}
