/**
 * A reader for the plain part of SMILES, as OpenSMILES describes it: atoms
 * of the organic subset and in brackets (isotope, hydrogens, charge),
 * aromatic atoms, branches, ring closures and bond symbols, and "*" for an
 * atom of any kind - enough for the groups Meno's abbreviations stand for
 * (./abbreviations), written by hand. A tetrahedral centre's @ or @@ is
 * kept, as the configuration Meno's layout engine takes - a carbon's, a
 * quaternary N+'s, and that of an atom of three neighbours whose lone pair
 * keeps one (./lonePairCentres: a sulfoxide's S, a phosphine's P, an
 * aziridine's N) - and a double bond's cis or trans, as its neighbours' directional bonds
 * (/ and \) say it. Any other stereo mark (@@@, @TH, @SP and the rest), or
 * an @ on an atom it cannot be read of, is refused with the reason: a
 * configuration is never dropped without a word. So is a quadruple bond
 * ("$"): Meno has no bond of that order. An atom class is kept: a
 * ligand's (./ligands) marks the atoms that bind a metal.
 */
import { torsionSense, type Axial, type Cumulated } from "../layout/stereo";
import { lonePairCentres } from "./lonePairCentres";
import { implicitHydrogens } from "./molecule";
import { isMetal } from "../layout/perceive";
import { CHELATE_RING } from "./chelateRing";
import { runsOf, type Runs } from "./perception/stereo/runs";

export type SmilesAtom = {
  el: string;
  charge?: number;
  /** Hydrogens a bracket atom says it has; an organic-subset atom's are by valence. */
  hs?: number;
  isotope?: number;
  aromatic?: boolean;
  /** Its atom class ([P:1]): which of a ligand's donors it is. */
  cls?: number;
  /** Its configuration, where it is a tetrahedral centre ([C@H], [C@@]). */
  tetra?: Configuration;
};
/**
 * A tetrahedral centre's configuration, as Meno's layout engine takes it
 * (lib/layout/stereo): its neighbours by index, -1 for its H, last, and the
 * sign of the volume the first three span, seen from the centre.
 */
export type Configuration = { neighbours: number[]; volume: 1 | -1 };
/**
 * A bond by atom index; order 4 is aromatic. A double bond with a
 * directional bond (/ or \) on each end has its cis or trans: an atom
 * bonded to each end (`refs`, the first to `a1`), and whether the two are
 * on the same side.
 */
export type SmilesBond = { a1: number; a2: number; order: number; cisTrans?: { refs: [number, number]; cis: boolean } };
/**
 * The atoms and bonds, and the configurations that are not an atom's or a
 * bond's: an allene's axis, from an @ or @@ on its middle atom (`axes`),
 * and an odd cumulene's cis or trans, from the directional bonds at its
 * ends (`cumulated`) - each by atom index, as lib/layout/stereo has them.
 */
export type Smiles = { atoms: SmilesAtom[]; bonds: SmilesBond[]; axes?: Axial[]; cumulated?: Cumulated[]; arrangements?: MarkedArrangement[] };
/** A metal whose square-planar or octahedral mark (@SP1-3, @OH1-30) says which of its neighbours are across from each other: by atom index. */
export type MarkedArrangement = { metal: number; pairs: [number, number][] };

const ORGANIC = ["Cl", "Br", "B", "C", "N", "O", "P", "S", "F", "I"];
const AROMATIC = ["b", "c", "n", "o", "p", "s"];
const BOND_ORDER: Record<string, number> = { "-": 1, "=": 2, "#": 3, ":": 4, "/": 1, "\\": 1 };
/** Why a quadruple bond ("$", OpenSMILES's bond symbols) is refused: Meno has no bond of that order, and never reads one as another. */
export const QUADRUPLE_REFUSED = "a quadruple bond, which Meno does not draw";

/**
 * The aromatic bonds (order 4) that lie in no ring of aromatic bonds - each a
 * bridge of the graph of aromatic bonds alone - found in one walk over it,
 * as long as the molecule is large (Tarjan's bridges: a bond is one where no
 * path back reaches above it).
 */
