/**
 * What the layout engine needs to know about a molecule before it places
 * anything: who is bonded to whom, the rings, and the ring systems - rings
 * sharing an atom or more, laid out together as one piece.
 */
import { smallestRings } from "./rings";
import type { Axial, Tetrahedral } from "./stereo";

export type CisTrans = {
  /** An atom on each end of the double bond, each bonded to its end. */
  refs: readonly [number, number];
  /** Whether those two are on the same side. */
  cis: boolean;
};

export type LayoutAtom = {
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
export type LayoutBond = { a: number; b: number; order: number; stereo?: CisTrans };
export type LayoutInput = {
  atoms: readonly LayoutAtom[];
  bonds: readonly LayoutBond[];
  /** Its axes of chirality (BINAP's), each shown by a wedge (stereo.ts). */
  axes?: readonly Axial[];
};

export type RingSystem = {
  /** Its atoms, in no particular order. */
  atoms: number[];
  /** Indices into `Molecule.rings`. */
  rings: number[];
};

export type Molecule = {
  n: number;
  el: string[];
  hs: number[];
  charge: number[];
  bonds: readonly LayoutBond[];
  neighbours: number[][];
  /** The bond between two atoms, by `key(a, b)`. */
  bondIndex: Map<string, number>;
  rings: number[][];
  /** For each atom, the rings it is in. */
  ringsOf: number[][];
  systems: RingSystem[];
  /** For each atom, its ring system, or -1. */
  systemOf: number[];
  /** Bonds in a ring, by `key`. */
  ringBonds: Set<string>;
  /** Connected pieces (a salt's ions), as atom lists. */
  pieces: number[][];
  /** Each stereocentre's configuration, as given. */
  tetra: Map<number, Tetrahedral>;
  /**
   * The rings bound face-on to a metal through all their atoms (η⁵-Cp,
   * η⁶-arene): each one's star - at its centre, a member of its ring
   * system - its ring in order round, and its metal (-1 for none).
   */
  eta: EtaRing[];
  /**
   * The metals in no ring with rings bound face-on, each with them as one
   * system (a sandwich, a half-sandwich): drawn as one, the metal at its
   * middle.
   */
  units: MetalUnit[];
  /**
   * The rings bound to a metal through two C=C of their own (cod's), each
   * drawn as the tub it is (section 7): its ring in order round, its two
   * stars, its metal.
   */
  dienes: DieneRing[];
  /**
   * The pi systems bound to a metal that make no ring - an alkene's C=C,
   * an allyl's three atoms - by their stars: the atom the star is bonded
   * to first (an allyl's middle one), then the rest.
   */
  open?: Map<number, number[]>;
  /**
   * Each atom's neighbours and, for a ring bound face-on and its star, each
   * other: what is moved with an atom - a side of a bond, a branch - goes
   * through a metal to its rings and on.
   */
  linked: number[][];
};

/** A ring bound face-on to a metal through all its atoms, as `Molecule.eta` has it. */
export type EtaRing = {
  star: number;
  ring: number[];
  metal: number;
  /** The atoms of its own ring system, and its star. */
  atoms: number[];
  /** The system it is drawn in: its own, or its metal's unit's. */
  system: number;
};

/**
 * A ring of its own (no other ring sharing its atoms) bound to one metal
 * through two of its C=C, each by a star at it: 1,5-cyclooctadiene's, as
 * `Molecule.dienes` has it.
 */
export type DieneRing = {
  metal: number;
  /** The ring, in order round it. */
  ring: number[];
  /** The stars, each with its C=C. */
  stars: { star: number; pi: [number, number] }[];
  /** The ring's atoms and its stars. */
  atoms: number[];
  /** The system it is drawn in: its metal's unit's. */
  system: number;
};

/**
 * A metal and the rings bound face-on to it - or by two C=C each - drawn as
 * one system. Or two metals bridged by two atoms ([Rh(cod)Cl]2's chlorides),
 * their four-membered ring and each one's rings: `metal` the first, `pair`
 * the second and the bridging atoms. Or six metals in contact as an
 * octahedron (Stryker's reagent's Cu6), `cluster` its corners - `metal`
 * the first - and the atoms bridging its edges.
 */
export type MetalUnit = {
  metal: number;
  eta: EtaRing[];
  dienes: DieneRing[];
  system: number;
  pair?: { metal: number; bridges: [number, number] };
  /** (`up`: which way is up as the cluster is seen, from the metals below its middle to those above - set when it is laid out) */
  cluster?: { metals: number[]; bridges: number[]; up?: { from: number[]; to: number[] } };
};

export const key = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

export function perceive(input: LayoutInput): Molecule {
  const n = input.atoms.length;
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  const bondIndex = new Map<string, number>();
  const bonds: LayoutBond[] = [...input.bonds];
  const join = (a: number, b: number, i: number) => {
    if (a === b || bondIndex.has(key(a, b))) return;
    neighbours[a].push(b);
    neighbours[b].push(a);
    bondIndex.set(key(a, b), i);
  };
  input.bonds.forEach(({ a, b }, i) => join(a, b, i));
  // A ring of its own bound to a metal by stars at two of its C=C, and by
  // nothing else of its pi systems (cod on Ni, Rh, Ir): drawn as a tub, the
  // stars at those C=C - no bond of theirs into the ring, which would make a
  // ring through the metal of it
  const dienesFound = dieneRings(input, neighbours);
  const ofDiene = new Map(dienesFound.flatMap((d) => d.stars.map((s) => [s.star, s.pi] as const)));
  // A star's pi system: a ring of it (Cp, an arene) is drawn round it, the
  // star a member of the ring's system; any other (an alkene's C=C, an
  // allyl) hangs from it by a bond to one of its atoms - an allyl's middle
  // one, bonded to both the others - as a chain would (`open`)
  const ringOfPi = new Map<number, number[]>();
  const open = new Map<number, number[]>();
  input.atoms.forEach((a, star) => {
    if (!a.pi || a.pi.length < 2 || ofDiene.has(star)) return;
    const cycle = cycleOf(a.pi, neighbours);
    if (cycle) ringOfPi.set(star, cycle);
    else {
      const pi = a.pi;
      const middle = pi.length === 3 ? pi.find((p) => pi.every((q) => q === p || neighbours[p].includes(q))) : undefined;
      const first = middle ?? pi[0];
      open.set(star, [first, ...pi.filter((p) => p !== first)]);
      bonds.push({ a: star, b: first, order: 1 });
      join(star, first, bonds.length - 1);
    }
  });
  const edges = [...bondIndex.keys()].map((k) => k.split(",").map(Number) as [number, number]);
  const rings = smallestRings(n, edges);
  const ringsOf: number[][] = Array.from({ length: n }, () => []);
  rings.forEach((r, i) => r.forEach((a) => ringsOf[a].push(i)));
  const ringBonds = new Set<string>();
  for (const r of rings) r.forEach((a, i) => ringBonds.add(key(a, r[(i + 1) % r.length])));

  // ring systems: rings sharing an atom, merged
  const systemOf = new Array<number>(n).fill(-1);
  const groupOf = rings.map((_, i) => i);
  const find = (i: number): number => (groupOf[i] === i ? i : (groupOf[i] = find(groupOf[i])));
  for (let a = 0; a < n; a++) {
    const rs = ringsOf[a];
    for (let i = 1; i < rs.length; i++) groupOf[find(rs[i])] = find(rs[0]);
  }
  const byGroup = new Map<number, RingSystem>();
  rings.forEach((r, i) => {
    const g = find(i);
    const sys = byGroup.get(g) ?? { atoms: [], rings: [] };
    sys.rings.push(i);
    for (const a of r) if (!sys.atoms.includes(a)) sys.atoms.push(a);
    byGroup.set(g, sys);
  });
  const systems = [...byGroup.values()];
  systems.forEach((s, i) => s.atoms.forEach((a) => (systemOf[a] = i)));
  // each ring bound face-on joined by its star, at its centre
  const eta: EtaRing[] = [];
  for (const [star, ring] of ringOfPi) {
    const system = systemOf[ring[0]];
    if (system < 0 || systemOf[star] >= 0) continue;
    systems[system].atoms.push(star);
    systemOf[star] = system;
    const metal = neighbours[star].find((m) => isMetal(input.atoms[m].el)) ?? -1;
    eta.push({ star, ring, metal, atoms: systems[system].atoms, system });
  }
  // each ring bound by two C=C, its stars joined to its system
  const dienes: DieneRing[] = [];
  for (const d of dienesFound) {
    const system = systemOf[d.ring[0]];
    if (system < 0 || d.stars.some((s) => systemOf[s.star] >= 0)) continue;
    for (const s of d.stars) {
      systems[system].atoms.push(s.star);
      systemOf[s.star] = system;
    }
    dienes.push({ ...d, atoms: systems[system].atoms, system });
  }
  // and a metal in no ring with its rings bound face-on, or by two C=C:
  // one system; two metals bridged by two atoms, a ring of the four and
  // nothing else, the same with each one's rings
  const units: MetalUnit[] = [];
  systems.forEach((sys, i) => {
    if (sys.rings.length !== 1 || sys.atoms.length !== 4) return;
    const r = rings[sys.rings[0]];
    // (a main-group metal bridged to one - the Tebbe reagent's aluminium -
    // as much as a second of them)
    const metal = (a: number) => isMetal(input.atoms[a].el) || BRIDGED_TO.has(input.atoms[a].el);
    const k = metal(r[0]) && metal(r[2]) ? 0 : 1;
    if (!metal(r[k]) || !metal(r[k + 2]) || metal(r[k + 1]) || metal(r[(k + 3) % 4])) return;
    if (!isMetal(input.atoms[r[k]].el) && !isMetal(input.atoms[r[k + 2]].el)) return;
    // (the transition metal first)
    const [m1, m2] = isMetal(input.atoms[r[k]].el) ? [r[k], r[k + 2]] : [r[k + 2], r[k]];
    const own = eta.filter((e) => e.metal === m1 || e.metal === m2);
    const tubs = dienes.filter((d) => d.metal === m1 || d.metal === m2);
    const parts = [...own, ...tubs];
    const merged = { atoms: [...r, ...parts.flatMap((e) => e.atoms)], rings: [...sys.rings, ...parts.flatMap((e) => systems[e.system].rings)] };
    const index = systems.length;
    systems.push(merged);
    systems[i] = { atoms: [], rings: [] };
    for (const e of parts) {
      systems[e.system] = { atoms: [], rings: [] };
      e.system = index;
    }
    for (const a of merged.atoms) systemOf[a] = index;
    units.push({ metal: m1, eta: own, dienes: tubs, system: index, pair: { metal: m2, bridges: [r[k + 1], r[(k + 3) % 4]] } });
  });
  // six metals each in contact with four of the others - an octahedron -
  // and atoms each bridging two of them, nothing else in their system
  systems.forEach((sys, i) => {
    const metals = sys.atoms.filter((a) => isMetal(input.atoms[a].el));
    if (metals.length !== 6) return;
    const inSys = new Set(sys.atoms);
    const corners = metals.every((m) => neighbours[m].filter((b) => metals.includes(b)).length === 4);
    const bridges = sys.atoms.filter((a) => !metals.includes(a));
    const bridging = bridges.every((b) => neighbours[b].filter((x) => inSys.has(x)).every((x) => metals.includes(x)));
    if (!corners || !bridging) return;
    units.push({ metal: metals[0], eta: [], dienes: [], system: i, cluster: { metals, bridges } });
  });
  for (let m = 0; m < n; m++) {
    const own = eta.filter((e) => e.metal === m);
    const tubs = dienes.filter((d) => d.metal === m);
    if ((!own.length && !tubs.length) || systemOf[m] >= 0 || !isMetal(input.atoms[m].el)) continue;
    const parts = [...own, ...tubs];
    const merged = { atoms: [m, ...parts.flatMap((e) => e.atoms)], rings: parts.flatMap((e) => systems[e.system].rings) };
    const index = systems.length;
    systems.push(merged);
    for (const e of parts) {
      systems[e.system] = { atoms: [], rings: [] };
      e.system = index;
    }
    for (const a of merged.atoms) systemOf[a] = index;
    units.push({ metal: m, eta: own, dienes: tubs, system: index });
  }
  // (the systems a unit took in, emptied, are left out)
  const kept = systems.map((sys, i) => (sys.atoms.length ? i : -1)).filter((i) => i >= 0);
  const renumber = new Map(kept.map((old, i) => [old, i]));
  systems.splice(0, systems.length, ...kept.map((i) => systems[i]));
  for (let a = 0; a < n; a++) if (systemOf[a] >= 0) systemOf[a] = renumber.get(systemOf[a])!;
  for (const e of eta) e.system = renumber.get(e.system)!;
  for (const d of dienes) d.system = renumber.get(d.system)!;
  for (const u of units) u.system = renumber.get(u.system)!;

  const pieces: number[][] = [];
  const seen = new Array<boolean>(n).fill(false);
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const piece = [s];
    seen[s] = true;
    for (let h = 0; h < piece.length; h++) {
      // (a ring bound face-on is the same piece as its star)
      const u = piece[h];
      const near = [
        ...neighbours[u],
        ...(ringOfPi.get(u) ?? []),
        ...eta.filter((e) => e.ring.includes(u)).map((e) => e.star),
        ...(ofDiene.get(u) ?? []),
        ...[...ofDiene].filter(([, pi]) => pi.includes(u)).map(([star]) => star),
      ];
      for (const b of near) {
        if (!seen[b]) {
          seen[b] = true;
          piece.push(b);
        }
      }
    }
    pieces.push(piece);
  }

  return {
    n,
    el: input.atoms.map((a) => a.el),
    hs: input.atoms.map((a) => a.hs ?? 0),
    charge: input.atoms.map((a) => a.charge ?? 0),
    bonds,
    neighbours,
    bondIndex,
    rings,
    ringsOf,
    systems,
    systemOf,
    ringBonds,
    pieces,
    tetra: new Map(
      input.atoms.flatMap((a, i): [number, Tetrahedral][] => (a.tetra ? [[i, a.tetra]] : [])),
    ),
    eta,
    units,
    dienes,
    open,
    linked: neighbours.map((nb, a) => [
      ...nb,
      ...(ringOfPi.get(a) ?? []),
      ...eta.filter((e) => e.ring.includes(a)).map((e) => e.star),
      ...(ofDiene.get(a) ?? []),
      ...[...ofDiene].filter(([, pi]) => pi.includes(a)).map(([star]) => star),
    ]),
  };
}

