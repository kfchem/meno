/**
 * The stereochemistry a drawing shows, as the layout reads it: the core's reader of a drawing (lib/chem/perception/stereo/from2d, where the
 * rules are said), with the layout's own part handed in - a cage drawn in perspective read against the solid the engine takes it to be
 * (`cageFits`) - and what a drawing in perspective needs to say it to a reader that knows only wedges (`wedgesForFlat`, placed as the engine
 * places wedges). Every name it had is here still, so no reader of it changes.
 */
import {
  fitLinear,
  groupDepths as groupDepthsFrom2d,
  readStereo as readFrom2d,
  type CageFit,
  type DrawnAtom,
  type DrawnBond,
  type DrawnStereo,
  type Vec3,
} from "../chem/perception/stereo/from2d";
import type { Tetrahedral } from "../chem/perception/stereo/types";
import { isCage, solidOf } from "./cage";
import { key, perceive, type LayoutInput } from "./perceive";
import { symmetryOrbits } from "./canonical";
import { huckelBonds } from "../chem/huckel";
import { movingCN } from "../chem/stereoOpen";
import { factsOf, OPEN_RING } from "../chem/perception/facts";
import { runsOf } from "../chem/perception/stereo/runs";
import { sharesThreeAtoms } from "../chem/perception/rings";
import { withRecognisedDepth } from "../chem/perception/projection/depth";
import { cageViews } from "./recognised";
import { placeStereo, type Stereo, type Wedge } from "./stereo";
import type { Point } from "./geometry";
import { IN_LINE, sameConfiguration, unsureStereo } from "../chem/perception/stereo/from2d";

export { IN_LINE, sameConfiguration, straightEnds, unreadWhy, unsureStereo } from "../chem/perception/stereo/from2d";
export type { DrawnAtom, DrawnBond, DrawnStereo };

/**
 * The stereochemistry a drawing shows (lib/chem/perception/stereo/from2d `readStereo`): a ring drawn in perspective with no depth given
 * has its depth worked out first (lib/chem/perception/projection/depth `withRecognisedDepth`, the engine giving its views of cages: ./recognised), and a bridged system or a
 * cage in perspective is read against its solid.
 */
export function readStereo(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): DrawnStereo {
  return readFrom2d(withRecognisedDepth(atoms, bonds, cageViews), bonds, cageFits);
}

/** The depth of each group drawn out of a ring in perspective, for where its bond passes behind another (from2d `groupDepths`), a bridged system or a cage read against its solid. */
export function groupDepths(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): Map<number, number> {
  return groupDepthsFrom2d(atoms, bonds, cageFits);
}

const sub3 = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot3 = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

/**
 * A cage drawn in perspective, as the solid it is drawn from (`CageFit`): for each atom of a ring system of four atoms or more, all with a
 * depth, the solid the engine takes it to be (cage.ts) and the map that takes it to where its atoms are drawn, fitted - as the engine may
 * draw a cage the way textbooks do rather than exactly as it is seen.
 */
function cageFits(
  atoms: readonly DrawnAtom[],
  bonds: readonly DrawnBond[],
  /** Centres the solid holds as they are read (`readStereo`). */
  held: ReadonlyMap<number, Tetrahedral> = new Map(),
): Map<number, CageFit> {
  const out = new Map<number, CageFit>();
  if (!atoms.some((a) => a.z != null)) return out;
  const mol = perceive({
    atoms: atoms.map((a, i) => ({ el: "C", hs: a.hs, ...(held.has(i) ? { tetra: held.get(i)! } : {}) })),
    bonds: bonds.map(({ a, b, order }) => ({ a, b, order })),
  });
  for (const sys of mol.systems) {
    if (sys.atoms.length < 4 || sys.atoms.some((a) => atoms[a].z == null)) continue;
    // (the engine's solid is the right one for a bridged system or a cage, wrong for chairs fused - a decalin's is a chair and a twist-boat - and no
    //  use for a single ring, a Haworth ring drawn flat: every other system with depth is read from its own ring bonds as drawn, which says nothing of
    //  which solid was drawn. A system both bridged and carrying fused chairs is read through the fit: no tool makes one)
    if (!isCage(mol, sys) && !bridged(mol.rings, sys.rings)) continue;
    const solid = solidOf(mol, sys);
    const from = sys.atoms.map((a) => solid.get(a)!);
    const to = sys.atoms.map((a): Vec3 => [atoms[a].x, atoms[a].y, atoms[a].z!]);
    const map = fitLinear(from, to);
    if (!map) continue;
    // (the map is linear, the drawing's middle the solid's)
    const n = from.length;
    const mid = (ps: readonly Vec3[]): Vec3 => [0, 1, 2].map((k) => ps.reduce((s, p) => s + p[k], 0) / n) as Vec3;
    const [pf, pt] = [mid(from), mid(to)];
    const miss = from.reduce((s, p, i) => {
      const q = sub3(to[i], pt);
      const m = map(sub3(p, pf));
      return s + dot3(sub3(q, m), sub3(q, m));
    }, 0) / n;
    const fit = { solid, map, miss };
    for (const a of sys.atoms) out.set(a, fit);
  }
  return out;
}

