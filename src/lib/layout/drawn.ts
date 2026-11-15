/**
 * The stereochemistry a drawing shows, as the layout reads it: the core's reader of a drawing (lib/chem/perception/stereo/from2d, where the
 * rules are said), with the layout's own part handed in - a cage drawn in perspective read against the solid the engine takes it to be
 * (`cageFits`) - and what a drawing in perspective needs to say it to a reader that knows only wedges (`wedgesForFlat`, placed as the engine
 * places wedges). Every name it had is here still, so no reader of it changes.
 */
import {
  fitLinear,
  inSmallRing,
  readStereo as readFrom2d,
  type CageFit,
  type DrawnAtom,
  type DrawnBond,
  type DrawnStereo,
  type Vec3,
} from "../chem/perception/stereo/from2d";
import type { Tetrahedral } from "../chem/perception/stereo/types";
import { solidOf } from "./cage";
import { key, perceive, type LayoutInput } from "./perceive";
import { symmetryOrbits } from "./canonical";
import { huckelBonds } from "../chem/huckel";
import { movingCN } from "../chem/stereoOpen";
import { placeStereo, type Stereo } from "./stereo";

export { IN_LINE, sameConfiguration, straightEnds, unreadWhy, unsureStereo } from "../chem/perception/stereo/from2d";
export type { DrawnAtom, DrawnBond, DrawnStereo };

/** The stereochemistry a drawing shows (lib/chem/perception/stereo/from2d `readStereo`), a cage in perspective read against its solid. */
export function readStereo(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): DrawnStereo {
  return readFrom2d(atoms, bonds, cageFits);
}

const sub3 = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot3 = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

/**
 * A cage drawn in perspective, as the solid it is drawn from (`CageFit`): for each atom of a ring system of four atoms or more, all with a
 * depth, the solid the engine takes it to be (cage.ts) and the map that takes it to where its atoms are drawn, fitted - as the engine may
 * draw a cage the way textbooks do rather than exactly as it is seen.
 */
function cageFits(
  atoms: readonly DrawnAtom[],
  bonds: readonly DrawnBond[],
  /** Centres the solid holds as they are read (`readStereo`). */
  held: ReadonlyMap<number, Tetrahedral> = new Map(),
): Map<number, CageFit> {
  const out = new Map<number, CageFit>();
  if (!atoms.some((a) => a.z != null)) return out;
  const mol = perceive({
    atoms: atoms.map((a, i) => ({ el: "C", hs: a.hs, ...(held.has(i) ? { tetra: held.get(i)! } : {}) })),
    bonds: bonds.map(({ a, b, order }) => ({ a, b, order })),
  });
  for (const sys of mol.systems) {
    if (sys.atoms.length < 4 || sys.atoms.some((a) => atoms[a].z == null)) continue;
    const solid = solidOf(mol, sys);
    const from = sys.atoms.map((a) => solid.get(a)!);
    const to = sys.atoms.map((a): Vec3 => [atoms[a].x, atoms[a].y, atoms[a].z!]);
    const map = fitLinear(from, to);
    if (!map) continue;
    // (the map is linear, the drawing's middle the solid's)
    const n = from.length;
    const mid = (ps: readonly Vec3[]): Vec3 => [0, 1, 2].map((k) => ps.reduce((s, p) => s + p[k], 0) / n) as Vec3;
    const [pf, pt] = [mid(from), mid(to)];
    const miss = from.reduce((s, p, i) => {
      const q = sub3(to[i], pt);
      const m = map(sub3(p, pf));
      return s + dot3(sub3(q, m), sub3(q, m));
    }, 0) / n;
    const fit = { solid, map, miss };
    for (const a of sys.atoms) out.set(a, fit);
  }
  return out;
}

/**
 * What a drawing that shows some of its stereochemistry in perspective
 * needs to say it to a reader that knows only wedges - a MOL file, RDKit,
 * another program: a wedge on a bond out of each centre the perspective
 * shows (and an H, where the centre has no other bond to put it on, drawn
 * where the engine would), read as flat. A centre with a wedge of its own
 * says it already. The drawing is left as it is.
 */
