/**
 * The stereochemistry a drawing shows, read back out of it: each
 * stereocentre's configuration and the side each double bond's groups are
 * on, in the form the layout engine takes them (lib/layout/perceive).
 *
 * - A centre drawn flat shows its configuration by its wedges: a neighbour
 *   on a wedge stands out of the page, one on hashes behind it (as
 *   `drawnVolume` reads it).
 * - A centre in a structure drawn in perspective - a cage, as the engine
 *   draws one - shows it by the drawing itself (`centre`). Its atoms have a
 *   depth, so the bonds between them are known in three dimensions; a bond
 *   out of the cage points one of the ways the centre's other bonds leave
 *   free, and which one is read from the way it is drawn. Turn a
 *   substituent the other way - from one side of a chair to the other - and
 *   the configuration turns with it.
 * - Any other centre shows it by its wedges, depth or none: a ring laid
 *   across the face of another (morphine's piperidine, gibberellic acid's
 *   lactone) is drawn in front of it or behind, its depth a layer and not a
 *   place in space, and a ring fused flat onto a cage is flat.
 * - A double bond's groups are on the side they are drawn on - but in a
 *   ring of seven atoms or fewer, which has them as its ring does (cis),
 *   however it is drawn: a benzene ring's bonds say nothing.
 * - An axis of chirality - a single bond in no ring, each end with two
 *   other neighbours (a biaryl's) - shows how it turns by a wedge out of an
 *   end, narrow there: that neighbour out of the page (or behind it, on
 *   hashes), the other end's neighbours in it. Not a wedge out of an
 *   allene's end: that states the allene's axis (ST-1.6) and nothing else,
 *   so a single bond from there is read only from wedges at its other end
 *   (ST-1.7's form, by analogy).
 *
 * The rules it follows (Brecher 2006, by rule number):
 * - ST-0.3: a wedge is narrow at its stereocentre, and is read there only
 *   (`lift`); a bond's bold or hashed look with no wedge states no centre.
 * - ST-0.1, ST-1.2.12: two plain bonds in line with one wedge are a T, not a
 *   tetrahedral centre: "in line" within `IN_LINE`; such a centre is unread
 *   and `unreadWhy` says why.
 * - ST-0.4, ST-4.4: a wavy bond, a double bond's "either": that centre or
 *   bond is open.
 * - ST-3.1 to ST-3.3: depth and crossings (`volumeInSpace`; a cage's solid
 *   fitted to the drawing is the layout's, handed in as `fit`).
 * - ST-1.1.9 to 1.1.11, four-bond depictions the text calls ambiguous: read
 *   as drawn, as before this file moved here (a change of its own).
 *
 * The core's (lib/chem/perception): it imports nothing of the layout's. The
 * layout's `lib/layout/drawn` reads through it with its cage fit handed in.
 */
import { lonePairCentres, pyramidal } from "./lonePairs";
import { drawnAxisSense, drawnVolume, freeCorners } from "./senses";
import type { Axial, CisTrans, Cumulated, Tetrahedral } from "./types";
import { parity } from "./geometry";
import { factsOf, OPEN_RING } from "../facts";
import { ofTheStructure } from "../graph";

/** A pair of atoms as one key, the lower first. */
const key = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

export type DrawnAtom = {
  x: number;
  y: number;
  /** What it is: C unless said, for where an H drawn beside it can go. */
  el?: string;
  /** Its charge, where it has one: for whether it has a lone pair (lib/chem/lonePairCentres). */
  charge?: number;
  /** Its depth where the structure is drawn in perspective: nearer the viewer is larger. */
  z?: number;
  /** Hydrogens it carries but are not drawn as atoms. */
  hs: number;
  /**
   * A stereocentre whose configuration the drawing shows without a wedge:
   * one in a structure drawn in perspective.
   */
  centre?: boolean;
};

export type DrawnBond = {
  a: number;
  b: number;
  order: number;
  /** A wedge (up) or hashes (down), narrow at `narrow`, the stereocentre. */
  wedge?: { narrow: number; stereo: "up" | "down" };
  /** A wavy bond: either configuration, so none is read at its ends. */
  either?: boolean;
  /** A ring bond drawn bold, or as a near edge: the edge of a ring in perspective that is the nearer. */
  bold?: boolean;
  /** A hydrogen bond: no bond of the structure (perception/graph `ofTheStructure`), so read as if it were not there. */
  hydrogen?: boolean;
};

export type DrawnStereo = {
  tetra: Map<number, Tetrahedral>;
  /** By bond index. */
  cisTrans: Map<number, CisTrans>;
  /** Each axis's refs the lower-numbered neighbour at each end: a biaryl's, an allene's. */
  axes: Axial[];
  /** Each odd cumulene set cis or trans, by its ends (a butatriene's). */
  cumulated: Cumulated[];
};

/** A point or a direction in three dimensions. */
export type Vec3 = [number, number, number];
type V3 = Vec3;
const sub3 = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot3 = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross3 = (p: V3, q: V3): V3 => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
const unit3 = (p: V3): V3 => {
  const l = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / l, p[1] / l, p[2] / l];
};
const det3 = (p: V3, q: V3, r: V3) => dot3(p, cross3(q, r));

/** Half the tetrahedral angle, and how far a free bond leans off the bisector. */
const HALF_TETRAHEDRAL = Math.acos(-1 / 3) / 2;
/** How far out of the page a wedge is taken to stand, as a share of its length. */
const WEDGE_LIFT = 0.8;
/**
 * The least volume three bonds of unit length into a cage span, drawn, for
 * the drawing to say which way round they go: less, and they lie all but in
 * one plane on the page, which way a matter of a hair (a tetrahedral
 * centre's three span 0.77).
 */
const HAIR = 0.2;
/**
 * How far a group of a perspective centre is drawn from half way between two free positions, as seen, to be unread there: the drawing says neither (by convention, as UNSURE_TURN; no text gives a number). Two free positions seen less than twice this apart leave a group between them unread, however it is drawn.
 */
const BETWEEN = (12 * Math.PI) / 180;
/** A bond is seen end-on where its length on the page is less than this share of its depth: a Newman projection's central bond. */
const END_ON = 0.1;

/**
 * How near two bonds' directions are taken to be one line, either way - in
 * line, or on top of each other: 10 degrees. Brecher 2006, ST-0.1: two bonds
 * between 170 and 190 degrees apart are in line, and two that look nearly in
 * line are taken as exactly in line. Drawn so, a centre's bonds state no
 * configuration - two of three in line are a T, not a tetrahedral centre
 * (ST-1.2.12), two on top of each other cannot be told apart -
 * and a double bond's group straight on from it states neither cis nor
 * trans (ST-4.4, the linear depiction of a double bond of unspecified
 * configuration).
 */
export const IN_LINE = (10 * Math.PI) / 180;

/** How far apart two directions are, 0 to pi. */
const apart = (t: number, u: number) => Math.abs(Math.atan2(Math.sin(t - u), Math.cos(t - u)));

/** Two bonds in line, or on top of each other: which of them is which cannot be told, or the drawing is a T. */
const IN_LINE_WHY = "two of its bonds in line or on top of each other";