/**
 * How long a bond between a metal and a ligand's atom is drawn, in bond
 * lengths: longer, as it is (Pd-P 2.3 Å against C-C 1.5 Å), so that the
 * ligands round a metal have room (docs/LAYOUT-2D.md, section 7).
 */
export const METAL_BOND = 1.4;

/**
 * The metals: the d block and the lanthanides, as a complex's formula has
 * them (chem/ligands) - Pr aside, being propyl's label as well.
 */
const METALS = new Set(
  "Sc Ti V Cr Mn Fe Co Ni Cu Zn Y Zr Nb Mo Tc Ru Rh Pd Ag Cd Hf Ta W Re Os Ir Pt Au Hg La Ce Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu".split(" "),
);

/** Main-group metals bridged to a transition metal by two atoms as a second one is (Cp2Ti(μ-Cl)(μ-CH2)AlMe2). */
const BRIDGED_TO = new Set(["Li", "Na", "K", "Mg", "Ca", "Zn", "Al", "Ga", "In"]);

/** Whether an atom is a metal's: one ligands are drawn round (docs/LAYOUT-2D.md, section 7). */
/**
 * The rings a drawing binds to a metal atom by atom - a bond from the
 * metal to each of the ring's atoms, as ferrocene or bis(benzene)chromium
 * is drawn by hand, with no haptic bond to draw - each with its metal, its
 * atoms and those bonds (by index). Such a ring is bound face-on and is
 * laid out so, as a haptic bond's ring is (the maintainer, 2026-10-13):
 * laid out as drawn, every bond to the metal a ring of three, it was a
 * tangle.
 */
