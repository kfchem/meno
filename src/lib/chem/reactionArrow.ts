import { bondFraction, type DrawingStyle, type Length } from "./style";

/**
 * How a reaction arrow is drawn: its line, and its head - a triangle, or
 * one whose back is drawn in towards its point - as one outline, so that
 * the canvas and the settings' preview draw the same arrow.
 */

type P = { x: number; y: number };

/** The settings a reaction arrow is drawn by; an arrow may set any of them for itself. */
export const ARROW_SETTINGS = [
  "reactionArrowThickness",
  "reactionArrowHeadLength",
  "reactionArrowHeadWidth",
  "reactionArrowHeadInset",
] as const satisfies readonly (keyof DrawingStyle)[];

export type ArrowSetting = (typeof ARROW_SETTINGS)[number];

/** What an arrow sets for itself, over the drawing style. */
export type ArrowLook = Partial<Pick<DrawingStyle, ArrowSetting>>;

/** A reaction arrow's measures, in the drawing's units. */
export type ArrowMeasures = {
  thickness: number;
  headLength: number;
  headWidth: number;
  /** How far the head's back is drawn in, as a fraction of its length. */
  inset: number;
  /** Whether its tail is round, as every end is in a style with round ends. */
  round: boolean;
};

/** The deepest the head's back is drawn in: further, and it is no head. */
const MAX_INSET = 0.9;

/** The measures `style` gives a reaction arrow, with a bond `bondLength` long in the drawing's units. */
export function arrowMeasures(style: DrawingStyle, bondLength: number): ArrowMeasures {
  const at = (l: Length) => bondFraction(l, style) * bondLength;
  return {
    thickness: at(style.reactionArrowThickness ?? style.lineThickness),
    headLength: at(style.reactionArrowHeadLength),
    headWidth: at(style.reactionArrowHeadWidth),
    inset: style.reactionArrowHeadInset,
    round: style.ends === "round",
  };
}

/**
 * The outline of a reaction arrow from `from` to its point at `to`,
 * anticlockwise: its line, ending inside the head, and the head. The head
 * is no narrower than the line and no longer than the arrow: on an arrow
 * shorter than its head, it is all head, with the line in its notch.
 */
export function arrowOutline(from: P, to: P, m: ArrowMeasures): P[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (!(len > 0)) return [];
  const u = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  const n = { x: -u.y, y: u.x };
  // along the arrow from its tail, and across it to the left
  const at = (s: number, c: number): P => ({
    x: from.x + u.x * s + n.x * c,
    y: from.y + u.y * s + n.y * c,
  });
  const t = Math.max(0, m.thickness / 2);
  const h = Math.min(Math.max(0, m.headLength), len);
  const w = Math.max(m.headWidth / 2, t);
  const d = Math.min(Math.max(0, m.inset), MAX_INSET) * h;
  const back = len - h;
  // where the line meets the back of the head, on either side of it
  const join = back + (w > 0 ? d * (1 - t / w) : 0);
  const head = [at(back, -w), at(len, 0), at(back, w)];
  if (join <= 0 || t === 0) return d > 0 ? [...head, at(back + d, 0)] : head;
  const out: P[] = [at(0, -t), at(join, -t), ...head, at(join, t), at(0, t)];
  if (m.round) {
    // round about the tail, from its left side to its right
    for (let i = 1; i < 16; i++) {
      const a = Math.PI / 2 + (i / 16) * Math.PI;
      out.push(at(t * Math.cos(a), t * Math.sin(a)));
    }
  }
  return out;
}

/**
 * An arrow's kind, besides a reaction's (none said): an equilibrium's two
 * lines, each with a half head - or a full one - pointing either way; a
 * retrosynthesis's open double one; a reaction that does not go, crossed
 * out (docs/EDITOR-2D.md, *Arrows*).
 */
export type ArrowKind = "equilibrium" | "retrosynthetic" | "noReaction";
export const ARROW_KINDS: readonly ArrowKind[] = ["equilibrium", "retrosynthetic", "noReaction"];

/** How heavy an arrow's line is besides the regular, as a share of it: as a shape's thin and thick lines are of its regular one (lib/chem/shapes `WEIGHT_PT`). */
export type ArrowWeight = "thin" | "thick";
export const WEIGHT_SHARE: Record<ArrowWeight, number> = { thin: 0.6, thick: 2 };

/** A corner of an arrow's line: along it from its tail, as a share of how far its point is, and across it to its left, in the drawing's units - so that it moves, turns and grows with the arrow. */
export type ArrowCorner = { along: number; across: number };

/**
 * What an arrow is besides where it lies and its measures: its kind, its
 * heads - a head at either end (`heads` 2), an equilibrium's full rather
 * than half (`full`) - whether its line is dashed, how heavy it is, and
 * the corners its line turns at, from its tail.
 */
