/**
 * A molecule's bond orders estimated from where its atoms stand - for a
 * file of coordinates, with or without its hydrogens (docs/WORKSPACE.md,
 * *Hydrogens and bond orders*). Three kinds of evidence, weighed together:
 *
 * - **Lengths.** A bond's length set against the sums of its atoms'
 *   single-, double- and triple-bond covalent radii (./elements,
 *   Pyykkö's) reads as an order between one and three: 1.39 Å between two
 *   carbons is about one and a half.
 * - **Shapes.** What an atom's neighbours make of it: a carbon with four is
 *   saturated; with three in a plane, it has one double bond, pyramidal,
 *   none; with two in a line, a triple bond or two doubles. Where the
 *   molecule has its hydrogens, each atom's valence says it exactly.
 * - **Rings.** A flat five- or six-membered ring whose double bonds and
 *   lone pairs make it aromatic - 4n+2 electrons in its ring - is how such
 *   a ring is far more often than not.
 *
 * The orders chosen are those, of all an atom's shape allows, that cost
 * least against the lengths, less what aromatic rings bring - a search
 * over each conjugated part. Where no choice gives an atom what its shape
 * plainly asks (a plane carbon left without a double bond) or its valence
 * sets, the estimate is not decided. Pure: atoms and bonds in, orders and
 * formal charges out. (Comparing a bond's length with bond-type radii, and
 * counting a ring's electrons, are as the maintainer's ACCeL does; the code
 * is Meno's own.)
 */
import { elementOf } from "./elements";

export type GeoAtom = { el: string; x: number; y: number; z: number };
export type GeoBond = { a1: number; a2: number };

/** Each bond's order (one to three) and each atom's formal charge; `decided`, whether every atom was given what its shape asks. */
export type GeometryOrders = { orders: number[]; charges: number[]; decided: boolean };