export function ringsBondedAtomByAtom(input: LayoutInput): { metal: number; ring: number[]; bonds: number[] }[] {
  const toMetal = new Map<number, Map<number, number>>();
  input.bonds.forEach((b, i) => {
    for (const [m, x] of [
      [b.a, b.b],
      [b.b, b.a],
    ]) {
      if (!isMetal(input.atoms[m]?.el ?? "") || isMetal(input.atoms[x]?.el ?? "")) continue;
      if (!toMetal.has(m)) toMetal.set(m, new Map());
      toMetal.get(m)!.set(x, i);
    }
  });
  const out: { metal: number; ring: number[]; bonds: number[] }[] = [];
  for (const [metal, around] of toMetal) {
    if (around.size < 3) continue;
    // (the rings among the atoms bonded to it, the metal left out)
    const local = [...around.keys()];
    const at = new Map(local.map((a, k) => [a, k]));
    const edges = input.bonds.flatMap((b): [number, number][] => (at.has(b.a) && at.has(b.b) ? [[at.get(b.a)!, at.get(b.b)!]] : []));
    for (const r of smallestRings(local.length, edges)) {
      if (r.length < 3 || r.length > 8) continue;
      const ring = r.map((k) => local[k]);
      out.push({ metal, ring, bonds: ring.map((a) => around.get(a)!) });
    }
  }
  return out;
}