export type ArrowForm = { kind?: ArrowKind; heads?: 0 | 2; full?: true; dash?: true; weight?: ArrowWeight; corners?: readonly ArrowCorner[] };

/** The points an arrow's line runs through: its tail, its corners, its point. */
export function arrowPath(from: P, to: P, corners: readonly ArrowCorner[] = []): P[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (!(len > 0) || !corners.length) return [from, to];
  const u = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  const n = { x: -u.y, y: u.x };
  return [from, ...corners.map((c) => ({ x: from.x + u.x * c.along * len + n.x * c.across, y: from.y + u.y * c.along * len + n.y * c.across })), to];
}

/** The corner a point of the page makes, for an arrow from `from` to `to`. */
export function cornerAt(from: P, to: P, p: P): ArrowCorner {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const u = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  const d = { x: p.x - from.x, y: p.y - from.y };
  return { along: (d.x * u.x + d.y * u.y) / len, across: -d.x * u.y + d.y * u.x };
}

const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);
const unitOf = (a: P, b: P): P => {
  const l = dist(a, b) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
};

/** How long a line through `points` is. */
export function pathLength(points: readonly P[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i]);
  return s;
}

/** The point `s` along a line through `points`, and which way the line goes there. */
export function pointAlong(points: readonly P[], s: number): { at: P; u: P } {
  let left = Math.max(0, s);
  for (let i = 1; i < points.length; i++) {
    const l = dist(points[i - 1], points[i]);
    if (left <= l || i === points.length - 1) {
      const u = unitOf(points[i - 1], points[i]);
      const t = Math.min(left, l);
      return { at: { x: points[i - 1].x + u.x * t, y: points[i - 1].y + u.y * t }, u };
    }
    left -= l;
  }
  return { at: points[0], u: { x: 1, y: 0 } };
}

/** A line through `points` cut short: `head` off its end, `tail` off its start - none of it, where those meet. */
function trimmed(points: readonly P[], tail: number, head: number): P[] {
  const total = pathLength(points);
  if (tail + head >= total) return [];
  const out: P[] = [pointAlong(points, tail).at];
  let s = 0;
  for (let i = 1; i < points.length - 1; i++) {
    s += dist(points[i - 1], points[i]);
    if (s > tail && s < total - head) out.push(points[i]);
  }
  out.push(pointAlong(points, total - head).at);
  return out;
}

/** A line through `points` moved `d` to its left, its corners where the moved stretches meet. */
function offsetPath(points: readonly P[], d: number): P[] {
  if (points.length < 2 || d === 0) return points.slice();
  const out: P[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = i > 0 ? unitOf(points[i - 1], points[i]) : null;
    const next = i < points.length - 1 ? unitOf(points[i], points[i + 1]) : null;
    const a = prev ?? next!;
    const b = next ?? prev!;
    let m = { x: -a.y - b.y, y: a.x + b.x };
    const ml = Math.hypot(m.x, m.y);
    m = ml < 1e-9 ? { x: -b.y, y: b.x } : { x: m.x / ml, y: m.y / ml };
    const cos = Math.max(m.x * -b.y + m.y * b.x, 1 / 3);
    out.push({ x: points[i].x + (m.x * d) / cos, y: points[i].y + (m.y * d) / cos });
  }
  return out;
}

/** The outline of a line `width` wide through `points`, its corners mitred: what a picture fills for it. */
export function strokeOutline(points: readonly P[], width: number): P[] {
  if (points.length < 2 || !(width > 0)) return [];
  const left = offsetPath(points, width / 2);
  const right = offsetPath(points, -width / 2);
  return [...right, ...left.reverse()];
}

/** A round end, `r` across, about `c`. */
function disc(c: P, r: number): P[] {
  return Array.from({ length: 16 }, (_, i) => ({ x: c.x + r * Math.cos((i / 16) * 2 * Math.PI), y: c.y + r * Math.sin((i / 16) * 2 * Math.PI) }));
}

/** A dashed line's dash and gap for a line `width` wide: as a shape's (lib/chem/shapes `dashOf`), without its fixed part, which is in points. */
function dashesOf(points: readonly P[], width: number): P[][] {
  const dash = 4.5 * width;
  const gap = 3 * width;
  const out: P[][] = [];
  const total = pathLength(points);
  for (let s = 0; s < total; s += dash + gap) out.push(trimmed(points, s, Math.max(0, total - s - dash)));
  return out.filter((p) => p.length > 1);
}

/**
 * What an arrow from `from` to its point at `to` fills, as `form` makes it,
 * with the measures `m`: each piece a closed outline - its lines, or their
 * dashes, each apart; its heads; its cross - in the order they are drawn.
 * A reaction arrow straight, single and solid is the one outline
 * `arrowOutline` gives.
 */