/**
 * Why a centre drawn flat with four bonds states no configuration - or null where it states one - by the forms Brecher 2006 (ST-1.1) calls
 * ambiguous or the picture of another shape (read as open, never guessed), `lifts` each bond's
 * +1 (a wedge narrow at the centre), -1 (hashes) or 0. "Half a turn" with `IN_LINE`'s tolerance either way (ST-0.1): a deciding gap in that band
 * says nothing either. Open:
 * - all four bonds within half the page - the largest gap between neighbours half a turn or more - whatever their kinds: a tetrahedron's four
 *   bonds add up to nought, so their pictures never all point into one half (ST-1.1.12's figure, every drawing of it);
 * - four wedges of one kind (ST-1.1.20);
 * - three of one kind and one other, the other in the space of half a turn or more between two of the three (ST-1.1.9);
 * - two plain, a wedge and hashes: the plain bonds not next to each other (ST-1.1.10, 1.1.15), or next to each other and half a turn or more
 *   apart (ST-1.1.13, 1.1.14);
 * - two of one kind of wedge and two plain, like next to like: every gap under half a turn (ST-1.1.11) or the plain bonds more than half a turn
 *   apart (ST-1.1.19);
 * - three plain and a wedge, two plain bonds next to each other half a turn or more apart and the wedge not in that space (ST-1.1.16);
 * - two wedges and two hashes, like next to like (ST-1.1.17, 1.1.18).
 * Read as before: the forms the text gives a configuration with bonds on both sides of the centre, ST-1.1.4's cross (three plain, two half a
 * turn or more apart, the wedge in that space) and the upright cross with two like wedges across from each other among them.
 */
function fourBondsSayNothing(at: { x: number; y: number }, around: readonly { x: number; y: number }[], lifts: readonly number[]): string | null {
  const t = around.map((p) => Math.atan2(p.y - at.y, p.x - at.x));
  const turn = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const order = [0, 1, 2, 3].sort((a, b) => turn(t[a]) - turn(t[b]));
  // (each gap from a bond to the next round the centre)
  const gaps = order.map((k, m) => ({ from: k, to: order[(m + 1) % 4], size: turn(t[order[(m + 1) % 4]] - t[k]) }));
  const atLeastHalf = (g: number) => g > Math.PI - IN_LINE;
  const next = (a: number, b: number) => gaps.some((g) => (g.from === a && g.to === b) || (g.from === b && g.to === a));
  const kinds = [0, 1, -1].map((k) => [0, 1, 2, 3].filter((i) => lifts[i] === k));
  const [plain, up, down] = kinds;
  const WHY = "its four bonds are not drawn as a tetrahedral centre's: draw two of them in the page side by side, a wedge and hashes on the far side";
  // (all four within half the page)
  if (atLeastHalf(Math.max(...gaps.map((g) => g.size)))) return WHY;
  if (up.length === 4 || down.length === 4) return WHY;
  // (three of one wedge kind and one other: the other in the wide space between two of the three)
  for (const three of [up, down]) {
    if (three.length !== 3) continue;
    const odd = [0, 1, 2, 3].find((i) => !three.includes(i))!;
    const m = order.indexOf(odd);
    const [before, after] = [order[(m + 3) % 4], order[(m + 1) % 4]];
    if (atLeastHalf(turn(t[after] - t[before]))) return WHY;
  }
  if (plain.length === 2 && up.length === 1 && down.length === 1) {
    if (!next(plain[0], plain[1])) return WHY;
    const between = gaps.find((g) => plain.includes(g.from) && plain.includes(g.to))!;
    if (atLeastHalf(between.size)) return WHY;
  }
  if (plain.length === 2 && (up.length === 2 || down.length === 2)) {
    const like = up.length === 2 ? up : down;
    if (next(plain[0], plain[1]) && next(like[0], like[1])) {
      const between = gaps.find((g) => plain.includes(g.from) && plain.includes(g.to))!;
      if (gaps.every((g) => g.size < Math.PI + IN_LINE) || atLeastHalf(between.size)) return WHY;
    }
  }
  if (plain.length === 3) {
    const wide = gaps.find((g) => plain.includes(g.from) && plain.includes(g.to) && atLeastHalf(g.size));
    if (wide) return WHY;
  }
  if (up.length === 2 && down.length === 2 && next(up[0], up[1])) return WHY;
  return null;
}

/**
 * Why a centre drawn flat with three bonds, its H (or lone pair) left out, states no configuration - or null where it states one - by the
 * forms the figures of Brecher 2006 (ST-1.2) draw and grade, `lifts` each bond's +1 (a wedge narrow at the centre), -1 (hashes) or 0:
 * - two bonds on top of each other, within `IN_LINE` (ST-0.1): nothing, whatever is wedged;
 * - one wedged: read (ST-1.2.1, 1.2.3; ST-1.2.4 with the wedge in line with a plain bond, its H in the widest gap opposite), but two plain
 *   bonds in line with the wedge between them are a T (ST-1.2.12);
 * - two wedged alike and one plain: read by the drawn volume (ST-1.2.5; nought, so nothing, where the two mirror each other);
 * - a wedge, hashes and a plain bond: read only where the plain bond stands half a turn or more from one of them (ST-1.2.2), not where it lies
 *   between them (ST-1.2.10, a trigonal planar picture);
 * - three wedged alike: read only where every gap is under half a turn (ST-1.2.6), not with one of half a turn or more (ST-1.2.9);
 * - two alike and one other: read only where the two alike are half a turn or more apart, the other between them on the narrower side
 *   (ST-1.2.7); not where every gap is under half a turn (ST-1.2.11) nor where the wide gap is between the unlike pair (ST-1.2.8).
 * A deciding gap within `IN_LINE` of half a turn says nothing: which side of the rule it is on cannot be told from the figures.
 */
function threeBondsSayNothing(at: { x: number; y: number }, around: readonly { x: number; y: number }[], lifts: readonly number[]): string | null {
  const t = around.map((p) => Math.atan2(p.y - at.y, p.x - at.x));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (apart(t[i], t[j]) < IN_LINE) return IN_LINE_WHY;
  const wedged = [0, 1, 2].filter((k) => lifts[k] !== 0);
  const turn = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // (the bonds in order round the centre, and each gap from one to the next)
  const order = [0, 1, 2].sort((a, b) => turn(t[a]) - turn(t[b]));
  const gaps = order.map((k, m) => ({ from: k, to: order[(m + 1) % 3], size: turn(t[order[(m + 1) % 3]] - t[k]) }));
  const halfTurn = (g: number) => Math.abs(g - Math.PI) <= IN_LINE;
  if (wedged.length === 1) {
    // (two plain bonds in line, the wedge between them: a T)
    const plain = [0, 1, 2].filter((k) => !lifts[k]);
    return apart(t[plain[0]], t[plain[1]]) > Math.PI - IN_LINE ? IN_LINE_WHY : null;
  }
  if (wedged.length === 2) {
    if (lifts[wedged[0]] === lifts[wedged[1]]) return null;
    const p = [0, 1, 2].find((k) => !lifts[k])!;
    const wide = Math.max(...gaps.filter((g) => g.from === p || g.to === p).map((g) => g.size));
    if (halfTurn(wide)) return IN_LINE_WHY;
    return wide > Math.PI ? null : "its plain bond lies between its wedge and its hashes: draw it across from them";
  }
  if (wedged.length === 3) {
    const wide = gaps.reduce((w, g) => (g.size > w.size ? g : w));
    if (halfTurn(wide.size)) return IN_LINE_WHY;
    const alike = lifts[0] === lifts[1] && lifts[1] === lifts[2];
    if (alike) return wide.size < Math.PI ? null : "its three wedges leave half a turn or more open: draw one of them plain";
    if (wide.size < Math.PI) return "its wedges and hashes are spread all round it: draw one of them plain";
    return lifts[wide.from] === lifts[wide.to] ? null : "its wedge and its hashes are half a turn or more apart: draw one of them plain";
  }
  return null;
}

