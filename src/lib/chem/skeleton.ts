/**
 * Skeletons: molecules in 3D whose hydrogens are not there (docs/WORKSPACE.md,
 * *Hydrogens and bond orders*). A file of coordinates - an X-ray entry, an
 * XYZ file of heavy atoms - gives a molecule's skeleton, not the molecule:
 * how its atoms are protonated, and so its charge and spin, are not in it.
 * A structure without hydrogens is not treated as a molecule (the
 * maintainer, 2026-10-21): it is not given a charge or a spin, a
 * calculation is not run on it, and it is not drawn as a formula, until
 * its hydrogens are added - or the chemist says it is whole without any.
 *
 * Meno's one rule for whether some atoms are a skeleton. Pure: over atoms
 * and bonds.
 */
import { implicitHydrogens, type Radical } from "./molecule";
import { ordersFromGeometry } from "./ordersFromGeometry";

export type SkeletonAtom = { el: string; x: number; y: number; z: number; charge?: number; radical?: Radical };
export type SkeletonBond = { a1: number; a2: number; order: number };

/**
 * Why `count` molecules without their hydrogens are not taken further, as
 * every step and writer that needs whole molecules says it - and what to
 * do: their hydrogens added, the chemist choosing how each is protonated,
 * or one that has none marked whole without any.
 */
export function skeletonWhy(count = 1): string {
  return count === 1
    ? "This molecule has no hydrogens, so its charge and spin are not known. Add its hydrogens, choosing how it is protonated - or, if it has none, mark it complete without hydrogens."
    : `${count.toLocaleString("en")} of these molecules have no hydrogens, so their charge and spin are not known. Add their hydrogens, choosing how each is protonated - or, where one has none, mark it complete without hydrogens.`;
}

/** Two of a carbon's neighbours further round it than this, in degrees, stand in a line with it. */
const IN_A_LINE = 165;
/**
 * Three of its neighbours whose angles at it come to this, in degrees, or
 * more leave it no room for a hydrogen: halfway between a tetrahedron's
 * corner (328.4, three angles of 109.47) and C60's carbons (348: a
 * pentagon's 108 and two hexagons' 120 - a truncated icosahedron's faces
 * are flat) - a carbon with no hydrogen of its own that is not flat.
 */
const IN_A_PLANE = 338;
/** The end of a triple bond from a carbon to oxygen or nitrogen, in ångströms, at most: carbon monoxide's 1.13, an isocyanide's 1.17 (a C=O or C=N is 1.2 or more). */
const TRIPLE_END = 1.18;

/**
 * Whether a carbon, its bond orders unknown, would carry hydrogens, by
 * where its neighbours stand (`near`): with none, or one - but for the end
 * of a C≡O or C≡N, carbon monoxide's or an isocyanide's; two, not in a
 * line; three, short of `IN_A_PLANE`. With four, two in a line (carbon
 * dioxide, a nitrile, a metal's carbonyl, an alkyne's middle) or three
 * about it (C60, a ring carbon with no hydrogen of its own) it has room for
 * none.
 */
function wantsHydrogens(atoms: readonly SkeletonAtom[], i: number, near: readonly number[]): boolean {
  const c = atoms[i];
  const way = (j: number) => [atoms[j].x - c.x, atoms[j].y - c.y, atoms[j].z - c.z];
  const angle = (j: number, k: number) => {
    const [u, v] = [way(j), way(k)];
    const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    return (Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(...u) * Math.hypot(...v))))) * 180) / Math.PI;
  };
  if (near.length === 0) return true;
  if (near.length === 1) {
    const o = atoms[near[0]];
    return !((o.el === "O" || o.el === "N") && Math.hypot(...way(near[0])) <= TRIPLE_END);
  }
  if (near.length === 2) return angle(near[0], near[1]) < IN_A_LINE;
  if (near.length === 3) return angle(near[0], near[1]) + angle(near[0], near[2]) + angle(near[1], near[2]) < IN_A_PLANE;
  return false;
}

