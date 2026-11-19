/**
 * The C=N double bonds whose E/Z is no configuration of their own, with why (foundation part 13, C: a bond that is never a unit, by what
 * it is, not by what is alike round it - moved here from lib/chem/stereoOpen, which re-exports it, unchanged but for its count of
 * hydrogens, the core's one count, ../hydrogens `hydrogenCounts`).
 */
import { flatRingAtoms } from "../flatRings";
import { hydrogenCounts } from "../hydrogens";
import { smallestRings } from "../rings";

/** An atom as the rule reads it: its element and charge, and its hydrogens where they are given (else by its valence). */
export type MovingAtom = { el: string; charge?: number; hs?: number };
/** A bond as the rule reads it: its atoms and order (4 aromatic). */
export type MovingBond = { a: number; b: number; order: number };

/**
 * Why a C=N's E/Z is no configuration of its own (`movingCN`), as the InChI
 * Technical Manual (v1.04, 2011) takes such bonds.
 */
export const MOVING_CN = {
  shift: "its double bond moves with a hydrogen on an N, O or S beside it (an amidine, a guanidine, an imidic acid)",
  nh: "its N carries a hydrogen",
  cation: "an amidinium or guanidinium bond, shared with the N beside it",
} as const;
export type MovingWhy = keyof typeof MOVING_CN;

/** Each atom's hydrogens: those given, or those its valence leaves (the one count), and the hydrogen atoms bonded to it. */
function hydrogensWithAtoms(atoms: readonly MovingAtom[], bonds: readonly MovingBond[]): number[] {
  const explicit = atoms.map(() => 0);
  for (const b of bonds) {
    if (atoms[b.a]?.el === "H") explicit[b.b]++;
    if (atoms[b.b]?.el === "H") explicit[b.a]++;
  }
  return hydrogenCounts(atoms, bonds).map((n, i) => n + explicit[i]);
}

/**
 * The C=N double bonds whose E/Z is no configuration of their own, by bond
 * index, each with why (`MOVING_CN`): never enumerated, never chosen, nor
 * counted as left open (docs/WORKFLOWS.md, *C=N double bonds whose E/Z is
 * none of their own*). As the InChI Technical Manual (v1.04, 2011) takes
 * them: a hydrogen on an N, O or S bonded to the C=N's carbon moves to its
 * N, and the double bond with it - the 1,3-shift of its mobile H (IV.b,
 * Table 6), a bond it presumes rotatable (Appendix 5b) - an amidine's, a
 * guanidine's, an N-acyl amidine's, an imidic acid's. And a C=N whose N
 * bears a hydrogen, and an amidinium or guanidinium C=N+, its double bond
 * shared with an amino N beside it, one in no ring held flat. An imine
 * whose N bears a carbon, an oxime and a hydrazone keep theirs. A C=N in a
 * ring held flat (lib/chem/conformersSought `flatRingAtoms`: a pyridine's,
 * an imidazole's) is no double bond of its own.
 */
export function movingCN(atoms: readonly MovingAtom[], bonds: readonly MovingBond[]): Map<number, MovingWhy> {
  const hs = hydrogensWithAtoms(atoms, bonds);
  const around: number[][] = atoms.map(() => []);
  for (const b of bonds) {
    around[b.a]?.push(b.b);
    around[b.b]?.push(b.a);
  }
  const rings = smallestRings(atoms.length, bonds.map((b) => [b.a, b.b] as const));
  const flat = flatRingAtoms(atoms, bonds, rings);
  const inFlatRing = (x: number, y: number) => rings.some((r) => r.includes(x) && r.includes(y) && r.every((k) => flat.has(k)));
  const out = new Map<number, MovingWhy>();
  bonds.forEach((b, k) => {
    if (b.order !== 2) return;
    const [x, y] = [atoms[b.a], atoms[b.b]];
    if (!x || !y || [x.el, y.el].sort().join() !== "C,N" || inFlatRing(b.a, b.b)) return;
    const [c, n] = x.el === "C" ? [b.a, b.b] : [b.b, b.a];
    const others = around[c].filter((j) => j !== n);
    if (others.some((j) => ["N", "O", "S"].includes(atoms[j].el) && hs[j] > 0)) out.set(k, "shift");
    else if (hs[n] > 0) out.set(k, "nh");
    else if ((atoms[n].charge ?? 0) > 0 && others.some((j) => atoms[j].el === "N" && !(atoms[j].charge ?? 0) && !flat.has(j))) out.set(k, "cation");
  });
  return out;
}