/**
 * The ends of the double bonds a drawing draws straight - an end's one group
 * straight on from it, within `IN_LINE` - so that it states neither cis nor
 * trans though the bond could have either (IUPAC 2006, ST-4.4: the linear
 * depiction of a double bond of unspecified configuration): each such end,
 * by atom index. Not a double bond with nothing on an end, in a ring of
 * seven atoms or fewer, cumulated, or with a wavy bond at an end - none of
 * those has a cis or trans to leave unsaid - nor an end with two groups,
 * whose other group states it. And the ends of an odd cumulene's run so
 * drawn (a butatriene's), by the same tests. Clean-up keeps these ends
 * straight (`LayoutAtom.linear`), so that what it lays out leaves the bond
 * unsaid too.
 */
export function straightEnds(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): Set<number> {
  return straightEndsOf(atoms, structureOf(bonds).bonds);
}

function straightEndsOf(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): Set<number> {
  const neighbours: number[][] = atoms.map(() => []);
  const bondOf = new Map<string, DrawnBond>();
  bonds.forEach((b) => {
    if (b.a === b.b || bondOf.has(key(b.a, b.b))) return;
    neighbours[b.a].push(b.b);
    neighbours[b.b].push(b.a);
    bondOf.set(key(b.a, b.b), b);
  });
  const inRingUnder = ringsOfDrawing(atoms, bonds);
  const out = new Set<number>();
  const cumulated = (end: number, other: number) => neighbours[end].some((n) => n !== other && bondOf.get(key(end, n))!.order >= 2);
  const straightOn = (end: number, other: number, n: number) =>
    apart(Math.atan2(atoms[n].y - atoms[end].y, atoms[n].x - atoms[end].x), Math.atan2(atoms[end].y - atoms[other].y, atoms[end].x - atoms[other].x)) < IN_LINE;
  for (const bond of bonds) {
    if (bond.order !== 2 || bondOf.get(key(bond.a, bond.b)) !== bond) continue;
    const { a, b } = bond;
    const groups = (end: number, other: number) => neighbours[end].filter((n) => n !== other);
    if (!groups(a, b).length || !groups(b, a).length || inRingUnder(a, b, OPEN_RING) || cumulated(a, b) || cumulated(b, a)) continue;
    if ([a, b].some((x) => neighbours[x].some((n) => bondOf.get(key(x, n))!.either))) continue;
    for (const [end, other] of [
      [a, b],
      [b, a],
    ]) {
      const g = groups(end, other);
      if (g.length === 1 && straightOn(end, other, g[0])) out.add(end);
    }
  }
  // (and the ends of an odd cumulene's run - a butatriene's: its cis or trans across the run, read from its ends' groups as a double
  //  bond's are - by the same tests, an end's group straight on from the run)
  const { middle, runFrom } = runsOfDrawing(atoms, neighbours, bondOf);
  atoms.forEach((_, i) => {
    if (middle(i)) return;
    for (const m of neighbours[i]) {
      if (bondOf.get(key(i, m))!.order !== 2 || !middle(m)) continue;
      const run = runFrom(i, m);
      const j = run[run.length - 1];
      if (j <= i || run.length % 2 === 1) continue;
      const ends = [
        [i, m],
        [j, run[run.length - 2]],
      ];
      const groups = (end: number, other: number) => neighbours[end].filter((n) => n !== other);
      // (each end with two groups, an H among them at most, as the run is read)
      if (ends.some(([e, t]) => !groups(e, t).length || groups(e, t).length + atoms[e].hs !== 2) || inRingUnder(i, m, OPEN_RING)) continue;
      if (ends.some(([e]) => neighbours[e].some((n) => bondOf.get(key(e, n))!.either))) continue;
      for (const [e, t] of ends) {
        const g = groups(e, t);
        if (g.length === 1 && straightOn(e, t, g[0])) out.add(e);
      }
    }
  });
  return out;
}

/**
 * The centres a drawing shows, and what each was read against: the atoms, their bonds, and for each atom of a bridged system or a cage the
 * solid fitted to it (`fit`, the layout's: asked once, and again with the centres the first reading fixed held). `readStereo` and
 * `groupDepths` both read from this, so a group's depth is the very choice that read its centre.
 */
function readCentres(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], fit: CageFitter) {
  const neighbours: number[][] = atoms.map(() => []);
  const bondOf = new Map<string, DrawnBond>();
  bonds.forEach((b) => {
    if (b.a === b.b || bondOf.has(key(b.a, b.b))) return;
    neighbours[b.a].push(b.b);
    neighbours[b.b].push(b.a);
    bondOf.set(key(b.a, b.b), b);
  });
  // how a bond out of a centre stands: +1 on a wedge, -1 on hashes, 0 in
  // the page (a wedge narrow at the other end says nothing about this one)
  const lift = (c: number, n: number) => {
    const w = bondOf.get(key(c, n))?.wedge;
    return w && w.narrow === c ? (w.stereo === "up" ? 1 : -1) : 0;
  };
  // (which atoms of three bonds keep a configuration by their lone pair: Meno's rule, lib/chem/lonePairCentres)
  const keepsPyramid = lonePairCentres(atoms, [...bondOf.values()]);

  const centres = (fits: Map<number, CageFit>) => {
    const found = new Map<number, Tetrahedral>();
    atoms.forEach((atom, c) => {
      const around = neighbours[c];
      // (a sulfoxide's S, a phosphine's P, an aziridine's N: three groups and
      // a lone pair for the fourth, undrawn, where the lone pair keeps its
      // configuration (lib/chem/lonePairCentres) - read as a centre with its
      // H left out is, its configuration the volume of the three, as the
      // SMILES reader keeps one)
      const lonePair = atom.hs === 0 && around.length === 3 && keepsPyramid(c);
      if (!lonePair && (atom.hs > 1 || around.length + atom.hs !== 4)) return;
      if (around.some((n) => bondOf.get(key(c, n))!.either)) return;
      const wedged = around.some((n) => lift(c, n) !== 0);
      if (!wedged && !atom.centre) return;
      const inSpace = atom.centre && atom.z != null;
      // (drawn flat, its H left out, two of its bonds in line or on top of each other: no configuration stated)
      if (!inSpace && (atom.hs === 1 || lonePair) && around.length === 3 && threeBondsSayNothing(atom, around.map((n) => atoms[n]), around.map((n) => lift(c, n)))) return;
      if (!inSpace && around.length === 4 && fourBondsSayNothing(atom, around.map((n) => atoms[n]), around.map((n) => lift(c, n)))) return;
      const order = atom.hs ? [...around, -1] : around;
      const volume = inSpace ? volumeInSpace(atoms, c, around, lift, fits.get(c)) : 0;
      const v =
        volume ||
        drawnVolume(
          atom,
          order.map((n) => (n === -1 ? null : atoms[n])),
          order.map((n) => (n === -1 ? 0 : lift(c, n))),
        );
      if (v) found.set(c, { neighbours: order, volume: v > 0 ? 1 : -1 });
    });
    return found;
  };
  // (and a cage's solid shaped as the centres it fixes itself have it -
  // each with three bonds into the cage, read from those bonds as drawn -
  // where the drawing is the nearer picture of that one, and the centres
  // read again from it: a solid with no configuration at all can be
  // another isomer's, its free corners elsewhere - tetrodotoxin's C4, its
  // two corners drawn on one side, read by a hair)
  const first = fit(atoms, bonds);
  let tetra = centres(first);
  let fits = first;
  const fixed = new Map(
    [...tetra].filter(([c]) => {
      const fit = first.get(c);
      return !!fit && atoms[c].centre && atoms[c].z != null && neighbours[c].filter((n) => fit.solid.has(n) && !lift(c, n)).length >= 3;
    }),
  );
  if (fixed.size) {
    const second = fit(atoms, bonds, fixed);
    const nearer = new Map([...first].map(([a, f]) => [a, (second.get(a)?.miss ?? Infinity) < f.miss ? second.get(a)! : f]));
    if ([...nearer].some(([a, f]) => f !== first.get(a))) {
      fits = nearer;
      tetra = centres(nearer);
    }
  }
  return { neighbours, bondOf, lift, keepsPyramid, tetra, fits };
}

