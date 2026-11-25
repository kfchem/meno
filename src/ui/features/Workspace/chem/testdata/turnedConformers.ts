/**
 * Made-up conformers for the tests of a search that goes on (pageConformers,
 * growing, the store's growing3d): places set by hand, so that what the page
 * must show of them can be said by hand.
 */
import type { Conformers } from "../../../../../lib/roles/client";

const rad = (d: number) => (d * Math.PI) / 180;

/** Chloroethane: C0 the methyl's carbon, C1, Cl2, H3-H5 on C0, H6 and H7 on C1. */
export const CHLOROETHANE: Pick<Conformers, "atoms" | "bonds"> = {
  atoms: ["C", "C", "Cl", "H", "H", "H", "H", "H"].map((el) => ({ el, charge: 0 })),
  bonds: [
    [0, 1],
    [1, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 6],
    [1, 7],
  ].map(([a1, a2]) => ({ a1, a2, order: 1 as const })),
};

/** Chloroethane with its methyl's three hydrogens, H3, H4 and H5 in turn, at `phis` degrees about the C-C bond (along x). */
export const chloroethane = (phis: readonly [number, number, number]): number[] => [
  0, 0, 0,
  1.53, 0, 0,
  2.124, 1.678, 0,
  ...phis.flatMap((p) => [-0.36, 1.03 * Math.cos(rad(p)), 1.03 * Math.sin(rad(p))]),
  1.89, -0.51, 0.89,
  1.89, -0.51, -0.89,
];

/** 2-Chloropropane's heavy atoms and its one hydrogen: C0 in the middle, its methyls C1 and C2, Cl3, H4. */
export const CHLOROPROPANE: Pick<Conformers, "atoms" | "bonds"> = {
  atoms: ["C", "C", "C", "Cl", "H"].map((el) => ({ el, charge: 0 })),
  bonds: [1, 2, 3, 4].map((a2) => ({ a1: 0, a2, order: 1 as const })),
};

/** 2-Chloropropane about C0 as a tetrahedron: its methyls at `methyls` in turn (two of the corners `C1` and `C2`), Cl up z, H at the fourth corner. */
export const chloropropane = (methyls: readonly ["C1" | "C2", "C1" | "C2"]): number[] => {
  const corner = { C1: [0.943, 0, -0.333], C2: [-0.471, 0.816, -0.333] };
  return [0, 0, 0, ...methyls.flatMap((m) => corner[m].map((v) => 1.53 * v)), 0, 0, 1.79, ...[-0.471, -0.816, -0.333].map((v) => 1.09 * v)];
};

/** A round of a search: `of`'s atoms in `frames`, their energies `energies` (hartree), as a search gives them. */
export const roundOf = (of: Pick<Conformers, "atoms" | "bonds">, frames: number[][], energies: number[]): Conformers =>
  ({ ...of, frames, energies, field: "MMFF94", cip: { atoms: {}, bonds: {} }, how: [] }) as unknown as Conformers;
