import { bondFraction, type DrawingStyle } from "./style";

/**
 * How an electron-pushing arrow is drawn (docs/EDITOR-2D.md,
 * *Electron-pushing arrows*): a curve from a lone pair, a bond or an atom
 * to an atom, a bond or the gap where a bond forms, its head full (a pair of
 * electrons) or half, a fishhook (one), and a lone pair's two dots at its
 * tail - as outlines and dots, so that the canvas, an SVG and an EMF draw
 * the same arrow.
 *
 * Unbent, Meno lays the curve as a chemist draws it by hand: it leaves a
 * lone pair the way the pair points, or a bond from beside its middle, and
 * comes onto an atom from the side the new bond forms - straight in from
 * behind where the atom loses a bond as it gains one, as in an SN2 - rising
 * off its tail and coming down onto its head, round the structure rather
 * than across its bonds and labels. A short one, from a bond to its own
 * atom or a lone pair to the bond beside it, is a small curl beside the
 * bond. Bent by hand, the curve is a quadratic one whose control point is
 * held in the frame of the line between its ends (`PushBend`), so that it
 * bends the same way however the structure is moved or turned.
 */

type P = { x: number; y: number };

/**
 * An end as the drawing has it: an atom - where it is, how far round it its
 * label (or its bare vertex) keeps clear in a direction, whether a lone pair
 * is drawn there, which way its bonds leave it, and which way any bond it
 * loses leaves it - a bond, by where its atoms are, the side of it away from
 * the rest of its structure, the middle of its line as drawn (shortened
 * where a label stands at an end) and how far its lines reach either side
 * of its axis (`left` of the way from its first atom to its second) - or two
 * atoms with a gap between them.
 */
export type PushEndAt =
  | { atom: P; clear: (toward: P) => number; pair?: boolean; bonds?: readonly P[]; losing?: readonly P[] }
  | { bond: readonly [P, P]; outside?: P; middle?: P; reach?: { left: number; right: number } }
  | { gap: readonly [P, P] };

/** What an arrow keeps clear of where it can: the lines of the bonds, the boxes of the labels, the atoms - and other arrows, by points along them. */
export type PushScene = {
  segments: readonly (readonly [P, P])[];
  /** Each label's box, and the atom it is on. */
  boxes: readonly { min: P; max: P; at?: P }[];
  atoms: readonly P[];
  arrows?: readonly P[];
};

/** Where the curve's control point is, in the frame of the line between its ends: `along` it from its start, a share of its length, and `out` to its left, likewise. */
export type PushBend = { along: number; out: number };

/** An electron-pushing arrow's measures, in the drawing's units. */
export type PushMeasures = {
  thickness: number;
  headLength: number;
  headWidth: number;
  /** How far the back of the head is drawn in toward its point, a share of its length. */
  headInset: number;
  /** Whether its tail is round, as every end is in a style with round ends. */
  round: boolean;
  bondLength: number;
};

/** The measures `style` gives an electron-pushing arrow, with a bond `bondLength` long in the drawing's units: a bond's line, the style's head. */
export function pushMeasures(style: DrawingStyle, bondLength: number): PushMeasures {
  const at = (l: Parameters<typeof bondFraction>[0]) => bondFraction(l, style) * bondLength;
  return {
    thickness: at(style.lineThickness),
    headLength: at(style.electronArrowHeadLength),
    headWidth: at(style.electronArrowHeadWidth),
    headInset: style.electronArrowHeadInset,
    round: style.ends === "round",
    bondLength,
  };
}

/** The curve of an arrow - a cubic, from `start` by `c1` and `c2` to `end` - and a lone pair's dots at its tail (each a middle and a radius). */
export type PushShape = { start: P; c1: P; c2: P; end: P; dots: { c: P; r: number }[] };

const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k });
const len = (a: P) => Math.hypot(a.x, a.y);
const unit = (a: P): P => {
  const l = len(a);
  return l > 1e-12 ? mul(a, 1 / l) : { x: 1, y: 0 };
};
const left = (a: P): P => ({ x: -a.y, y: a.x });
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y;
const cross = (a: P, b: P) => a.x * b.y - a.y * b.x;
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const turn = (a: P, angle: number): P => ({ x: a.x * Math.cos(angle) - a.y * Math.sin(angle), y: a.x * Math.sin(angle) + a.y * Math.cos(angle) });
const dir = (angle: number): P => ({ x: Math.cos(angle), y: Math.sin(angle) });
const DEG = Math.PI / 180;
/** The angle between two directions, 0 to pi. */
const apart = (a: P, b: P) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b)))));