/** Whether two rings of a system share three atoms or more: it is bridged (perception/rings `sharesThreeAtoms`). */
function bridged(rings: readonly (readonly number[])[], of: readonly number[]): boolean {
  return of.some((r, i) => of.some((q, j) => j > i && sharesThreeAtoms(rings[r], rings[q])));
}

/**
 * What a drawing that shows some of its stereochemistry in perspective
 * needs to say it to a reader that knows only wedges - a MOL file, RDKit,
 * another program: a wedge on a bond out of each centre the perspective
 * shows (and an H, where the centre has no other bond to put it on, drawn
 * where the engine would), read as flat. A centre with a wedge of its own
 * says it already. A ring in perspective drawn with no depth, recognised as
 * one (`withRecognisedDepth`), shows its centres as one drawn with depth
 * does: 3D and a file take the configuration read, never the shape drawn.
 * The drawing is left as it is.
 */
export function wedgesForFlat(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], given?: ReadonlyMap<number, Tetrahedral>): Stereo {
  // (the centres' configuration: as given - read from the drawing as it stood, where its atoms are then moved to be written - else as
  //  its marks and depth read)
  const tetra = given ?? readStereo(atoms, bonds).tetra;
  const seen = withRecognisedDepth(atoms, bonds, cageViews);
  const wedged = new Set(bonds.flatMap((b) => (b.wedge ? [b.wedge.narrow] : [])));
  const shown = new Map([...tetra].filter(([c]) => seen[c].z != null && !wedged.has(c)));
  if (!shown.size) return { wedges: [], hydrogens: [] };
  const mol = perceive({
    atoms: atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs })),
    bonds: bonds.map(({ a, b, order }) => ({ a, b, order })),
  });
  // (placed as the engine places them, at its bond length of 1)
  const lengths = bonds.map(({ a, b }) => Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y)).sort((p, q) => p - q);
  const k = lengths[lengths.length >> 1] || 1;
  const pos = new Map(atoms.map((a, i) => [i, { x: a.x / k, y: a.y / k }]));
  // (on a bond no other centre's wedge is on: two on one bond, one is lost)
  const taken = new Set(bonds.flatMap((b) => (b.wedge ? [key(b.a, b.b)] : [])));
  const placed = placeStereo(mol, pos, shown, taken);
  return hydrogensWhereUnread(atoms, bonds, shown, { wedges: placed.wedges, hydrogens: placed.hydrogens.map(({ on, at }) => ({ on, at: { x: at.x * k, y: at.y * k } })) }, k);
}

/** How far an H drawn at a centre keeps from every other atom - its label - and from every bond, in bonds: past these it is clear. */
const H_CLEAR_ATOM = 0.75;
const H_CLEAR_BOND = 0.4;

/** How far `p` is from the segment `u`-`v`. */
function toSegment(p: Point, u: Point, v: Point): number {
  const dx = v.x - u.x;
  const dy = v.y - u.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (u.x + t * dx), p.y - (u.y + t * dy));
}

/** How far apart two directions are, 0 to pi. */
const apart = (t: number, u: number) => Math.abs(Math.atan2(Math.sin(t - u), Math.cos(t - u)));


/**
 * The wedges and H's `placed` for the centres `shown`, where a centre's
 * wedge does not say it - left unread, or read only by luck: two of its
 * bonds in one line, as a cage's projection can leave them (epibatidine's
 * C2) or a flat drawing's ring (doxorubicin's C1 of its sugar) - with its
 * H drawn in the widest gap round it, `k` out, and wedged instead, the way
 * that says its configuration; where that reads no surer, or the centre
 * has no H of its own, as placed. Read as a reader of wedges alone reads
 * them: the drawing's depth, where it has one, is not read - it says no
 * centre without the wedges' own drawing in space, which the page's atoms
 * carry and these do not.
 */