/**
 * The stereochemistry a drawing shows (this file's header). A drawing with depth is read by its bonds with depth; `fit`, where given, says
 * for each atom of a bridged system or a cage the solid it is drawn from, fitted to the drawing (the layout's `cageFits`).
 */
export function readStereo(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], fit: CageFitter = () => new Map()): DrawnStereo {
  const kept = structureOf(bonds);
  const read = readStereoOf(atoms, kept.bonds, fit);
  return { ...read, cisTrans: new Map([...read.cisTrans].map(([i, c]) => [kept.at(i), c])) };
}

function readStereoOf(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], fit: CageFitter): DrawnStereo {
  const { neighbours, bondOf, lift, keepsPyramid, tetra } = readCentres(atoms, bonds, fit);
  const inRingUnder = ringsOfDrawing(atoms, bonds);

  const cisTrans = new Map<number, CisTrans>();
  const cumulated = (end: number, other: number) => neighbours[end].some((n) => n !== other && bondOf.get(key(end, n))!.order >= 2);
  bonds.forEach((bond, i) => {
    if (bond.order !== 2 || bondOf.get(key(bond.a, bond.b)) !== bond) return;
    const { a, b } = bond;
    // (each end's group read off the bond's line: one straight on from it, within IN_LINE, states neither cis nor trans)
    const straightOn = (end: number, other: number, n: number) =>
      apart(Math.atan2(atoms[n].y - atoms[end].y, atoms[n].x - atoms[end].x), Math.atan2(atoms[end].y - atoms[other].y, atoms[end].x - atoms[other].x)) < IN_LINE;
    const ra = neighbours[a].find((n) => n !== b && !straightOn(a, b, n));
    const rb = neighbours[b].find((n) => n !== a && !straightOn(b, a, n));
    if (ra == null || rb == null || inRingUnder(a, b, OPEN_RING)) return;
    // (an end with a second double bond, or a triple one - an azide's
    // middle N, an allene's middle C - is straight through, and the bond
    // has no cis or trans of its own, however the drawing bends it)
    if (cumulated(a, b) || cumulated(b, a)) return;
    // a wavy bond at either end: either configuration
    if ([a, b].some((x) => neighbours[x].some((n) => bondOf.get(key(x, n))!.either))) return;
    const along = { x: atoms[b].x - atoms[a].x, y: atoms[b].y - atoms[a].y };
    const side = (r: number, from: number) => {
      const v = { x: atoms[r].x - atoms[from].x, y: atoms[r].y - atoms[from].y };
      const s = along.x * v.y - along.y * v.x;
      return Math.abs(s) < 1e-6 * (Math.hypot(along.x, along.y) * Math.hypot(v.x, v.y) || 1) ? 0 : Math.sign(s);
    };
    const sa = side(ra, a);
    const sb = side(rb, b);
    if (!sa || !sb) return;
    cisTrans.set(i, { refs: [ra, rb], cis: sa === sb });
  });

  // a run of cumulated double bonds (`runsOfDrawing`)
  const { middle, runFrom } = runsOfDrawing(atoms, neighbours, bondOf);
  // (an end of a run of an even number of double bonds - an allene's, a ketenimine's: a wedge out of it is the run's)
  const endsAnAllene = (i: number) =>
    !middle(i) && neighbours[i].some((m) => bondOf.get(key(i, m))!.order === 2 && middle(m) && runFrom(i, m).length % 2 === 1);

  const axes: Axial[] = [];
  bonds.forEach((bond) => {
    if (bond.order !== 1 || bondOf.get(key(bond.a, bond.b)) !== bond) return;
    const ends: [number, number][] = [
      [bond.a, bond.b],
      [bond.b, bond.a],
    ];
    for (const [i, j] of ends) {
      const near = neighbours[i].filter((n) => n !== j);
      const far = neighbours[j].filter((n) => n !== i);
      if (near.length !== 2 || far.length !== 2 || atoms[i].hs || atoms[j].hs || tetra.has(i)) continue;
      // (a wedge out of an allene's end states the allene's axis and nothing else - ST-1.6: with the far end in the page,
      // it has the double bond in the page, which the single bond's axis would need behind it. The single bond's own axis
      // is still read from its other end's wedges, as a hindered biaryl's is - ST-1.7, by analogy)
      if (endsAnAllene(i)) continue;
      // (read as an axis's, the wedge from a sulfoxide's S to its methyl
      // turned the S over: laid out, the axis was kept and the centre not.
      // A wedge at a pyramid of three is about the pyramid, whether or not
      // that keeps a configuration - no axis's end)
      const orders = neighbours[i].reduce((sum, n) => sum + (bondOf.get(key(i, n))!.order === 4 ? 1.5 : bondOf.get(key(i, n))!.order), 0);
      if (keepsPyramid(i) || pyramidal(atoms[i].el ?? "C", atoms[i].charge ?? 0, 3, orders, atoms[i].hs)) continue;
      const lifted = near.find((n) => lift(i, n) !== 0);
      // (an axis in a ring only where the ring is of seven atoms or more - a 2,2'-bridged biphenyl's, a BINOL phosphoric
      // acid's: in five or six the rings are held all but flat, or turn over fast - fluorene, 9,10-dihydrophenanthrene)
      // (a metal counted as any ring atom: BINAP's chelate ring through its axis is of seven, read; a 2,2'-bipyridine's on a
      // metal, of five, held flat)
      if (lifted == null || inRingUnder(i, j, AXIS_RING)) continue;
      const refs: [number, number] = [Math.min(...near), Math.min(...far)];
      const sense = drawnAxisSense((k) => atoms[k], { atoms: [i, j], refs }, lifted, lift(i, lifted) as 1 | -1);
      if (sense) axes.push({ atoms: [i, j], refs, sense });
      return;
    }
  });

  // an allene's axis and an odd cumulene's cis or trans: each run of
  // cumulated double bonds, end to end, drawn straight through
  const odd: Cumulated[] = [];
  atoms.forEach((_, i) => {
    if (middle(i)) return;
    for (const m of neighbours[i]) {
      if (bondOf.get(key(i, m))!.order !== 2 || !middle(m)) continue;
      const run = runFrom(i, m);
      const j = run[run.length - 1];
      if (j < i) continue;
      const [ti, tj] = [run[1], run[run.length - 2]];
      const near = neighbours[i].filter((n) => n !== ti);
      const far = neighbours[j].filter((n) => n !== tj);
      // (each end with two groups, an H among them at most)
      if (!near.length || !far.length || near.length + (atoms[i].hs ?? 0) !== 2 || far.length + (atoms[j].hs ?? 0) !== 2) continue;
      // a wavy bond at an end: either
      if ([i, j].some((x) => neighbours[x].some((n) => bondOf.get(key(x, n))!.either))) continue;
      if (run.length % 2 === 1) {
        // an allene's (an even number of double bonds): a wedge out of one end
        // to a group of it, the other end's groups in the page, read as a
        // biaryl's axis is - its ends not bonded, the turn the same; wedged at
        // both ends, the two read alike, else none (unreadWhy says why)
        const read = ([e, f, en, fn]: readonly [number, number, number[], number[]]) => {
          const lifted = en.find((n) => lift(e, n) !== 0);
          if (lifted == null) return null;
          const refs: [number, number] = [Math.min(...en), Math.min(...fn)];
          return { atoms: [e, f] as [number, number], refs, sense: drawnAxisSense((k) => atoms[k], { atoms: [e, f], refs }, lifted, lift(e, lifted) as 1 | -1) };
        };
        const [one, two] = [read([i, j, near, far]), read([j, i, far, near])];
        const first = one ?? two;
        // (read from the other end, against the same two groups, an axis turns the same way)
        const agree = !one || !two || one.sense === two.sense;
        if (first && first.sense && agree) axes.push({ atoms: first.atoms, refs: first.refs, sense: first.sense });
        continue;
      }
      // an odd cumulene's (an odd number of double bonds): each end's group
      // off the line through the run, on one side of it or the other, as a
      // double bond's are read
      const along = { x: atoms[j].x - atoms[i].x, y: atoms[j].y - atoms[i].y };
      const side = (r: number, from: number) => {
        const v = { x: atoms[r].x - atoms[from].x, y: atoms[r].y - atoms[from].y };
        const t = along.x * v.y - along.y * v.x;
        return Math.abs(t) < 1e-6 * (Math.hypot(along.x, along.y) * Math.hypot(v.x, v.y) || 1) ? 0 : Math.sign(t);
      };
      const straightOn = (end: number, other: number, n: number) =>
        apart(Math.atan2(atoms[n].y - atoms[end].y, atoms[n].x - atoms[end].x), Math.atan2(atoms[end].y - atoms[other].y, atoms[end].x - atoms[other].x)) < IN_LINE;
      const ri = near.find((n) => !straightOn(i, ti, n));
      const rj = far.find((n) => !straightOn(j, tj, n));
      if (ri == null || rj == null) continue;
      const [si, sj] = [side(ri, i), side(rj, j)];
      if (si && sj) odd.push({ atoms: [i, j], refs: [ri, rj], cis: si === sj });
    }
  });

  return { tetra, cisTrans, axes, cumulated: odd };
}

