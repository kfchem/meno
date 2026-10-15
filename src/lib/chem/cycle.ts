/**
 * A catalytic cycle (docs/EDITOR-2D.md, *Catalytic cycles*): a circle on
 * the page, and what is placed on it - structures, words - each its middle
 * on the circle's line. The circle breaks round each with a margin, and
 * each stretch between two neighbours is a curved reaction arrow, the way
 * the cycle goes (clockwise, unless it is turned the other way). An arrow
 * comes in to a stretch, or goes out of it, joining it along its way.
 *
 * What is on a cycle is not kept with it: it is what lies on its line, so
 * that it is moved along the circle, or off it, as anything is moved. The
 * arrows are worked out from the cycle and what is on it, and drawn - on
 * the canvas and in every picture - as reaction arrows are
 * (lib/chem/reactionArrow), their corners points along the curve.
 */
import { cornerAt, type ArrowForm } from "./reactionArrow";

type P = { x: number; y: number };
/** A box, in the drawing's units: its left, bottom, right and top. */
export type CycleBox = { x0: number; y0: number; x1: number; y1: number };

/** An arrow coming in to the cycle, or going out of it, where it joins the circle: an angle, in radians, anticlockwise from the circle's right (y up). */
export type CycleBranch = { at: number; way: "in" | "out" };

/** A cycle: its middle and radius, in the drawing's units; the way it goes (clockwise, unless `ccw`); the arrows coming in and going out; its colour (#rrggbb; none, the bonds' ink). */
export type Cycle = { id: number; x: number; y: number; r: number; ccw?: true; branches?: CycleBranch[]; color?: string };

/**
 * An arrow as a cycle draws it: where its middle is, which way it points and
 * how long it is, and its form - as a reaction arrow is kept. While the cycle
 * changes, its head may be drawn smaller (`headScale`, a share of its size).
 */
export type CycleArrow = ArrowForm & { x: number; y: number; angle: number; length: number; color?: string; headScale?: number };

/**
 * A cycle caught changing, drawn on the way rather than at a jump: turning
 * round to the way it goes now (`turn`, from 0, just turned, to 1, done),
 * and its arrows coming in and going out, each as far grown as it is (0 to
 * 1: one put there growing, one taken away going).
 */
export type CycleMotion = { turn?: number; branches?: readonly { b: CycleBranch; grown: number }[] };

/**
 * What is on a cycle: which of the boxes given, at what angle round it, and
 * how far round either side the circle breaks for it (radians) - and, while
 * it goes off the line and the circle closes after it, `passing`: the
 * stretch to it then has no head, running on through it.
 */
export type CycleMember = { index: number; angle: number; half: number; passing?: true };

/** How near the line a thing's middle lies to be on it, in bonds. */
export const ON_LINE = 0.6;
/** How far the circle stays clear of what is on it, in bonds. */
export const MARGIN = 0.3;
/** How far an arrow coming in or going out runs along the circle, and out from it, in bonds. */
export const BRANCH_ALONG = 1.6;
export const BRANCH_OUT = 1.1;
/** The step a curve is drawn in, in radians: a few degrees. */
const STEP = (4 * Math.PI) / 180;

const middle = (b: CycleBox): P => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
/** The way round a cycle goes: -1 clockwise (y up), 1 anticlockwise. */
const wayOf = (c: Pick<Cycle, "ccw">) => (c.ccw ? 1 : -1);
const pointOn = (c: Pick<Cycle, "x" | "y">, r: number, a: number): P => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
/** An angle brought into [0, 2pi): how far round from where it is counted. */
const round = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** Whether a box's middle lies on a cycle's line - within `ON_LINE` bonds of it. */
export function onCycle(c: Pick<Cycle, "x" | "y" | "r">, b: CycleBox, bond: number): boolean {
  const m = middle(b);
  return Math.abs(Math.hypot(m.x - c.x, m.y - c.y) - c.r) <= ON_LINE * bond;
}

/** Where a box is put on a cycle's line: its middle moved straight out from the cycle's middle, or in, to the line. */
export function ontoCycle(c: Pick<Cycle, "x" | "y" | "r">, b: CycleBox): P {
  const m = middle(b);
  const d = Math.hypot(m.x - c.x, m.y - c.y) || 1;
  return { x: c.x + ((m.x - c.x) / d) * c.r - m.x, y: c.y + ((m.y - c.y) / d) * c.r - m.y };
}