export function wedgesForFlat(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): Stereo {
  const { tetra } = readStereo(atoms, bonds);
  const wedged = new Set(bonds.flatMap((b) => (b.wedge ? [b.wedge.narrow] : [])));
  const shown = new Map([...tetra].filter(([c]) => atoms[c].z != null && !wedged.has(c)));
  if (!shown.size) return { wedges: [], hydrogens: [] };
  const mol = perceive({
    atoms: atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs })),
    bonds: bonds.map(({ a, b, order }) => ({ a, b, order })),
  });
  // (placed as the engine places them, at its bond length of 1)
  const lengths = bonds.map(({ a, b }) => Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y)).sort((p, q) => p - q);
  const k = lengths[lengths.length >> 1] || 1;
  const pos = new Map(atoms.map((a, i) => [i, { x: a.x / k, y: a.y / k }]));
  // (on a bond no other centre's wedge is on: two on one bond, one is lost)
  const taken = new Set(bonds.flatMap((b) => (b.wedge ? [key(b.a, b.b)] : [])));
  const { wedges, hydrogens } = placeStereo(mol, pos, shown, taken);
  return { wedges, hydrogens: hydrogens.map(({ on, at }) => ({ on, at: { x: at.x * k, y: at.y * k } })) };
}

/**
 * The double bonds of a structure that arrives with no drawing - a SMILES's, a name's, a file's with no places - that could have a cis or
 * trans and are given none, and how each is to be drawn so that it states none (Brecher 2006, ST-4.4; ST-6.2): where each end has one group,
 * each end kept STRAIGHT on from the bond (`straight`, by atom: the layout's `linear`); where an end has two, or the bond is in a ring (of
 * eight atoms or more: a ring atom cannot be kept straight on), a wavy bond on a group (`either`, by bond: the bond's "either", drawn as a
 * wavy bond on a single group, a ring's bond beside it - `layout2d` `unspecifiedDoubles`). Never bent as if stated. Which double bonds could
 * have one is the reader's own test (`readStereo`): a group on each end, not in a ring of seven atoms or fewer, not cumulated, not a bond of
 * a Hückel ring (an aromatic macrocycle's: `huckelBonds`), not a C=N whose E/Z is none of its own (`movingCN`: an amidine's) - and not an
 * end with two groups that are alike (`symmetryOrbits`), which has none either way. One given a configuration (`LayoutBond.stereo`) is left
 * as it is.
 */
export function openDoubleBonds(input: LayoutInput): { straight: number[]; either: number[] } {
  const n = input.atoms.length;
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  const order = new Map<string, number>();
  for (const b of input.bonds) {
    if (b.a === b.b || order.has(key(b.a, b.b))) continue;
    neighbours[b.a].push(b.b);
    neighbours[b.b].push(b.a);
    order.set(key(b.a, b.b), b.order);
  }
  const cumulated = (end: number, other: number) => neighbours[end].some((m) => m !== other && (order.get(key(end, m)) ?? 0) >= 2);
  let orbits: number[] | null = null;
  let huckel: Set<string> | null = null;
  let moving: Map<number, unknown> | null = null;
  const alike = (p: number, q: number) => (orbits ??= symmetryOrbits(input).orbit)[p] === orbits[q];
  const straight = new Set<number>();
  const either: number[] = [];
  input.bonds.forEach((b, i) => {
    if (b.order !== 2 || b.stereo) return;
    const groups = (end: number, other: number) => neighbours[end].filter((m) => m !== other);
    const [ga, gb] = [groups(b.a, b.b), groups(b.b, b.a)];
    if (!ga.length || !gb.length || ga.length > 2 || gb.length > 2) return;
    if (inSmallRing(neighbours, b.a, b.b) || cumulated(b.a, b.b) || cumulated(b.b, b.a)) return;
    // (a bond of a Hückel ring - an aromatic macrocycle's, a porphyrin's - has no cis or trans: its Kekulé form is only one way of writing it)
    if ((huckel ??= huckelBonds(n, input.bonds)).has(key(b.a, b.b))) return;
    if ((moving ??= movingCN(input.atoms, input.bonds)).has(i)) return;
    if ((ga.length === 2 && alike(ga[0], ga[1])) || (gb.length === 2 && alike(gb[0], gb[1]))) return;
    if (ga.length === 1 && gb.length === 1 && !inRing(neighbours, b.a, b.b)) {
      straight.add(b.a);
      straight.add(b.b);
    } else either.push(i);
  });
  return { straight: [...straight], either };
}

/** Whether the bond i-j is in a ring: j reached from i some other way. */
function inRing(neighbours: readonly number[][], i: number, j: number): boolean {
  const seen = new Set([i]);
  const queue = neighbours[i].filter((n) => n !== j);
  queue.forEach((n) => seen.add(n));
  for (let h = 0; h < queue.length; h++) {
    if (queue[h] === j) return true;
    for (const m of neighbours[queue[h]]) {
      if (seen.has(m)) continue;
      seen.add(m);
      queue.push(m);
    }
  }
  return false;
}
