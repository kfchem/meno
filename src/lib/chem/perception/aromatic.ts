/**
 * Which rings are aromatic: Meno's rule, the one lib/chem/kekulize (which
 * nitrogen of a tetrazole or a purine carries its H) and
 * lib/chem/conformersSought (which rings a conformer search holds flat)
 * both take - the chemical answer, said once in the core. The aromatic
 * forms (a structure's bonds made order 4, to tell structures apart and
 * alike) are another thing.
 *
 * IUPAC defines aromatic compounds as those that, in accordance with
 * Hückel's theory, "have a cyclic, delocalized (4n+2) π-electron system",
 * heteroaromatic ones (a thiophene, a pyridine) taken in (Moss, Smith and
 * Tavernier, Pure Appl. Chem. 67, 1307, 1995, p. 1319). Hückel's rule
 * itself is stated of monocyclic planar or almost planar systems of
 * trigonal atoms, 4n + 2 aromatic and 4n antiaromatic (Müller, Pure Appl.
 * Chem. 66, 1077, 1994, p. 1122; E. Hückel, Z. Phys. 70, 204, 1931). Meno
 * extends it to fused rings, and that extension is Meno's rule, stated so:
 * the count is applied to each ring of the smallest set, and to each pair
 * of those rings fused at a bond - their outer ring, as azulene's ten
 * electrons run round its five- and seven-ring together. An atom is
 * aromatic where it lies on such a ring or pair of 4n + 2, n from 0 to 5
 * (`MOST_PI`, 22) - as far as the rule is generally held to go (Müller,
 * p. 1122): a larger annulene is not taken for aromatic, and a conformer
 * search lets it find its own shape. A fused system counted whole fails where the definition
 * plainly holds - pyrene's 16, coronene's 24 and perylene's 20 are 4n,
 * though each of their six-rings is a benzene's 6. Counted so, a
 * fluoranthene's or an acenaphthylene's five-ring (5 electrons, alone or
 * with a six-ring) is not aromatic, as chemists hold it is not;
 * biphenylene's four-ring (4) is not, and its six-rings are.
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

import type { ChemBond, ChemGraph } from "./graph";

/** Two atoms as one key, the lower first. */
const pairKey = (x: number, y: number) => (x < y ? `${x},${y}` : `${y},${x}`);

/** The most pi electrons a ring or pair is taken as aromatic with: 4n + 2 for n = 5, as far as Hückel's rule is generally held to go (Müller, Pure Appl. Chem. 66, 1077, 1994, p. 1122). */
export const MOST_PI = 22;

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
 * electrons (`electrons`, null where not known) add up to 4n + 2, at most
 * `MOST_PI`.
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
    return sum % 4 === 2 && sum <= MOST_PI;
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

// --- the two aromatic forms ---------------------------------------------------

/*
 * The two aromatic forms: a structure with some of its bonds given one order,
 * 4 (`AROMATIC`), where its Kekulé structures may draw them either way. Each
 * answers its own question, by its own search; they are not one algorithm.
 * - `aromaticForm`: every bond on an alternating cycle, a ring of 4n atoms
 *   as much as one of 4n + 2 - for telling structures apart and alike:
 *   identity, symmetry orbits, atom mapping, substructure, reference
 *   numbering, scaffolds, Compare bonding, restraints, the CIP's blending.
 *   Bond-shift isomers are one structure (cyclooctatetraene's two).
 * - `huckelBonds` / `huckelForm`: the bonds of alternating cycles of 4n + 2
 *   atoms only, a perimeter as much as a ring (azulene's ten) - for
 *   comparing geometries: whether two conformers are the same, settling in
 *   3D, where a 4n ring's bonds are really long and short.
 *
 * What neither joins: both are about single and double bonds in turn round a
 * cycle, and nothing else. A charge or an unpaired electron drawn at another
 * atom of one delocalised system is another structure to Meno - the
 * 1-methylallyl cation with its charge at either end is two, as is
 * methylcyclopentadienide with its charge on C1 or on C2 - and two tautomers
 * are two (4- and 5-methylimidazole: a drawing is the tautomer drawn,
 * Brecher, Pure Appl. Chem. 80, 277, 2008, GR-10). So neither is "resonance
 * forms are one".
 *
 * Order 4 enters a graph only through these two. A structure that comes with
 * aromatic bonds (a file's, a SMILES's) is given Kekulé orders first
 * (lib/chem/kekulize), once, where it is read.
 */