export function hydrogensWhereUnread(
  atoms: readonly DrawnAtom[],
  bonds: readonly DrawnBond[],
  shown: ReadonlyMap<number, Tetrahedral>,
  placed: Stereo,
  k: number,
): Stereo {
  const wedges = [...placed.wedges];
  const hydrogens = [...placed.hydrogens];
  // (a centre its wedge does not say read flat - left unread, or read only by luck: two of its bonds in one line, as a cage's
  // projection can leave them, epibatidine's - its H drawn in the widest gap round it and wedged instead, the way that says its
  // configuration; where that reads no surer, as placed)
  const flatOf = (ws: Wedge[], hs: { on: number; at: Point }[]) => {
    const fa: DrawnAtom[] = atoms.map(({ x, y, el, charge, hs: h }, i) => ({ x, y, el, ...(charge ? { charge } : {}), hs: h - hs.filter((q) => q.on === i).length }));
    const fb: DrawnBond[] = bonds.map(({ a, b, order, wedge, either }) => ({ a, b, order, ...(wedge ? { wedge } : {}), ...(either ? { either } : {}) }));
    hs.forEach((q) => {
      fa.push({ x: q.at.x, y: q.at.y, el: "H", hs: 0 });
      fb.push({ a: q.on, b: fa.length - 1, order: 1 });
    });
    for (const w of ws) {
      const to = w.to === -1 ? atoms.length + hs.findIndex((q) => q.on === w.from) : w.to;
      const i = fb.findIndex((b) => (b.a === w.from && b.b === to) || (b.b === w.from && b.a === to));
      if (i >= 0) fb[i] = { ...fb[i], wedge: { narrow: w.from, stereo: w.stereo } };
    }
    return { atoms: fa, bonds: fb };
  };
  // (where in the gap round `c` - about its middle `mid`, `gap` wide - its H stands clearest of every other atom, H and bond: the middle at
  // a bond's length where that is clear, else the place the farthest from them, turned within the gap up to 25 degrees short of its
  // bonds - an H laid on another label, or on a bond, reads as another's: GR-2.1.6, GR-4.3. Always a bond long: a shorter H's wedge,
  // its label's room taken off, reads as a speck)
  const clearestIn = (c: number, mid: number, gap: number): Point => {
    const at = atoms[c];
    const others = [...atoms.flatMap((a, i) => (i === c ? [] : [a])), ...hydrogens.map((q) => q.at)];
    const segs = bonds.filter(({ a, b }) => a !== c && b !== c).map(({ a, b }) => [atoms[a], atoms[b]] as const);
    const room = (p: Point) => Math.min(...others.map((o) => Math.hypot(o.x - p.x, o.y - p.y) / (H_CLEAR_ATOM * k)), ...segs.map(([u, v]) => toSegment(p, u, v) / (H_CLEAR_BOND * k)));
    const spot = (turn: number) => ({ x: at.x + k * Math.cos(mid + turn), y: at.y + k * Math.sin(mid + turn) });
    let best = { p: spot(0), r: room(spot(0)) };
    if (best.r >= 1) return best.p;
    const most = Math.max(0, gap / 2 - (25 * Math.PI) / 180);
    for (let deg = 5; deg <= 90; deg += 5) {
      const turn = (deg * Math.PI) / 180;
      if (turn > most + 1e-9) break;
      for (const t of [turn, -turn]) {
        const r = room(spot(t));
        if (r > best.r + 1e-9) best = { p: spot(t), r };
      }
    }
    return best.p;
  };
  const first = flatOf(wedges, hydrogens);
  const byLuck = new Set(unsureStereo(first.atoms, first.bonds).atoms);
  const readFirst = readStereo(first.atoms, first.bonds).tetra;
  // (a centre with an H placed already is as placed: its H is no other centre's, and a wedge on it says the centre)
  const says = (c: number, t: Tetrahedral) => {
    const r = readFirst.get(c);
    return !!r && sameConfiguration(r, t);
  };
  // (a centre of three bonds whose wedge stands in line with another of its bonds, within IN_LINE: read or not, a form the text grades
  // not acceptable - Brecher 2006, ST-1.2.4 - which a drawing of Meno's own is not to show)
  const inLine = (c: number) => {
    const near = bonds.flatMap(({ a, b }) => (a === c ? [b] : b === c ? [a] : []));
    if (near.length !== 3) return false;
    const way = (n: number) => Math.atan2(atoms[n].y - atoms[c].y, atoms[n].x - atoms[c].x);
    return wedges.some((w) => w.from === c && w.to >= 0 && near.some((n) => n !== w.to && apart(way(n), way(w.to)) > Math.PI - IN_LINE));
  };
  for (const [c, t] of shown) {
    // (a centre with no H of its own gets none: drawn, it would have five bonds, which reads as no centre)
    if (hydrogens.some((q) => q.on === c) || (says(c, t) && !byLuck.has(c) && !inLine(c)) || atoms[c].hs < 1) continue;
    const at = atoms[c];
    const dirs = bonds.flatMap(({ a, b }) => (a === c ? [b] : b === c ? [a] : [])).map((n) => Math.atan2(atoms[n].y - at.y, atoms[n].x - at.x)).sort((p, q) => p - q);
    let gap = -1;
    let mid = 0;
    dirs.forEach((d, i) => {
      const next = i + 1 < dirs.length ? dirs[i + 1] : dirs[0] + 2 * Math.PI;
      if (next - d > gap) [gap, mid] = [next - d, (d + next) / 2];
    });
    const h = { on: c, at: clearestIn(c, mid, gap) };
    const others = wedges.filter((w) => w.from !== c);
    for (const stereo of ["up", "down"] as const) {
      const ws = [...others, { from: c, to: -1, stereo }];
      const hs = [...hydrogens, h];
      const f = flatOf(ws, hs);
      const read = readStereo(f.atoms, f.bonds).tetra.get(c);
      const hIndex = atoms.length + hs.length - 1;
      if (!read || !sameConfiguration(read, t, (n) => (n === hIndex ? -1 : n))) continue;
      if (new Set(unsureStereo(f.atoms, f.bonds).atoms).has(c)) break;
      wedges.splice(0, wedges.length, ...ws);
      hydrogens.push(h);
      break;
    }
  }
  return { wedges, hydrogens };
}