/** Whether atoms with their bonds' orders summed (`sum`) take hydrogens their valence leaves room for. */
const roomFor = (atoms: readonly SkeletonAtom[], among: readonly number[], sum: ArrayLike<number>, charges?: readonly number[]) =>
  among.some((i) => implicitHydrogens(atoms[i].el, Math.round(sum[i]), charges ? charges[i] : (atoms[i].charge ?? 0), atoms[i].radical) > 0);

/**
 * Whether some atoms of a molecule (`among`; all, unset) are a skeleton:
 * none of them is a hydrogen, and some of them would carry hydrogens. With
 * their bonds' orders known, an atom whose valence leaves room for some
 * does. With them unknown (`ordersUnknown`: a file of coordinates), a
 * carbon whose neighbours leave room (`wantsHydrogens`) does; and where no
 * carbon says so but another atom could carry some - an oxygen with one
 * bond, a nitrogen with two - the orders are estimated from where the atoms
 * stand (./ordersFromGeometry) and an atom they leave room on does - a
 * carboxylate's oxygen, an amine's nitrogen. Where they cannot be
 * estimated, it cannot be told that none is missing: a skeleton. Carbon
 * dioxide, sulfur hexafluoride, carbon tetrachloride, C60 and a metal's
 * carbonyls are whole without any.
 */
export function lacksHydrogens(
  atoms: readonly SkeletonAtom[],
  bonds: readonly SkeletonBond[],
  ordersUnknown: boolean,
  among: readonly number[] = atoms.map((_, i) => i),
): boolean {
  if (!among.length || among.some((i) => atoms[i].el === "H")) return false;
  if (!ordersUnknown) {
    const sum = new Float64Array(atoms.length);
    for (const b of bonds) {
      const order = b.order === 4 ? 1.5 : b.order >= 1 && b.order <= 3 ? b.order : 0;
      sum[b.a1] += order;
      sum[b.a2] += order;
    }
    return roomFor(atoms, among, sum);
  }
  const near: number[][] = atoms.map(() => []);
  for (const b of bonds) {
    near[b.a1]?.push(b.a2);
    near[b.a2]?.push(b.a1);
  }
  if (among.some((i) => atoms[i].el === "C" && wantsHydrogens(atoms, i, near[i]))) return true;
  // (no carbon says so, and no other atom could carry one whatever its orders - each bond single, its valence met: C60, CCl4, SF6)
  if (!among.some((i) => atoms[i].el !== "C" && implicitHydrogens(atoms[i].el, near[i].length, atoms[i].charge ?? 0, atoms[i].radical) > 0)) return false;
  // (else its orders as its shape gives them, and what they leave room for - on these atoms, and the bonds among them)
  const inside = new Map(among.map((i, k) => [i, k]));
  const part = among.map((i) => atoms[i]);
  const within = bonds.flatMap((b) => (inside.has(b.a1) && inside.has(b.a2) ? [{ a1: inside.get(b.a1)!, a2: inside.get(b.a2)! }] : []));
  const estimate = ordersFromGeometry(part, within);
  if (!estimate.decided) return true;
  // (each atom's bonds summed: those among these atoms as estimated, those to others - a metal's - single)
  const sum = new Float64Array(part.length);
  within.forEach((b, k) => {
    sum[b.a1] += estimate.orders[k];
    sum[b.a2] += estimate.orders[k];
  });
  for (const b of bonds) {
    if (inside.has(b.a1) !== inside.has(b.a2)) sum[inside.get(b.a1) ?? inside.get(b.a2)!] += 1;
  }
  // (its carbons told by their shape above - a metal's carbonyl's is no C=O the estimate knows: its other atoms by what is left them)
  return roomFor(part, part.flatMap((a, k) => (a.el === "C" ? [] : [k])), sum, part.map((a, k) => a.charge || estimate.charges[k]));
}
