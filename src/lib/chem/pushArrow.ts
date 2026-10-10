import { bondFraction, type DrawingStyle } from "./style";

/**
 * How an electron-pushing arrow is drawn (docs/EDITOR-2D.md,
 * *Electron-pushing arrows*): a curve from a lone pair, a bond or an atom
 * to an atom, a bond or the gap where a bond forms, its head full (a pair of
 * electrons) or half, a fishhook (one), and a lone pair's two dots at its
 * tail - as outlines and dots, so that the canvas, an SVG and an EMF draw
 * the same arrow.
 *
 * The curve is a quadratic one, its control point held in the frame of the
 * line between its ends (`PushBend`), so that it bends the same way however
 * the structure is moved or turned.
 */

type P = { x: number; y: number };

/**
 * An end as the drawing has it: an atom - where it is, how far round it its
 * label (or its bare vertex) keeps clear in a direction, and whether a lone
 * pair is drawn there - a bond, or two atoms with a gap between them, each
 * by where its atoms are.
 */
export type PushEndAt =
  | { atom: P; clear: (toward: P) => number; pair?: boolean }
  | { bond: readonly [P, P] }
  | { gap: readonly [P, P] };

/** Where the curve's control point is, in the frame of the line between its ends: `along` it from its start, a share of its length, and `out` to its left, likewise. */
export type PushBend = { along: number; out: number };

/** An electron-pushing arrow's measures, in the drawing's units. */
export type PushMeasures = {
  thickness: number;
  headLength: number;
  headWidth: number;
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
    round: style.ends === "round",
    bondLength,
  };
}

/** The curve of an arrow: where it starts and ends, its control point, and a lone pair's dots at its tail (each a middle and a radius). */
export type PushShape = { start: P; control: P; end: P; dots: { c: P; r: number }[] };

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
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Where an end is, before it is drawn clear of anything: an atom, a bond's middle, a gap's middle. */
export function endBase(e: PushEndAt): P {
  return "atom" in e ? e.atom : "bond" in e ? mid(e.bond[0], e.bond[1]) : mid(e.gap[0], e.gap[1]);
}

/** How high the curve stands off the line between its ends, as a share of it, and the least it stands off, in bonds. */
const RISE = 0.36;
const LEAST_RISE = 0.45;

/**
 * How an arrow bends unless it is told: a curve standing off the line
 * between its ends by about a third of it - no less than nearly half a bond -
 * on the side away from the atoms `around` it (the middle of them), so that
 * it runs round the outside of the structure rather than across it.
 */