/** Where an end is, before it is drawn clear of anything: an atom, a bond's middle, a gap's middle. */
export function endBase(e: PushEndAt): P {
  return "atom" in e ? e.atom : "bond" in e ? (e.middle ?? mid(e.bond[0], e.bond[1])) : mid(e.gap[0], e.gap[1]);
}

/** Where an arrow's end beside a bond is, on the side `side` of it: clear of its lines - a double bond's second one too - by a little. */
function besideBond(e: Extract<PushEndAt, { bond: readonly [P, P] }>, side: P, L: number): P {
  const n = unit(left(sub(e.bond[1], e.bond[0])));
  const reach = e.reach ? (dot(side, n) >= 0 ? e.reach.left : e.reach.right) : 0;
  return add(endBase(e), mul(side, reach + BOND_GAP * L));
}

/** Where the control point of a curve from `s` to `e` bent `b` is. */
export function controlOf(s: P, e: P, b: PushBend): P {
  const chord = sub(e, s);
  return add(add(s, mul(chord, b.along)), mul(left(chord), b.out));
}

/** The bend that puts a curve from `s` to `e` through `p` at its middle (t = ½). */
export function bendThrough(s: P, e: P, p: P): PushBend {
  // (B(½) = (s + 2c + e) / 4)
  const c = sub(mul(p, 2), mul(add(s, e), 0.5));
  const chord = sub(e, s);
  const l2 = Math.max(dot(chord, chord), 1e-12);
  const d = sub(c, s);
  return { along: dot(d, chord) / l2, out: dot(d, left(chord)) / l2 };
}

/** A point of the quadratic curve from `s` through `c` to `e`. */
export function curveAt(s: P, c: P, e: P, t: number): P {
  const u = 1 - t;
  return { x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, y: u * u * s.y + 2 * u * t * c.y + t * t * e.y };
}

/** A point of an arrow's curve. */
export function pointAt(shape: Pick<PushShape, "start" | "c1" | "c2" | "end">, t: number): P {
  const { start: a, c1: b, c2: c, end: d } = shape;
  const u = 1 - t;
  const k0 = u * u * u;
  const k1 = 3 * u * u * t;
  const k2 = 3 * u * t * t;
  const k3 = t * t * t;
  return { x: k0 * a.x + k1 * b.x + k2 * c.x + k3 * d.x, y: k0 * a.y + k1 * b.y + k2 * c.y + k3 * d.y };
}

/** How far clear of a bond's lines an arrow's end beside it stands, toward the side it comes from, in bonds. */
const BOND_GAP = 0.08;
/** A lone pair's dots: how big each is, how far apart, in bonds - and how far the tail starts beyond them. */
const PAIR_DOT = 0.045;
const PAIR_GAP = 0.2;
const PAIR_CLEAR = 0.08;
/** How far short of an atom it ends, beyond what its label keeps clear, in bonds. */
const END_CLEAR = 0.06;

/** The control point of the part of the quadratic curve from `s` through `c` to `e` between `a` and `b` (its blossom). */
function controlBetween(s: P, c: P, e: P, a: number, b: number): P {
  const w0 = (1 - a) * (1 - b);
  const w1 = (1 - a) * b + a * (1 - b);
  const w2 = a * b;
  return { x: w0 * s.x + w1 * c.x + w2 * e.x, y: w0 * s.y + w1 * c.y + w2 * e.y };
}

/** How far a lone pair's tail starts from its atom, toward `u`. */
function pairRoom(e: Extract<PushEndAt, { atom: P }>, u: P, L: number): number {
  return e.clear(u) + (e.pair ? 2 * PAIR_DOT * L + (PAIR_GAP * L) / 2 + PAIR_CLEAR * L : 0);
}

/** A lone pair's two dots, set across the way out `u` from its atom, clear of its label. */
function pairDots(e: Extract<PushEndAt, { atom: P }>, u: P, L: number): { c: P; r: number }[] {
  if (!e.pair) return [];
  const r = PAIR_DOT * L;
  const at = add(e.atom, mul(u, e.clear(u) + r + (PAIR_GAP * L) / 2));
  const across = mul(left(u), (PAIR_GAP * L) / 2);
  return [
    { c: add(at, across), r },
    { c: sub(at, across), r },
  ];
}