function aromaticBridges(atoms: number, bonds: readonly SmilesBond[]): Set<number> {
  const near: { to: number; bond: number }[][] = Array.from({ length: atoms }, () => []);
  bonds.forEach((b, k) => {
    if (b.order !== 4) return;
    near[b.a1].push({ to: b.a2, bond: k });
    near[b.a2].push({ to: b.a1, bond: k });
  });
  const order = new Array<number>(atoms).fill(-1);
  const low = new Array<number>(atoms).fill(0);
  const bridges = new Set<number>();
  let count = 0;
  for (let root = 0; root < atoms; root++) {
    if (order[root] >= 0 || !near[root].length) continue;
    // (each step: an atom, the bond it was reached by, and how far through its neighbours the walk is)
    const stack: { at: number; via: number; next: number }[] = [{ at: root, via: -1, next: 0 }];
    order[root] = low[root] = count++;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.next < near[top.at].length) {
        const { to, bond } = near[top.at][top.next++];
        if (bond === top.via) continue;
        if (order[to] >= 0) low[top.at] = Math.min(low[top.at], order[to]);
        else {
          order[to] = low[to] = count++;
          stack.push({ at: to, via: bond, next: 0 });
        }
        continue;
      }
      stack.pop();
      const up = stack[stack.length - 1];
      if (!up) continue;
      low[up.at] = Math.min(low[up.at], low[top.at]);
      if (low[top.at] > order[up.at]) bridges.add(top.via);
    }
  }
  return bridges;
}

/**
 * A SMILES string's atoms and bonds; throws on what it cannot read. With `metalMarks`, a metal's square-planar or octahedral
 * mark (@SP1-3, @OH1-30) is read as which of its neighbours are across (`arrangements`, `pairsMarked`); without, it is refused
 * as any other mark is - a caller that does not take the pairs never drops them without a word.
 */
