/**
 * Which rings a structure holds flat, and the aromatic rings among them, by
 * Meno's rule (perception/aromatic, where the rule is stated and its sources
 * cited): what the lone-pair rule (perception/stereo/lonePairs: a phosphole's
 * P, an arsole's As), a conformer search (lib/chem/conformersSought) and what
 * a structure leaves open (lib/chem/stereoOpen) ask. Moved here unchanged
 * with the lone pairs (foundation part 14 B), from lib/chem/aromaticity
 * (`ringSystems`, `aromaticIn`, `pairKey`) and lib/chem/conformersSought
 * (`flatRingAtoms`), which re-export them.
 */
import { aromaticAtoms, piElectrons } from "./aromatic";
import { metal } from "./elements";
import { fusedSetsOf } from "./rings";

/** An atom as the flat-ring test reads it: its element and charge. */
export type FlatAtom = { el: string; charge?: number };
/** A bond as the flat-ring test reads it: its atoms and order (4 aromatic; a coordination bond a neighbour like any other). */
export type FlatBond = { a: number; b: number; order: number };

/**
 * Each atom's ring system, by index (-1 for an atom in no ring): the rings
 * of `rings` joined where they share a bond - a naphthalene's two, an
 * azulene's - and the bonds that are ring bonds of it, by their atoms.
 */
export function ringSystems(n: number, rings: readonly (readonly number[])[]): { system: Int32Array; ringBonds: Set<string> } {
  const system = new Int32Array(n).fill(-1);
  const ringBonds = new Set<string>();
  for (const r of rings) r.forEach((x, k) => ringBonds.add(pairKey(x, r[(k + 1) % r.length])));
  // (the rings that share a bond are the core's fused sets; an atom in two systems - a spiro atom - is the last ring's, as it was)
  const setOf: number[] = [];
  fusedSetsOf(rings).forEach((set, s) => set.forEach((i) => (setOf[i] = s)));
  rings.forEach((r, i) => r.forEach((a) => (system[a] = setOf[i])));
  return { system, ringBonds };
}

/**
 * The atoms of a structure drawn with its bonds' orders (aromatic, 4, where
 * drawn so) that lie on an aromatic ring (`aromaticAtoms`), by index, its
 * rings `rings` (the smallest set): each atom's electrons by how it stands
 * in its ring system (`piElectrons`).
 */
export function aromaticIn(
  atoms: readonly { el: string; charge?: number }[],
  bonds: readonly { a: number; b: number; order: number }[],
  rings: readonly (readonly number[])[],
): Set<number> {
  const around: [number, number][][] = atoms.map(() => []);
  for (const b of bonds) {
    if (b.a === b.b || !around[b.a] || !around[b.b]) continue;
    around[b.a].push([b.b, b.order]);
    around[b.b].push([b.a, b.order]);
  }
  const { system, ringBonds } = ringSystems(atoms.length, rings);
  // (a double or aromatic bond within its ring system, or the element across one out of it)
  const within = (x: number, j: number) => system[x] >= 0 && system[j] === system[x] && ringBonds.has(pairKey(x, j));
  return aromaticAtoms(rings, (x) => {
    const multiple = around[x].filter(([, o]) => o === 2 || o === 4);
    const out = multiple.find(([j]) => !within(x, j));
    return piElectrons({
      el: atoms[x].el,
      charge: atoms[x].charge ?? 0,
      inSystem: multiple.some(([j]) => within(x, j)),
      outTo: out ? atoms[out[0]].el : null,
      triple: around[x].some(([, o]) => o === 3),
      degree: around[x].length,
    });
  });
}

/** Two atoms as one key, the lower first. */
export const pairKey = (x: number, y: number) => (x < y ? `${x},${y}` : `${y},${x}`);

/** Each atom's bonds, as [other atom, order]. */
function neighboursOf(atoms: readonly FlatAtom[], bonds: readonly FlatBond[]): [number, number][][] {
  const out: [number, number][][] = atoms.map(() => []);
  for (const b of bonds) {
    if (b.a === b.b || !atoms[b.a] || !atoms[b.b]) continue;
    out[b.a].push([b.b, b.order]);
    out[b.b].push([b.a, b.order]);
  }
  return out;
}

/**
 * The atoms that lie on a ring held flat, by index: each ring (the smallest
 * set) every atom of which is aromatic under Meno's rule (perception/
 * aromatic: Hückel's 4n + 2, of each ring and each pair of rings fused
 * at a bond) - a benzene's, a pyrrole's, a tropone's, azulene's two, and a
 * fluoranthene's five-ring, which is not aromatic itself but every atom of
 * which lies on an aromatic ring (the rule's 22 electrons at most is the
 * rule's alone). So, whatever its count, is one every bond of which is
 * drawn aromatic, and one every atom of which is bound to one metal (a
 * ferrocene's, eta) - by a bond each, or through a star at its centre
 * (`held`: each such bond's atoms) - as its metal holds it.
 */
export function flatRingAtoms(
  atoms: readonly FlatAtom[],
  bonds: readonly FlatBond[],
  rings: readonly (readonly number[])[],
  held: readonly (readonly number[])[] = [],
): Set<number> {
  const around = neighboursOf(atoms, bonds);
  // (a metal as the core says one is - perception/elements `metal`, Al among them; before, any heavy atom with no most bonds was, Ge,
  //  As, Sb, Te, At, Ts and the noble gases too, so a ring each of whose atoms is bonded to one Ge or Te was held flat as if on a
  //  metal: foundation part 3, B4)
  const isMetal = (i: number) => atoms[i] != null && metal.has(atoms[i].el);
  const aromatic = aromaticIn(atoms, bonds, rings);
  const out = new Set<number>();
  for (const ring of rings) {
    const order = (x: number, y: number) => around[x].find(([j]) => j === y)?.[1];
    const ringBondsOf = ring.map((x, k) => order(x, ring[(k + 1) % ring.length]));
    const bound = ring.every((x) => around[x].some(([j]) => isMetal(j))) && around[ring[0]].some(([m]) => isMetal(m) && ring.every((x) => around[x].some(([j]) => j === m)));
    const centred = held.some((h) => ring.every((x) => h.includes(x)));
    if (bound || centred || ringBondsOf.every((o) => o === 4) || ring.every((x) => aromatic.has(x))) for (const x of ring) out.add(x);
  }
  return out;
}
