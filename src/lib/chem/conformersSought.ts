/**
 * How many conformers a search is to try of a molecule where the chemist
 * asks for no number of their own: as many as its shape needs - Meno's
 * rule, the same whichever plugin searches (docs/WORKFLOWS.md,
 * *Conformers*; the plugin is given the number).
 *
 * - By how many of its bonds turn: fifty up to seven, two hundred to
 *   twelve, three hundred beyond - Ebejer, Morris and Deane's rule
 *   (*Conformer Generation using RDKit*, 1st RDKit User General Meeting,
 *   London 2012; *Freely Available Conformer Generation Methods: How Good
 *   Are They?*, J. Chem. Inf. Model. 2012, 52, 1146-1158).
 * - At least `RING_CONFORMERS` where a ring of it can flip: a ring's two
 *   forms are shapes no turning bond counts, and an embedding reaches the
 *   rarer seldom.
 * - `FEW_CONFORMERS` where nothing in it turns at all.
 *
 * Which bonds turn is Meno's own count (`turningBonds`), of the molecule's
 * heavy atoms: hydrogens, carried or not, change nothing.
 */
import type { Option, OptionValues } from "../options";
import { symmetryOrbits } from "../layout/canonical";
import { smallestRings } from "../layout/rings";
import { readMolfile } from "./ctfile";
import { aromaticIn } from "./aromaticity";
import { implicitHydrogens, mostBonds } from "./molecule";

/** An atom as the count reads it. */
export type SoughtAtom = { el: string; charge?: number };
/** A bond as the count reads it: its atoms and order (4 aromatic; a coordination bond, `COORDINATION_BOND`, a neighbour and no turning bond). */
export type SoughtBond = { a: number; b: number; order: number };

/**
 * How many are tried of a molecule in which nothing turns and no ring can
 * flip: the number RDKit's own embedding takes when given none, which is as
 * many shapes as such a molecule has.
 */
export const FEW_CONFORMERS = 10;
/**
 * How many are tried, at least, of a molecule with a ring that can flip: an
 * embedding reaches a ring's rarer form about once in twenty-five tries
 * (measured 2026-10-20 over twelve monosubstituted cyclohexanes: 3.8% of
 * embeddings for tert-butyl, 4.3% for phenyl), so a molecule with one is
 * tried enough times that both forms are made.
 */
export const RING_CONFORMERS = 200;
/** How many are tried by how many bonds turn: Ebejer, Morris and Deane's rule (above) - up to seven, fifty; to twelve, two hundred; past that, three hundred. */
export const BY_TURNS: readonly (readonly [number, number])[] = [
  [7, 50],
  [12, 200],
  [Infinity, 300],
];
/**
 * The most a chemist may ask for (*Conformers sought*, *This many*). A chain
 * needs more than the rule gives it: of the 1523 conformers within 3
 * kcal/mol of the lowest that 5000 embeddings of butyl octanoate (nine
 * turning bonds, the rule's 200) found, 200 found 110, 500 found 266, 1000
 * found 487, and the lowest came only at 2000 (RDKit's search, 2026-10-20).
 * 5000 of it is a job of about a minute on ten cores.
 */
export const MOST_CONFORMERS = 5000;

const heavy = (a: SoughtAtom | undefined) => a != null && a.el !== "H" && a.el !== "*";

/**
 * A metal, to a ring bound to one (`flatRingAtoms`): a heavy atom with no
 * most bonds (./molecule `mostBonds`). Not the core's `metal`
 * (lib/chem/perception/elements): Ge, As, Sb, Te, At, Ts and the noble
 * gases are metals here, which foundation part 3 (B4) mends.
 */
const metalByBonds = (a: SoughtAtom) => heavy(a) && mostBonds(a.el) === null;