/**
 * The double bonds of a structure that arrives with no drawing - a SMILES's, a name's, a file's with no places - that could have a cis or
 * trans and are given none, and how each is to be drawn so that it states none (Brecher 2006, ST-4.4; ST-6.2): where each end has one group,
 * each end kept STRAIGHT on from the bond (`straight`, by atom: the layout's `linear`); where an end has two, or the bond is in a ring (of
 * eight atoms or more: a ring atom cannot be kept straight on), a wavy bond on a group (`either`, by bond: the bond's "either", drawn as a
 * wavy bond on a single group, a ring's bond beside it - `layout2d` `unspecifiedDoubles`). Never bent as if stated. Which double bonds could
 * have one is the reader's own test (`readStereo`): a group on each end, not in a ring of seven atoms or fewer, not cumulated, not a bond of
 * a Hückel ring (an aromatic macrocycle's: `huckelBonds`), not a C=N whose E/Z is none of its own (`movingCN`: an amidine's) - and not an
 * end with two groups that are alike (`symmetryOrbits`), which has none either way. One given a configuration (`LayoutBond.stereo`) is left
 * as it is. An odd cumulene's cis or trans, across its run's two ends, is open as a double bond's is, by its ends' groups (a run given one,
 * `LayoutInput.cumulated`, left as it is); an allene's axis is not a double bond's to open.
 */
export function openDoubleBonds(input: LayoutInput): { straight: number[]; either: number[] } {
  return openOf(input, true);
}

/**
 * The odd cumulenes alone of `openDoubleBonds` (a butatriene's): those of a structure that `input.cumulated` does not give, open. For a
 * drawing nobody made - a plugin's, from a MOL block, which cannot say a run's cis or trans: what its picture shows of one is chance.
 */
export function openRuns(input: LayoutInput): { straight: number[]; either: number[] } {
  return openOf(input, false);
}

