/**
 * Whether a double-click's second press, let go without a drag beside atom `near` (the store's `findAtomNear`), joins its atom `from` to it
 * (docs/EDITOR-2D.md, *How it is worked*): only where the two are not bonded already. An atom already bonded to it is no new bond, and the
 * release stays the double-click's own: the two atoms of a Newman pair lie at one place, so a double-click on its centre finds the back atom
 * there, and it must still add a bond to the front atom (`bondOut`). Pure.
 */
import type { Bond } from "../store/types";

export function tapConnects(model: { bonds: readonly Bond[] }, from: number, near: number | null): near is number {
  if (near == null || near === from) return false;
  return !model.bonds.some((b) => (b.a === from && b.b === near) || (b.b === from && b.a === near));
}