export function isMetal(el: string): boolean {
  return METALS.has(el);
}

/**
 * The atoms of a pi system in order round, where they make a ring by
 * their own bonds (Cp, an arene), or null (an alkene's two, an allyl's
 * three).
 */
/**
 * The rings bound to a metal through two C=C of their own, as stars at them
 * (`LayoutAtom.pi`, two atoms each, bonded): rings of their own, sharing no
 * atom with another ring, whose metal has no ring bound face-on.
 */
function dieneRings(input: LayoutInput, neighbours: number[][]): Omit<DieneRing, "atoms" | "system">[] {
  const n = input.atoms.length;
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) for (const b of neighbours[a]) if (a < b) edges.push([a, b]);
  const rings = smallestRings(n, edges);
  const count = new Array<number>(n).fill(0);
  for (const r of rings) for (const a of r) count[a]++;
  const own = rings.filter((r) => r.every((a) => count[a] === 1));
  const byKey = new Map<string, Omit<DieneRing, "atoms" | "system">>();
  const faceOn = new Set<number>();
  input.atoms.forEach((a, star) => {
    if (!a.pi || a.pi.length < 2) return;
    const metal = neighbours[star].find((m) => isMetal(input.atoms[m].el)) ?? -1;
    if (metal < 0) return;
    if (cycleOf(a.pi, neighbours)) return void faceOn.add(metal);
    if (a.pi.length !== 2 || !neighbours[a.pi[0]].includes(a.pi[1])) return;
    const ring = own.find((r) => a.pi!.every((p) => r.includes(p)));
    if (!ring) return;
    const k = `${metal}:${Math.min(...ring)}`;
    const found = byKey.get(k) ?? { metal, ring: cycleOf(ring, neighbours) ?? ring, stars: [] };
    found.stars.push({ star, pi: [a.pi[0], a.pi[1]] });
    byKey.set(k, found);
  });
  return [...byKey.values()].filter((d) => d.stars.length === 2 && !faceOn.has(d.metal));
}

function cycleOf(atoms: readonly number[], neighbours: number[][]): number[] | null {
  if (atoms.length < 3) return null;
  const inside = new Set(atoms);
  const near = (a: number) => neighbours[a].filter((b) => inside.has(b));
  if (atoms.some((a) => near(a).length !== 2)) return null;
  const order = [atoms[0]];
  let prev = -1;
  while (order.length < atoms.length) {
    const at = order[order.length - 1];
    const next = near(at).find((b) => b !== prev && !order.includes(b));
    if (next == null) return null;
    prev = at;
    order.push(next);
  }
  return near(order[order.length - 1]).includes(order[0]) ? order : null;
}

/** The order of the bond between two atoms, or 0. */
export function orderOf(mol: Molecule, a: number, b: number): number {
  const i = mol.bondIndex.get(key(a, b));
  return i == null ? 0 : mol.bonds[i].order;
}
