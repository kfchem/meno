/**
 * A structure's configuration as its source gives it, beside its drawing (docs/LAYOUT-2D.md, *A structure from a plugin*): a plugin's
 * reading of a SMILES, of a stereoisomer it made, of a molecule in 3D - each centre and double bond it holds one for, by the drawing block's
 * own atom and bond numbers (lib/chem/stereoOpen `IsomerConfiguration`) - and Meno's own reading of a SMILES's allene axes and odd cumulenes. Meno
 * lays its drawing out from this, not from the plugin's picture: the picture is only places for Meno's engine to lay out again, and a lossy
 * one (a ring of 36 or more comes as a regular polygon, its centres stating nothing).
 */
import type { IsomerConfiguration, ConfiguredCentre, ConfiguredDouble } from "../../../../lib/chem/stereoOpen";
import type { Axial, CisTrans, Cumulated, Tetrahedral } from "../../../../lib/chem/perception/stereo/types";

/** What a structure's source gives of its configuration: the plugin's centres and double bonds, where it sent them, and the text's axes and odd cumulenes. */
export type Given = { axes: readonly Axial[]; cumulated: readonly Cumulated[]; configuration?: IsomerConfiguration };

/**
 * The handedness of the drawing's frame, against the field's: a given centre's `sense` is +1 where det(n1 - c, n2 - c, n3 - c) is positive in
 * a right-handed frame, its neighbours in the order given (the plugin's convention, measured on its blocks); a centre the engine is given
 * says the sign of the same determinant in the drawing's own frame - x across the page, y up it, a wedge toward the viewer - which is
 * right-handed. Pinned by known answers typed by hand (CHBrClF, L-alanine written both ways, L-proline).
 */
const HANDED = 1;

/**
 * A given centre as the engine takes one (`Tetrahedral`): its neighbours in one fixed order - rising - so that the engine's input does not
 * depend on who gave it, and the sense turned with the order's parity. With three named, the fourth place is an H not drawn (`-1`, last) -
 * or, where the atom has none (`lonePair`), a lone pair, which a centre's neighbours leave out as the reader does.
 */
export function tetraOfGiven(c: ConfiguredCentre, lonePair = false): Tetrahedral {
  const named = [...c.neighbours];
  const ordered = [...named].sort((p, q) => p - q);
  // (the swaps that take the order given to the rising order, counted as inversions; the one not named stays last in both)
  let odd = false;
  for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) if (named[i] > named[j]) odd = !odd;
  const neighbours = named.length === 3 && !lonePair ? [...ordered, -1] : ordered;
  return { neighbours, volume: (HANDED * c.sense * (odd ? -1 : 1)) as 1 | -1 };
}

/**
 * A given double bond as the engine takes one, on the bond `a`-`b`: a group on each end - the first on `a`'s - and whether those two are on
 * one side, in one fixed form: on each end its lowest-numbered group (`neighbours` each atom's), the cis or trans turned for each end whose
 * group given was another - so that the engine's input does not depend on who gave it. Null where its ends are not that bond's groups.
 */
export function cisTransOfGiven(d: ConfiguredDouble, a: number, b: number, neighbours: (x: number) => readonly number[]): CisTrans | null {
  const [p, q] = d.ends;
  const on = (end: number, other: number, x: number) => x !== other && neighbours(end).includes(x);
  const given = on(a, b, p) && on(b, a, q) ? ([p, q] as const) : on(a, b, q) && on(b, a, p) ? ([q, p] as const) : null;
  if (!given) return null;
  const lowest = (end: number, other: number) => Math.min(...neighbours(end).filter((x) => x !== other));
  const [ra, rb] = [lowest(a, b), lowest(b, a)];
  // (another group on an end: on the other side of it - an end has two at most - so the cis or trans turns)
  const turns = (ra !== given[0] ? 1 : 0) + (rb !== given[1] ? 1 : 0);
  return { refs: [ra, rb], cis: turns % 2 === 0 ? d.cis : !d.cis };
}

/**
 * What a structure's source gives of its configuration : the text's axes and odd cumulenes, where it has any, and
 * the plugin's reading, where it sent one. None where there is neither: the drawing is then read, as a file's is.
 */
export function givenOf(runs: Given | undefined, configuration: IsomerConfiguration | undefined): Given | undefined {
  if (!runs && !configuration) return undefined;
  return { axes: runs?.axes ?? [], cumulated: runs?.cumulated ?? [], ...(configuration ? { configuration } : {}) };
}