function openOf(input: LayoutInput, doubles: boolean): { straight: number[]; either: number[] } {
  const n = input.atoms.length;
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  const order = new Map<string, number>();
  const once: { a: number; b: number; order: number }[] = [];
  for (const b of input.bonds) {
    if (b.a === b.b || order.has(key(b.a, b.b))) continue;
    neighbours[b.a].push(b.b);
    neighbours[b.b].push(b.a);
    order.set(key(b.a, b.b), b.order);
    once.push({ a: b.a, b: b.b, order: b.order });
  }
  // (its rings the core's, as the reader takes them: perception/facts)
  const facts = factsOf({ atoms: input.atoms.map((a) => ({ el: a.el })), bonds: once });
  const bondOf = (a: number, b: number) => facts.bondBetween(a, b);
  // (its runs of cumulated double bonds: perception/stereo/runs, the reader's rule of what a run goes on through)
  const runs = runsOf({ atoms: input.atoms, bonds: once });
  let orbits: number[] | null = null;
  let huckel: Set<string> | null = null;
  let moving: Map<number, unknown> | null = null;
  const alike = (p: number, q: number) => (orbits ??= symmetryOrbits(input).orbit)[p] === orbits[q];
  const straight = new Set<number>();
  const either: number[] = [];
  input.bonds.forEach((b, i) => {
    if (!doubles || b.order !== 2 || b.stereo) return;
    const groups = (end: number, other: number) => neighbours[end].filter((m) => m !== other);
    const [ga, gb] = [groups(b.a, b.b), groups(b.b, b.a)];
    if (!ga.length || !gb.length || ga.length > 2 || gb.length > 2) return;
    if (facts.inRingSmallerThan(bondOf(b.a, b.b), OPEN_RING) || runs.cumulatedAt(b.a, b.b) || runs.cumulatedAt(b.b, b.a)) return;
    // (a bond of a Hückel ring - an aromatic macrocycle's, a porphyrin's - has no cis or trans: its Kekulé form is only one way of writing it)
    if ((huckel ??= huckelBonds(n, input.bonds)).has(key(b.a, b.b))) return;
    if ((moving ??= movingCN(input.atoms, input.bonds)).has(i)) return;
    if ((ga.length === 2 && alike(ga[0], ga[1])) || (gb.length === 2 && alike(gb[0], gb[1]))) return;
    if (ga.length === 1 && gb.length === 1 && !facts.inRing[bondOf(b.a, b.b)]) {
      straight.add(b.a);
      straight.add(b.b);
    } else either.push(i);
  });
  // an odd cumulene's (a butatriene's: an odd number of double bonds end to end, its run drawn straight through) cis or trans across its
  // two ends, as the reader takes it (`readStereo`), open as a double bond's is where nothing gives it (`LayoutInput.cumulated`): each end
  // with one group kept straight on, or a wavy bond on a group of an end (`either`, on that end's double bond)
  const { middle } = runs;
  const given = new Set((input.cumulated ?? []).map((c) => key(c.atoms[0], c.atoms[1])));
  for (let i = 0; i < n; i++) {
    if (middle(i)) continue;
    for (const m of neighbours[i]) {
      if (order.get(key(i, m)) !== 2 || !middle(m)) continue;
      const run = runs.from(i, m);
      const j = run[run.length - 1];
      // (once for each run, from its lower end; an even run of double bonds - an allene's - has an axis, not a cis or trans)
      if (j <= i || run.length % 2 === 1 || given.has(key(i, j))) continue;
      const [ga, gb] = [neighbours[i].filter((x) => x !== m), neighbours[j].filter((x) => x !== run[run.length - 2])];
      // (each end with two groups, an H among them at most: the reader's test of a run's end - an N's end of one group has none to state)
      if (!ga.length || !gb.length || ga.length + (input.atoms[i].hs ?? 0) !== 2 || gb.length + (input.atoms[j].hs ?? 0) !== 2) continue;
      const first = bondOf(i, m);
      if (facts.inRingSmallerThan(first, OPEN_RING)) continue;
      if ((ga.length === 2 && alike(ga[0], ga[1])) || (gb.length === 2 && alike(gb[0], gb[1]))) continue;
      if (ga.length === 1 && gb.length === 1 && !facts.inRing[first]) {
        straight.add(i);
        straight.add(j);
        continue;
      }
      // (the wavy bond at an end of one group, where there is one - `unspecifiedDoubles` takes the run's far end as the bond's other)
      const [e, f] = ga.length === 1 || gb.length !== 1 ? [i, m] : [j, run[run.length - 2]];
      const k = input.bonds.findIndex((b) => b.order === 2 && key(b.a, b.b) === key(e, f));
      if (k >= 0) either.push(k);
    }
  }
  return { straight: [...straight], either };
}