/** Each atom's bonds, as [other atom, order]. */
function neighboursOf(atoms: readonly SoughtAtom[], bonds: readonly SoughtBond[]): [number, number][][] {
  const out: [number, number][][] = atoms.map(() => []);
  for (const b of bonds) {
    if (b.a === b.b || !atoms[b.a] || !atoms[b.b]) continue;
    out[b.a].push([b.b, b.order]);
    out[b.b].push([b.a, b.order]);
  }
  return out;
}

/** The bonds that lie in a ring - those whose ends stay joined without them - by index. */
function ringBonds(n: number, bonds: readonly SoughtBond[]): Set<number> {
  // (the bonds no cycle passes through are a graph's bridges: found by depth-first search, each bond's lowest reach)
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  bonds.forEach((b, i) => {
    if (b.a === b.b || b.a >= n || b.b >= n) return;
    adj[b.a].push([b.b, i]);
    adj[b.b].push([b.a, i]);
  });
  const seen = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const bridges = new Set<number>();
  let time = 0;
  for (let root = 0; root < n; root++) {
    if (seen[root] >= 0) continue;
    // (iterative: a chain of thousands of atoms is no recursion's)
    const stack: { v: number; via: number; k: number }[] = [{ v: root, via: -1, k: 0 }];
    seen[root] = low[root] = time++;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.k < adj[top.v].length) {
        const [w, i] = adj[top.v][top.k++];
        if (i === top.via) continue;
        if (seen[w] < 0) {
          seen[w] = low[w] = time++;
          stack.push({ v: w, via: i, k: 0 });
        } else low[top.v] = Math.min(low[top.v], seen[w]);
      } else {
        stack.pop();
        const up = stack[stack.length - 1];
        if (up) {
          low[up.v] = Math.min(low[up.v], low[top.v]);
          if (low[top.v] > seen[up.v]) bridges.add(top.via);
        }
      }
    }
  }
  return new Set(bonds.flatMap((_, i) => (bridges.has(i) ? [] : [i])));
}

/**
 * The bonds of a molecule that turn and move the rest of it, by index:
 * single bonds outside any ring, with another heavy atom at each end - but
 * none whose turning gives the same shape:
 * - **a straight line, counted once**: the atoms of triple bonds lie on
 *   one line with the two atoms at its ends, so the bonds along it are one
 *   turn, not one each - and none where an end has nothing beyond it (a
 *   nitrile, a methyl alkyne): diphenylacetylene's two rings turn against
 *   each other once, as one bond would let them;
 * - **an end that is a symmetric top**: an atom whose other three
 *   neighbours are alike end atoms (CF3, CCl3, a tert-butyl's centre, a
 *   trimethylsilyl's), any turn of which by a third gives the same shape;
 * - **a bond held flat whose two flat forms are one shape**: a bond from a
 *   carbon with a double bond to O, N or S, to an N, O or S, is held flat
 *   by the lone pair's conjugation (an amide's C-N, an ester's C-O, a
 *   thioamide's, an amidine's), and has two flat forms - an amide's cis
 *   and trans, an ester's Z and E - each a conformer of its own, so it
 *   counts as a bond that turns; but not where the lone pair's atom
 *   carries two alike (an N,N-dimethylamide's methyls), whose two forms
 *   are one shape.
 * And a bond to an end N, O or S that carries hydrogens counts (an OH's,
 * an NH2's, a thiol's): their turn gives conformers of their own, the same
 * conformer keeping OH and NH rotamers apart - but not where it is held flat
 * and they are two (an amide's NH2), its two forms one shape, nor where
 * they are three (an NH3, a symmetric top). So does a C=N whose N carries a
 * hydrogen and nothing else (an imine's NH, an amidine's or a guanidine's):
 * the hydrogen on either side - an E/Z never chosen - is two conformers.
 * A coordination bond is no turning bond; it counts as a neighbour.
 *
 * The rule (above) is by the bonds that turn; which those are is Meno's
 * definition, here: a bond whose turn gives conformers of their own.
 */