export function defaultBend(from: PushEndAt, to: PushEndAt, around: readonly P[], bondLength: number): PushBend {
  const s = endBase(from);
  const e = endBase(to);
  const chord = sub(e, s);
  const l = Math.max(len(chord), 1e-9);
  const rise = Math.max(RISE * l, LEAST_RISE * bondLength);
  // (a quadratic curve stands off by half as far as its control point does)
  const out = (2 * rise) / l;
  const centre = around.length ? mul(around.reduce(add, { x: 0, y: 0 }), 1 / around.length) : null;
  const side = centre ? dot(sub(centre, mid(s, e)), left(chord)) : 0;
  return { along: 0.5, out: side > 1e-9 ? -out : out };
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

/** A point of the curve from `s` through `c` to `e`. */
export function curveAt(s: P, c: P, e: P, t: number): P {
  const u = 1 - t;
  return { x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, y: u * u * s.y + 2 * u * t * c.y + t * t * e.y };
}

/** How far off a bond's line an arrow's end on it stands, toward the side it comes from, in bonds. */
const BOND_OFF = 0.1;
/** A lone pair's dots: how big each is, how far apart, in bonds - and how far the tail starts beyond them. */
const PAIR_DOT = 0.045;
const PAIR_GAP = 0.2;
const PAIR_CLEAR = 0.1;
/** How far short of an atom it ends, beyond what its label keeps clear, in bonds. */
const END_CLEAR = 0.06;

/** The control point of the part of the curve from `s` through `c` to `e` between `a` and `b` (its blossom). */
function controlBetween(s: P, c: P, e: P, a: number, b: number): P {
  const w0 = (1 - a) * (1 - b);
  const w1 = (1 - a) * b + a * (1 - b);
  const w2 = a * b;
  return { x: w0 * s.x + w1 * c.x + w2 * e.x, y: w0 * s.y + w1 * c.y + w2 * e.y };
}

/**
 * The curve an arrow takes from `from` to `to`, bent `bend` - unset, as
 * `defaultBend` bends it, away from `around` - drawn clear of what it
 * leaves and reaches: from an atom beyond its label, or beyond its lone
 * pair's dots where they are drawn; to an atom short of its label; on a
 * bond a little off its line, on the side the curve comes from; at a gap,
 * its middle. It is cut where it leaves an atom's room and where it comes
 * into one, along itself, so that it comes to an atom as it was heading.
 * Null where its ends are one place.
 */
export function pushShape(from: PushEndAt, to: PushEndAt, bend: PushBend | undefined, around: readonly P[], m: PushMeasures): PushShape | null {
  const s0 = endBase(from);
  const e0 = endBase(to);
  if (len(sub(e0, s0)) < 1e-9) return null;
  const b = bend ?? defaultBend(from, to, around, m.bondLength);
  const c = controlOf(s0, e0, b);
  const L = m.bondLength;
  // (on a bond, off its line toward where the control point is)
  const offBond = (pts: readonly [P, P]) => {
    const n = unit(left(sub(pts[1], pts[0])));
    const m0 = mid(pts[0], pts[1]);
    return add(m0, mul(n, (dot(sub(c, m0), n) >= 0 ? 1 : -1) * BOND_OFF * L));
  };
  const s = "bond" in from ? offBond(from.bond) : s0;
  const e = "bond" in to ? offBond(to.bond) : e0;
  // where it leaves its start's room and comes into its end's, along the curve
  const r = PAIR_DOT * L;
  const startRoom = (u: P) => ("atom" in from ? from.clear(u) + (from.pair ? 2 * r + (PAIR_GAP * L) / 2 + PAIR_CLEAR * L : 0) : 0);
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
  const dots: { c: P; r: number }[] = [];
  if ("atom" in from && from.pair) {
    const u = unit(sub(start, s0));
    // (both dots clear of the label: the pair stands across the way out, so half of it reaches back toward the label's side)
    const at = add(s0, mul(u, from.clear(u) + r + (PAIR_GAP * L) / 2));
    const across = mul(left(u), (PAIR_GAP * L) / 2);
    dots.push({ c: add(at, across), r }, { c: sub(at, across), r });
  }
  return { start, control: controlBetween(s, c, e, a, z), end: curveAt(s, c, e, z), dots };
}

/**
 * The arrow as outlines to fill: its line, along the curve to where its
 * head begins, as wide as a bond's - round at its tail in a style with
 * round ends - and its head, full, or (`half`) the one side of it on the
 * outside of the curve, as a fishhook is drawn.
 */
export function pushOutlines(shape: PushShape, half: boolean, m: PushMeasures): P[][] {
  const { start: s, control: c, end: e } = shape;
  const t = Math.max(0, m.thickness / 2);
  // (the head no longer than the arrow)
  const n = 48;
  const pts = Array.from({ length: n + 1 }, (_, i) => curveAt(s, c, e, i / n));
  let total = 0;
  for (let i = 1; i <= n; i++) total += len(sub(pts[i], pts[i - 1]));
  const h = Math.min(m.headLength, total * 0.9);
  // the line: the curve up to where the head begins, each point offset
  // either side - the head along the curve's last stretch, so that it
  // points the way the curve comes in
  let cut = n;
  while (cut > 1 && len(sub(pts[cut], e)) < h) cut--;
  const dir = unit(sub(e, pts[cut]));
  const base = sub(e, mul(dir, h));
  const line = [...pts.slice(0, cut + 1), base];
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
      outline.push(add(s, { x: t * Math.cos(a), y: t * Math.sin(a) }));
    }
  }
  const w = Math.max(m.headWidth / 2, t);
  const across = left(dir);
  // (the outside of the curve: the side its control point stands, seen from the middle of its ends)
  const outside = dot(sub(c, mid(s, e)), across) >= 0 ? across : mul(across, -1);
  const head = half ? [e, add(base, mul(outside, w)), sub(base, mul(outside, t))] : [e, add(base, mul(across, w)), sub(base, mul(across, w))];
  return [outline, head];
}