/**
 * The ways round an atom a lone pair can point, or a new bond come in
 * from: every fifteen degrees, those well clear of its bonds - all round,
 * with none; the middle of the widest gap between them, with no other.
 */
function freeWays(bonds: readonly P[], clearance: number): P[] {
  const ways: P[] = [];
  for (let k = 0; k < 24; k++) {
    const u = dir(k * 15 * DEG);
    if (bonds.every((b) => apart(u, b) >= clearance - 1e-9)) ways.push(u);
  }
  if (ways.length || !bonds.length) return ways;
  const angles = bonds.map((b) => Math.atan2(b.y, b.x)).sort((a, b) => a - b);
  let best = 0;
  let at = 0;
  angles.forEach((a, i) => {
    const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
    if (next - a > best) {
      best = next - a;
      at = a + best / 2;
    }
  });
  return [dir(at)];
}

/** One way an arrow could start or end: where, which way it heads there, and how much less it suits than the best. */
type Way = { at: P; heading: P; cost: number; dots?: { c: P; r: number }[] };

/**
 * The ways an arrow could leave its tail toward `target`: from a lone pair
 * (or an atom), out the way the pair points; from a bond, from beside its
 * middle, out from it and leaning toward where it goes.
 */
function startWays(from: PushEndAt, target: P, L: number): Way[] {
  const base = endBase(from);
  const toward = unit(sub(target, base));
  if ("atom" in from) {
    const ways = freeWays(from.bonds ?? [], 60 * DEG);
    const nearest = Math.min(...ways.map((u) => from.clear(u)));
    return ways.map((u) => ({
      at: add(from.atom, mul(u, pairRoom(from, u, L))),
      heading: u,
      // (a pair pointing a little toward where it goes, rather than away -
      // but not straight at it: an arrow is a curve, never a line - and
      // beside the element's symbol, not out past the H's written after it)
      cost: 0.4 * Math.max(0, apart(u, toward) - 75 * DEG) + 2 * Math.max(0, 35 * DEG - apart(u, toward)) + (3 * (from.clear(u) - nearest)) / L,
      dots: pairDots(from, u, L),
    }));
  }
  const [a, b] = "bond" in from ? from.bond : from.gap;
  const n = unit(left(sub(b, a)));
  const outside = "bond" in from ? from.outside : undefined;
  return [n, mul(n, -1)].flatMap((side) =>
    [-45, -25, 0, 25, 45].map((lean) => {
      const heading = turn(side, lean * DEG);
      return {
        at: "bond" in from ? besideBond(from, side, L) : base,
        heading,
        cost: (outside && dot(side, outside) < 0 ? 0.8 : 0) + 0.3 * Math.max(0, apart(heading, toward) - 60 * DEG) + 2 * Math.max(0, 35 * DEG - apart(heading, toward)),
      };
    }),
  );
}

/**
 * The ways an arrow could come onto its head from `source`: onto an atom,
 * from where its new bond will be - straight from behind a bond it loses
 * meanwhile, as in an SN2 - short of its label; onto a bond, from beside its
 * middle; onto a gap, at its middle, from either side.
 */