export function readSmiles(text: string, { metalMarks = false }: { metalMarks?: boolean } = {}): Smiles {
  const atoms: SmilesAtom[] = [];
  const bonds: SmilesBond[] = [];
  const stack: number[] = [];
  const rings = new Map<number, { atom: number; order: number | null; slot: number; dir: string | null }>();
  // each atom's neighbours in the order OpenSMILES reads a centre's by: the
  // atom before it, its own H, its ring closures as their digits come, then
  // the atoms after it; and the centres, @ or @@
  const around: number[][] = [];
  const chiral = new Map<number, string>();
  let prev = -1;
  let pending: number | null = null;
  // (a directional bond's mark, / or \, and each such bond as written: from
  // the atom before it to the atom after)
  let pendingDir: string | null = null;
  const directed: { from: number; to: number; up: boolean }[] = [];
  let i = 0;
  // (the atoms written first, with no atom before them: their H, or lone pair, is the one looked from; and those
  // that carry a ring-closure digit themselves)
  const first = new Set<number>();
  // (the bonds written with no symbol between two aromatic atoms, taken as aromatic for now: one in no ring is single, below)
  const unwritten = new Set<number>();
  const closes = new Set<number>();
  const connect = (a: number, mark = "") => {
    if (prev < 0) first.add(a);
    around[a] = prev >= 0 ? [prev] : [];
    if (mark) chiral.set(a, mark);
    if (atoms[a].hs === 1) around[a].push(-1);
    if (prev >= 0) {
      const both = atoms[prev].aromatic && atoms[a].aromatic;
      if (pending == null && both) unwritten.add(bonds.length);
      bonds.push({ a1: prev, a2: a, order: pending ?? (both ? 4 : 1) });
      around[prev].push(a);
      if (pendingDir) directed.push({ from: prev, to: a, up: pendingDir === "/" });
    }
    pending = null;
    pendingDir = null;
    prev = a;
  };
  while (i < text.length) {
    const c = text[i];
    if (c === "(") {
      stack.push(prev);
      i++;
      continue;
    }
    if (c === ")") {
      if (!stack.length) throw new Error(`Unopened branch at ${i} in ${text}`);
      prev = stack.pop()!;
      i++;
      continue;
    }
    if (c === ".") {
      prev = -1;
      i++;
      continue;
    }
    if (c === "$") throw new Error(`Cannot read "$" at ${i} in ${text}: ${QUADRUPLE_REFUSED}`);
    if (c in BOND_ORDER) {
      pending = BOND_ORDER[c];
      if (c === "/" || c === "\\") pendingDir = c;
      i++;
      continue;
    }
    if (/\d/.test(c) || c === "%") {
      const n = c === "%" ? Number.parseInt(text.slice(i + 1, i + 3), 10) : Number.parseInt(c, 10);
      i += c === "%" ? 3 : 1;
      closes.add(prev);
      const open = rings.get(n);
      if (open) {
        const both = atoms[open.atom].aromatic && atoms[prev].aromatic;
        if (pending == null && open.order == null && both) unwritten.add(bonds.length);
        bonds.push({ a1: open.atom, a2: prev, order: pending ?? open.order ?? (both ? 4 : 1) });
        around[open.atom][open.slot] = prev;
        around[prev].push(open.atom);
        // (a ring bond's direction as written where its mark is: at its
        // closing digit, from this atom to the one that opened it; at its
        // opening one, from that atom to this)
        if (pendingDir) directed.push({ from: prev, to: open.atom, up: pendingDir === "/" });
        else if (open.dir) directed.push({ from: open.atom, to: prev, up: open.dir === "/" });
        rings.delete(n);
      } else {
        rings.set(n, { atom: prev, order: pending, slot: around[prev].push(-2) - 1, dir: pendingDir });
      }
      pending = null;
      pendingDir = null;
      continue;
    }
    if (c === "*") {
      atoms.push({ el: "*" });
      connect(atoms.length - 1);
      i++;
      continue;
    }
    if (c === "[") {
      const end = text.indexOf("]", i);
      if (end < 0) throw new Error(`Unclosed bracket at ${i} in ${text}`);
      const { atom, mark } = bracketAtom(text.slice(i + 1, end));
      atoms.push(atom);
      connect(atoms.length - 1, mark);
      i = end + 1;
      continue;
    }
    const organic = ORGANIC.find((s) => text.startsWith(s, i));
    if (organic) {
      atoms.push({ el: organic });
      connect(atoms.length - 1);
      i += organic.length;
      continue;
    }
    if (AROMATIC.includes(c)) {
      atoms.push({ el: c.toUpperCase(), aromatic: true });
      connect(atoms.length - 1);
      i++;
      continue;
    }
    throw new Error(`Cannot read "${c}" at ${i} in ${text}`);
  }
  if (rings.size) throw new Error(`Unclosed ring in ${text}`);
  // An unwritten bond between two aromatic atoms is aromatic only where it is
  // in a ring of them (OpenSMILES, *Aromaticity*): one that joins two rings
  // - a biaryl written c1ccccc1c1ccccc1, 2,2'-bipyridine as
  // c1ccc(nc1)c1ccccn1, or that bipyridine chelating a metal, its two rings
  // in a ring through the metal - is single, and each ring is its own system
  // (read as aromatic, the two were one system of twelve atoms, and two of
  // its N were read with an H nobody wrote)
  const bridges = unwritten.size ? aromaticBridges(atoms.length, bonds) : new Set<number>();
  for (const k of unwritten) if (bridges.has(k)) bonds[k] = { ...bonds[k], order: 1 };
  const keepsPyramid = chiral.size
    ? lonePairCentres(
        atoms.map((a) => ({ el: a.el, charge: a.charge, hs: a.hs ?? 0 })),
        bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
      )
    : () => false;
  const orderOf = new Map(bonds.map((b) => [b.a1 < b.a2 ? `${b.a1},${b.a2}` : `${b.a2},${b.a1}`, b.order]));
  const order = (a: number, b: number) => orderOf.get(a < b ? `${a},${b}` : `${b},${a}`) ?? 0;
  // (its runs of cumulated double bonds: perception/stereo/runs, the reader's rule of what a run goes on through)
  const runs = runsOf({ atoms, bonds: bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) });
  const axes: Axial[] = [];
  const arrangements: MarkedArrangement[] = [];
  for (const [at, written] of chiral) {
    let mark = written;
    // (a bare @ or @@ at a metal of six neighbours: the octahedral class's first two, @OH1 and @OH2 - the default class for six
    //  connections (Daylight; OpenSMILES's own table writes [Co@] so). At four it stays a tetrahedral mark, refused below: never
    //  read as square planar)
    if (metalMarks && (mark === "@" || mark === "@@") && isMetal(atoms[at].el)) {
      if (around[at].length !== 6) throw new Error(`Cannot read the arrangement at [${atoms[at].el}${mark}] in ${text}: a bare ${mark} at a metal of ${around[at].length} neighbours states none`);
      mark = mark === "@" ? "@OH1" : "@OH2";
    }
    // (a metal's @SP or @OH: its neighbours across, from the order they are written in - none of them its own H)
    if (metalMarks && /^@(SP|OH)\d/.test(mark)) {
      const why = (reason: string) => new Error(`Cannot read the arrangement at [${atoms[at].el}${mark}] in ${text}: ${reason}`);
      if (!isMetal(atoms[at].el)) throw why("only a metal's is read");
      if (around[at].includes(-1)) throw why("a neighbour written as the metal's own H is not read");
      const n = Number.parseInt(mark.slice(3), 10);
      if (mark.startsWith("@SP") ? n < 1 || n > 3 : n < 1 || n > 30) throw why(`${mark.slice(1)} is not a mark OpenSMILES has`);
      const pairs = pairsMarked(mark.slice(1), around[at]);
      if (!pairs) throw why(`${mark.startsWith("@SP") ? "four" : "six"} neighbours are needed, and it has ${around[at].length}`);
      // (two ends of one chelate across - joined, not through the metal, by a ring of CHELATE_RING atoms or fewer, which cannot
      //  span it: a mark that cannot be, refused, as identity's own fill never puts them so)
      const joined = (p: number, q: number) => {
        let ring = [p];
        const seen = new Set([p, at]);
        for (let d = 1; d <= CHELATE_RING - 2 && ring.length; d++) {
          const next: number[] = [];
          for (const x of ring)
            for (const y of around[x] ?? []) {
              if (y === q) return true;
              if (y < 0 || seen.has(y)) continue;
              seen.add(y);
              next.push(y);
            }
          ring = next;
        }
        return false;
      };
      if (pairs.some(([p, q]) => joined(p, q))) throw why(`it puts two ends of one chelate across, which a ring of ${CHELATE_RING} atoms or fewer cannot span`);
      arrangements.push({ metal: at, pairs });
      continue;
    }
    // (an @ between two double bonds: an allene's middle atom - a carbon or an N+, not a sulfur's: C=S=C is bent)
    if (runs.middle(at)) {
      axes.push(alleneAxis(at, mark, atoms, around, order, text, runs));
      continue;
    }
    const double = bonds.some((b) => b.order === 2 && (b.a1 === at || b.a2 === at));
    atoms[at].tetra = configuration(atoms[at], around[at], mark, { first: first.has(at), closes: closes.has(at), double, lonePair: keepsPyramid(at) }, text);
  }
  // A double bond's cis or trans (OpenSMILES): a directional bond on each
  // end; a neighbour written before its end with "/" lies below it, one
  // written after it above, "\\" the other way; the two the same side, cis
  // (F/C=C/F trans, F/C=C\\F cis)
  const side = (end: number, other: number) => {
    const d = directed.find((b) => (b.from === end && b.to !== other) || (b.to === end && b.from !== other));
    if (!d) return null;
    const n = d.from === end ? d.to : d.from;
    return { n, above: d.from === end ? d.up : !d.up };
  };
  for (const b of bonds) {
    if (b.order !== 2) continue;
    const [p, q] = [side(b.a1, b.a2), side(b.a2, b.a1)];
    if (p && q) b.cisTrans = { refs: [p.n, q.n], cis: p.above === q.above };
  }
  // and an odd cumulene's, likewise, at its two ends (OpenSMILES, *Cis/Trans
  // configuration of double bonds*: F/C=C=C=C/F trans, F/C=C=C=C\F cis)
  const cumulated: Cumulated[] = [];
  for (const { atoms: run, odd } of runs.all) {
    if (!odd) continue;
    const [t1, c1] = [run[0], run[1]];
    const [t2, c2] = [run[run.length - 1], run[run.length - 2]];
    const [p, q] = [side(t1, c1), side(t2, c2)];
    if (p && q) cumulated.push({ atoms: [t1, t2], refs: [p.n, q.n], cis: p.above === q.above });
  }
  return { atoms, bonds, ...(axes.length ? { axes } : {}), ...(cumulated.length ? { cumulated } : {}), ...(arrangements.length ? { arrangements } : {}) };
}

