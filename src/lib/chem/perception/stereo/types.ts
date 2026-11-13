/**
 * What a configuration is, as the core says it: the types for a stereocentre, a double bond and an axis, one definition each (foundation
 * part 1). Types only: nothing here is worked out. The layout (`lib/layout/stereo`, `lib/layout/perceive`) names them again
 * where it uses them.
 */

/**
 * A stereocentre's configuration: its neighbours in order (-1 for an implicit H, last) and the sign of the volume the first three span,
 * seen from the centre.
 */
export type Tetrahedral = {
  /** Neighbours in order; -1 for an implicit H, last. */
  neighbours: readonly number[];
  /** The sign of the volume the first three span, seen from the centre. */
  volume: 1 | -1;
};

/** A double bond's configuration: an atom on each end, each bonded to its end, and whether those two are on the same side. */
export type CisTrans = {
  /** An atom on each end of the double bond, each bonded to its end. */
  refs: readonly [number, number];
  /** Whether those two are on the same side. */
  cis: boolean;
};

/**
 * An axis of chirality: the single bond between `atoms`, each end with two
 * other neighbours (a biaryl's - BINAP's C1-C1'), or an allene's two ends,
 * not bonded to each other (an even run of cumulated double bonds, its
 * ends each with two other neighbours, C=C=C, C=C=C=C=C); and how the two
 * `refs`, one bonded to each end, are turned about it: the sign of the
 * torsion refs[0]-atoms[0]-atoms[1]-refs[1] (IUPAC's: + where, looking
 * along the axis, the near one turns clockwise onto the far one). Drawn
 * flat, a biaryl's is shown by a wedge on a bond out of an end of it,
 * narrow there, to the neighbour that stands out of the page, the other
 * end's neighbours in it - as an atropisomer's wedge is read.
 */
export type Axial = { atoms: readonly [number, number]; refs: readonly [number, number]; sense: 1 | -1 };

/**
 * An odd run of cumulated double bonds' cis or trans (a butatriene's,
 * C=C=C=C): its two ends, `atoms`, not bonded to each other, each with two
 * other neighbours, all of them in one plane; an atom bonded to each end
 * (`refs`, the first to `atoms[0]`), and whether the two are on the same
 * side.
 */
export type Cumulated = { atoms: readonly [number, number]; refs: readonly [number, number]; cis: boolean };
