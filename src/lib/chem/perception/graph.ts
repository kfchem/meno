/**
 * The graph the core reads (foundation part 1, design 3.2): atoms, bonds between them, and a configuration riding on it as given - a
 * centre's, a double bond's, an axis's - until it is stored apart. It is the layout's input without what is an instruction to the layout.
 * The layout and the other readers name it again for themselves (`LayoutAtom` is a `ChemAtom` with its `linear`); structurally they are one.
 */
import type { Axial, CisTrans, Tetrahedral } from "./stereo/types";

export type ChemAtom = {
  el: string;
  charge?: number;
  hs?: number;
  /** Its configuration, where it is a stereocentre. */
  tetra?: Tetrahedral;
  /**
   * For a star ("*") at the centre of a pi system bound to a metal through
   * all its atoms (a haptic bond): the system's atoms.
   */
  pi?: readonly number[];
};

/** A bond between two atoms, by index, of an order - 4 is an aromatic bond, made only by the aromatic forms - and, a double bond, its configuration. */
export type ChemBond = { a: number; b: number; order: number; stereo?: CisTrans };

export type ChemGraph = {
  atoms: readonly ChemAtom[];
  bonds: readonly ChemBond[];
  /** Its axes of chirality (BINAP's, an allene's), a biaryl's shown by a wedge. */
  axes?: readonly Axial[];
};