/**
 * The shape each square-planar mark draws through its four neighbours in their written order (OpenSMILES specification,
 * version 1.0, 2016-05-15, *Square Planar Centers*: SP1 the U, SP2 the 4, SP3 the Z; the octahedral table below is its
 * *Octahedral Centers*), as which of the four lie across: the U goes round, so the first and third and the second and fourth;
 * the Z starts and ends across, so the first and fourth and the second and third (its start and end
 * "never adjacent"); the 4, the one left, the first and second and the third and fourth.
 */
const SHAPE_PAIRS: Record<"U" | "Z" | "4", [number, number][]> = { U: [[0, 2], [1, 3]], Z: [[0, 3], [1, 2]], "4": [[0, 1], [2, 3]] };
const SQUARE_SHAPE: Record<number, "U" | "Z" | "4"> = { 1: "U", 2: "4", 3: "Z" };
/**
 * Each octahedral mark's axis - the first neighbour and the one across from it, by its place among the six (b to f: 1 to 5) -
 * and the shape the other four are drawn in, in their written order (OpenSMILES, *Octahedral Centers*, its table; the order,
 * @ or @@, a hand, says nothing of which are across and is not kept).
 */
const OCTAHEDRAL: Record<number, [number, "U" | "Z" | "4"]> = {
  1: [5, "U"], 2: [5, "U"], 3: [4, "U"], 16: [4, "U"], 6: [3, "U"], 18: [3, "U"], 19: [2, "U"], 24: [2, "U"], 25: [1, "U"], 30: [1, "U"],
  4: [5, "Z"], 14: [5, "Z"], 5: [4, "Z"], 15: [4, "Z"], 7: [3, "Z"], 17: [3, "Z"], 20: [2, "Z"], 23: [2, "Z"], 26: [1, "Z"], 29: [1, "Z"],
  10: [5, "4"], 8: [5, "4"], 11: [4, "4"], 9: [4, "4"], 13: [3, "4"], 12: [3, "4"], 22: [2, "4"], 21: [2, "4"], 28: [1, "4"], 27: [1, "4"],
};