function endWays(to: PushEndAt, from: PushEndAt, L: number): Way[] {
  const base = endBase(to);
  const source = endBase(from);
  const back = unit(sub(source, base));
  if ("atom" in to) {
    // from a bond of its own: in beside the bond, a curl from its middle
    const own = "bond" in from && from.bond.some((p) => len(sub(p, to.atom)) < 1e-9);
    if (own) {
      const u0 = unit(sub(source, to.atom));
      return [-55, -35, 35, 55].map((a) => {
        const u = turn(u0, a * DEG);
        return { at: add(to.atom, mul(u, to.clear(u) + END_CLEAR * L)), heading: mul(u, -1), cost: Math.abs(a) > 40 ? 0.15 : 0 };
      });
    }
    const losing = to.losing ?? [];
    const ways = losing.length ? freeWays([], 0).filter((u) => losing.every((l) => apart(u, l) >= 150 * DEG)) : freeWays(to.bonds ?? [], 40 * DEG);
    return ways.map((u) => ({
      at: add(to.atom, mul(u, to.clear(u) + END_CLEAR * L)),
      heading: mul(u, -1),
      // (straight from behind, where a bond is lost; else from the side it
      // comes from - aslant to the line between its ends as much as it
      // leaves aslant to it, an arc and not an S)
      cost: losing.length ? 1.2 * Math.max(...losing.map((l) => Math.max(0, Math.PI - apart(u, l) - 20 * DEG))) : 0.6 * Math.max(0, apart(u, back) - 50 * DEG),
    }));
  }
  const [a, b] = "bond" in to ? to.bond : to.gap;
  const n = unit(left(sub(b, a)));
  const outside = "bond" in to ? to.outside : undefined;
  return [n, mul(n, -1)].flatMap((side) =>
    [-35, 0, 35].map((lean) => ({
      at: "bond" in to ? besideBond(to, side, L) : base,
      heading: turn(mul(side, -1), lean * DEG),
      cost: (outside && dot(side, outside) < 0 ? 0.8 : 0) + 0.15 * Math.abs(lean) * DEG,
    })),
  );
}

/** Points along a cubic, `n` steps. */
function along(c: Pick<PushShape, "start" | "c1" | "c2" | "end">, n: number): P[] {
  return Array.from({ length: n + 1 }, (_, i) => pointAt(c, i / n));
}

function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => Math.sign(cross(sub(q, p), sub(r, p)));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/**
 * How badly a curve sits: each bond it crosses, each stretch of it inside a
 * label or close by an atom it neither leaves nor reaches, and how far it
 * wanders and turns more than it must.
 */
function fault(pts: readonly P[], scene: PushScene, ends: readonly P[], L: number): number {
  let f = 0;
  for (let i = 1; i < pts.length; i++)
    for (const [u, v] of scene.segments) if (segmentsCross(pts[i - 1], pts[i], u, v)) f += 6;
  // (a label's ink and a little room round it)
  const pad = 0.12 * L;
  for (const p of pts) {
    for (const b of scene.boxes) {
      // (not the labels of the atoms it leaves and reaches: it keeps clear of those as it ends)
      if (b.at && ends.some((e) => len(sub(e, b.at!)) < 1e-6)) continue;
      if (p.x > b.min.x - pad && p.x < b.max.x + pad && p.y > b.min.y - pad && p.y < b.max.y + pad) f += 1;
      if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y) f += 3;
    }
    for (const a of scene.atoms) {
      if (ends.some((e) => len(sub(e, a)) < 1e-6)) continue;
      const d = len(sub(p, a));
      if (d < 0.32 * L) f += 0.5 * (1 - d / (0.32 * L));
    }
    // (on the far side from another arrow where it can: a leaving group's curl away from the attack)
    for (const a of scene.arrows ?? []) {
      const d = len(sub(p, a));
      if (d < 0.7 * L) f += 0.15 * (1 - d / (0.7 * L));
    }
  }
  let length = 0;
  let turning = 0;
  // (and bends one way, never both: an arc, not an S)
  let leftward = 0;
  let rightward = 0;
  // (and turns smoothly, never at a corner)
  let sharpest = 0;
  for (let i = 1; i < pts.length; i++) {
    length += len(sub(pts[i], pts[i - 1]));
    if (i < 2) continue;
    const a = sub(pts[i - 1], pts[i - 2]);
    const b = sub(pts[i], pts[i - 1]);
    const t = apart(a, b);
    turning += t;
    sharpest = Math.max(sharpest, t);
    if (cross(a, b) > 0) leftward += t;
    else rightward += t;
  }
  const chord = Math.max(len(sub(pts[pts.length - 1], pts[0])), 1e-9);
  return f + 0.6 * Math.max(0, length / chord - 1.25) + 0.25 * Math.max(0, turning - 100 * DEG) + 1.5 * Math.max(0, Math.min(leftward, rightward) - 8 * DEG) + 4 * Math.max(0, sharpest - 14 * DEG);
}

/**
 * A round curl from `a` to `b` - an arc of a circle standing `rise` off the
 * line between them on the side `side` - as a cubic.
 */
