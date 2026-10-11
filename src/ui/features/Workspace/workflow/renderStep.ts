/**
 * Render as a step of a workflow (docs/RENDER.md, *Render as a step*): each
 * entry that comes in rendered as a picture of its own by the plugin that
 * does the step, and laid beside the step in a row; run again, the step
 * makes its pictures anew.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Carried3D, Molecule3D, Turn3D } from "../store/types";
import type { SetEntry } from "./entries";
import { CARD_W, GAP } from "./look";

/**
 * An entry as a render takes it: its atoms and bonds at its own geometry -
 * a conformer's, an optimised one's - in the look its molecule is drawn in,
 * turned as the canvas turns that molecule; nothing it shows besides (a
 * list's surface, a vibration), which a step's picture does not carry.
 */
export function entryCarried(e: SetEntry, source: Pick<Molecule3D, "look"> | undefined, turn: Turn3D | undefined): Carried3D {
  return {
    atoms: e.atoms.map((a, i) => ({ ...a, x: e.xyz[3 * i], y: e.xyz[3 * i + 1], z: e.xyz[3 * i + 2] })),
    bonds: e.bonds.map((b) => ({ ...b })),
    at: { x: 0, y: 0 },
    ...(e.name ? { name: e.name } : {}),
    ...(source?.look ? { look: source.look } : {}),
    ...(turn ? { turn } : {}),
  };
}

/**
 * Where a step's pictures go: in a row to its right - where a result set
 * would stand - their tops level with the step's, each as large as its
 * molecules are drawn, a bond's length apart. Each picture's middle.
 */
export function picturesBeside(step: { x: number; y: number }, sizes: readonly (readonly [number, number])[]): { x: number; y: number }[] {
  let x = step.x + CARD_W + GAP;
  return sizes.map(([w, h]) => {
    const at = { x: x + w / 2, y: step.y - h / 2 };
    x += w + NOMINAL_BOND_LENGTH;
    return at;
  });
}

/** What a Render step's card says it did: how long it took, and how many pictures it made - of how many, where some failed. */
export const picturesSaid = (made: number, of: number) => `${made} picture${made === 1 ? "" : "s"}${made < of ? ` of ${of}` : ""}`;