/**
 * The pairs of `neighbours` across from each other that a square-planar mark (SP1-SP3) or an octahedral one (OH1-OH30) states,
 * the neighbours in OpenSMILES's order (the atom before, then ring closures as their digits come, then the atoms after). Null
 * for any other mark, or where the neighbours are not four for SP, six for OH.
 */
export function pairsMarked(mark: string, neighbours: readonly number[]): [number, number][] | null {
  const m = /^(SP|OH)(\d{1,2})$/.exec(mark);
  if (!m) return null;
  const n = Number.parseInt(m[2], 10);
  const pick = (four: readonly number[], shape: "U" | "Z" | "4") => SHAPE_PAIRS[shape].map(([p, q]): [number, number] => [four[p], four[q]]);
  if (m[1] === "SP") return neighbours.length === 4 && SQUARE_SHAPE[n] ? pick(neighbours, SQUARE_SHAPE[n]) : null;
  if (neighbours.length !== 6 || !OCTAHEDRAL[n]) return null;
  const [across, shape] = OCTAHEDRAL[n];
  return [[neighbours[0], neighbours[across]], ...pick(neighbours.filter((_, k) => k !== 0 && k !== across), shape)];
}

/**
 * An allene's axis from the @ or @@ on its middle atom (OpenSMILES,
 * *Tetrahedral Allene-like Systems*): the run of cumulated double bonds
 * "collapsed" into one tetrahedral centre, its neighbours the two ends'
 * other neighbours - the end the middle atom is written from first, each
 * end's in the order a centre's are read (the atom before it, its H, its
 * ring closures, the atoms after it) - and the @ or @@ read of those four
 * as of a centre's (*Tetrahedral Centers*). Put as an axis: the ends, a
 * neighbour of each, and the sign of the torsion between them, the
 * collapsed centre's turn kept, since pressing the run flat along its axis
 * turns nothing. A mark not on the middle of an even run, or an end
 * without two neighbours besides the run (a CH2), is refused.
 */
