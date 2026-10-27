/**
 * The stereochemistry a drawing shows, read back out of it: each
 * stereocentre's configuration and the side each double bond's groups are
 * on, in the form the layout engine takes them (perceive.ts).
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
 *   hashes), the other end's neighbours in it.
 */
import { freeCorners, solidOf } from "./cage";
import { isMetal, key, perceive, type CisTrans } from "./perceive";
import { drawnAxisSense, drawnVolume, placeStereo, type Axial, type Stereo, type Tetrahedral } from "./stereo";

export type DrawnAtom = {
  x: number;
  y: number;
  /** What it is: C unless said, for where an H drawn beside it can go. */
  el?: string;
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
};

export type DrawnStereo = {
  tetra: Map<number, Tetrahedral>;
  /** By bond index. */
  cisTrans: Map<number, CisTrans>;
  /** Each axis's refs the lower-numbered neighbour at each end. */
  axes: Axial[];
};

type V3 = [number, number, number];
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
 * The elements a stereocentre with three groups and a lone pair for its
 * fourth is of - a sulfoxide's S, a phosphine's P - as RDKit reads one:
 * such an atom at the end of a single bond is no axis's end.
 */
const LONE_PAIR_CENTRES = new Set(["S", "Se", "Te", "P", "As", "Sb"]);

/**
 * How near two bonds' directions are taken to be one line, either way - in
 * line, or on top of each other: 10 degrees. IUPAC 2006 (Brecher, Pure Appl.
 * Chem. 78, 1897), ST-0.1: "linear" is "forming an angle between 170° and
 * 190°", and "two bonds that look nearly collinear should be treated as
 * exactly collinear". Drawn so, a centre's bonds state no configuration -
 * two of three in line are a T (ST-1.2.12: "T-shaped configurations rather
 * than tetrahedral ones"), two on top of each other cannot be told apart -
 * and a double bond's group straight on from it states neither cis nor
 * trans (ST-4.4, the linear depiction of a double bond of unspecified
 * configuration).
 */
export const IN_LINE = (10 * Math.PI) / 180;

/** How far apart two directions are, 0 to pi. */
const apart = (t: number, u: number) => Math.abs(Math.atan2(Math.sin(t - u), Math.cos(t - u)));

/** Whether a centre drawn flat with three bonds, its H left out, has two of them in line or on top of each other (`IN_LINE`). */
function twoInLine(at: { x: number; y: number }, around: readonly { x: number; y: number }[]): boolean {
  const t = around.map((p) => Math.atan2(p.y - at.y, p.x - at.x));
  return t.some((u, i) => t.some((w, j) => j > i && (apart(u, w) < IN_LINE || apart(u, w) > Math.PI - IN_LINE)));
}