/** Elements whose bonds are counted: a metal's are dative, kept single and out of the reckoning. */
const COUNTED = new Set(["H", "B", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Ge", "As", "Se", "Br", "Te", "I"]);

/** An atom's three neighbours in a plane: the sum of its bond angles at least this, in degrees (360 flat, about 328 at a tetrahedron's corner); at most `PYRAMID_SUM`, pyramidal. */
const PLANE_SUM = 350;
const PYRAMID_SUM = 340;
/** Two neighbours in a line: a bond angle at least this open, in degrees; spread as a double bond's carbon's, at least `TRIGONAL` (sp2 about 120, sp3 about 109.5) - in a ring of five or fewer, whose angles are its own, not read. */
const LINE = 165;
const TRIGONAL = 116;
/** A ring flat: none of its torsion angles more than this, in degrees. */
const FLAT = 15;

/** What a plain shape left unmet costs; a carbon spread as a double bond's left without one; a charge an atom takes on; what an aromatic ring brings - half, where a double bond of its leaves it (a pyridone's C=O). */
const UNMET = 2;
const SPREAD = 0.5;
const CHARGED = 0.2;
const AROMATIC = 0.6;

/** How many nodes the search may visit for one conjugated part before it gives up. */
const MOST_NODES = 200_000;

/**
 * How many bonds beyond single an atom may have (`min` to `max`): `strong`,
 * whether its shape asks its minimum plainly (left unmet, the estimate is
 * not decided); `exact`, whether its valence sets it, never to be left
 * unmet; `terminalOnly`, whether its extra bonds go only to a heteroatom
 * bonded to nothing else (a sulfonyl's oxygens); `cost`, what a number of
 * extra bonds costs it - a charge it takes on, a shape it fits less well.
 */
type Range = { min: number; max: number; strong?: boolean; exact?: boolean; terminalOnly?: boolean; cost?: (extra: number) => number };

const dist = (a: GeoAtom, b: GeoAtom) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function angle(o: GeoAtom, a: GeoAtom, b: GeoAtom): number {
  const u = [a.x - o.x, a.y - o.y, a.z - o.z];
  const v = [b.x - o.x, b.y - o.y, b.z - o.z];
  const c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

function torsion(a: GeoAtom, b: GeoAtom, c: GeoAtom, d: GeoAtom): number {
  const b1 = [b.x - a.x, b.y - a.y, b.z - a.z];
  const b2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const b3 = [d.x - c.x, d.y - c.y, d.z - c.z];
  const cross = (p: number[], q: number[]) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  const m = cross(n1, b2.map((v) => v / Math.hypot(...b2)));
  return (Math.atan2(dot(m, n2), dot(n1, n2)) * 180) / Math.PI;
}

/** A bond's order as its length reads: one at the single-bond radii's sum or longer, two at the double's, three at the triple's, between in proportion. Null where the elements have no double-bond radii. */
export function orderFromLength(elA: string, elB: string, d: number): number | null {
  const a = elementOf(elA)?.radii;
  const b = elementOf(elB)?.radii;
  if (!a || !b || a[0] == null || b[0] == null || a[1] == null || b[1] == null) return null;
  const l1 = (a[0] + b[0]) / 100;
  const l2 = (a[1] + b[1]) / 100;
  if (d >= l1) return 1;
  if (d >= l2) return 1 + (l1 - d) / (l1 - l2);
  if (a[2] == null || b[2] == null) return 2;
  const l3 = (a[2] + b[2]) / 100;
  return d <= l3 ? 3 : 2 + (l2 - d) / (l2 - l3);
}

const chargedAbove = (n: number) => (extra: number) => (extra > n ? CHARGED : 0);

/**
 * An atom's range (see `Range`) by its element, its neighbours (`around`),
 * how many of them are heteroatoms bonded to nothing else (`terminals`),
 * and whether the molecule has its hydrogens.
 */
function rangeOf(el: string, around: GeoAtom[], at: GeoAtom, terminals: number, hydrogens: boolean, smallRing: boolean): Range {
  const deg = around.length;
  const sum3 = deg === 3 ? angle(at, around[0], around[1]) + angle(at, around[0], around[2]) + angle(at, around[1], around[2]) : 0;
  const plane = deg === 3 && sum3 >= PLANE_SUM;
  const pyramid = deg === 3 && sum3 <= PYRAMID_SUM;
  const line = deg === 2 && angle(at, around[0], around[1]) >= LINE;
  switch (el) {
    case "C": {
      if (hydrogens) return { min: Math.max(0, 4 - deg), max: Math.max(0, 4 - deg), exact: true };
      if (deg >= 4) return { min: 0, max: 0 };
      if (deg === 3) return plane ? { min: 1, max: 1, strong: true } : pyramid ? { min: 0, max: 0 } : { min: 0, max: 1 };
      if (deg === 2) return line ? { min: 2, max: 2, strong: true } : !smallRing && angle(at, around[0], around[1]) >= TRIGONAL ? { min: 0, max: 1, cost: (extra) => (extra ? 0 : SPREAD) } : { min: 0, max: 1 };
      return { min: 0, max: 2 };
    }
    case "N": {
      // (a nitro group's, or an N-oxide's, nitrogen carries its charge with its oxygen's: no cost)
      const cost = terminals ? undefined : chargedAbove(hydrogens ? Math.max(0, 3 - deg) : deg >= 3 ? 0 : 1);
      if (hydrogens) return { min: Math.max(0, 3 - deg), max: Math.max(0, 4 - deg), exact: true, cost };
      if (deg >= 4) return { min: 0, max: 0 };
      if (deg === 3) return pyramid ? { min: 0, max: 0 } : { min: 0, max: 1, cost };
      if (deg === 2) return { min: 0, max: line ? 2 : 1, cost };
      return { min: 0, max: 2 };
    }
    case "O":
    case "S":
    case "Se":
    case "Te": {
      // (sulfur's expanded valence, as drawn: a sulfoxide's S=O, a sulfonyl's two)
      if (el !== "O" && deg >= 3 && terminals) {
        const most = deg === 3 ? 1 : 2;
        return { min: Math.min(most, terminals), max: most, terminalOnly: true };
      }
      // (an oxygen with its hydrogens counted and none of its own: an anion, at a cost)
      if (hydrogens) return deg === 1 ? { min: 0, max: 1, cost: (extra) => (extra ? 0 : CHARGED) } : { min: 0, max: 0 };
      return deg === 1 ? { min: 0, max: 1 } : { min: 0, max: 0 };
    }
    case "P":
    case "As": {
      // (a phosphate's or phosphine oxide's one P=O)
      if (deg === 4 && terminals) return { min: 1, max: 1, terminalOnly: true };
      if (hydrogens) return { min: Math.max(0, 3 - deg), max: Math.max(0, 3 - deg), exact: true };
      return deg <= 2 ? { min: 0, max: 1 } : { min: 0, max: 0 };
    }
    case "Si":
    case "Ge":
      return hydrogens ? { min: Math.max(0, 4 - deg), max: Math.max(0, 4 - deg), exact: true } : { min: 0, max: deg <= 3 ? 1 : 0 };
    default:
      return { min: 0, max: 0 };
  }
}

/** The molecule's rings of three to six atoms, each its atoms in order around it. */
function smallRings(atoms: readonly GeoAtom[], near: number[][]): number[][] {
  const seen = new Set<string>();
  const rings: number[][] = [];
  const walk = (path: number[]) => {
    const last = path[path.length - 1];
    for (const next of near[last]) {
      if (next === path[0] && path.length >= 3) {
        const key = [...path].sort((p, q) => p - q).join(" ");
        if (!seen.has(key)) {
          seen.add(key);
          rings.push([...path]);
        }
      } else if (path.length < 6 && next > path[0] && !path.includes(next)) {
        walk([...path, next]);
      }
    }
  };
  atoms.forEach((a, i) => {
    if (a.el !== "H") walk([i]);
  });
  return rings;
}

/** Whether a ring is flat: none of its torsion angles far from naught. */
const isFlat = (atoms: readonly GeoAtom[], r: number[]) =>
  r.every((_, k) => Math.abs(torsion(...([0, 1, 2, 3].map((j) => atoms[r[(k + j) % r.length]]) as [GeoAtom, GeoAtom, GeoAtom, GeoAtom]))) <= FLAT);

/** The steps the estimate has taken: each ring entry looked through, each node of the search - counted so that a test can tell work in step with size from work that is not, which time on a busy machine cannot. */
export const work = { steps: 0 };

/**
 * A molecule's bond orders and formal charges estimated from its atoms'
 * places (see above). Bonds to metals stay single; so does every bond of a
 * conjugated part where the estimate is not decided.
 */
export function ordersFromGeometry(atoms: readonly GeoAtom[], bonds: readonly GeoBond[]): GeometryOrders {
  const counted = (i: number) => COUNTED.has(atoms[i].el);
  const hydrogens = atoms.some((a) => a.el === "H");
  const near: number[][] = atoms.map(() => []);
  bonds.forEach((b) => {
    if (counted(b.a1) && counted(b.a2) && b.a1 !== b.a2) {
      near[b.a1].push(b.a2);
      near[b.a2].push(b.a1);
    }
  });
  const terminalHetero = (i: number) => near[i].length === 1 && !["H", "C"].includes(atoms[i].el);
  const allRings = smallRings(atoms, near);
  const inSmallRing = new Uint8Array(atoms.length);
  for (const r of allRings) if (r.length <= 5) for (const x of r) inSmallRing[x] = 1;
  const range: Range[] = atoms.map((a, i) =>
    counted(i) ? rangeOf(a.el, near[i].map((k) => atoms[k]), a, near[i].filter(terminalHetero).length, hydrogens, !!inSmallRing[i]) : { min: 0, max: 0 },
  );
  // the bonds that may be more than single, each with what each order costs against its length
  const candidates: Candidate[] = [];
  bonds.forEach((bd, k) => {
    work.steps++;
    const { a1, a2 } = bd;
    if (!counted(a1) || !counted(a2) || a1 === a2 || atoms[a1].el === "H" || atoms[a2].el === "H") return;
    const ra = range[a1];
    const rb = range[a2];
    const hyper = !!(ra.terminalOnly || rb.terminalOnly);
    if ((ra.terminalOnly && !terminalHetero(a2)) || (rb.terminalOnly && !terminalHetero(a1))) return;
    const most = Math.min(ra.max, rb.max, hyper ? 1 : 2);
    if (most < 1) return;
    const d = dist(atoms[a1], atoms[a2]);
    // (a sulfonyl's or phosphate's bonds are shorter than the radii say whatever their order: there, the shortest is the double)
    const n = hyper ? null : orderFromLength(atoms[a1].el, atoms[a2].el, d);
    if (!hyper && n == null) return;
    const costs = Array.from({ length: most + 1 }, (_, e) => (hyper ? (e ? d : 0) : (1 + e - n!) ** 2));
    candidates.push({ bond: k, a: a1, b: a2, costs });
  });

  const rings = allRings.filter((r) => r.length >= 5 && isFlat(atoms, r));
  // (each atom's flat rings, for each conjugated part to find its own: not
  // every ring of the molecule looked through for each part)
  const ringsOf: number[][] = atoms.map(() => []);
  rings.forEach((r, k) => {
    for (const x of r) ringsOf[x].push(k);
  });
  const extra = new Int8Array(bonds.length);
  let decided = true;
  // each conjugated part on its own: candidates joined through shared atoms
  const byAtom: number[][] = atoms.map(() => []);
  candidates.forEach((c, k) => {
    byAtom[c.a].push(k);
    byAtom[c.b].push(k);
  });
  const done = new Uint8Array(candidates.length);
  for (let s = 0; s < candidates.length; s++) {
    if (done[s]) continue;
    // (in the order a walk from it reaches them, so that each choice soon settles its neighbours')
    const part = [s];
    done[s] = 1;
    for (let q = 0; q < part.length; q++) {
      const k = part[q];
      for (const x of [candidates[k].a, candidates[k].b]) {
        for (const j of byAtom[x]) {
          if (!done[j]) {
            done[j] = 1;
            part.push(j);
          }
        }
      }
    }
    const best = solve(part.map((k) => candidates[k]), range, rings, ringsOf, atoms, byAtom, candidates);
    if (!best || best.unmet) {
      decided = false;
      if (!best) continue;
    }
    part.forEach((k, i) => (extra[candidates[k].bond] = best.choice[i]));
  }
  // atoms whose shape plainly asks for a double bond, with none to have
  atoms.forEach((_, i) => {
    if ((range[i].strong || range[i].exact) && range[i].min > 0 && !byAtom[i].length) decided = false;
  });

  const orders = bonds.map((_, k) => 1 + extra[k]);
  // charges: what the valence says of the orders chosen
  const valence = new Int8Array(atoms.length);
  bonds.forEach((b, k) => {
    if (!counted(b.a1) || !counted(b.a2)) return;
    valence[b.a1] += orders[k];
    valence[b.a2] += orders[k];
  });
  const charges = atoms.map((a, i) => {
    if (!counted(i)) return 0;
    if (a.el === "N" && valence[i] === 4) return 1;
    if (a.el === "B" && valence[i] === 4) return -1;
    if (a.el === "O" && valence[i] === 3) return 1;
    if (hydrogens && a.el === "O" && valence[i] === 1) return -1;
    return 0;
  });
  // (an oxygen held singly by a charged nitrogen carries the charge back: a nitro group, an N-oxide)
  // (each atom's first bond, found once: not every bond looked through for each oxygen)
  const firstBond = new Int32Array(atoms.length).fill(-1);
  bonds.forEach((b, k) => {
    if (firstBond[b.a1] < 0) firstBond[b.a1] = k;
    if (firstBond[b.a2] < 0) firstBond[b.a2] = k;
  });
  atoms.forEach((a, i) => {
    if (a.el !== "O" || near[i].length !== 1 || hydrogens) return;
    const k = firstBond[i];
    const other = near[i][0];
    if (orders[k] === 1 && charges[other] === 1 && atoms[other].el === "N") charges[i] = -1;
  });
  return { orders, charges, decided };
}

type Candidate = { bond: number; a: number; b: number; costs: number[] };

/**
 * The least costly orders for a conjugated part (`part`, its candidate
 * bonds in walking order), by branch and bound: each bond's cost against
 * its length; each atom's extra bonds within its maximum, its minimum
 * unmet at a cost (never where its valence sets it), and its charges -
 * counted as its last bond is chosen; less what each flat ring brings that
 * is aromatic - counted as the last bond about it is chosen. Null where
 * the search ran too long, or no choice meets every valence.
 */
function solve(part: Candidate[], range: Range[], rings: number[][], ringsOf: number[][], atoms: readonly GeoAtom[], byAtom: number[][], all: Candidate[]): { choice: number[]; unmet: boolean } | null {
  const local = new Map(part.map((c, i) => [c, i]));
  const atomsIn = [...new Set(part.flatMap((c) => [c.a, c.b]))];
  const sum = new Map<number, number>(atomsIn.map((x) => [x, 0]));
  // how many of an atom's bonds are still to choose, and how much more they could give it
  const left = new Map<number, number>(atomsIn.map((x) => [x, 0]));
  const room = new Map<number, number>(atomsIn.map((x) => [x, 0]));
  for (const c of part) {
    for (const x of [c.a, c.b]) {
      left.set(x, left.get(x)! + 1);
      room.set(x, room.get(x)! + c.costs.length - 1);
    }
  }
  // the part's rings, each settled as the last bond about its atoms is chosen
  const here = new Set<number>();
  for (const x of atomsIn) {
    work.steps += 1 + ringsOf[x].length;
    for (const k of ringsOf[x]) here.add(k);
  }
  const ringsHere = [...here].sort((p, q) => p - q).map((k) => rings[k]);
  const settledAt: number[][] = part.map(() => []);
  ringsHere.forEach((r, k) => {
    work.steps += r.length;
    const last = Math.max(...r.flatMap((x) => byAtom[x].map((j) => local.get(all[j]) ?? -1)));
    if (last >= 0) settledAt[last].push(k);
  });
  const ringsAfter = new Int32Array(part.length + 1);
  for (let i = part.length - 1; i >= 0; i--) ringsAfter[i] = ringsAfter[i + 1] + settledAt[i].length;
  const choice: number[] = new Array(part.length).fill(0);
  /** What a ring brings as chosen: aromatic - each atom's double bond within it, a lone pair where it has none, 4n+2 electrons - `AROMATIC`, half where a double bond of its leaves it; else nothing. */
  const aromatic = (r: number[]) => {
    let electrons = 0;
    let leaves = false;
    for (let k = 0; k < r.length; k++) {
      const x = r[k];
      const prev = r[(k + r.length - 1) % r.length];
      const next = r[(k + 1) % r.length];
      let inRing = false;
      let any = false;
      for (const j of byAtom[x]) {
        const i = local.get(all[j]);
        if (i == null || !choice[i]) continue;
        any = true;
        const other = all[j].a === x ? all[j].b : all[j].a;
        if (other === prev || other === next) inRing = true;
      }
      const el = atoms[x].el;
      if (inRing) electrons += 1;
      else if (any) leaves = true;
      else if (el === "N" || el === "O" || el === "S" || el === "Se") electrons += 2;
      else return 0;
    }
    return electrons % 4 === 2 ? (leaves ? AROMATIC / 2 : AROMATIC) : 0;
  };
  const tail = new Float64Array(part.length + 1);
  for (let i = part.length - 1; i >= 0; i--) tail[i] = tail[i + 1] + Math.min(...part[i].costs);
  /** What an atom's choices cost it, all made: Infinity where its valence is not met. */
  const own = (x: number) => {
    const s = sum.get(x)!;
    const r = range[x];
    if (s < r.min && r.exact) return Infinity;
    return (s < r.min ? UNMET * (r.min - s) : 0) + (r.cost?.(s) ?? 0);
  };
  let best: number[] | null = null;
  let bestCost = Infinity;
  let nodes = 0;
  const visit = (i: number, cost: number): boolean => {
    work.steps++;
    if (++nodes > MOST_NODES) return false;
    if (cost + tail[i] - AROMATIC * ringsAfter[i] >= bestCost) return true;
    if (i === part.length) {
      bestCost = cost;
      best = [...choice];
      return true;
    }
    const c = part[i];
    for (const x of [c.a, c.b]) {
      left.set(x, left.get(x)! - 1);
      room.set(x, room.get(x)! - (c.costs.length - 1));
    }
    // (orders tried cheapest first, so that a good bound comes early)
    const tries = c.costs.map((v, e) => [v, e] as const).sort((p, q) => p[0] - q[0]);
    let ok = true;
    for (const [v, e] of tries) {
      if (sum.get(c.a)! + e > range[c.a].max || sum.get(c.b)! + e > range[c.b].max) continue;
      // (a valence the bonds still to choose could no longer meet)
      if ([c.a, c.b].some((x) => range[x].exact && sum.get(x)! + e + room.get(x)! < range[x].min)) continue;
      sum.set(c.a, sum.get(c.a)! + e);
      sum.set(c.b, sum.get(c.b)! + e);
      choice[i] = e;
      let more = v;
      for (const x of [c.a, c.b]) if (left.get(x) === 0) more += own(x);
      for (const k of settledAt[i]) more -= aromatic(ringsHere[k]);
      if (more < Infinity) ok = visit(i + 1, cost + more);
      sum.set(c.a, sum.get(c.a)! - e);
      sum.set(c.b, sum.get(c.b)! - e);
      choice[i] = 0;
      if (!ok) break;
    }
    for (const x of [c.a, c.b]) {
      left.set(x, left.get(x)! + 1);
      room.set(x, room.get(x)! + (c.costs.length - 1));
    }
    return ok;
  };
  if (!visit(0, 0) || !best) return null;
  const chosen: number[] = best;
  const got = new Map<number, number>(atomsIn.map((x) => [x, 0]));
  part.forEach((c, i) => {
    got.set(c.a, got.get(c.a)! + chosen[i]);
    got.set(c.b, got.get(c.b)! + chosen[i]);
  });
  return { choice: chosen, unmet: atomsIn.some((x) => range[x].strong && got.get(x)! < range[x].min) };
}
