/**
 * A ring in perspective drawn with no depth and recognised as one (lib/layout/recognised) is read by the convention - the lower atoms of a
 * mostly-horizontal ring the nearer - which follows the page. A move of Meno's that turns the drawing on the page, or turns it over, would
 * so read another compound: turned half round, or turned over left for right, its mirror image. So before such a move the depth the reading
 * worked out is stored on its atoms, and the move carries it as it carries any depth drawn: the compound is kept (docs/EDITOR-2D.md,
 * *Drawn in perspective*). Clean-up, which leaves the drawing where it is, stores none.
 */
import type { Model } from "../store/types";
import { withRecognisedDepth } from "../../../../lib/layout/recognised";
import { fragmentsHolding, partOf } from "./cleanUp";
import { drawingOf } from "./drawing";
import type { WorkspaceDocument } from "../document";

/** The depth the reading works out for each atom of a recognised ring in the structures holding `atoms`, by id: none for an atom with a depth of its own. */
export function recognisedDepthOf(model: Model, atoms: Iterable<number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const ids of fragmentsHolding(model, atoms)) {
    const part = partOf(model, ids);
    if (!part.atoms.length) continue;
    const d = drawingOf(part);
    const seen = withRecognisedDepth(d.atoms, d.bonds);
    part.atoms.forEach((a, i) => {
      const z = seen[i]?.z;
      if (a.z == null && z != null && d.atoms[i].z == null) out.set(a.id, z);
    });
  }
  return out;
}

/** `doc` with each of `held`'s depths stored on its atom, the atom a stereocentre of its drawing in perspective, as a tool's projection stores it. */
export function depthStored(doc: WorkspaceDocument, held: ReadonlyMap<number, number>): WorkspaceDocument {
  if (!held.size) return doc;
  return { ...doc, model: { ...doc.model, atoms: doc.model.atoms.map((a) => (held.has(a.id) ? { ...a, z: held.get(a.id)!, stereoCentre: true as const } : a)) } };
}
