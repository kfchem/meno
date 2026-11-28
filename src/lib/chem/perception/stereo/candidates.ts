/**
 * Which atoms and bonds of a structure can carry a configuration, by their shape alone - Meno's candidates (foundation part 13, C;
 * as the chemistry check ruled them, 11-13). No symmetry is asked: whether a candidate's groups are alike, and so whether it sets
 * anything, is identity's (./units). Each candidate says why it is one, and a place asked that is none says why not, in words that
 * say what it is (the reader's at an unread centre, the notes, the figure reader's line take them).
 * - A centre of four groups: B, C, Si, Ge, Sn, Pb, N, P, As, Sb, Bi, S, Se or Te, whatever the orders of its bonds, at most one of
 *   its groups a plain hydrogen (IUPAC 2013 P-93.2.0 to P-93.2.3, P-93.2.6). Never a metal of the d or f block, nor Al, Ga, In or Tl:
 *   their four groups are not surely tetrahedral (P-93.3 takes them by their polyhedra). Not an N+ with an H among its four: it
 *   loses its configuration through the free amine - Meno's rule, no text's (P+ and As+ with an H are candidates: their free forms
 *   keep theirs).
 * - A centre of three groups and a lone pair it keeps (./lonePairs, Meno's rule; P-93.3.3.2 takes them with a phantom atom): with an H
 *   among the three, a P, As, Sb or Bi as without one (a secondary phosphine's P, the maintainer's ruling of 2026-11-06).
 * - A double bond with a group besides the other end on each end, each end a trigonal-planar centre (./lonePairs `trigonalEnd`: not
 *   a sulfonium ylide's S, a sulfoximine's, a phosphorus ylide's P), in no ring of `SMALL_RING` atoms or fewer (P-93.5.1.4.1: there
 *   it is cis and states nothing; the text says monocycles, Meno takes the smallest ring through the bond for fused and bridged
 *   ones, its own extension), and not a C=N whose E/Z is none of its own (./movingCN).
 * - A run of cumulated double bonds between two carbons, each with a group: even, an axis (an allene's); odd, a cis or trans. Both
 *   ends carbon is a cautious rule of Meno's, no text's: the text's runs are all carbon (P-93.4.2.2, P-93.4.2.3), and of an N end
 *   it says nothing. An allene in a ring is a candidate as any.
 * - An axis of hindered rotation only where the drawing states one (Brecher 2006 ST-1.7: hindrance is a matter of degree).
 * Not candidates in this build: planar and helical chirality, and a metal's own geometry.
 */
import { factsOf, OPEN_RING } from "../facts";
import type { ChemGraph } from "../graph";
import { SMALL_RING } from "../rings";
import type { SymmetryInput } from "../symmetry";
import { lonePairCentres, trigonalEnd } from "./lonePairs";
import { MOVING_CN, movingCN } from "./movingCN";
import { runsOf as runsThroughLinear } from "./runs";

/** The elements a centre of four groups may be. */
export const CENTRE_ELEMENTS: ReadonlySet<string> = new Set(["B", "C", "Si", "Ge", "Sn", "Pb", "N", "P", "As", "Sb", "Bi", "S", "Se", "Te"]);

/** A place that can carry a configuration, with why: by its atom, its bond (by index), or a run's two ends. */
export type Candidate =
  | { kind: "centre"; at: number; why: string }
  | { kind: "bond"; at: number; why: string }
  | { kind: "axis" | "cumulated"; ends: [number, number]; why: string }
  | { kind: "biaryl"; atoms: readonly number[]; why: string };

/** A place asked of: an atom as a centre, or a bond by its index. */
export type Asked = { kind: "centre"; at: number } | { kind: "bond"; at: number };

/** The words for why each kind of candidate is one, and why a place is none. */
export const CANDIDATE_WHY = {
  four: "it has four groups round it",
  lonePair: "it has three groups and a lone pair that keeps its configuration",
  double: "a double bond with a group besides the other end on each end",
  axis: "an allene's axis: a run of an even number of double bonds between two carbons, each with a group",
  cumulated: "a run of an odd number of double bonds between two carbons, each with a group",
  biaryl: "an axis the drawing states",
} as const;
export const NOT_CANDIDATE = {
  metal: "it is a metal, whose groups are not surely tetrahedral",
  element: "its element carries no configuration of four groups",
  hydrogens: "two of its groups are hydrogens",
  ammonium: "it is an N+ with an H, which loses its configuration through the free amine (Meno's rule)",
  many: (n: number) => `it has ${n} groups round it, more than the four of a tetrahedral centre`,
  three: "it has three bonds and keeps no configuration of its own",
  few: "it has fewer than three groups round it",
  notDouble: "it is no double bond",
  bare: "an end of it carries nothing besides the other end",
  notTrigonal: "an end of it is no trigonal-planar centre (an ylide's S or P, a sulfoximine's S), so its groups do not lie in one plane",
  ring: `it is in a ring of ${SMALL_RING} atoms or fewer, which holds it cis`,
  moving: (why: string) => `${why} - no configuration of its own`,
  run: "it is part of a run of double bonds",
  runEnd: "an end of the run carries nothing besides the run",
  runNotCarbon: "an end of the run is not carbon (Meno's cautious rule)",
} as const;

