/**
 * How a molecule in 3D is first seen, and what *Reset turn* gives back (docs/WORKSPACE.md, docs/FILE-IO.md): one rule,
 * whoever put it down - a file, a step of a workflow. One tied to a drawing (`drawnFrom`) lies as its drawing lies:
 * no turn. Any other is seen along its principal axes (utils/align3d `principalTurn`) in the frame it is first shown
 * at (`firstFrame`). Only the view is turned; its coordinates stay as they are.
 */
import type { Molecule3D, Turn3D } from "../store/types";
import { principalTurn } from "./align3d";

type Seen = Pick<Molecule3D, "atoms" | "frames" | "path" | "entryFrames" | "drawnFrom">;

/**
 * The frame a molecule is first shown at: an optimisation's path at its end, the geometry it converged on; one of a
 * single entry among its frames, that entry; else its first - a conformer set's lowest, as it is followed. Counted as
 * the page counts frames: 0 its atoms, k its k-th frame.
 */
export function firstFrame(m: Pick<Molecule3D, "frames" | "path" | "entryFrames">): number {
  if (m.path) return m.frames?.length ?? 0;
  if (m.entryFrames?.length === 1) return m.entryFrames[0];
  return 0;
}

/** The turn a molecule is first seen at, and *Reset turn* gives back: none for one tied to a drawing, or of one atom. */
export function firstTurn(m: Seen): Turn3D | undefined {
  if (m.drawnFrom) return undefined;
  const f = firstFrame(m);
  const xyz = f === 0 ? m.atoms.flatMap((a) => [a.x, a.y, a.z ?? 0]) : (m.frames?.[f - 1] ?? []);
  return principalTurn(xyz);
}