/**
 * What lies on a cycle's line, of `boxes`: each with its angle round the
 * circle and how far round either side of it the circle stays clear of
 * it - as far as the circle runs inside its box, `MARGIN` bonds larger.
 */
export function cycleMembers(c: Pick<Cycle, "x" | "y" | "r">, boxes: readonly CycleBox[], bond: number): CycleMember[] {
  const out: CycleMember[] = [];
  boxes.forEach((b, index) => {
    if (!onCycle(c, b, bond)) return;
    const m = middle(b);
    const angle = Math.atan2(m.y - c.y, m.x - c.x);
    const g = MARGIN * bond;
    const inside = (a: number) => {
      const p = pointOn(c, c.r, a);
      return p.x >= b.x0 - g && p.x <= b.x1 + g && p.y >= b.y0 - g && p.y <= b.y1 + g;
    };
    // (round either way from its middle, a little at a time, to where the circle leaves its box)
    const fine = Math.min(STEP / 4, 0.25 / Math.max(c.r / bond, 1));
    let half = 0;
    for (const s of [1, -1]) {
      let a = 0;
      while (a < Math.PI && inside(angle + s * a)) a += fine;
      half = Math.max(half, a);
    }
    out.push({ index, angle, half });
  });
  return out;
}

/** Points along the circle from angle `a` round to `b` the way `way` goes (b reached after a, going so), every few degrees, both ends among them. */
function arcPoints(c: Pick<Cycle, "x" | "y" | "r">, a: number, sweep: number): P[] {
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / STEP) + 1);
  return Array.from({ length: n }, (_, i) => pointOn(c, c.r, a + (sweep * i) / (n - 1)));
}

/** An arrow along points, from the first to the last, as a reaction arrow is kept: its ends, and the rest as its corners. */
function arrowThrough(points: readonly P[], form: ArrowForm, color?: string, headScale?: number): CycleArrow | null {
  const from = points[0];
  const to = points[points.length - 1];
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (!(length > 1e-6)) return null;
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    angle: Math.atan2(to.y - from.y, to.x - from.x),
    length,
    ...form,
    ...(points.length > 2 ? { corners: points.slice(1, -1).map((p) => cornerAt(from, to, p)) } : {}),
    ...(color ? { color } : {}),
    ...(headScale !== undefined && headScale < 1 && form.heads !== 0 ? { headScale: Math.max(headScale, 0) } : {}),
  };
}

/** Points along a line through `points`, cut at a share `s` of the way along it: the part before, and the part after, both with the point cut at. */
function cutAt(points: readonly P[], s: number): [P[], P[]] {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let left = Math.min(Math.max(s, 0), 1) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] > 0 ? Math.min(left / lengths[i], 1) : 0;
      const at = { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
      return [[...points.slice(0, i + 1), at], [at, ...points.slice(i + 1)]];
    }
    left -= lengths[i];
  }
  return [[...points], [points[points.length - 1]]];
}

/** A quadratic curve's points, from `s` by `q` to `e`. */
function curvePoints(s: P, q: P, e: P, n = 16): P[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return { x: u * u * s.x + 2 * u * t * q.x + t * t * e.x, y: u * u * s.y + 2 * u * t * q.y + t * t * e.y };
  });
}

/**
 * Where an arrow coming in to a cycle, or going out of it, runs: from
 * outside the circle, curving in to join it at the angle it says, along
 * the cycle's way - or from there, along its way, curving out - and where
 * its words go, at its far end.
 */
export function branchPath(c: Pick<Cycle, "x" | "y" | "r" | "ccw">, b: CycleBranch, bond: number): { points: P[]; end: P; label: P } {
  const way = wayOf(c);
  const j = pointOn(c, c.r, b.at);
  const t = { x: -Math.sin(b.at) * way, y: Math.cos(b.at) * way };
  const n = { x: Math.cos(b.at), y: Math.sin(b.at) };
  const L = BRANCH_ALONG * bond;
  const D = BRANCH_OUT * bond;
  if (b.way === "in") {
    const s = { x: j.x - t.x * L + n.x * D, y: j.y - t.y * L + n.y * D };
    const q = { x: j.x - t.x * L * 0.55, y: j.y - t.y * L * 0.55 };
    return { points: curvePoints(s, q, j), end: s, label: { x: s.x + n.x * 0.8 * bond, y: s.y + n.y * 0.8 * bond } };
  }
  const e = { x: j.x + t.x * L + n.x * D, y: j.y + t.y * L + n.y * D };
  const q = { x: j.x + t.x * L * 0.55, y: j.y + t.y * L * 0.55 };
  return { points: curvePoints(j, q, e), end: e, label: { x: e.x + n.x * 0.8 * bond, y: e.y + n.y * 0.8 * bond } };
}