function arcCurve(a: P, b: P, side: P, rise: number): Pick<PushShape, "start" | "c1" | "c2" | "end"> {
  const chord = sub(b, a);
  const c = len(chord);
  const n0 = unit(left(chord));
  const n = dot(n0, side) >= 0 ? n0 : mul(n0, -1);
  // (the circle through both ends and the top of the arc)
  const r = (c * c) / 4 / rise / 2 + rise / 2;
  const centre = sub(add(mid(a, b), mul(n, rise)), mul(n, r));
  const theta = 2 * Math.atan2(c / 2, r - rise);
  const k = (4 / 3) * Math.tan(theta / 4) * r;
  // (round the circle the way that passes the top of the arc)
  const ccw = cross(sub(a, centre), sub(add(mid(a, b), mul(n, rise)), centre)) > 0 ? 1 : -1;
  const tangent = (p: P) => mul(left(unit(sub(p, centre))), ccw);
  return { start: a, c1: add(a, mul(tangent(a), k)), c2: sub(b, mul(tangent(b), k)), end: b };
}

/**
 * The curve Meno lays from `from` to `to` (see the top of this file): of
 * the ways it could leave its tail and come onto its head, and how high it
 * could stand, the one that sits best - rising off its tail more than it
 * comes down onto its head.
 */
function laidCurve(from: PushEndAt, to: PushEndAt, scene: PushScene, L: number): PushShape | null {
  const s0 = endBase(from);
  const e0 = endBase(to);
  const starts = startWays(from, e0, L);
  const ends = endWays(to, from, L);
  const atomsAt = [s0, e0, ...("atom" in from ? [] : "bond" in from ? from.bond : from.gap), ...("atom" in to ? [] : "bond" in to ? to.bond : to.gap)];
  let best: { shape: PushShape; cost: number } | null = null;
  for (const s of starts)
    for (const e of ends) {
      const d = len(sub(e.at, s.at));
      if (d < 1e-9) continue;
      // a short one: a round curl, standing out on the side it leaves toward
      if (d < 1.2 * L) {
        const chord = sub(e.at, s.at);
        const across = sub(s.heading, mul(unit(chord), dot(s.heading, unit(chord))));
        if (len(across) < 1e-6) continue;
        for (const [k, extra] of [
          [0.5, 0],
          [0.38, 0.05],
          [0.65, 0.1],
        ]) {
          const rise = Math.min(Math.max(k * d, 0.2 * L), 0.42 * L);
          const shape = { ...arcCurve(s.at, e.at, across, rise), dots: s.dots ?? [] };
          const cost = s.cost + e.cost + fault(along(shape, 40), scene, atomsAt, L) + extra;
          if (!best || cost < best.cost - 1e-9) best = { shape, cost };
        }
        continue;
      }
      // (how far it rises off its tail and how it comes down onto its head: a few heights, rising more than coming down)
      for (const [k1, k2, extra] of [
        [0.5, 0.3, 0],
        [0.8, 0.3, 0.1],
        [0.5, 0.5, 0.1],
        [0.8, 0.5, 0.15],
        [1.1, 0.45, 0.25],
      ]) {
        const h1 = Math.min(Math.max(k1 * d, 0.45 * L), 2.2 * L);
        const h2 = Math.min(Math.max(k2 * d, 0.32 * L), 1.4 * L);
        const shape = { start: s.at, c1: add(s.at, mul(s.heading, h1)), c2: sub(e.at, mul(e.heading, h2)), end: e.at, dots: s.dots ?? [] };
        const cost = s.cost + e.cost + fault(along(shape, 40), scene, atomsAt, L) + extra;
        if (!best || cost < best.cost - 1e-9) best = { shape, cost };
      }
    }
  return best?.shape ?? null;
}

/**
 * The curve an arrow takes from `from` to `to`: bent `bend` by hand - cut
 * where it leaves its tail's room and comes into its head's, along itself -
 * or else laid as Meno lays it, clear of what `scene` holds. Null where its
 * ends are one place.
 */