/** How far a bond in the page is turned, either way, to ask whether what the drawing says of a centre or a double bond stays the same. */
const UNSURE_TURN = (12 * Math.PI) / 180;

const turned = (p: { x: number; y: number }, c: { x: number; y: number }, t: number) => ({
  x: c.x + (p.x - c.x) * Math.cos(t) - (p.y - c.y) * Math.sin(t),
  y: c.y + (p.x - c.x) * Math.sin(t) + (p.y - c.y) * Math.cos(t),
});

/**
 * Why the wedges at atom `c` - three bonds or more, an H at most, read as
 * no centre (`readStereo`) - say no configuration, in words that follow
 * "the wedges at C do not say its configuration (...)": a wavy bond at it,
 * saying either; more groups round it than a tetrahedral centre's four; an
 * atom with three bonds that keeps no configuration of its own, where a
 * wedge states none (an amine's N, a plain N-alkyl aziridine's, a B: Meno's
 * rule, lib/chem/lonePairCentres); a centre by its lone pair drawn with
 * two bonds, its H carried (a secondary phosphine's P), its H and its lone
 * pair both left out; two of its bonds in line or on top of each other (a T, ST-1.2.12);
 * or else wedges and hashes that cancel, saying neither way round.
 */
export function unreadWhy(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], c: number): string {
  return unreadWhyOf(atoms, structureOf(bonds).bonds, c);
}

function unreadWhyOf(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], c: number): string {
  const mine = bonds.filter((b) => b.a !== b.b && (b.a === c || b.b === c));
  const around = [...new Set(mine.map((b) => (b.a === c ? b.b : b.a)))];
  const atom = atoms[c];
  if (mine.some((b) => b.either)) return "a wavy bond at it says it is either";
  // (a centre drawn in perspective with no wedge: a group drawn half way between the two ways it could point)
  if (atom.centre && atom.z != null && !mine.some((b) => b.wedge)) return "its bond is drawn between its two free positions";
  // (an allene's end: its wedge says how the allene turns - or, wedged at both ends, the two say opposite ways)
  const doubles = (x: number) => bonds.filter((b) => b.order === 2 && (b.a === x || b.b === x));
  const run = doubles(c).map((b) => (b.a === c ? b.b : b.a)).find((m) => doubles(m).length === 2);
  if (run != null) {
    // (its other end with one group - a ketenimine's N: the run has no axis, so the wedge has none to state)
    const path = [c, run];
    while (doubles(path[path.length - 1]).length === 2 && path.length <= atoms.length) {
      const [prev, at] = [path[path.length - 2], path[path.length - 1]];
      const next = doubles(at).map((b) => (b.a === at ? b.b : b.a)).find((x) => x !== prev);
      if (next == null) break;
      path.push(next);
    }
    const end = path[path.length - 1];
    const onEnd = bonds.filter((b) => b.a !== b.b && (b.a === end || b.b === end) && b.a !== path[path.length - 2] && b.b !== path[path.length - 2]).map((b) => (b.a === end ? b.b : b.a));
    const hs = atoms[end].hs + onEnd.filter((n) => atoms[n].el === "H").length;
    // (a ketene's O, with no group; a ketenimine's N, with one; a terminal allene's CH2, with two H: no axis for the wedge to state)
    if (onEnd.length + atoms[end].hs < 2 || hs >= 2) return "the other end of these double bonds does not carry two different groups, so there is no axis for a wedge to state";
    return "the wedges at the allene's two ends say it turns opposite ways, or its groups are in line with it";
  }
  const groups = around.length + atom.hs;
  if (groups > 4) return `it has ${groups} groups round it, more than the four of a tetrahedral centre`;
  if (around.length === 3 && atom.hs === 0 && !lonePairCentres(atoms, bonds)(c)) return "it has three bonds and keeps no configuration of its own, so a wedge at it states none";
  // (a centre by its lone pair, two bonds drawn and its H carried: the two corners left are each other's mirror image, and
  //  which holds the H, which the lone pair, is not drawn)
  if (around.length === 2 && atom.hs === 1 && lonePairCentres(atoms, bonds)(c)) return "its H and its lone pair are both left out, so which way each points is not drawn: draw its H as an atom";
  // (as readStereo has it: a centre drawn with three bonds - its H, or its lone pair, left out)
  const liftOf = (n: number) => {
    const w = mine.find((b) => b.wedge && b.wedge.narrow === c && (b.a === n || b.b === n))?.wedge;
    return w ? (w.stereo === "up" ? 1 : -1) : 0;
  };
  const why =
    around.length === 3 ? threeBondsSayNothing(atom, around.map((n) => atoms[n]), around.map(liftOf)) : around.length === 4 ? fourBondsSayNothing(atom, around.map((n) => atoms[n]), around.map(liftOf)) : null;
  if (why) return why;
  return "they are drawn crossed, saying neither way round";
}

/**
 * What the drawing says of its stereochemistry only by luck, by index: the
 * stereocentres drawn flat with a wedge whose reading changes with one of
 * their bonds in the page turned a little either way, or with every bond
 * in one half of the page (ibogaine's bridgehead, bilobalide's carbon,
 * drawn so); and the double bonds whose cis or trans changes so, a group
 * on one in line with it. A reader - RDKit, a chemist - may take either
 * the other way (docs/LAYOUT-2D-TUNING.md, *A wedge that reads by luck*).
 * A centre with a lone pair for its fourth group - a sulfoxide's S, a
 * phosphine's P (lib/chem/lonePairCentres) - is asked so too: its
 * configuration read as readStereo reads it, from its three groups.
 */