function alleneAxis(at: number, mark: string, atoms: readonly SmilesAtom[], around: readonly number[][], order: (a: number, b: number) => number, text: string, runs: Runs): Axial {
  const why = (reason: string) => new Error(`Cannot read the configuration at [${atoms[at].el}${mark}] in ${text}: ${reason}`);
  if (mark !== "@" && mark !== "@@") throw why("only @ and @@ are read");
  const near = (a: number) => around[a].filter((m) => m >= 0);
  // (each way along the run to its end: the end, and the atom before it)
  const end = (from: number) => {
    const run = runs.from(at, from);
    return { end: run[run.length - 1], before: run[run.length - 2], steps: run.length - 1 };
  };
  const [first, last] = near(at).map(end);
  if (first.steps !== last.steps) throw why("it is not the middle atom of its run of cumulated double bonds");
  // (an end's neighbours but the run, in the order a centre's are read: its H where a bracket's would be, after the atom before it)
  const others = ({ end: e, before }: { end: number; before: number }): number[] => {
    const a = atoms[e];
    const sum = near(e).reduce((t, m) => t + order(e, m), 0);
    const hs = a.hs ?? (a.aromatic ? 0 : implicitHydrogens(a.el, sum, a.charge ?? 0));
    const listed = around[e].includes(-1) ? [...around[e]] : around[e].length && around[e][0] >= 0 && e > around[e][0] ? [around[e][0], ...Array(hs).fill(-1), ...around[e].slice(1)] : [...Array(hs).fill(-1), ...around[e]];
    return listed.filter((m) => m !== before);
  };
  const ends = [first, last];
  const four = ends.flatMap(others);
  if (ends.some((x) => others(x).length !== 2) || ends.some((x) => others(x).every((m) => m < 0))) throw why("each end of an allene needs two neighbours besides it, not both hydrogens");
  // (the collapsed centre's four corners: the first three span a positive volume for @, as a centre's do (`configuration`))
  const corner = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ];
  if (mark === "@@") [corner[1], corner[2]] = [corner[2], corner[1]];
  const mid = (u: number[], v: number[]) => u.map((x, k) => (x + v[k]) / 2);
  const [near0, near1] = [mid(corner[0], corner[1]), mid(corner[2], corner[3])];
  // (each end's reference: its first neighbour that is an atom)
  const p = four[0] >= 0 ? 0 : 1;
  const q = four[2] >= 0 ? 2 : 3;
  const sense = torsionSense(corner[p], near0, near1, corner[q]);
  return { atoms: [first.end, last.end], refs: [four[p], four[q]], sense: sense as 1 | -1 };
}

/**
 * A centre's configuration from its neighbours in SMILES order and its
 * mark: @, looking from the first, the other three go round anticlockwise;
 * @@, clockwise (OpenSMILES, *Tetrahedral Centers*). Its implicit H is
 * where the Daylight SMILES theory manual (3.3.3) puts it: the "from" atom
 * where the centre is written first, else the first of the three that
 * follow. A centre with three neighbours and a lone pair that keeps its
 * configuration (`lonePair`, ./lonePairCentres) has its lone pair taken in
 * the H's place: neither text says
 * where a lone pair goes, and that is where the H's rule puts it, as RDKit
 * reads it (measured on its 3D embeddings: the first of the three that
 * follow, or the last, which is the same configuration). Written first,
 * the H's rule would look from it and RDKit takes it as the last: the two
 * disagree, and it is refused.
 * Put in the engine's terms - its H last, the sign turned for every place
 * it moves; a lone pair, not an atom, left out. Any other mark, or a centre
 * that is none of these, is refused, never read past.
 */
