import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { magnifiedOfAtom } from "../../../../lib/chem/magnified2d";
/**
 * The magnified display (docs/WORKSPACE.md, *Magnified display*): a
 * structure in 2D or a molecule in 3D shown larger or smaller than it is,
 * 1 being its true size - the workspace's one style unchanged underneath.
 */

/** The least and the most an object is shown magnified: a quarter of its size, four times it. */
export const MAGNIFIED_LEAST = 0.25;
export const MAGNIFIED_MOST = 4;

/** The magnifications the menu offers, besides its true size (the maintainer, 2026-10-16). */
export const MAGNIFICATIONS = [0.5, 0.75, 1.25, 1.5, 2, 3] as const;

/** A magnification as it is said: "150 %". */
export function magnificationText(k: number): string {
  return `${Math.round(k * 100)} %`;
}

/** A magnification kept within its bounds - and a hair from 1, 1 itself. */
export function magnificationWithin(k: number): number {
  const to = Math.min(MAGNIFIED_MOST, Math.max(MAGNIFIED_LEAST, Number.isFinite(k) ? k : 1));
  return Math.abs(to - 1) < 1e-6 ? 1 : to;
}

/** How far a drag along a magnification's mark takes it: doubled every this many pixels to the right, halved to the left. */
export const DOUBLING_PX = 120;

/** The magnification a drag of `dx` pixels along its mark makes of `from`, kept within its bounds and to whole percents. */
export function draggedMagnification(from: number, dx: number): number {
  return magnificationWithin(Math.round(from * 2 ** (dx / DOUBLING_PX) * 100) / 100);
}

/**
 * How long a bond drawn from an atom is drawn, where it is shown: the
 * style's, times as large as the atom's structure is shown - so that what
 * is drawn on a structure shown magnified is drawn as large as the rest of
 * it (lib/chem/magnified2d). The style's from no atom (`id` null, or one
 * not there): a structure begun on empty space is at its true size.
 */
export function bondLengthFrom(atoms: readonly { id: number; magnified?: number }[], id: number | null | undefined): number {
  if (id == null) return NOMINAL_BOND_LENGTH;
  const a = atoms.find((x) => x.id === id);
  return NOMINAL_BOND_LENGTH * (a ? magnifiedOfAtom(a) : 1);
}