export function unsureStereo(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): { atoms: number[]; bonds: number[] } {
  const kept = structureOf(bonds);
  const unsure = unsureStereoOf(atoms, kept.bonds);
  return { atoms: unsure.atoms, bonds: unsure.bonds.map(kept.at) };
}

function unsureStereoOf(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): { atoms: number[]; bonds: number[] } {
  const neighbours: number[][] = atoms.map(() => []);
  const bondOf = new Map<string, DrawnBond>();
  bonds.forEach((b) => {
    if (b.a === b.b || bondOf.has(key(b.a, b.b))) return;
    neighbours[b.a].push(b.b);
    neighbours[b.b].push(b.a);
    bondOf.set(key(b.a, b.b), b);
  });
  const inRingUnder = ringsOfDrawing(atoms, bonds);
  const lift = (c: number, n: number) => {
    const w = bondOf.get(key(c, n))?.wedge;
    return w && w.narrow === c ? (w.stereo === "up" ? 1 : -1) : 0;
  };
  // (which atoms of three bonds keep a configuration by their lone pair: Meno's rule, as readStereo asks it)
  const keepsPyramid = lonePairCentres(atoms, [...bondOf.values()]);
  const centres: number[] = [];
  atoms.forEach((atom, c) => {
    const around = neighbours[c];
    const lonePair = atom.hs === 0 && around.length === 3 && keepsPyramid(c);
    if (atom.centre || (!lonePair && (atom.hs > 1 || around.length + atom.hs !== 4))) return;
    if (around.some((n) => bondOf.get(key(c, n))!.either)) return;
    if (!around.some((n) => lift(c, n) !== 0)) return;
    // (as readStereo reads it: an H left out a fourth group, a lone pair none - the volume of its three)
    const order = atom.hs ? [...around, -1] : around;
    const lifts = order.map((n) => (n === -1 ? 0 : lift(c, n)));
    const at = (n: number) => (n === -1 ? null : atoms[n]);
    const read = (pts: ({ x: number; y: number } | null)[]) => drawnVolume(atom, pts, lifts);
    const pts = order.map(at);
    const v = read(pts);
    const steady = pts.every((p, i) => !p || lifts[i] !== 0 || [-UNSURE_TURN, UNSURE_TURN].every((t) => read(pts.map((q, j) => (j === i && q ? turned(q, atom, t) : q))) === v));
    const angles = around.map((n) => Math.atan2(atoms[n].y - atom.y, atoms[n].x - atom.x)).sort((p, q) => p - q);
    const widest = Math.max(...angles.map((t, k) => (k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI) - t));
    const spread = around.length < 4 || widest < Math.PI - UNSURE_TURN;
    if (!v || !steady || !spread) centres.push(c);
  });
  const doubles: number[] = [];
  bonds.forEach((bond, i) => {
    if (bond.order !== 2 || bondOf.get(key(bond.a, bond.b)) !== bond) return;
    const { a, b } = bond;
    if (atoms[a].z != null || atoms[b].z != null || inRingUnder(a, b, OPEN_RING)) return;
    if ([a, b].some((x) => neighbours[x].some((n) => bondOf.get(key(x, n))!.either))) return;
    // (a group on either end within the turn of the bond's own line: cis and trans told apart by luck)
    // (a group exactly in line says nothing, as an allene's middle does; one
    // by a double or triple bond is no group of a stereo double bond)
    const inLine = (end: number, other: number) =>
      neighbours[end]
        .filter((n) => n !== other && bondOf.get(key(end, n))!.order === 1)
        .some((n) => {
          const u = Math.atan2(atoms[n].y - atoms[end].y, atoms[n].x - atoms[end].x);
          const w = Math.atan2(atoms[end].y - atoms[other].y, atoms[end].x - atoms[other].x);
          const off = Math.abs(Math.atan2(Math.sin(u - w), Math.cos(u - w)));
          return off > 1e-3 && off < UNSURE_TURN;
        });
    const groups = neighbours[a].some((n) => n !== b) && neighbours[b].some((n) => n !== a);
    // (nor one cumulated with another, which has none: readStereo)
    const cumulated = [a, b].some((end) => neighbours[end].some((n) => n !== (end === a ? b : a) && bondOf.get(key(end, n))!.order >= 2));
    if (groups && !cumulated && (inLine(a, b) || inLine(b, a))) doubles.push(i);
  });
  return { atoms: centres, bonds: doubles };
}

/**
 * A cage drawn in perspective, as the solid it is drawn from: the solid
 * the engine takes it to be (lib/layout/cage), and the map that takes that solid to
 * where its atoms are drawn, their depth as the third coordinate - fitted,
 * as the engine may draw a cage the way textbooks do rather than exactly
 * as it is seen.
 */
export type CageFit = {
  solid: Map<number, Vec3>;
  map: (v: Vec3) => Vec3;
  /** How far the drawing is from the solid so mapped: the mean square of its atoms' misses, depth among them. */
  miss: number;
};

/** How a cage's solid is fitted to a drawing, atom by atom (the layout's `cageFits`): the atoms, the bonds, and the centres it holds as read. */
export type CageFitter = (atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], held?: ReadonlyMap<number, Tetrahedral>) => Map<number, CageFit>;

/** The linear part of the affine map that best takes `from` to `to`, or null where `from` is flat. */
export function fitLinear(from: readonly V3[], to: readonly V3[]): ((v: V3) => V3) | null {
  const n = from.length;
  const mean = (ps: readonly V3[]): V3 => [0, 1, 2].map((k) => ps.reduce((s, p) => s + p[k], 0) / n) as V3;
  const pf = mean(from);
  const pt = mean(to);
  const P = [0, 1, 2].map(() => [0, 0, 0]);
  const Q = [0, 1, 2].map(() => [0, 0, 0]);
  for (let i = 0; i < n; i++) {
    const p = sub3(from[i], pf);
    const q = sub3(to[i], pt);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        P[r][c] += p[r] * p[c];
        Q[r][c] += q[r] * p[c];
      }
    }
  }
  const d = det3(P[0] as V3, P[1] as V3, P[2] as V3);
  if (Math.abs(d) < 1e-9) return null;
  // P's inverse, by its cofactors (P is symmetric)
  const cof = (r: number, c: number) => {
    const [r1, r2] = [0, 1, 2].filter((k) => k !== r);
    const [c1, c2] = [0, 1, 2].filter((k) => k !== c);
    return ((r + c) % 2 ? -1 : 1) * (P[r1][c1] * P[r2][c2] - P[r1][c2] * P[r2][c1]);
  };
  const inv = [0, 1, 2].map((r) => [0, 1, 2].map((c) => cof(c, r) / d));
  const L = [0, 1, 2].map((r) => [0, 1, 2].map((c) => Q[r][0] * inv[0][c] + Q[r][1] * inv[1][c] + Q[r][2] * inv[2][c]));
  return (v) => [0, 1, 2].map((r) => L[r][0] * v[0] + L[r][1] * v[1] + L[r][2] * v[2]) as V3;
}