function configuration(
  atom: SmilesAtom,
  neighbours: readonly number[],
  mark: string,
  at: { first: boolean; closes: boolean; double: boolean; lonePair: boolean },
  text: string,
): Configuration {
  const why = (reason: string) => new Error(`Cannot read the configuration at [${atom.el}${mark}] in ${text}: ${reason}`);
  if (mark !== "@" && mark !== "@@") throw why(`only @ and @@ are read`);
  let around = [...neighbours];
  const three = around.length === 3 && !around.includes(-1) && !(atom.hs ?? 0);
  if (three && !at.lonePair && atom.el !== "C" && atom.el !== "Si")
    throw why(`a ${atom.el} of three neighbours keeps no configuration of its own: its lone pair turns it over at room temperature, or it has none`);
  const lonePair = three && at.lonePair;
  // (written first, where the H's rule would look from its lone pair and the reading libraries do not - RDKit takes
  // it as the last of four - the configuration is not read: refused. Else first of the three that follow, as an H)
  if (lonePair && at.first) throw why("a centre with a lone pair written first is read differently by different readers - write an atom before it");
  // (with a ring-closure digit of its own and no double bond on it - a phosphine's, an arsine's, a sulfonium's ring -
  // RDKit reads it the other way: measured on RDKit's 3D embeddings, 18 of 18 such P, As and S+ rings opposite; with
  // one - a sulfoxide, a selenoxide, a sulfilimine (S=N), an S=C - they agree, 64 of 64)
  if (lonePair && at.closes && !at.double) throw why("a centre with a lone pair and no double bond that closes a ring at itself is read differently by different readers - write the ring closure on another atom");
  if (lonePair) around.splice(1, 0, -1);
  if (around.length !== 4 || around.filter((n) => n === -1).length > 1) throw why(`it has ${neighbours.length} neighbours, not four (or three and a lone pair)`);
  const h = around.indexOf(-1);
  const moves = h < 0 ? 0 : 3 - h;
  const sign = (mark === "@" ? 1 : -1) * (moves % 2 ? -1 : 1);
  around = h < 0 ? around : [...around.filter((n) => n !== -1), ...(lonePair ? [] : [-1])];
  return { neighbours: around, volume: sign as 1 | -1 };
}

/** What is inside a bracket: [isotope] symbol [chirality] [H count] [charge] [:class]. */
function bracketAtom(body: string): { atom: SmilesAtom; mark: string } {
  const m = /^(\d+)?(\*|[A-Z][a-z]?|[a-z][a-z]?)(@(?:SP\d|OH\d{1,2}|TB\d{1,2}|TH\d|AL\d)|@*)(H\d*)?([+-]\d*|\+\+|--)?(?::(\d+))?$/.exec(body);
  if (!m) throw new Error(`Cannot read [${body}]`);
  const [, iso, sym, mark, h, q, cls] = m;
  const aromatic = /^[a-z]/.test(sym);
  const atom: SmilesAtom = { el: aromatic ? sym[0].toUpperCase() + sym.slice(1) : sym };
  if (aromatic) atom.aromatic = true;
  if (iso) atom.isotope = Number.parseInt(iso, 10);
  atom.hs = h ? (h.length > 1 ? Number.parseInt(h.slice(1), 10) : 1) : 0;
  if (cls) atom.cls = Number.parseInt(cls, 10);
  if (q) {
    const sign = q[0] === "+" ? 1 : -1;
    atom.charge = q === "++" || q === "--" ? 2 * sign : sign * (q.length > 1 ? Number.parseInt(q.slice(1), 10) : 1);
  }
  return { atom, mark };
}

