/**
 * What is worked out of a graph once and asked for by many (foundation part 1, design 3.2): each atom's neighbours and bonds, the bond
 * between two atoms, and the connected pieces. Kept per graph object in a WeakMap and made on first use, as `canonical.ts` keeps its classes
 * per input: two equal graphs that are different objects each have their own; the same object asked twice is given the same arrays.
 * The rings: a smallest set of them, each atom's, each bond's, the size of the smallest ring through a bond or an atom, and the ring systems (rings
 * sharing an atom) and fused sets (rings sharing a bond) - worked out on first use, from the graph's distinct bonds (`distinctEdges`).
 */
import type { ChemGraph } from "./graph";
import { distinctEdges, ringSystemsOf, fusedSetsOf, smallestRings, type Ring } from "./rings";

export type Facts = {
  /** Each atom's neighbours, in the order of its bonds - a bond to itself, to an atom the graph does not have, or to an atom already bonded to it, counted once, by its first bond. */
  readonly around: readonly (readonly number[])[];
  /** Each atom's bonds, by their index in the graph's bonds, in the same order. */
  readonly bondsAt: readonly (readonly number[])[];
  /** The index of the bond between two atoms, the first the graph has between them; -1 for none. */
  bondBetween(a: number, b: number): number;
  /**
   * The connected pieces as atom lists, found from atom 0 up and each walked out from its first atom: an ion's, a molecule's. A star
   * with a `pi` is in one piece with the atoms of its pi system.
   */
  readonly pieces: readonly (readonly number[])[];
  /** A smallest set of rings (`smallestRings`): atoms in order round each, the smallest first. */
  readonly rings: readonly Ring[];
  /** Each atom's rings, by their index in `rings`. */
  readonly ringsAt: readonly (readonly number[])[];
  /** Whether each bond, by its index in the graph's bonds, is a bond of a ring (a bond to itself, or to no atom, is not). */
  readonly inRing: readonly boolean[];
  /** The size of the smallest ring through a bond, by its index in the graph's bonds: 0 where it is in none. A smallest set holds one of that size for every bond (rings.ts). */
  sizeThrough(bond: number): number;
  /** The size of the smallest ring through an atom: 0 where it is in none. */
  sizeAt(atom: number): number;
  /** The ring systems: rings sharing an atom, each with its atoms and its rings by index, in the order of their first rings. */
  readonly ringSystems: readonly { atoms: number[]; rings: number[] }[];
  /** The fused sets: rings sharing a bond, each as the indices of its rings. */
  readonly fusedSets: readonly (readonly number[])[];
};

/** A pair of atoms as one key, the lower first. */
const keyOf = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

const made = new WeakMap<ChemGraph, Facts>();

/** The facts of a graph: made on first asking, kept with the graph. */
export function factsOf(g: ChemGraph): Facts {
  const had = made.get(g);
  if (had) return had;
  const n = g.atoms.length;
  const around: number[][] = Array.from({ length: n }, () => []);
  const bondsAt: number[][] = Array.from({ length: n }, () => []);
  const between = new Map<string, number>();
  g.bonds.forEach(({ a, b }, i) => {
    if (a === b || a < 0 || b < 0 || a >= n || b >= n || between.has(keyOf(a, b))) return;
    around[a].push(b);
    around[b].push(a);
    bondsAt[a].push(i);
    bondsAt[b].push(i);
    between.set(keyOf(a, b), i);
  });
  // (made on first use: the pieces and the rings wait until they are asked for)
  let pieces: number[][] | undefined;
  type Rings = { rings: Ring[]; at: number[][]; bondSize: Map<string, number>; atomSize: number[]; inRing: boolean[]; systems: { atoms: number[]; rings: number[] }[]; fused: number[][] };
  let ringsMade: Rings | undefined;
  const ringed = (): Rings =>
    (ringsMade ??= ringsOfGraph(g, n));
  const facts: Facts = {
    around,
    bondsAt,
    bondBetween: (a, b) => between.get(keyOf(a, b)) ?? -1,
    get pieces() {
      return (pieces ??= piecesOf(g, around));
    },
    get rings() {
      return ringed().rings;
    },
    get ringsAt() {
      return ringed().at;
    },
    get inRing() {
      return ringed().inRing;
    },
    sizeThrough: (bond) => {
      const b = g.bonds[bond];
      return b ? (ringed().bondSize.get(keyOf(b.a, b.b)) ?? 0) : 0;
    },
    sizeAt: (atom) => ringed().atomSize[atom] ?? 0,
    get ringSystems() {
      return ringed().systems;
    },
    get fusedSets() {
      return ringed().fused;
    },
  };
  made.set(g, facts);
  return facts;
}

function piecesOf(g: ChemGraph, around: readonly (readonly number[])[]): number[][] {
  const n = g.atoms.length;
  // (a pi system's atoms and its star are one piece: the star reaches them, and each reaches its star)
  const pi: number[][] = Array.from({ length: n }, () => []);
  g.atoms.forEach((a, star) => {
    for (const p of a.pi ?? []) {
      if (p < 0 || p >= n || p === star) continue;
      pi[star].push(p);
      pi[p].push(star);
    }
  });
  const out: number[][] = [];
  const seen = new Array<boolean>(n).fill(false);
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const piece = [s];
    seen[s] = true;
    for (let h = 0; h < piece.length; h++) {
      for (const b of [...around[piece[h]], ...pi[piece[h]]]) {
        if (!seen[b]) {
          seen[b] = true;
          piece.push(b);
        }
      }
    }
    out.push(piece);
  }
  return out;
}

function ringsOfGraph(g: ChemGraph, n: number) {
  const { edges } = distinctEdges(g);
  const rings = smallestRings(n, edges);
  const at: number[][] = Array.from({ length: n }, () => []);
  rings.forEach((r, i) => r.forEach((a) => at[a].push(i)));
  const bondSize = new Map<string, number>();
  const atomSize = new Array<number>(n).fill(0);
  for (const r of rings) {
    r.forEach((a, k) => {
      const key = keyOf(a, r[(k + 1) % r.length]);
      const was = bondSize.get(key);
      if (was == null || r.length < was) bondSize.set(key, r.length);
      if (!atomSize[a] || r.length < atomSize[a]) atomSize[a] = r.length;
    });
  }
  const inRing = g.bonds.map((b) => bondSize.has(keyOf(b.a, b.b)) && b.a !== b.b);
  return { rings, at, bondSize, atomSize, inRing, systems: ringSystemsOf(n, rings), fused: fusedSetsOf(rings) };
}

const without = new WeakMap<ChemGraph, Map<(el: string) => boolean, Facts>>();

/**
 * The facts of the graph with its metals taken out, atoms and bond indices kept: the bonds to a metal are gone, so no ring runs through one, and
 * what is bonded to nothing else stands alone. Memoised beside the first. `isMetal` is the caller's until the metals are one list.
 */
export function factsWithoutMetals(g: ChemGraph, isMetal: (el: string) => boolean): Facts {
  const per = without.get(g) ?? without.set(g, new Map()).get(g)!;
  const had = per.get(isMetal);
  if (had) return had;
  const metal = g.atoms.map((a) => isMetal(a.el));
  const kept: ChemGraph = { atoms: g.atoms, bonds: g.bonds.map((b) => (metal[b.a] || metal[b.b] ? { ...b, a: b.a, b: b.a } : b)) };
  const facts = factsOf(kept);
  per.set(isMetal, facts);
  return facts;
}