export function arrowPieces(from: P, to: P, form: ArrowForm, m: ArrowMeasures): P[][] {
  const path = arrowPath(from, to, form.corners);
  const total = pathLength(path);
  if (!(total > 0)) return [];
  const share = form.weight ? WEIGHT_SHARE[form.weight] : 1;
  const grow = share > 1 ? (1 + share) / 2 : 1;
  const t = Math.max(0, (m.thickness * share) / 2);
  const kind = form.kind;
  const two = form.heads === 2 && kind !== "equilibrium" && kind !== "retrosynthetic";
  const h = Math.min(Math.max(0, m.headLength * grow), total / (two ? 2 : 1));
  const w = Math.max((m.headWidth * grow) / 2, t);
  const d = Math.min(Math.max(0, m.inset), MAX_INSET) * h;
  // (no head at all: a line alone - a catalytic cycle's arrow coming in, merging into its arc - lib/chem/cycle)
  const none = form.heads === 0 && !kind;
  if (!kind && !two && !none && !form.dash && path.length === 2 && share === 1) return [arrowOutline(from, to, m)];
  const out: P[][] = [];
  const line = (points: readonly P[]) => {
    for (const piece of form.dash ? dashesOf(points, 2 * t) : [points.slice()]) {
      const o = strokeOutline(piece, 2 * t);
      if (o.length > 2) out.push(o);
    }
  };
  /** A head with its point at `s` along `points`, pointing along them (or back, `back`), whole or half - `side` 1 its left half, -1 its right. */
  const head = (points: readonly P[], s: number, back: boolean, side: 0 | 1 | -1 = 0) => {
    const { at: tip, u: along } = pointAlong(points, s);
    const u = back ? { x: -along.x, y: -along.y } : along;
    const n = { x: -u.y, y: u.x };
    const at = (a: number, c: number): P => ({ x: tip.x - u.x * (h - a) + n.x * c, y: tip.y - u.y * (h - a) + n.y * c });
    // (its back drawn in to the line, where the style draws it in; a half head's to the line's middle)
    const notch = at(d, 0);
    if (side === 1) out.push([tip, at(0, w), notch]);
    else if (side === -1) out.push([tip, notch, at(0, -w)]);
    else out.push(d > 0 ? [at(0, -w), tip, at(0, w), notch] : [at(0, -w), tip, at(0, w)]);
  };
  const into = h - d * (w > 0 ? 1 - t / w : 0);
  if (kind === "equilibrium") {
    // two lines, a head's half width apart: the upper to the point, the lower back to the tail, each its head on its outer side
    const g = Math.max(1.3 * w, 5 * t);
    const upper = offsetPath(path, g / 2);
    const lower = offsetPath(path, -g / 2);
    line(trimmed(upper, 0, form.full ? into : 0.5 * h));
    line(trimmed(lower, form.full ? into : 0.5 * h, 0));
    head(upper, pathLength(upper), false, form.full ? 0 : 1);
    head(lower, 0, true, form.full ? 0 : 1);
    return out;
  }
  if (kind === "retrosynthetic") {
    // two lines a head's width apart, ending in an open head that spans them
    const g = Math.max(2 * w * 0.9, 5 * t);
    const W = g / 2 + w * 0.7;
    const stop = (h * (g / 2)) / W;
    line(trimmed(offsetPath(path, g / 2), 0, stop));
    line(trimmed(offsetPath(path, -g / 2), 0, stop));
    const { at: tip, u } = pointAlong(path, total);
    const n = { x: -u.y, y: u.x };
    const corner = (c: number): P => ({ x: tip.x - u.x * h + n.x * c, y: tip.y - u.y * h + n.y * c });
    const o = strokeOutline([corner(W), tip, corner(-W)], 2 * t);
    if (o.length > 2) out.push(o);
    return out;
  }
  if (none) {
    line(path);
    if (m.round && !form.dash && t > 0) out.push(disc(path[0], t), disc(path[path.length - 1], t));
    return out;
  }
  // one line, cut where its heads take over, with its heads
  line(trimmed(path, two ? into : 0, into));
  if (!two && m.round && !form.dash && t > 0) out.push(disc(path[0], t));
  head(path, total, false);
  if (two) head(path, 0, true);
  if (kind === "noReaction") {
    // crossed out at its middle, as a "no reaction" is
    const { at, u } = pointAlong(path, total / 2);
    const r = 1.8 * w;
    const c = Math.SQRT1_2;
    for (const s of [1, -1]) {
      const v = { x: (u.x - s * u.y) * c, y: (u.y + s * u.x) * c };
      const o = strokeOutline([{ x: at.x - v.x * r, y: at.y - v.y * r }, { x: at.x + v.x * r, y: at.y + v.y * r }], 2 * t);
      if (o.length > 2) out.push(o);
    }
  }
  return out;
}