/**
 * The arrows a cycle is drawn with, what is on it given by `boxes`: each
 * stretch of the circle between two neighbours on it, the way it goes, a
 * reaction arrow; the circle whole, with nothing on it, as two halves with
 * no heads; and each arrow coming in (no head: it joins the stretch, which
 * goes on) or going out (its head at its far end). What is on it may be
 * given as it is being drawn (`members`) - one coming on, or going off -
 * and the cycle caught changing (`motion`): turning round, each stretch's
 * head travels along it from the end it was at to the other, turning about
 * half way, where it is smallest; an arrow coming in or going out turns
 * from the one side to the other; one growing comes in from its far end, or
 * goes out from the circle.
 */
export function cycleArrows(c: Cycle, boxes: readonly CycleBox[], bond: number, members: readonly CycleMember[] = cycleMembers(c, boxes, bond), motion: CycleMotion = {}): CycleArrow[] {
  const turn = motion.turn ?? 1;
  const way = wayOf(c);
  const out: CycleArrow[] = [];
  const push = (a: CycleArrow | null) => a && out.push(a);
  if (!members.length) {
    for (const start of [0, Math.PI]) push(arrowThrough(arcPoints(c, start, Math.PI * way), { heads: 0 }, c.color));
  } else {
    // (in the order the cycle goes round, each to the next)
    const ranked = members.map((m) => ({ m, s: round((m.angle - members[0].angle) * way) })).sort((p, q) => p.s - q.s);
    ranked.forEach(({ m }, k) => {
      const next = ranked[(k + 1) % ranked.length].m;
      const start = m.angle + way * m.half;
      let gap = round((next.angle - m.angle) * way);
      if (ranked.length === 1) gap = 2 * Math.PI;
      const sweep = gap - m.half - next.half;
      if (sweep <= STEP / 2) return;
      const points = arcPoints(c, start, sweep * way);
      if (next.passing || turn >= 1) return push(arrowThrough(points, next.passing ? { heads: 0 } : {}, c.color));
      // (turning round: its head part of the way along, pointing the way it went until half way, then the way it goes)
      const [before, after] = cutAt(points, turn);
      if (turn >= 0.5) {
        push(arrowThrough(before, {}, c.color, 2 * turn - 1));
        push(arrowThrough(after, { heads: 0 }, c.color));
      } else {
        push(arrowThrough(before, { heads: 0 }, c.color));
        push(arrowThrough([...after].reverse(), {}, c.color, 1 - 2 * turn));
      }
    });
  }
  const was = { ...c, ccw: c.ccw ? undefined : (true as const) };
  for (const { b, grown } of motion.branches ?? (c.branches ?? []).map((b) => ({ b, grown: 1 }))) {
    let points = branchPath(c, b, bond).points;
    // (turning round: from the side it joined on to the other, point by point)
    if (turn < 1) {
      const from = branchPath(was, b, bond).points;
      points = points.map((p, i) => ({ x: from[i].x + (p.x - from[i].x) * turn, y: from[i].y + (p.y - from[i].y) * turn }));
    }
    if (grown <= 0) continue;
    // (growing: coming in from its far end, or going out from the circle)
    if (grown < 1) points = cutAt(points, grown)[0];
    push(arrowThrough(points, b.way === "in" ? { heads: 0 } : {}, c.color, grown < 1 && b.way === "out" ? grown : undefined));
  }
  return out;
}

/**
 * The angle round a cycle a point lies at - where an arrow coming in or
 * going out is put, from where its menu was asked for - and whether it
 * lies on the line, within `reach` of it.
 */
export function angleOn(c: Pick<Cycle, "x" | "y" | "r">, p: P, reach: number): number | null {
  const d = Math.hypot(p.x - c.x, p.y - c.y);
  return Math.abs(d - c.r) <= reach ? Math.atan2(p.y - c.y, p.x - c.x) : null;
}

/** The radius a cycle starts with, in bonds: room for three or four structures round it. */
export const CYCLE_RADIUS = 4.5;