/**
 * The sign of the volume a perspective centre's first three bonds span, or
 * 0 where the drawing does not give enough of it in three dimensions. Bonds
 * to atoms with a depth are known; a wedge stands out of the page, hashes
 * behind it; the rest take the ways the known ones leave free, whichever
 * each is drawn nearer to - the ways the cage's solid leaves free, where
 * the centre is in one, as the drawing shows them. A centre with three
 * bonds into the cage is read from those three alone, the fourth being
 * where they leave it - and where they are drawn all but in one plane, as
 * a textbook's chair can draw a bridgehead, from the cage as a whole, its
 * solid as fitted to the drawing.
 */
function volumeInSpace(
  atoms: readonly DrawnAtom[],
  c: number,
  around: readonly number[],
  lift: (c: number, n: number) => number,
  fit?: CageFit,
  /** Filled, where the centre is read, with the way each of its groups out of the ring (no depth, no wedge) was read to go: for `groupDepths`. */
  chosen?: Map<number, V3>,
): number {
  const at: V3 = [atoms[c].x, atoms[c].y, atoms[c].z!];
  const dirs = new Map<number, V3>();
  const unknown: number[] = [];
  for (const n of around) {
    const p = atoms[n];
    const flat: V3 = [p.x - at[0], p.y - at[1], 0];
    const l = lift(c, n);
    const inCage = fit ? fit.solid.has(n) : p.z != null;
    if (inCage && !l) dirs.set(n, sub3([p.x, p.y, p.z!], at));
    else if (l) dirs.set(n, [flat[0], flat[1], l * WEDGE_LIFT * Math.hypot(flat[0], flat[1])]);
    else unknown.push(n);
  }
  const caged = around.filter((n) => (fit ? fit.solid.has(n) : atoms[n].z != null) && !lift(c, n));
  if (caged.length >= 3) {
    // (the volume of three, as the volume of the first three says it: the
    // same, or the other way, by which one is left out)
    const out = around.findIndex((n) => !caged.includes(n));
    const left = around.length === 4 && out >= 0 ? out : 3;
    const three = around.filter((_, k) => k !== left).slice(0, 3);
    const sign = left % 2 === 1 ? 1 : -1;
    // (a fourth group the three leave where they leave it: away from all three, as they were read)
    const fourth = (ways: V3[]) => {
      const group = unknown.length === 1 ? unknown[0] : null;
      if (chosen && group != null) chosen.set(group, unit3(ways.reduce((s, u) => sub3(s, unit3(u)), [0, 0, 0] as V3)));
    };
    const d = det3(...(three.map((n) => unit3(dirs.get(n)!)) as [V3, V3, V3]));
    if (Math.abs(d) >= HAIR || !fit) {
      if (Math.abs(d) < 1e-6) return 0;
      fourth(caged.map((n) => dirs.get(n)!));
      return Math.sign(d) * sign;
    }
    const s = fit.solid.get(c)!;
    const f = det3(...(three.map((n) => unit3(fit.map(sub3(fit.solid.get(n)!, s)))) as [V3, V3, V3]));
    if (Math.abs(f) < 1e-6) return 0;
    fourth(caged.map((n) => fit.map(sub3(fit.solid.get(n)!, s))));
    return Math.sign(f) * sign;
  }
  // a Newman projection's atom (docs/EDITOR-2D.md, *Drawn in perspective*): its one known bond end-on - the atom behind it, or before it, in the same place on the page - and its groups drawn about it at angles of their own: each leaves it away from that atom, at the angle it is drawn at, as a staggered or an eclipsed projection says
  if (dirs.size === 1 && unknown.length >= 2) {
    const d0 = [...dirs.values()][0];
    if (Math.hypot(d0[0], d0[1]) >= END_ON * Math.abs(d0[2])) return 0;
    const away = d0[2] > 0 ? -1 : 1;
    const t = Math.acos(-1 / 3);
    const angles = unknown.map((n) => Math.atan2(atoms[n].y - at[1], atoms[n].x - at[0]));
    // (two groups drawn on one line, or all but, say nothing of which is which)
    for (let i = 0; i < angles.length; i++) for (let j = i + 1; j < angles.length; j++) if (apart(angles[i], angles[j]) < 2 * BETWEEN) return 0;
    unknown.forEach((n, i) => dirs.set(n, [Math.sin(t) * Math.cos(angles[i]), Math.sin(t) * Math.sin(angles[i]), away * -Math.cos(t)]));
    unknown.length = 0;
  }
  if (dirs.size < 2) return 0;
  if (unknown.length) {
    let free: V3[];
    if (fit) {
      // the solid's free corners at the centre, as the drawing shows them
      const s = fit.solid.get(c)!;
      const us = around.filter((n) => fit.solid.has(n)).map((n) => unit3(sub3(fit.solid.get(n)!, s)));
      if (us.length < 2) return 0;
      free = freeCorners(us).map((corner) => fit.map(corner));
    } else if (dirs.size >= 3) {
      free = [unit3([...dirs.values()].reduce((s, u) => sub3(s, unit3(u)), [0, 0, 0] as V3))];
    } else {
      const [u1, u2] = [...dirs.values()].map(unit3);
      const mid = unit3([-(u1[0] + u2[0]), -(u1[1] + u2[1]), -(u1[2] + u2[2])]);
      const across = unit3(cross3(u1, u2));
      const c0 = Math.cos(HALF_TETRAHEDRAL);
      const s0 = Math.sin(HALF_TETRAHEDRAL);
      free = [1, -1].map((s): V3 => [
        mid[0] * c0 + s * across[0] * s0,
        mid[1] * c0 + s * across[1] * s0,
        mid[2] * c0 + s * across[2] * s0,
      ]);
    }
    // how near a free way is to where a bond is drawn, seen from the front
    const fitTo = (n: number, d: V3) => {
      const p = atoms[n];
      const vx = p.x - at[0];
      const vy = p.y - at[1];
      const lv = Math.hypot(vx, vy) || 1;
      const ld = Math.hypot(d[0], d[1]);
      return ld < 1e-9 ? 0 : (vx * d[0] + vy * d[1]) / (lv * ld);
    };
    if (unknown.length === 1) {
      const [n] = unknown;
      // (drawn half way between its two nearest free ways, as seen, or between two seen close together: neither is said)
      if (free.length >= 2 && !fit) {
        const seen = free.filter((d) => Math.hypot(d[0], d[1]) > 1e-9).map((d) => Math.atan2(d[1], d[0]));
        const group = Math.atan2(atoms[n].y - at[1], atoms[n].x - at[0]);
        const near = [...seen].sort((p, q) => apart(group, p) - apart(group, q)).slice(0, 2);
        if (near.length === 2) {
          const mid = Math.atan2(Math.sin(near[0]) + Math.sin(near[1]), Math.cos(near[0]) + Math.cos(near[1]));
          const between = apart(near[0], near[1]) < Math.PI && apart(group, near[0]) + apart(group, near[1]) <= apart(near[0], near[1]) + 1e-9;
          if (apart(near[0], near[1]) < 2 * BETWEEN && between) return 0;
          if (apart(group, mid) < BETWEEN && apart(near[0], near[1]) > 1e-9) return 0;
        }
      }
      dirs.set(n, free.reduce((best, d) => (fitTo(n, d) > fitTo(n, best) ? d : best)));
    } else if (unknown.length === 2 && free.length === 2) {
      const [m, n] = unknown;
      const straight = fitTo(m, free[0]) + fitTo(n, free[1]);
      const crossed = fitTo(m, free[1]) + fitTo(n, free[0]);
      dirs.set(m, straight >= crossed ? free[0] : free[1]);
      dirs.set(n, straight >= crossed ? free[1] : free[0]);
    } else {
      return 0;
    }
  }
  const [p, q, r] = around.slice(0, 3).map((n) => unit3(dirs.get(n)!));
  const d = det3(p, q, r);
  if (Math.abs(d) < 1e-6) return 0;
  if (chosen) for (const n of around) if (!lift(c, n) && !(fit ? fit.solid.has(n) : atoms[n].z != null)) chosen.set(n, unit3(dirs.get(n)!));
  return Math.sign(d);
}