export function readStereo(
  atoms: readonly DrawnAtom[],
  bonds: readonly DrawnBond[],
): DrawnStereo {
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

  const centres = (fits: Map<number, CageFit>) => {
    const found = new Map<number, Tetrahedral>();
    atoms.forEach((atom, c) => {
      const around = neighbours[c];
      if (atom.hs > 1 || around.length + atom.hs !== 4) return;
      if (around.some((n) => bondOf.get(key(c, n))!.either)) return;
      const wedged = around.some((n) => lift(c, n) !== 0);
      if (!wedged && !atom.centre) return;
      const inSpace = atom.centre && atom.z != null;
      // (drawn flat, its H left out, two of its bonds in line or on top of each other: no configuration stated)
      if (!inSpace && atom.hs === 1 && twoInLine(atom, around.map((n) => atoms[n]))) return;
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
  const first = cageFits(atoms, bonds);
  let tetra = centres(first);
  const fixed = new Map(
    [...tetra].filter(([c]) => {
      const fit = first.get(c);
      return !!fit && atoms[c].centre && atoms[c].z != null && neighbours[c].filter((n) => fit.solid.has(n) && !lift(c, n)).length >= 3;
    }),
  );
  if (fixed.size) {
    const second = cageFits(atoms, bonds, fixed);
    const nearer = new Map([...first].map(([a, f]) => [a, (second.get(a)?.miss ?? Infinity) < f.miss ? second.get(a)! : f]));
    if ([...nearer].some(([a, f]) => f !== first.get(a))) tetra = centres(nearer);
  }

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
    if (ra == null || rb == null || inSmallRing(neighbours, a, b)) return;
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
      // (read as an axis's, the wedge from a sulfoxide's S to its methyl
      // turned the S over: laid out, the axis was kept and the centre not)
      if (LONE_PAIR_CENTRES.has(atoms[i].el ?? "C")) continue;
      const lifted = near.find((n) => lift(i, n) !== 0);
      if (lifted == null || inRing(neighbours, i, j, (k) => isMetal(atoms[k].el ?? "C"))) continue;
      const refs: [number, number] = [Math.min(...near), Math.min(...far)];
      const sense = drawnAxisSense((k) => atoms[k], { atoms: [i, j], refs }, lifted, lift(i, lifted) as 1 | -1);
      if (sense) axes.push({ atoms: [i, j], refs, sense });
      return;
    }
  });

  return { tetra, cisTrans, axes };
}

/** How far a bond in the page is turned, either way, to ask whether what the drawing says of a centre or a double bond stays the same. */
const UNSURE_TURN = (12 * Math.PI) / 180;

const turned = (p: { x: number; y: number }, c: { x: number; y: number }, t: number) => ({
  x: c.x + (p.x - c.x) * Math.cos(t) - (p.y - c.y) * Math.sin(t),
  y: c.y + (p.x - c.x) * Math.sin(t) + (p.y - c.y) * Math.cos(t),
});

/**
 * What the drawing says of its stereochemistry only by luck, by index: the
 * stereocentres drawn flat with a wedge whose reading changes with one of
 * their bonds in the page turned a little either way, or with every bond
 * in one half of the page (ibogaine's bridgehead, bilobalide's carbon,
 * drawn so); and the double bonds whose cis or trans changes so, a group
 * on one in line with it. A reader - RDKit, a chemist - may take either
 * the other way (docs/LAYOUT-2D-TUNING.md, *A wedge that reads by luck*).
 */
