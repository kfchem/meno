/**
 * What tells a molecule's atoms apart, whatever order they come in: for
 * the layout's choices between atoms, rings and branches that would
 * otherwise go to whichever is listed first.
 *
 * The ranks are the core's (perception/symmetry: the one refinement and
 * search), of the input the layout's `Molecule` was perceived from: each
 * atom classed by what it is - its element, charge, H count, bonds and
 * their orders, a star's pi system, a part in an axis - and the classes
 * refined by its neighbours' until they part no further (Morgan's way);
 * then by each stereocentre's configuration, each double bond's cis or
 * trans and each axis's sense, read against its neighbours' classes,
 * which tells apart atoms the bonds alone leave alike. Atoms still in one
 * class are alike in every way the layout looks at - a tert-butyl's
 * methyls, a phenyl's two ortho carbons with the same bonds to them - or
 * nearly so (cuneane's, basketane's).
 *
 * A choice is made by the structure first (`atomClasses`); only between
 * atoms it leaves alike does the canonical rank decide (`canonicalRanks`):
 * the drawings either way are then the same drawing, or one is the other's
 * mirror image or turned.
 */
import type { LayoutInput, Molecule } from "./perceive";
import { canonicalRanks as coreRanks, symmetryClasses } from "../chem/perception/symmetry";

type Ranked = { classes: number[]; canonical?: number[] };

/**
 * The classes and ranks of each input, as the core gives them: a layout
 * perceives its molecule afresh for each pass, from one input, and asks the
 * same ranks each time.
 */
const found = new WeakMap<LayoutInput, Ranked>();

/** The ranking kept for a molecule's input. */
function rankedOf(mol: Molecule): Ranked {
  const known = found.get(mol.input);
  if (known) return known;
  const ranked: Ranked = { classes: symmetryClasses(mol.input) };
  found.set(mol.input, ranked);
  return ranked;
}

/** Each atom's class: equal for atoms alike in everything the layout looks at, the same in any order. */
export function atomClasses(mol: Molecule): number[] {
  return rankedOf(mol).classes;
}

/**
 * Each atom alone, the same in any order: the classes (`atomClasses`), and
 * atoms of one class parted by the core's search - the order that writes
 * the molecule least. Only the last tie-break, between atoms the structure
 * leaves alike.
 */
export function canonicalRanks(mol: Molecule): number[] {
  const known = rankedOf(mol);
  return (known.canonical ??= coreRanks(mol.input));
}

/** Two atoms compared by their classes, then their canonical ranks: the order of the atoms never decides. */
export function byStructure(mol: Molecule): (p: number, q: number) => number {
  const c = atomClasses(mol);
  let canon: number[] | null = null;
  return (p, q) => c[p] - c[q] || (p === q ? 0 : (canon ??= canonicalRanks(mol))[p] - canon[q]);
}

/** A ring's atoms as the structure has them, the same in any order: its atoms' classes, sorted. */
export function ringKey(mol: Molecule, ring: readonly number[]): string {
  const c = atomClasses(mol);
  return ring
    .map((a) => c[a])
    .sort((p, q) => p - q)
    .map((v) => String(v).padStart(6, "0"))
    .join(",");
}

/** A ring's least canonical rank: the last tie-break between rings the structure leaves alike. */
export function ringRank(mol: Molecule, ring: readonly number[]): number {
  const r = canonicalRanks(mol);
  return Math.min(...ring.map((a) => r[a]));
}