export function turningBonds(atoms: readonly SoughtAtom[], bonds: readonly SoughtBond[]): number[] {
  const around = neighboursOf(atoms, bonds);
  const inRing = ringBonds(atoms.length, bonds);
  const heavyAround = (i: number) => around[i].filter(([j]) => heavy(atoms[j]));
  const end = (i: number) => heavyAround(i).length === 1;
  const linear = (i: number) => around[i].some(([, o]) => o === 3);
  const top = (i: number, other: number) => {
    const rest = around[i].filter(([j]) => j !== other);
    if (rest.length !== 3 || !rest.every(([j, o]) => o === 1 && heavy(atoms[j]) && end(j))) return false;
    const [first] = rest;
    const kind = (j: number) => `${atoms[j].el}${atoms[j].charge ?? 0}`;
    return rest.every(([j]) => kind(j) === kind(first[0]));
  };
  const lonePair = (i: number) => ["N", "O", "S"].includes(atoms[i].el) && (atoms[i].charge ?? 0) <= 0;
  const acyl = (i: number) => atoms[i].el === "C" && around[i].some(([j, o]) => o === 2 && ["O", "N", "S"].includes(atoms[j].el));
  // (a lone pair's atom carrying two alike - in one orbit of the symmetries that keep the flat bond itself in place: one of
  //  them swaps the two, so the bond's two forms are one shape. The bond's own atoms marked apart from every other atom, so
  //  an automorphism that moves it onto another bond is not one of them. Not by symmetry classes, which can join two atoms
  //  no automorphism takes onto each other - fewer conformers sought, the unsafe way - while orbits are never coarser than
  //  the true ones, and finer at worst where the search is cut short: more sought. Worked out only where asked)
  const twoAlike = (i: number, other: number) => {
    const rest = heavyAround(i).filter(([j]) => j !== other);
    if (rest.length !== 2) return false;
    const marked = atoms.map((a, k) => (k === i || k === other ? { ...a, el: `${a.el}*` } : a));
    const { orbit } = symmetryOrbits({ atoms: marked, bonds });
    return orbit[rest[0][0]] === orbit[rest[1][0]];
  };
  const flat = (i: number, j: number) => (acyl(i) && lonePair(j) && twoAlike(j, i)) || (acyl(j) && lonePair(i) && twoAlike(i, j));
  // (an end N, O or S's hydrogens - those bonded to it as atoms, or those its valence leaves - whose turn gives conformers of
  //  their own: the same conformer keeps OH and NH rotamers apart (workflow/sameConformer) - but not where the bond is held flat
  //  and they are two, its two forms one shape: an amide's NH2)
  const hydrogens = (i: number) => {
    const sum = around[i].reduce((n, [, o]) => n + (o === 4 ? 1.5 : o <= 3 ? o : 0), 0);
    return around[i].filter(([j]) => atoms[j].el === "H").length + implicitHydrogens(atoms[i].el, Math.round(sum), atoms[i].charge ?? 0);
  };
  //  - and an NH3's three, a symmetric top as a methyl is)
  const rotamers = (x: number, y: number) =>
    end(y) && lonePair(y) && heavyAround(x).length >= 2 && !linear(x) && hydrogens(y) > 0 && hydrogens(y) < 3 && !(acyl(x) && hydrogens(y) > 1);
  // (a C=N whose N carries a hydrogen and nothing else: that hydrogen on either side - its E/Z no configuration of its own, never
  //  chosen (lib/chem/stereoOpen) - is two conformers)
  const sides = (b: SoughtBond) =>
    b.order === 2 && [b.a, b.b].some((n) => atoms[n].el === "N" && end(n) && hydrogens(n) > 0 && atoms[b.a === n ? b.b : b.a].el === "C" && heavyAround(b.a === n ? b.b : b.a).length >= 2);
  const out: number[] = [];
  bonds.forEach((b, k) => {
    if (sides(b) && !inRing.has(k)) return void out.push(k);
    if (b.order !== 1 || inRing.has(k) || !heavy(atoms[b.a]) || !heavy(atoms[b.b])) return;
    if (rotamers(b.a, b.b) || rotamers(b.b, b.a)) return void out.push(k);
    if (heavyAround(b.a).length < 2 || heavyAround(b.b).length < 2) return;
    if (linear(b.a) || linear(b.b) || top(b.a, b.b) || top(b.b, b.a) || flat(b.a, b.b)) return;
    out.push(k);
  });
  // (each straight line once: its atoms walked from one, the bonds out of it to its ends single and in no ring, each end with
  //  more beyond it - the turn given as the bond to the end of lower index)
  const walked = new Set<number>();
  const bondOf = (x: number, y: number) => bonds.findIndex((b) => (b.a === x && b.b === y) || (b.a === y && b.b === x));
  atoms.forEach((_, i) => {
    if (walked.has(i) || !heavy(atoms[i]) || !linear(i)) return;
    const line = [i];
    walked.add(i);
    const ends: [number, number][] = [];
    for (let k = 0; k < line.length; k++)
      for (const [j] of around[line[k]]) {
        if (!heavy(atoms[j]) || walked.has(j) || line.includes(j)) continue;
        if (linear(j)) {
          walked.add(j);
          line.push(j);
        } else ends.push([line[k], j]);
      }
    if (ends.length !== 2) return;
    const across = ends.map(([x, y]) => ({ end: y, bond: bondOf(x, y) }));
    if (across.some(({ end, bond }) => bond < 0 || bonds[bond].order !== 1 || inRing.has(bond) || heavyAround(end).length < 2)) return;
    out.push(across[0].end < across[1].end ? across[0].bond : across[1].bond);
  });
  return out.sort((x, y) => x - y);
}

