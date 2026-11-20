/**
 * Whether a structure holds a projection (docs/EDITOR-2D.md, *Projections*): what Clean-up keeps as drawn, *Draw flat* lays out flat, and
 * 3D takes the configuration of, never the conformation.
 */
import { recognisedSaid } from "../../../../lib/chem/perception/projection/depth";
import { drawingOf } from "../chem/drawing";
import type { Model } from "../store/types";
import { newmansIn } from "./newman";
import { projectionsIn } from "./rings";

/** What was asked of each drawing, by its atoms: a menu asks it at every turn while it is open, and the drawing is a new one when changed. */
const asked = new WeakMap<Model, Map<string, boolean>>();

/**
 * Whether the structure of the atoms `ids` holds a projection: a chair or a Haworth ring the Projections tool put down (./rings `projectionsIn`), a
 * Newman pair (./newman `newmansIn`), or a ring system Meno reads as drawn
 * in perspective - a chair or a Haworth ring drawn by hand, read from the ring as drawn, or taken for one whose near and far are not marked
 * (lib/chem/perception/projection/depth `recognisedSaid`), as Clean-up keeps it where it is. A cage or a bridged system drawn by hand is
 * not asked after: fitting it to the engine's views of it takes up to a second, too long for a menu (found in review). Each drawing is
 * asked once.
 */
export function isProjection(model: Model, ids: ReadonlySet<number>): boolean {
  const key = [...ids].sort((a, b) => a - b).join(",");
  let byIds = asked.get(model);
  if (!byIds) asked.set(model, (byIds = new Map()));
  const was = byIds.get(key);
  if (was != null) return was;
  const is = projectionIn(model, ids);
  byIds.set(key, is);
  return is;
}

function projectionIn(model: Model, ids: ReadonlySet<number>): boolean {
  // (a chair or a Haworth ring of the tool's, or a Newman pair: ./newman `newmansIn`)
  if (projectionsIn(model, ids).length > 0 || newmansIn(model, ids).length > 0) return true;
  const part: Model = { ...model, atoms: model.atoms.filter((a) => ids.has(a.id)), bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) };
  if (!part.bonds.length) return false;
  const { atoms, bonds } = drawingOf(part);
  return recognisedSaid(atoms, bonds).size > 0;
}