/** The order a bond of an aromatic form is given, beside 1, 2 and 3. */
const AROMATIC = 4;

/** A graph as an aromatic form gives it back: as it was, but that its bonds' orders may now be 4. */
export type AromaticForm<G extends ChemGraph> = Omit<G, "bonds"> & { bonds: readonly ChemBond[] };

/**
 * The structure with every bond whose order its Kekulé structures disagree
 * on given one order, whichever of them was drawn: Meno's rule for identity
 * and symmetry. A structure's double bonds pair its atoms off (a perfect
 * matching of those with one); another Kekulé structure of it differs by
 * an alternating cycle - single and double bonds in turn, round a ring.
 * So a bond is drawn now single, now double exactly where it lies on such a
 * cycle, and those bonds become `AROMATIC`: benzene's, naphthalene's,
 * phenanthrene's and azulene's ring bonds, a pyridine's, cyclooctatetraene's.
 * A bond on no such cycle keeps its order, as every Kekulé structure has it:
 * pyrrole's, furan's and thiophene's (they have one Kekulé structure), a
 * quinone's (its C=O is no part of a cycle), azulene's middle bond. Which
 * bonds lie on an alternating cycle is the structure's, not the drawing's,
 * so every Kekulé structure of one structure comes to the same form, and
 * its identity cannot split by how its rings were drawn. It follows that
 * bond-shift isomers are one structure: 1,2-disubstituted cyclooctatetraene
 * with its substituents across a double bond and across a single one - two
 * compounds, a barrier apart - has one identity, as joins and duplicates
 * want it. A bond so made one order says no cis or trans of its own: it is
 * single in some of the structure's Kekulé structures, so a drawing's side
 * on it - a cyclooctatetraene's ring bonds, drawn cis - is dropped with its
 * order. That holds for a real trans bond too: in a large annulene (a
 * [14]- or [18]annulene, with E bonds in its ring), configurational
 * isomers that differ by such a bond are one structure, as the rule
 * states.
 */
