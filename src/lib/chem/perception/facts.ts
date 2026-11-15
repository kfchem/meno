/**
 * What is worked out of a graph once and asked for by many (foundation part 1, design 3.2): each atom's neighbours and bonds, the bond
 * between two atoms, and the connected pieces. Kept per graph object in a WeakMap and made on first use, as `canonical.ts` keeps its classes
 * per input: two equal graphs that are different objects each have their own; the same object asked twice is given the same arrays.
 * The rings come here with part 2.
 */
import type { ChemGraph } from "./graph";

export type Facts = {
  /** Each atom's neighbours, in the order of its bonds - a bond to itself, or to an atom already bonded to it, counted once, by its first bond. */
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
    if (a === b || between.has(keyOf(a, b))) return;
    around[a].push(b);
    around[b].push(a);
    bondsAt[a].push(i);
    bondsAt[b].push(i);
    between.set(keyOf(a, b), i);
  });
  // (made on first use: the pieces wait until they are asked for)
  let pieces: number[][] | undefined;
  const facts: Facts = {
    around,
    bondsAt,
    bondBetween: (a, b) => between.get(keyOf(a, b)) ?? -1,
    get pieces() {
      return (pieces ??= piecesOf(g, around));
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