/**
 * The atoms that lie on a ring held flat, by index: each ring (the smallest
 * set) every atom of which is aromatic under Meno's rule (lib/chem/
 * aromaticity: Hückel's 4n + 2, of each ring and each pair of rings fused
 * at a bond) - a benzene's, a pyrrole's, a tropone's, azulene's two, and a
 * fluoranthene's five-ring, which is not aromatic itself but every atom of
 * which lies on an aromatic ring (the rule's 22 electrons at most is the
 * rule's alone). So, whatever its count, is one every bond of which is
 * drawn aromatic, and one every atom of which is bound to one metal (a
 * ferrocene's, eta) - by a bond each, or through a star at its centre
 * (`held`: each such bond's atoms) - as its metal holds it.
 */
export function flatRingAtoms(
  atoms: readonly SoughtAtom[],
  bonds: readonly SoughtBond[],
  rings: readonly (readonly number[])[],
  held: readonly (readonly number[])[] = [],
): Set<number> {
  const around = neighboursOf(atoms, bonds);
  const metal = (i: number) => metalByBonds(atoms[i]);
  const aromatic = aromaticIn(atoms, bonds, rings);
  const out = new Set<number>();
  for (const ring of rings) {
    const order = (x: number, y: number) => around[x].find(([j]) => j === y)?.[1];
    const ringBondsOf = ring.map((x, k) => order(x, ring[(k + 1) % ring.length]));
    const bound = ring.every((x) => around[x].some(([j]) => metal(j))) && around[ring[0]].some(([m]) => metal(m) && ring.every((x) => around[x].some(([j]) => j === m)));
    const centred = held.some((h) => ring.every((x) => h.includes(x)));
    if (bound || centred || ringBondsOf.every((o) => o === 4) || ring.every((x) => aromatic.has(x))) for (const x of ring) out.add(x);
  }
  return out;
}