export function aromaticForm<G extends ChemGraph>(input: G): AromaticForm<G> {
  const n = input.atoms.length;
  // (each atom's partner by its one double bond, where it has exactly one and no triple bond)
  const mate = new Array<number>(n).fill(-1);
  const doubles = new Array<number>(n).fill(0);
  const triple = new Array<boolean>(n).fill(false);
  for (const b of input.bonds) {
    if (b.order === 2) {
      doubles[b.a]++;
      doubles[b.b]++;
      mate[b.a] = b.b;
      mate[b.b] = b.a;
    } else if (b.order === 3) triple[b.a] = triple[b.b] = true;
  }
  const paired = (i: number) => doubles[i] === 1 && !triple[i] && mate[i] >= 0 && doubles[mate[i]] === 1 && !triple[mate[i]];
  // (the single bonds between paired atoms: what an alternating cycle's other half runs along)
  const singles: number[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    if (b.order === 1 && paired(b.a) && paired(b.b)) {
      singles[b.a].push(b.b);
      singles[b.b].push(b.a);
    }
  }
  const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const aromatic = new Set<string>();
  // a single bond u-v lies on an alternating cycle where, from v's partner, single and double bonds in
  // turn reach a single bond into u's partner (u - v = v' - ... - u' = u)
  for (const b of input.bonds) {
    if (b.order !== 1 || !paired(b.a) || !paired(b.b) || mate[b.a] === b.b) continue;
    const [u, v] = [b.a, b.b];
    const goal = mate[u];
    const seen = new Set<number>([mate[v]]);
    const queue = [mate[v]];
    let found = false;
    while (queue.length && !found) {
      const x = queue.shift()!;
      for (const y of singles[x]) {
        if (y === goal) {
          found = true;
          break;
        }
        if (y === u || y === v) continue;
        const next = mate[y];
        if (next === u || next === v || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    if (!found) continue;
    aromatic.add(key(u, v));
    aromatic.add(key(u, mate[u]));
    aromatic.add(key(v, mate[v]));
  }
  if (!aromatic.size) return input;
  return {
    ...input,
    bonds: input.bonds.map((b) => {
      if (!aromatic.has(key(b.a, b.b))) return b;
      const { stereo: _side, ...rest } = b;
      return { ...rest, order: AROMATIC };
    }),
  };
}

/**
 * The bonds of Hückel rings: rings of single and double bonds in turn, each
 * atom with one double bond, of 4n + 2 atoms - a benzene ring's, a
 * pyridine's, every one of a naphthalene's. Which of them a Kekulé structure
 * makes double is no part of a molecule's shape or of which of its atoms are
 * alike. A cyclooctatetraene's ring, of 4n, is none: its double bonds stay
 * where they are, as a pyrrole's do. This answers which bonds a Kekulé
 * structure may draw either way, for sameness and shape; which rings are
 * aromatic is Meno's rule (above).
 */
/** The most steps the search for one bond's Hückel ring takes; past it, the bond keeps its order: two alike can then be told apart, never two unlike made one. */
const RING_STEPS = 100_000;

/** The bonds of Hückel rings, each by its atoms ("a,b", the lower first). */
export function huckelBonds(n: number, bonds: readonly { a: number; b: number; order: number }[]): Set<string> {
  const mate = new Array<number>(n).fill(-1);
  const doubles = new Array<number>(n).fill(0);
  const triple = new Array<boolean>(n).fill(false);
  for (const b of bonds) {
    if (b.order === 2) {
      doubles[b.a]++;
      doubles[b.b]++;
      mate[b.a] = b.b;
      mate[b.b] = b.a;
    } else if (b.order === 3) triple[b.a] = triple[b.b] = true;
  }
  const paired = (i: number) => doubles[i] === 1 && !triple[i];
  const singles: number[][] = Array.from({ length: n }, () => []);
  for (const b of bonds) {
    if (b.order === 1 && paired(b.a) && paired(b.b)) {
      singles[b.a].push(b.b);
      singles[b.b].push(b.a);
    }
  }
  const found = new Set<string>();
  for (const b of bonds) {
    if (b.order !== 1 || !paired(b.a) || !paired(b.b) || found.has(pairKey(b.a, b.b))) continue;
    // (u - v = v' - y = z - ... - u' = u: from v', a single bond and a double in turn, m times, then a single bond
    //  into u' - a ring of 2m + 4 atoms, 4n + 2 where m is odd)
    const [u, v] = [b.a, b.b];
    const goal = mate[u];
    const on = new Set([u, v, mate[v]]);
    const ring = [u, v, mate[v]];
    let steps = 0;
    const walk = (x: number, m: number): boolean => {
      for (const y of singles[x]) {
        if (++steps > RING_STEPS) return false;
        if (y === goal) {
          if (m % 2 === 1) return true;
          continue;
        }
        const z = mate[y];
        if (on.has(y) || on.has(z)) continue;
        on.add(y).add(z);
        ring.push(y, z);
        if (walk(z, m + 1)) return true;
        ring.length -= 2;
        on.delete(y);
        on.delete(z);
      }
      return false;
    };
    if (!walk(mate[v], 0)) continue;
    ring.push(goal);
    ring.forEach((x, k) => found.add(pairKey(x, ring[(k + 1) % ring.length])));
  }
  return found;
}

/** The structure with its Hückel rings' bonds aromatic, the rest as they are. */
export function huckelForm<G extends ChemGraph>(input: G): AromaticForm<G> {
  const found = huckelBonds(
    input.atoms.length,
    input.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })),
  );
  if (!found.size) return input;
  return { ...input, bonds: input.bonds.map((b) => (found.has(pairKey(b.a, b.b)) ? { ...b, order: AROMATIC } : b)) };
}