// --- writing -----------------------------------------------------------------

/** An atom to write: its element ("*" for an attachment), and what a bracket says of it. */
export type SmilesAtomOut = { el: string; charge?: number; isotope?: number; hs: number };

/** The valences an organic-subset atom may have, as OpenSMILES fills its hydrogens to. */
const NORMAL_VALENCES: Record<string, number[]> = {
  B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1], Br: [1], I: [1],
};

/** The hydrogens OpenSMILES gives an organic-subset atom written plainly, for bonds summing to `sum`. */
function plainHydrogens(el: string, sum: number): number | null {
  const normal = NORMAL_VALENCES[el];
  if (!normal) return null;
  const v = normal.find((n) => n >= sum);
  return v == null ? 0 : v - sum;
}

/**
 * Atoms and bonds as SMILES (OpenSMILES), from atom `start` - an
 * abbreviation's "*" first, as Meno writes them. Bonds are written as
 * their orders (Kekulé), an atom plainly where the organic subset's
 * hydrogens are its own and in brackets otherwise: with its isotope, its
 * hydrogens and its charge. Rings are closed with digits, then %nn; parts
 * not joined to the rest follow after a dot.
 */
export function writeSmiles(atoms: readonly SmilesAtomOut[], bonds: readonly SmilesBond[], start = 0): string {
  const near = atoms.map(() => [] as { to: number; order: number; bond: number }[]);
  bonds.forEach((b, i) => {
    near[b.a1].push({ to: b.a2, order: b.order, bond: i });
    near[b.a2].push({ to: b.a1, order: b.order, bond: i });
  });
  const sums = atoms.map((_, i) => near[i].reduce((s, e) => s + e.order, 0));
  // which bonds the walk goes along; the rest close rings
  const seen = atoms.map(() => false);
  const tree = new Set<number>();
  const walk = (u: number) => {
    seen[u] = true;
    for (const e of near[u]) {
      if (!seen[e.to]) {
        tree.add(e.bond);
        walk(e.to);
      }
    }
  };
  const roots: number[] = [];
  for (const r of [start, ...atoms.map((_, i) => i)]) {
    if (r < atoms.length && !seen[r]) {
      roots.push(r);
      walk(r);
    }
  }
  const symbol = (order: number) => (order === 2 ? "=" : order === 3 ? "#" : order === 4 ? ":" : "");
  const atomText = (i: number) => {
    const a = atoms[i];
    if (a.el === "*" && !a.charge && !a.isotope && !a.hs) return "*";
    const plain = plainHydrogens(a.el, sums[i]);
    if (!a.charge && !a.isotope && plain === a.hs) return a.el;
    const charge = !a.charge ? "" : `${a.charge > 0 ? "+" : "-"}${Math.abs(a.charge) > 1 ? Math.abs(a.charge) : ""}`;
    return `[${a.isotope ?? ""}${a.el}${a.hs ? `H${a.hs > 1 ? a.hs : ""}` : ""}${charge}]`;
  };
  const digits = new Map<number, number>();
  const free: number[] = [];
  let next = 1;
  const written = atoms.map(() => false);
  const write = (u: number): string => {
    written[u] = true;
    let out = atomText(u);
    for (const e of near[u]) {
      if (tree.has(e.bond)) continue;
      const open = digits.get(e.bond);
      if (open != null) {
        out += open < 10 ? `${open}` : `%${open}`;
        digits.delete(e.bond);
        free.push(open);
      } else {
        free.sort((x, y) => x - y);
        const n = free.length ? free.shift()! : next++;
        digits.set(e.bond, n);
        out += symbol(e.order) + (n < 10 ? `${n}` : `%${n}`);
      }
    }
    const children = near[u].filter((e) => tree.has(e.bond) && !written[e.to]);
    children.forEach((e, k) => {
      const branch = symbol(e.order) + write(e.to);
      out += k < children.length - 1 ? `(${branch})` : branch;
    });
    return out;
  };
  return roots.map(write).join(".");
}
