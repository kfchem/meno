/**
 * Whether a structure holds a projection (docs/EDITOR-2D.md, *Projections*): what Clean-up keeps as drawn, *Draw flat* lays out flat, and
 * 3D takes the configuration of, never the conformation.
 */
import { recognisedSaid } from "../../../../lib/chem/perception/projection/depth";
import { cageViews } from "../../../../lib/layout/recognised";
import { drawingOf } from "../chem/drawing";
import type { Model } from "../store/types";
import { chairsIn } from "./chair";

/**
 * Whether the structure of the atoms `ids` holds a projection: a chair the Projections tool put down, or a ring system Meno reads as drawn
 * in perspective - a chair or a Haworth ring drawn by hand, read from the ring as drawn, or taken for one whose near and far are not marked
 * (lib/chem/perception/projection/depth `recognisedSaid`), as Clean-up keeps it where it is.
 */
export function isProjection(model: Model, ids: ReadonlySet<number>): boolean {
  if (chairsIn(model, ids).length > 0) return true;
  const part: Model = { ...model, atoms: model.atoms.filter((a) => ids.has(a.id)), bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) };
  if (!part.bonds.length) return false;
  const { atoms, bonds } = drawingOf(part);
  return recognisedSaid(atoms, bonds, cageViews).size > 0;
}