/**
 * The depth of each group drawn out of a ring in perspective, worked out for where its bond passes behind another (lib/chem/layout2d
 * `brokenBehind`; Brecher 2006, ST-3.1): the way its centre is read to send it (`volumeInSpace`, the very choice that reads the centre - the
 * ring's bonds as drawn, or a bridged system's or a cage's solid fitted to it) says how far before or behind its ring atom it lies: that way's
 * depth, as a part of a bond one long, times the bond's length as drawn. The atoms further out along the same group lie at its first atom's
 * depth: a group is drawn flat, before or behind its ring as its first atom is. None where the ring atom is not read there - a group drawn half
 * way between two places, a wavy bond at it - nor for an atom reached from two atoms with depth, nor where nothing in the drawing has depth.
 * Nothing is kept: the drawing asks again as it is drawn, so a group dragged round has its depth, and its gap, follow it. By atom index.
 */
export function groupDepths(drawnAtoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], fit: CageFitter = () => new Map()): Map<number, number> {
  return groupDepthsOf(drawnAtoms, structureOf(bonds).bonds, fit);
}

function groupDepthsOf(drawnAtoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], fit: CageFitter): Map<number, number> {
  const out = new Map<number, number>();
  const deep = (i: number) => drawnAtoms[i].z != null;
  // (no atom with depth that has a group without and two bonds with depth, or one seen end-on as a Newman projection's: nothing to work out,
  //  and nothing read - an engine's cage gives its groups' first atoms depth already)
  const near = drawnAtoms.map((): number[] => []);
  for (const b of bonds) {
    if (b.a === b.b) continue;
    near[b.a].push(b.b);
    near[b.b].push(b.a);
  }
  const endOn = (c: number, n: number) => Math.hypot(drawnAtoms[n].x - drawnAtoms[c].x, drawnAtoms[n].y - drawnAtoms[c].y) < END_ON * Math.abs(drawnAtoms[n].z! - drawnAtoms[c].z!);
  const anchors = (c: number) => deep(c) && near[c].some((n) => !deep(n)) && (near[c].filter(deep).length >= 2 || near[c].some((n) => deep(n) && endOn(c, n)));
  if (!drawnAtoms.some((_, c) => anchors(c))) return out;
  const atoms = drawnAtoms;
  const { neighbours, bondOf, lift, fits } = readCentres(atoms, bonds, fit);
  const first = new Map<number, number>();
  const twice = new Set<number>();
  atoms.forEach((atom, c) => {
    if (!deep(c)) return;
    const around = neighbours[c];
    if (around.length > 4 || around.length + atom.hs > 4 || around.some((n) => bondOf.get(key(c, n))!.either)) return;
    const groups = around.filter((n) => !deep(n) && !lift(c, n));
    if (!groups.length) return;
    const chosen = new Map<number, V3>();
    if (!volumeInSpace(atoms, c, around, lift, fits.get(c), chosen)) return;
    for (const n of groups) {
      const way = chosen.get(n);
      if (!way) continue;
      if (first.has(n)) twice.add(n);
      first.set(n, atoms[c].z! + way[2] * Math.hypot(atoms[n].x - atom.x, atoms[n].y - atom.y));
    }
  });
  // (an atom bonded to two atoms with depth is between them, not out of either)
  for (const [n] of first) if (twice.has(n) || neighbours[n].filter(deep).length > 1) first.delete(n);
  // each group's further atoms at its first atom's depth; one reached from two groups, neither's
  const from = new Map<number, number>();
  for (const [g] of first) {
    const seen = new Set([g]);
    const queue = [g];
    while (queue.length) {
      const i = queue.shift()!;
      for (const n of neighbours[i]) {
        if (deep(n) || seen.has(n) || first.has(n)) continue;
        seen.add(n);
        queue.push(n);
        if (from.has(n) && from.get(n) !== g) twice.add(n);
        from.set(n, g);
      }
    }
  }
  for (const [g, z] of first) out.set(g, z);
  for (const [n, g] of from) if (!twice.has(n)) out.set(n, first.get(g)!);
  return out;
}

/**
 * Whether two readings of a centre say the same: the same neighbours, in
 * orders an even number of swaps apart with the same volume, or an odd
 * number with the opposite one. Neighbours are matched through `as` where
 * one reading names an atom the other counts as its implicit H (-1).
 */
export function sameConfiguration(
  p: Tetrahedral,
  q: Tetrahedral,
  as: (n: number) => number = (n) => n,
): boolean {
  const a = p.neighbours.map(as);
  const b = q.neighbours.map(as);
  if (a.length !== b.length || a.some((n) => !b.includes(n))) return false;
  // (the parity of the permutation taking one order to the other: geometry's)
  return (parity(a.map((n) => b.indexOf(n))) === 1) === (p.volume === q.volume);
}

/**
 * The drawing's bonds of the structure (perception/graph `ofTheStructure`: a hydrogen bond is none), which every reading here takes in place
 * of the caller's, and `at`, which gives a kept bond's index in the caller's list back - so what is said of bonds is said in its numbering.
 */
function structureOf(bonds: readonly DrawnBond[]): { bonds: readonly DrawnBond[]; at: (i: number) => number } {
  if (bonds.every(ofTheStructure)) return { bonds, at: (i) => i };
  const at: number[] = [];
  bonds.forEach((b, i) => {
    if (ofTheStructure(b)) at.push(i);
  });
  return { bonds: at.map((i) => bonds[i]), at: (i) => at[i] };
}

/** The smallest ring a drawn axis may be in: seven atoms. */
const AXIS_RING = 7;

/**
 * Whether the bond a-b of a drawing is in a ring of fewer than `n` atoms (perception/facts `inRingSmallerThan`): the rings of every drawn
 * bond, as the reader takes them, a metal's too; false for a bond in no ring.
 */
function ringsOfDrawing(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): (a: number, b: number, n: number) => boolean {
  const facts = factsOf({ atoms: atoms.map((x) => ({ el: x.el ?? "C" })), bonds: bonds.map(({ a, b, order }) => ({ a, b, order })) });
  return (a, b, n) => facts.inRingSmallerThan(facts.bondBetween(a, b), n);
}

/**
 * A drawing's runs of cumulated double bonds: `middle`, whether an atom is one a run goes on through - a carbon, or an N+, between two
 * double bonds (a sulfur's C=S=C is bent, no axis - the rule the restraints' linear-by-bonds has); `runFrom`, the atoms along the run from
 * end `i` through its double bond to `m`, to the run's other end.
 */
function runsOfDrawing(atoms: readonly DrawnAtom[], neighbours: readonly number[][], bondOf: ReadonlyMap<string, DrawnBond>) {
  const linearMiddle = (x: number) => (atoms[x].el ?? "C") === "C" || ((atoms[x].el ?? "C") === "N" && (atoms[x].charge ?? 0) === 1);
  const middle = (x: number) => linearMiddle(x) && neighbours[x].length === 2 && neighbours[x].every((n) => bondOf.get(key(x, n))!.order === 2);
  const runFrom = (i: number, m: number) => {
    const run = [i, m];
    while (middle(run[run.length - 1]) && run.length <= atoms.length) run.push(neighbours[run[run.length - 1]].find((x) => x !== run[run.length - 2])!);
    return run;
  };
  return { middle, runFrom };
}