/**
 * Whether a molecule has a ring with more than one shape of its own: a ring
 * of five atoms or more not every atom of which lies on a ring held flat
 * (`flatRingAtoms`), and not bridged - a chair and its flipped chair, a
 * sugar's two chairs, a five-ring's puckers. A bridged ring (adamantane, a
 * norbornane) is held in its one shape by its bridge: so a ring sharing
 * more than one bond with another ring of its own size or smaller does not
 * count - against a larger ring it is no bridge but the way round it, as
 * each sugar of a cyclodextrin lies on its macrocycle.
 */
export function canFlip(atoms: readonly SoughtAtom[], bonds: readonly SoughtBond[], held: readonly (readonly number[])[] = []): boolean {
  const rings = smallestRings(
    atoms.length,
    bonds.filter((b) => b.a !== b.b && atoms[b.a] && atoms[b.b]).map((b) => [b.a, b.b] as const),
  );
  const flat = flatRingAtoms(atoms, bonds, rings, held);
  const edges = rings.map((r) => new Set(r.map((x, k) => (x < r[(k + 1) % r.length] ? `${x},${r[(k + 1) % r.length]}` : `${r[(k + 1) % r.length]},${x}`))));
  return rings.some((ring, i) => {
    if (ring.length < 5 || ring.every((x) => flat.has(x))) return false;
    const bridged = rings.some((other, j) => j !== i && other.length <= ring.length && [...edges[i]].filter((e) => edges[j].has(e)).length > 1);
    return !bridged;
  });
}

/** How many conformers to try of a molecule where none is asked for: as many as its shape needs (above). `held`: atoms bound to a metal through a star at their centre. */
export function conformersSought(atoms: readonly SoughtAtom[], bonds: readonly SoughtBond[], held: readonly (readonly number[])[] = []): number {
  const turns = turningBonds(atoms, bonds).length;
  const many = BY_TURNS.find(([most]) => turns <= most)![1];
  if (canFlip(atoms, bonds, held)) return Math.max(many, RING_CONFORMERS);
  return turns ? many : FEW_CONFORMERS;
}

/**
 * How many to try of a structure as Meno writes it for a plugin, a MOL
 * block: its atoms and bonds as written - a star at a ring's centre no
 * atom of it, the ring it binds held by its metal - or null where it
 * cannot be read.
 */
export function conformersSoughtOf(molblock: string): number | null {
  const ct = readMolfile(molblock);
  if (!ct) return null;
  const atoms = ct.atoms.map((a) => ({ el: a.symbol, charge: a.charge ?? 0 }));
  const bonds = ct.bonds.filter((b) => !b.endpoints?.length).map((b) => ({ a: b.a1, b: b.a2, order: b.type }));
  const held = ct.bonds.flatMap((b) => (b.endpoints?.length ? [[...b.endpoints]] : []));
  return conformersSought(atoms, bonds, held);
}

/**
 * What the window for new conformers in a search in rounds says under it,
 * the window being the chemist's own: what it is for, a guide - not a
 * default - and what energies it is of.
 */
export const WITHIN_GUIDE =
  "Meno sets none: give your own. A round that brings no new conformer within this of the lowest is the last. As a guide, at 298.15 K one 2.73\u00a0kcal/mol above the lowest weighs 1/100 as much (RT\u00a0ln\u00a0100). The energies are the search's own force field's.";
/** The window's guide in Settings, for the page: Meno's value said, the chemist's to change (lib/settings/appSettings `WITHIN_3D`); the guide as `WITHIN_GUIDE`'s. */
export const pageWithinGuide = (within: number) => WITHIN_GUIDE.replace("Meno sets none: give your own.", `Meno's is ${within}\u00a0kcal/mol; yours to change.`);
/** What a search in rounds given no window needs, wherever it is asked. */
export const WITHIN_NEEDED = "Give the window for new conformers, in kcal/mol";

/** A search in rounds' own values, where a chemist has set them (Settings, or a step): its window for new conformers, its first round, the most it tries. */
export type RoundsChosen = { within?: number; first?: number; most?: number };
/** Settings' values for a search in rounds (lib/settings/appSettings `ChemistrySettings`), as `soughtOptions` takes them. */
export const roundsChosen = (s: { within3d?: number; first3d?: number; most3d?: number }): RoundsChosen => ({ within: s.within3d, first: s.first3d, most: s.most3d });

