/**
 * Which rings are aromatic: Meno's rule, the one lib/chem/kekulize (which
 * nitrogen of a tetrazole or a purine carries its H) and
 * lib/chem/conformersSought (which rings a conformer search holds flat)
 * both take.
 *
 * Hückel's count of pi electrons, 4n + 2 for an aromatic ring (E. Hückel,
 * Z. Phys. 70, 204, 1931; IUPAC's Gold Book entry for the rule, H02867, to
 * check before it is cited here), is applied to each ring of the smallest set and
 * to each pair of those rings fused at a bond - their outer ring, as
 * azulene's ten electrons run round its five- and seven-ring together. An
 * atom is aromatic where it lies on such a ring or pair. That is Meno's
 * extension of the count, stated so: Hückel's rule is of one ring, and a
 * fused system counted whole fails where it plainly holds - pyrene's 16,
 * coronene's 24 and perylene's 20 are 4n, though each of their six-rings is
 * a benzene's 6. Counted so, a fluoranthene's or an acenaphthylene's
 * five-ring (5 electrons, alone or with a six-ring) is not aromatic, as
 * chemists hold it is not; biphenylene's four-ring (4) is not, and its
 * six-rings are.
 *
 * An atom's pi electrons in a ring (`piElectrons`):
 * - one where it has a double bond within its ring system (the rings fused
 *   at bonds with its own), whichever Kekulé structure is drawn: a
 *   benzene's carbon, a pyridine's N;
 * - none for a carbon whose double bond leaves the ring system to O, N, S,
 *   Se or Te - a tropone's, a 2-pyridone's C=O - its electron taken by the
 *   dipolar form (C+ O-) that makes such a ring aromatic;
 * - two for a lone pair it gives the ring: an N, P or As with no double
 *   bond (a pyrrole's), an O, S, Se or Te (a furan's, a thiophene's), a
 *   carbanion (a cyclopentadienide's);
 * - none for a carbocation (a tropylium's) and a boron of three bonds; one
 *   for a B- of three (a boratabenzene's);
 * - not known for anything else: a CH2, a triple bond, a double bond out of
 *   the ring system to a carbon (a fulvene's) or to a P or an As - whose
 *   polarity runs the other way, so the dipolar form gives no basis - and
 *   a ring with an atom not known is not aromatic.
 */

/** The elements whose atom, with no double bond in its ring system, gives the ring a lone pair: two electrons. */
const LONE_PAIR = new Set(["N", "P", "As", "O", "S", "Se", "Te"]);
/** The elements a ring carbon's double bond may leave its ring system to, its electron then taken: none. */
const TAKES = new Set(["O", "N", "S", "Se", "Te"]);

/** How an atom stands in its ring system, as its pi electrons are counted. */
export type PiState = {
  el: string;
  charge: number;
  /** It has a double (or aromatic) bond to an atom of its ring system, by a ring bond. */
  inSystem: boolean;
  /** The element across its double bond out of its ring system, where it has one. */
  outTo: string | null;
  /** It has a triple bond. */
  triple: boolean;
  /** How many atoms it is bonded to, its hydrogens counted where they are known. */
  degree: number;
};

/** An atom's pi electrons in a ring, as Meno counts them (above); null where not known. */
export function piElectrons(s: PiState): number | null {
  if (s.triple) return null;
  if (s.inSystem) return 1;
  if (s.outTo != null) return s.el === "C" && TAKES.has(s.outTo) ? 0 : null;
  if (s.el === "C") return s.charge < 0 ? 2 : s.charge > 0 ? 0 : null;
  if (s.el === "B") return s.degree > 3 ? null : s.charge < 0 ? 1 : s.charge === 0 ? 0 : null;
  if (LONE_PAIR.has(s.el) && s.charge <= 0) return 2;
  return null;
}

/**
 * The atoms that lie on an aromatic ring (above), by index: of `rings` (the
 * smallest set) each, and each two that share a bond, whose atoms'
 * electrons (`electrons`, null where not known) add up to 4n + 2.
 */
export function aromaticAtoms(rings: readonly (readonly number[])[], electrons: (atom: number) => number | null): Set<number> {
  const out = new Set<number>();
  const huckel = (atoms: Iterable<number>) => {
    let sum = 0;
    for (const a of atoms) {
      const e = electrons(a);
      if (e == null) return false;
      sum += e;
    }
    return sum % 4 === 2;
  };
  const edges = rings.map((r) => new Set(r.map((x, k) => pairKey(x, r[(k + 1) % r.length]))));
  rings.forEach((r, i) => {
    if (huckel(r)) r.forEach((a) => out.add(a));
    for (let j = i + 1; j < rings.length; j++) {
      if (![...edges[i]].some((e) => edges[j].has(e))) continue;
      const both = new Set([...r, ...rings[j]]);
      if (huckel(both)) both.forEach((a) => out.add(a));
    }
  });
  return out;
}

/**
 * Each atom's ring system, by index (-1 for an atom in no ring): the rings
 * of `rings` joined where they share a bond - a naphthalene's two, an
 * azulene's - and the bonds that are ring bonds of it, by their atoms.
 */
export function ringSystems(n: number, rings: readonly (readonly number[])[]): { system: Int32Array; ringBonds: Set<string> } {
  const system = new Int32Array(n).fill(-1);
  const ringBonds = new Set<string>();
  const edges = rings.map((r) => r.map((x, k) => pairKey(x, r[(k + 1) % r.length])));
  for (const e of edges) e.forEach((k) => ringBonds.add(k));
  const parent = rings.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  edges.forEach((es, i) =>
    es.forEach((k) => {
      const j = owner.get(k);
      if (j == null) owner.set(k, i);
      else parent[find(i)] = find(j);
    }),
  );
  rings.forEach((r, i) => r.forEach((a) => (system[a] = find(i))));
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