/** An element as written, identity's own marks (a mass number, an unpaired electron) taken off. */
const elementOf = (el: string): string => el.replace(/[\^.].*$/, "");

/** The d- and f-block metals and Al, Ga, In, Tl: never a centre of four groups. */
const NOT_TETRAHEDRAL = new Set([
  ...["Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd"],
  ...["Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn"],
  ...["La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu"],
  ...["Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr"],
  ...["Al", "Ga", "In", "Tl"],
]);

/** What a structure is read as, once, for `candidates` and `notCandidate`. */
function readOf(g: SymmetryInput) {
  const n = g.atoms.length;
  const around: number[][] = g.atoms.map(() => []);
  const doubles: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) {
    if (b.a === b.b) continue;
    around[b.a].push(b.b);
    around[b.b].push(b.a);
    if (b.order === 2) {
      doubles[b.a].push(b.b);
      doubles[b.b].push(b.a);
    }
  }
  const element = (i: number) => elementOf(g.atoms[i].el);
  const hs = (i: number) => g.atoms[i].hs ?? 0;
  const atoms = g.atoms.map((a, i) => ({ el: element(i), charge: a.charge ?? 0, hs: hs(i) }));
  const pyramid = lonePairCentres(atoms, g.bonds);
  // (the C=N rule counts hydrogens by valence where none are given)
  const moving = movingCN(
    g.atoms.map((a, i) => ({ el: element(i), charge: a.charge ?? 0, ...(a.hs != null ? { hs: a.hs } : {}) })),
    g.bonds,
  );
  const others = (end: number, partner: number) => around[end].filter((m) => m !== partner);
  const orders = g.atoms.map(() => 0);
  for (const b of g.bonds) {
    if (b.a === b.b) continue;
    orders[b.a] += b.order;
    orders[b.b] += b.order;
  }
  const trigonal = (i: number) => trigonalEnd(element(i), g.atoms[i].charge ?? 0, around[i].length, orders[i], hs(i));
  return { n, around, doubles, element, hs, pyramid, moving, others, trigonal };
}
type Read = ReturnType<typeof readOf>;

/** Why atom `i` is no centre, or null where it is one. */
function centreWhyNot(g: SymmetryInput, r: Read, i: number): string | null {
  const groups = r.around[i].length + r.hs(i);
  const el = r.element(i);
  if (groups > 4) return NOT_CANDIDATE.many(groups);
  if (groups < 3) return NOT_CANDIDATE.few;
  if (NOT_TETRAHEDRAL.has(el)) return NOT_CANDIDATE.metal;
  if (!CENTRE_ELEMENTS.has(el)) return NOT_CANDIDATE.element;
  // (with an H among its three, a P, As, Sb or Bi as without one - a secondary phosphine's P; never an N, S, Se or Te: ./lonePairs)
  if (groups === 3) return r.hs(i) <= 1 && r.pyramid(i) ? null : NOT_CANDIDATE.three;
  if (r.hs(i) > 1) return NOT_CANDIDATE.hydrogens;
  if (el === "N" && (g.atoms[i].charge ?? 0) > 0 && r.hs(i) > 0) return NOT_CANDIDATE.ammonium;
  return null;
}

/** Why double bond `k` is none of a candidate double bond, or null where it is one (a run's bonds are the run's: `NOT_CANDIDATE.run`). */
function bondWhyNot(g: SymmetryInput, r: Read, k: number): string | null {
  const b = g.bonds[k];
  if (b.order !== 2) return NOT_CANDIDATE.notDouble;
  if (r.doubles[b.a].length !== 1 || r.doubles[b.b].length !== 1) return NOT_CANDIDATE.run;
  if (!r.others(b.a, b.b).length || !r.others(b.b, b.a).length) return NOT_CANDIDATE.bare;
  if (!r.trigonal(b.a) || !r.trigonal(b.b)) return NOT_CANDIDATE.notTrigonal;
  const moving = r.moving.get(k);
  if (moving) return NOT_CANDIDATE.moving(MOVING_CN[moving]);
  if (inSmallRing(g, k)) return NOT_CANDIDATE.ring;
  return null;
}

/**
 * Whether bond `k` of `g` is in a ring of `SMALL_RING` atoms or fewer - the smallest ring through it, for a fused or bridged system
 * too (../facts `inRingSmallerThan`, `OPEN_RING`): a double bond there has its ring's one arrangement, cis, and a cis or trans
 * written on it states nothing (P-93.5.1.4.1; Brecher 2006, ST-4.3). The one test a candidate double bond, identity's blanks and
 * the sides a structure was given (`smallRingSidesDropped`) ask.
 */