/**
 * How many conformers are sought, Meno's choice for any conformer search
 * that takes a number of tries (a plugin's role says it does: `tries`) - on
 * the page, from Settings; on a *Conformers* step, from its own options.
 * Where its search gives another set of tries for each draw (`draws`), as
 * many as the molecule needs is asked in rounds (chem/conformerRounds),
 * with their own options - `rounds`, from Settings: the window for new
 * conformers, the chemist's own, none until given; the first round, 0 the
 * molecule's own count; the most tried.
 */
export function soughtOptions(sought: "needed" | "fixed" = "needed", count = RING_CONFORMERS, rounds?: RoundsChosen): Option[] {
  const needed = { when: { id: "sought", in: ["needed"] } };
  return [
    {
      id: "sought",
      label: "Conformers sought",
      type: "choice",
      choices: [
        { value: "needed", label: "As many as the molecule needs" },
        { value: "fixed", label: "This many" },
      ],
      default: sought,
    },
    { id: "count", when: { id: "sought", in: ["fixed"] }, label: "How many", type: "number", default: count, min: 1, max: MOST_CONFORMERS, step: 1, whole: true },
    ...(rounds
      ? ([
          { id: "within", ...needed, label: "New conformers within", type: "number", default: rounds.within ?? Number.NaN, min: 0, step: 0.5, unit: "kcal/mol", note: WITHIN_GUIDE },
          {
            id: "first",
            ...needed,
            label: "First round",
            type: "number",
            default: rounds.first ?? 0,
            unset: 0,
            min: 0,
            max: MOST_CONFORMERS,
            step: 1,
            whole: true,
            note: "0: the molecule's own count, by the bonds that turn. Then as many again, then each twice the one before.",
          },
          { id: "most", ...needed, label: "Tried at most", type: "number", default: rounds.most ?? MOST_CONFORMERS, min: 1, max: MOST_CONFORMERS, step: 1, whole: true },
        ] satisfies Option[])
      : []),
  ];
}

/**
 * A search in rounds as its options ask it (`soughtOptions`): its window,
 * its first round - the chemist's, else the molecule's own (`needed`) - and
 * the most it tries, each kept to what it may be; or what it still needs
 * (`WITHIN_NEEDED`), or null where it is not asked in rounds: a number of
 * the chemist's own ("fixed"), or no window option offered.
 */
export function roundsAsked(values: OptionValues, needed: () => number | null): { window: number; first: number; most: number } | { needs: string } | null {
  if (values.sought === "fixed" || !("within" in values)) return null;
  const window = values.within;
  if (typeof window !== "number" || !Number.isFinite(window) || window < 0) return { needs: WITHIN_NEEDED };
  const most = typeof values.most === "number" && Number.isFinite(values.most) ? Math.min(Math.max(1, Math.round(values.most)), MOST_CONFORMERS) : MOST_CONFORMERS;
  const chosen = typeof values.first === "number" && Number.isFinite(values.first) && values.first >= 1 ? Math.round(values.first) : null;
  const first = Math.min(Math.max(1, chosen ?? needed() ?? RING_CONFORMERS), most);
  return { window, first, most };
}

/** The number to try, as the choice (`soughtOptions`) gives it: the number asked for, kept to 1-`MOST_CONFORMERS`, or the molecule's (`needed`, worked out only then). */
export function soughtNumber(values: OptionValues, needed: () => number | null): number | null {
  if (values.sought === "fixed") {
    const n = typeof values.count === "number" && Number.isFinite(values.count) ? Math.round(values.count) : RING_CONFORMERS;
    return Math.min(Math.max(n, 1), MOST_CONFORMERS);
  }
  return needed();
}