export function unsureStereo(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): { atoms: number[]; bonds: number[] } {
  const neighbours: number[][] = atoms.map(() => []);
  const bondOf = new Map<string, DrawnBond>();
  bonds.forEach((b) => {
    if (b.a === b.b || bondOf.has(key(b.a, b.b))) return;
    neighbours[b.a].push(b.b);
    neighbours[b.b].push(b.a);
    bondOf.set(key(b.a, b.b), b);
  });
  const lift = (c: number, n: number) => {
    const w = bondOf.get(key(c, n))?.wedge;
    return w && w.narrow === c ? (w.stereo === "up" ? 1 : -1) : 0;
  };
  const centres: number[] = [];
  atoms.forEach((atom, c) => {
    const around = neighbours[c];
    if (atom.centre || atom.hs > 1 || around.length + atom.hs !== 4) return;
    if (around.some((n) => bondOf.get(key(c, n))!.either)) return;
    if (!around.some((n) => lift(c, n) !== 0)) return;
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
    if (atoms[a].z != null || atoms[b].z != null || inSmallRing(neighbours, a, b)) return;
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
 * the engine takes it to be (cage.ts), and the map that takes that solid to
 * where its atoms are drawn, their depth as the third coordinate - fitted,
 * as the engine may draw a cage the way textbooks do rather than exactly
 * as it is seen.
 */
type CageFit = {
  solid: Map<number, V3>;
  map: (v: V3) => V3;
  /** How far the drawing is from the solid so mapped: the mean square of its atoms' misses, depth among them. */
  miss: number;
};

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
    const solid = solidOf(mol, sys);
    const from = sys.atoms.map((a) => solid.get(a)!);
    const to = sys.atoms.map((a): V3 => [atoms[a].x, atoms[a].y, atoms[a].z!]);
    const map = fitLinear(from, to);
    if (!map) continue;
    // (the map is linear, the drawing's middle the solid's)
    const n = from.length;
    const mid = (ps: readonly V3[]): V3 => [0, 1, 2].map((k) => ps.reduce((s, p) => s + p[k], 0) / n) as V3;
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

/** The linear part of the affine map that best takes `from` to `to`, or null where `from` is flat. */
function fitLinear(from: readonly V3[], to: readonly V3[]): ((v: V3) => V3) | null {
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
    const d = det3(...(three.map((n) => unit3(dirs.get(n)!)) as [V3, V3, V3]));
    if (Math.abs(d) >= HAIR || !fit) return Math.abs(d) < 1e-6 ? 0 : Math.sign(d) * sign;
    const s = fit.solid.get(c)!;
    const f = det3(...(three.map((n) => unit3(fit.map(sub3(fit.solid.get(n)!, s)))) as [V3, V3, V3]));
    return Math.abs(f) < 1e-6 ? 0 : Math.sign(f) * sign;
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
  return Math.abs(d) < 1e-6 ? 0 : Math.sign(d);
}

/**
 * What a drawing that shows some of its stereochemistry in perspective
 * needs to say it to a reader that knows only wedges - a MOL file, RDKit,
 * another program: a wedge on a bond out of each centre the perspective
 * shows (and an H, where the centre has no other bond to put it on, drawn
 * where the engine would), read as flat. A centre with a wedge of its own
 * says it already. The drawing is left as it is.
 */
export function wedgesForFlat(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): Stereo {
  const { tetra } = readStereo(atoms, bonds);
  const wedged = new Set(bonds.flatMap((b) => (b.wedge ? [b.wedge.narrow] : [])));
  const shown = new Map([...tetra].filter(([c]) => atoms[c].z != null && !wedged.has(c)));
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
  const { wedges, hydrogens } = placeStereo(mol, pos, shown, taken);
  return { wedges, hydrogens: hydrogens.map(({ on, at }) => ({ on, at: { x: at.x * k, y: at.y * k } })) };
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
  const perm = a.map((n) => b.indexOf(n));
  let swaps = 0;
  const seen = perm.map(() => false);
  for (let i = 0; i < perm.length; i++) {
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true;
      len++;
    }
    if (len) swaps += len - 1;
  }
  return (swaps % 2 === 0) === (p.volume === q.volume);
}

/** Whether the bond i-j is in a ring of seven atoms or fewer: j reached from i some other way within six bonds. */
function inSmallRing(neighbours: readonly number[][], i: number, j: number): boolean {
  let level = neighbours[i].filter((n) => n !== j);
  const seen = new Set([i, ...level]);
  for (let step = 1; step < 6 && level.length; step++) {
    if (level.includes(j)) return true;
    const next: number[] = [];
    for (const u of level) {
      for (const v of neighbours[u]) {
        if (seen.has(v)) continue;
        seen.add(v);
        next.push(v);
      }
    }
    level = next;
  }
  return level.includes(j);
}

/**
 * Whether the bond i-j is in a ring: j reached from i some other way - not
 * through a metal (BINAP's axis in its chelate's ring is still an axis).
 */
function inRing(neighbours: readonly number[][], i: number, j: number, metal: (k: number) => boolean): boolean {
  const seen = new Set([i]);
  const todo = neighbours[i].filter((n) => n !== j && !metal(n));
  for (const n of todo) seen.add(n);
  while (todo.length) {
    const u = todo.pop()!;
    if (u === j) return true;
    for (const v of neighbours[u]) {
      if (seen.has(v) || metal(v)) continue;
      seen.add(v);
      todo.push(v);
    }
  }
  return false;
}