export function inSmallRing(g: ChemGraph, k: number): boolean {
  return factsOf(g).inRingSmallerThan(k, OPEN_RING);
}

/**
 * `g` with no cis or trans on a double bond in a ring of `SMALL_RING` atoms or fewer (`inSmallRing`), whoever wrote it - a SMILES's
 * marks, a file's, a plugin's answer: there it states nothing, so cyclohexene written C1C/C=C\CC1 is cyclohexene, one structure
 * with C1CC=CCC1, and has no E or Z. A ring of eight or more keeps it: cis- and trans-cyclooctene are two. Identity compares
 * a structure so (lib/chem/identity `compared`) and the CIP labels one so (lib/chem/cip `cipLabels`); a drawing's reader reads
 * no side there in the first place (./from2d). `g` itself where nothing is dropped.
 */
export function smallRingSidesDropped<T extends ChemGraph>(g: T): T {
  if (!g.bonds.some((b, k) => b.stereo && inSmallRing(g, k))) return g;
  return { ...g, bonds: g.bonds.map((b, k) => (b.stereo && inSmallRing(g, k) ? (({ stereo: _stereo, ...rest }) => rest)(b) : b)) };
}

/**
 * Every place of `g` that can carry a configuration (see the file's header), whether it carries one or not, with why: centres by
 * atom, then double bonds by index, then runs by their ends, then the axes the drawing states. `g` is a structure as identity reads
 * it: a plain hydrogen counted among its atom's hydrogens (../fold `hydrogensFolded`).
 */
export function candidates(g: SymmetryInput): Candidate[] {
  const r = readOf(g);
  const out: Candidate[] = [];
  for (let i = 0; i < r.n; i++) {
    if (centreWhyNot(g, r, i) != null) continue;
    out.push({ kind: "centre", at: i, why: r.around[i].length + r.hs(i) === 4 ? CANDIDATE_WHY.four : CANDIDATE_WHY.lonePair });
  }
  g.bonds.forEach((_, k) => {
    if (bondWhyNot(g, r, k) == null) out.push({ kind: "bond", at: k, why: CANDIDATE_WHY.double });
  });
  for (const run of runsOf(g, r)) if (!run.whyNot) out.push({ kind: run.count % 2 ? "cumulated" : "axis", ends: run.ends, why: run.count % 2 ? CANDIDATE_WHY.cumulated : CANDIDATE_WHY.axis });
  // (an axis drawn across a bond - a biaryl's; one drawn between a run's ends is that run's, listed with it)
  const bonded = (p: number, q: number) => r.around[p].includes(q);
  for (const x of g.axes ?? []) if (bonded(x.atoms[0], x.atoms[1])) out.push({ kind: "biaryl", atoms: [...x.atoms], why: CANDIDATE_WHY.biaryl });
  return out;
}

/** Why a place asked of can carry no configuration (see the file's header), or null where it is a candidate. */
export function notCandidate(g: SymmetryInput, asked: Asked): string | null {
  const r = readOf(g);
  if (asked.kind === "centre") return centreWhyNot(g, r, asked.at);
  const why = bondWhyNot(g, r, asked.at);
  if (why !== NOT_CANDIDATE.run) return why;
  // (a bond of a run: the run's own why)
  const b = g.bonds[asked.at];
  const run = runsOf(g, r).find((x) => x.atoms.includes(b.a) && x.atoms.includes(b.b));
  return run ? run.whyNot : why;
}

/**
 * The runs of cumulated double bonds, each from an end of one double bond through atoms of two to the other end of one, with why
 * not: through a C or an N+ bonded by its two double bonds alone, the readers' rule (./runs `linear`) - so that no axis is offered,
 * nor asked filled, where no reader reads one (an S's C=S=C is bent).
 */
function runsOf(g: SymmetryInput, r: Read): { ends: [number, number]; atoms: number[]; count: number; whyNot: string | null }[] {
  const out: { ends: [number, number]; atoms: number[]; count: number; whyNot: string | null }[] = [];
  const graph = { atoms: g.atoms.map((a, i) => ({ el: r.element(i), charge: a.charge ?? 0 })), bonds: g.bonds };
  for (const run of runsThroughLinear(graph, "linear").all) {
    const atoms = [...run.atoms];
    const [e, f] = [atoms[0], atoms[atoms.length - 1]];
    if (r.doubles[e].length !== 1 || r.doubles[f].length !== 1) continue;
    const bare = !r.others(e, atoms[1]).length || !r.others(f, atoms[atoms.length - 2]).length;
    const whyNot = bare ? NOT_CANDIDATE.runEnd : r.element(e) !== "C" || r.element(f) !== "C" ? NOT_CANDIDATE.runNotCarbon : null;
    out.push({ ends: [e, f], atoms, count: atoms.length - 1, whyNot });
  }
  return out;
}