export function pushShape(from: PushEndAt, to: PushEndAt, bend: PushBend | undefined, scene: PushScene, m: PushMeasures): PushShape | null {
  const s0 = endBase(from);
  const e0 = endBase(to);
  if (len(sub(e0, s0)) < 1e-9) return null;
  const L = m.bondLength;
  if (!bend) return laidCurve(from, to, scene, L);
  const c = controlOf(s0, e0, bend);
  // (on a bond, off its line toward where the control point is)
  const offBond = (end: Extract<PushEndAt, { bond: readonly [P, P] }>) => {
    const n = unit(left(sub(end.bond[1], end.bond[0])));
    return besideBond(end, dot(sub(c, endBase(end)), n) >= 0 ? n : mul(n, -1), L);
  };
  const s = "bond" in from ? offBond(from) : s0;
  const e = "bond" in to ? offBond(to) : e0;
  // where it leaves its start's room and comes into its end's, along the curve
  const startRoom = (u: P) => ("atom" in from ? pairRoom(from, u, L) : 0);
  const endRoom = (u: P) => ("atom" in to ? to.clear(u) + END_CLEAR * L : 0);
  const STEPS = 240;
  let a = 0;
  let z = 1;
  if ("atom" in from)
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const d = sub(curveAt(s, c, e, t), s0);
      if (len(d) >= startRoom(unit(d))) {
        a = t;
        break;
      }
    }
  if ("atom" in to)
    for (let i = STEPS; i >= 0; i--) {
      const t = i / STEPS;
      const d = sub(curveAt(s, c, e, t), e0);
      if (len(d) >= endRoom(unit(d))) {
        z = t;
        break;
      }
    }
  // (no room left between them: the whole curve, as it is)
  if (z - a < 0.05) {
    a = 0;
    z = 1;
  }
  const start = curveAt(s, c, e, a);
  const end = curveAt(s, c, e, z);
  const q = controlBetween(s, c, e, a, z);
  const dots = "atom" in from ? pairDots(from, unit(sub(start, s0)), L) : [];
  // (the quadratic as a cubic)
  return { start, c1: add(start, mul(sub(q, start), 2 / 3)), c2: add(end, mul(sub(q, end), 2 / 3)), end, dots };
}

/**
 * The arrow as outlines to fill: its line, along the curve to where its
 * head begins, as wide as a bond's - round at its tail in a style with
 * round ends - and its head, barbed as the style draws it in, full, or
 * (`half`) the one side of it on the outside of the curve, as a fishhook is
 * drawn.
 */
export function pushOutlines(shape: PushShape, half: boolean, m: PushMeasures): P[][] {
  const t = Math.max(0, m.thickness / 2);
  const n = 64;
  const pts = along(shape, n);
  let total = 0;
  for (let i = 1; i <= n; i++) total += len(sub(pts[i], pts[i - 1]));
  // (the head no longer than a little under half the arrow)
  const h = Math.min(m.headLength, total * 0.42);
  const e = shape.end;
  // the line: the curve up to where the head begins, each point offset
  // either side - the head along the curve's last stretch, so that it
  // points the way the curve comes in
  let cut = n;
  while (cut > 1 && len(sub(pts[cut], e)) < h) cut--;
  const heading = unit(sub(e, pts[cut]));
  const base = sub(e, mul(heading, h));
  const inset = Math.max(0, Math.min(0.6, m.headInset));
  // (the line reaches into the head as far as its drawn-in back)
  const line = [...pts.slice(0, cut + 1), add(base, mul(heading, inset * h * 0.9))];
  const sides = line.map((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const nn = unit(left(sub(b, a)));
    return { l: add(p, mul(nn, t)), r: sub(p, mul(nn, t)) };
  });
  const outline: P[] = [...sides.map((q) => q.l), ...sides.map((q) => q.r).reverse()];
  if (m.round) {
    // (round about the tail, from its right side to its left)
    const back = unit(sub(line[0], line[1]));
    const a0 = Math.atan2(-back.x, back.y);
    for (let i = 1; i < 12; i++) {
      const a = a0 + Math.PI - (i / 12) * Math.PI;
      outline.push(add(shape.start, { x: t * Math.cos(a), y: t * Math.sin(a) }));
    }
  }
  const w = Math.max(m.headWidth / 2, t);
  const across = left(heading);
  const notch = add(base, mul(heading, inset * h));
  // (the outside of the curve: the side its middle stands, seen from the middle of its ends)
  const outside = dot(sub(pointAt(shape, 0.5), mid(shape.start, e)), across) >= 0 ? across : mul(across, -1);
  const head = half
    ? [e, add(base, mul(outside, w)), add(notch, mul(outside, -t)), sub(e, mul(heading, t * 2))]
    : [e, add(base, mul(across, w)), notch, sub(base, mul(across, w))];
  return [outline, head];
}
