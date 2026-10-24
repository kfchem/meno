/**
 * Shapes on the page (docs/PRESENTING.md, *Shapes*): rectangles - their
 * corners square or rounded, as far as asked - ellipses and lines. A shape
 * is a shape: no words in it. (An arrow is the page's one Arrow, not a
 * shape.) What each draws - the line it follows, broken into dashes where
 * it is dashed, and the area it fills - is worked out here, once, for the
 * canvas, for SVG and for EMF alike; and where a press takes it, how far it
 * reaches, and how it is drawn out, made larger or smaller, moved and
 * turned.
 *
 * Everything is in the page's units; a line's width is in points, as the
 * drawing's labels' size is, `pointPx` page units to the point.
 */
import { NOMINAL_BOND_LENGTH } from "./acs";
import type { Vec2 } from "./layout2d";

export type ShapeKind = "rect" | "ellipse" | "line";

/** The kinds, in the order Quick Add offers them, and their names. */
export const SHAPE_KINDS: readonly ShapeKind[] = ["rect", "ellipse", "line"];
export const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
};

/**
 * How wide a shape's line is: as the drawing's bonds - as one is made, and
 * following the drawing's style as it changes - or a width of its own, in
 * points, picked from these and kept whatever the style.
 */
export const SHAPE_WIDTHS_PT = [1, 2] as const;
/** A bond's line in ACS 1996's style, in points: what a shape's line is as wide as where the drawing's is not given. */
export const BOND_LINE_PT = 0.6;

/**
 * What a shape's drawing depends on. A box - a rectangle, an ellipse - lies
 * between two corners, `x0` < `x1` and `y0` < `y1`; a line runs from
 * (`x0`, `y0`) to (`x1`, `y1`). A rectangle's corners are rounded `radius`
 * points round - none, square - and never more than half its shorter side.
 */
export type ShapeGeometry = {
  kind: ShapeKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  radius?: number;
  /** Its line's width, in points; none, as wide as the drawing's bonds (`asBonds`). */
  width?: number;
  dash?: true;
};

/** Whether it is a box, which can be filled - not a line. */
export function isBox(kind: ShapeKind): boolean {
  return kind !== "line";
}

/** Its line's width, in page units: its own, or - `asBonds` not yet asked - a bond's in ACS 1996's style. */
export function lineWidthOf(s: Pick<ShapeGeometry, "width">, pointPx: number): number {
  return (s.width ?? BOND_LINE_PT) * pointPx;
}

/** `s` as it is drawn in a drawing whose bonds' lines are `bondLinePt` points wide: its line as wide as theirs, where it has no width of its own. */
export function asBonds<T extends ShapeGeometry>(s: T, bondLinePt: number): T {
  return s.width != null ? s : { ...s, width: bondLinePt };
}

/** How wide the bonds' lines are, in points, in a drawing laid out as `o` says (lib/chem/layout2d `LayoutOptions`): its line width over its point. */
export function bondLinePtOf(o: { lineWidthPx: number; pointPx?: number }): number {
  return o.pointPx ? o.lineWidthPx / o.pointPx : BOND_LINE_PT;
}

/**
 * Rounded corners as *Box around these* draws them and *Corners…* gives
 * them as *Rounded*, in bonds' lengths: a fifth of one (the maintainer,
 * 2026-10-24: 9 points, near two thirds of a bond, was far too round) -
 * and at most this share of the shorter side.
 */
export const ROUNDED_OF_BOND = 0.2;
export const ROUNDED_SHARE = 0.18;

/** Rounded corners (`ROUNDED_OF_BOND`), in points, in a drawing whose point is `pointPx` page units. */
export function roundedOfBondPt(pointPx: number): number {
  return (ROUNDED_OF_BOND * NOMINAL_BOND_LENGTH) / pointPx;
}
/** The points round a corner - at least, and at most, a corner rounded more taking more, one about each half point of its radius - and round an ellipse. */
const ARC_STEPS: readonly [number, number] = [8, 48];
const ELLIPSE_STEPS = 72;

/** The most a box `w` by `h` page units may round its corners, in page units: half its shorter side. */
export const roundestOf = (w: number, h: number) => Math.max(0, Math.min(w, h) / 2);

/** A box's corners' radius, in page units: a rectangle's as asked, never past half its shorter side; none for an ellipse or a line. */
export function cornerRadius(s: ShapeGeometry, pointPx: number): number {
  if (s.kind !== "rect" || !s.radius) return 0;
  return Math.min(Math.max(0, s.radius * pointPx), roundestOf(s.x1 - s.x0, s.y1 - s.y0));
}

/**
 * Rounded corners for a box `w` by `h` page units, in points, as a rounded
 * rectangle saved before 2026-10-19 (its own kind then, holding no radius)
 * was drawn: 9 points, less in a small box - so that one opens as it looked.
 */
export function roundedBeforePt(w: number, h: number, pointPx: number): number {
  return Math.min(Math.min(w, h) * ROUNDED_SHARE, 9 * pointPx) / pointPx;
}

/** Rounded corners for a box `w` by `h` page units, in points, as *Box around these* has them: a fifth of a bond, less in a small box. */
export function roundedPt(w: number, h: number, pointPx: number): number {
  return Math.min(Math.min(w, h) * ROUNDED_SHARE, ROUNDED_OF_BOND * NOMINAL_BOND_LENGTH) / pointPx;
}

/** A box's middle. */
export function middleOf(s: Pick<ShapeGeometry, "x0" | "y0" | "x1" | "y1">): Vec2 {
  return { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 };
}

function arc(c: Vec2, r: number, from: number, to: number, out: Vec2[], pointPx: number): void {
  if (r <= 0) {
    out.push({ x: c.x, y: c.y });
    return;
  }
  // (a large radius in as few steps as a small one showed its corners as facets)
  const steps = Math.min(ARC_STEPS[1], Math.max(ARC_STEPS[0], Math.ceil((2 * r) / Math.max(pointPx, 1e-9))));
  for (let k = 0; k <= steps; k++) {
    const a = from + ((to - from) * k) / steps;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
}

/** A box's edge, round it the way the page's angles go (anticlockwise, y up). */
function boxOutline(s: ShapeGeometry, pointPx: number): Vec2[] {
  const { x0, y0, x1, y1 } = s;
  if (s.kind === "ellipse") {
    const c = middleOf(s);
    const rx = (x1 - x0) / 2;
    const ry = (y1 - y0) / 2;
    return Array.from({ length: ELLIPSE_STEPS }, (_, k) => {
      const a = (2 * Math.PI * k) / ELLIPSE_STEPS - Math.PI / 2;
      return { x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) };
    });
  }
  const r = cornerRadius(s, pointPx);
  const out: Vec2[] = [];
  arc({ x: x0 + r, y: y0 + r }, r, Math.PI, 1.5 * Math.PI, out, pointPx);
  arc({ x: x1 - r, y: y0 + r }, r, 1.5 * Math.PI, 2 * Math.PI, out, pointPx);
  arc({ x: x1 - r, y: y1 - r }, r, 0, 0.5 * Math.PI, out, pointPx);
  arc({ x: x0 + r, y: y1 - r }, r, 0.5 * Math.PI, Math.PI, out, pointPx);
  // (no point twice over: a square corner's arc is its corner alone - and
  // one point kept of a box too small to tell its corners apart, whose
  // bounds were else no numbers, taking every other part of a picture's
  // with them)
  const kept = out.filter((p, i) => {
    const q = out[(i + out.length - 1) % out.length];
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-9;
  });
  return kept.length ? kept : out.slice(0, 1);
}

/** The line a shape follows - closed round a box; a line's, from end to end - in page units. */
export function outlineOf(s: ShapeGeometry, pointPx: number): { points: Vec2[]; closed: boolean } {
  if (isBox(s.kind)) return { points: boxOutline(s, pointPx), closed: true };
  return { points: [{ x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }], closed: false };
}

/** A dashed line's dashes and the gaps between them, in page units, for a line `width` wide. */
export function dashOf(width: number, pointPx: number): { dash: number; gap: number } {
  return { dash: 3.5 * width + 2 * pointPx, gap: 2 * width + 1.5 * pointPx };
}

/** A line - closed, or not - broken into dashes, each a line of its own, from its first point on. */
export function dashed(points: readonly Vec2[], closed: boolean, dash: number, gap: number): Vec2[][] {
  const pts = closed && points.length > 1 ? [...points, points[0]] : points.slice();
  const out: Vec2[][] = [];
  if (pts.length < 2 || dash <= 0) return out;
  let on = true;
  let left = dash;
  let piece: Vec2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let len = Math.hypot(b.x - a.x, b.y - a.y);
    while (len > 1e-12) {
      const step = Math.min(left, len);
      const f = step / len;
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      if (on) piece.push(p);
      left -= step;
      len -= step;
      a = p;
      if (left <= 1e-12) {
        if (on && piece.length > 1) out.push(piece);
        on = !on;
        left = on ? dash : gap;
        piece = [p];
      }
    }
  }
  if (on && piece.length > 1) out.push(piece);
  return out;
}

/** What a shape's line draws: the line it follows, whole - or its dashes, each a line of its own. */
export function strokePieces(s: ShapeGeometry, pointPx: number): { points: Vec2[]; closed: boolean }[] {
  const o = outlineOf(s, pointPx);
  if (!s.dash) return [o];
  const { dash, gap } = dashOf(lineWidthOf(s, pointPx), pointPx);
  return dashed(o.points, o.closed, dash, gap).map((points) => ({ points, closed: false }));
}

/** The area a box fills - its edge, round it; none for a line. */
export function fillOutline(s: ShapeGeometry, pointPx: number): Vec2[] | null {
  return isBox(s.kind) ? boxOutline(s, pointPx) : null;
}

/** Points along an arc of an ellipse about `c` - from angle `a` to `b`, a quarter turn at most - as a cubic Bezier segment's two controls and end, the start being where the arc begins. */
function arcBezier(c: Vec2, rx: number, ry: number, a: number, b: number): Vec2[] {
  const k = (4 / 3) * Math.tan((b - a) / 4);
  const p0 = { x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) };
  const p3 = { x: c.x + rx * Math.cos(b), y: c.y + ry * Math.sin(b) };
  return [
    { x: p0.x - k * rx * Math.sin(a), y: p0.y + k * ry * Math.cos(a) },
    { x: p3.x + k * rx * Math.sin(b), y: p3.y - k * ry * Math.cos(b) },
    p3,
  ];
}

/**
 * A box's edge as the curve it is, for pictures - cubic Bezier segments
 * end to end, the start then three points for each, closed where it began
 * - where it has curves: an ellipse, and a rectangle's rounded corners;
 * its straight stretches are segments as straight as lines. It begins at a
 * smooth point (an ellipse's bottom, the middle of the lower left corner)
 * so that a line drawn round it meets itself with no seam. None for a
 * line, or a rectangle with square corners: their edges are straight.
 */
export function outlineCurve(s: ShapeGeometry, pointPx: number): Vec2[] | null {
  if (!isBox(s.kind)) return null;
  const { x0, y0, x1, y1 } = s;
  if (s.kind === "ellipse") {
    const c = middleOf(s);
    const rx = (x1 - x0) / 2;
    const ry = (y1 - y0) / 2;
    const out: Vec2[] = [{ x: c.x, y: y0 }];
    for (let q = 0; q < 4; q++) out.push(...arcBezier(c, rx, ry, -Math.PI / 2 + (q * Math.PI) / 2, (q * Math.PI) / 2));
    return out;
  }
  const r = cornerRadius(s, pointPx);
  if (r <= 0) return null;
  const bl = { x: x0 + r, y: y0 + r };
  const out: Vec2[] = [{ x: bl.x + r * Math.cos(1.25 * Math.PI), y: bl.y + r * Math.sin(1.25 * Math.PI) }];
  const lineTo = (q: Vec2) => {
    const p = out[out.length - 1];
    if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-12) return;
    out.push({ x: p.x + (q.x - p.x) / 3, y: p.y + (q.y - p.y) / 3 }, { x: p.x + (2 * (q.x - p.x)) / 3, y: p.y + (2 * (q.y - p.y)) / 3 }, q);
  };
  out.push(...arcBezier(bl, r, r, 1.25 * Math.PI, 1.5 * Math.PI));
  lineTo({ x: x1 - r, y: y0 });
  out.push(...arcBezier({ x: x1 - r, y: y0 + r }, r, r, 1.5 * Math.PI, 2 * Math.PI));
  lineTo({ x: x1, y: y1 - r });
  out.push(...arcBezier({ x: x1 - r, y: y1 - r }, r, r, 0, 0.5 * Math.PI));
  lineTo({ x: x0 + r, y: y1 });
  out.push(...arcBezier({ x: x0 + r, y: y1 - r }, r, r, 0.5 * Math.PI, Math.PI));
  lineTo({ x: x0, y: y0 + r });
  out.push(...arcBezier(bl, r, r, Math.PI, 1.25 * Math.PI));
  return out;
}

/** A curve (`outlineCurve`'s points) as points along it, `steps` to each segment - an area to fill where a picture fills polygons. */
export function flattenedCurve(curve: readonly Vec2[], steps = 24): Vec2[] {
  const out: Vec2[] = curve.length ? [curve[0]] : [];
  for (let i = 1; i + 2 < curve.length; i += 3) {
    const [a, b, c, d] = [curve[i - 1], curve[i], curve[i + 1], curve[i + 2]];
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      const w = [(1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3];
      out.push({ x: w[0] * a.x + w[1] * b.x + w[2] * c.x + w[3] * d.x, y: w[0] * a.y + w[1] * b.y + w[2] * c.y + w[3] * d.y });
    }
  }
  return out;
}

/** How far a mitred corner may stand off its line, in half widths, before it is cut. */
const MITRE_LIMIT = 3;

/**
 * A line `width` wide along `points` - closed, or not - as triangles: the
 * pairs of points either side of it (`positions`, x and y each) and three
 * indices among them for each triangle. Its corners are mitred, as far as a
 * mitre may stand off.
 */
export function strokeTriangles(points: readonly Vec2[], closed: boolean, width: number): { positions: number[]; indices: number[] } {
  const n = points.length;
  const positions: number[] = [];
  const indices: number[] = [];
  if (n < 2) return { positions, indices };
  const h = width / 2;
  const dirOf = (i: number, j: number): Vec2 => {
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  };
  for (let i = 0; i < n; i++) {
    const prev = closed || i > 0 ? dirOf((i + n - 1) % n, i) : null;
    const next = closed || i < n - 1 ? dirOf(i, (i + 1) % n) : null;
    const a = prev ?? next!;
    const b = next ?? prev!;
    const na = { x: -a.y, y: a.x };
    const nb = { x: -b.y, y: b.x };
    let m = { x: na.x + nb.x, y: na.y + nb.y };
    const ml = Math.hypot(m.x, m.y);
    m = ml < 1e-9 ? nb : { x: m.x / ml, y: m.y / ml };
    const cos = m.x * nb.x + m.y * nb.y;
    const reach = h / Math.max(cos, 1 / MITRE_LIMIT);
    const p = points[i];
    positions.push(p.x + m.x * reach, p.y + m.y * reach, p.x - m.x * reach, p.y - m.y * reach);
  }
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % n;
    indices.push(2 * i, 2 * i + 1, 2 * j, 2 * j, 2 * i + 1, 2 * j + 1);
  }
  return { positions, indices };
}

/** Whether `p` lies inside the polygon `poly`. */
export function insidePolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * Where a press at `p` takes a shape: on its line - within `slack` of it,
 * besides its own width - or inside it, where it is filled (`filled`); else
 * null. Its line is pressed as a whole, dashed or not.
 */
export function shapeHit(s: ShapeGeometry, p: Vec2, slack: number, pointPx: number, filled: boolean, lined = true): "line" | "inside" | null {
  const o = outlineOf(s, pointPx);
  const reach = slack + (lined ? lineWidthOf(s, pointPx) / 2 : 0);
  const pts = o.points;
  const segments = o.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segments; i++) if (distanceToSegment(p, pts[i], pts[(i + 1) % pts.length]) <= reach) return "line";
  if (filled && o.closed && insidePolygon(p, pts)) return "inside";
  return null;
}

/** The box round all a shape draws: its line, half its width either side of it. */
export function shapeBounds(s: ShapeGeometry, pointPx: number): { x0: number; y0: number; x1: number; y1: number } {
  const pts = outlineOf(s, pointPx).points;
  const h = lineWidthOf(s, pointPx) / 2;
  return {
    x0: Math.min(...pts.map((q) => q.x)) - h,
    y0: Math.min(...pts.map((q) => q.y)) - h,
    x1: Math.max(...pts.map((q) => q.x)) + h,
    y1: Math.max(...pts.map((q) => q.y)) + h,
  };
}

/** Steps a line drawn with Shift keeps to: 15 degrees. */
const STEP = Math.PI / 12;

/**
 * A shape drawn from `a` to `b`: a box between them as corners - a square
 * or a circle with `even` - or a line from one to the other, with `even` at
 * a whole step of 15 degrees.
 */
export function drawnShape(kind: ShapeKind, a: Vec2, b: Vec2, even = false): Pick<ShapeGeometry, "x0" | "y0" | "x1" | "y1"> {
  if (!isBox(kind)) {
    if (!even) return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / STEP) * STEP;
    return { x0: a.x, y0: a.y, x1: a.x + len * Math.cos(angle), y1: a.y + len * Math.sin(angle) };
  }
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (even) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * side;
    dy = (dy < 0 ? -1 : 1) * side;
  }
  return { x0: Math.min(a.x, a.x + dx), y0: Math.min(a.y, a.y + dy), x1: Math.max(a.x, a.x + dx), y1: Math.max(a.y, a.y + dy) };
}

/** What a selected shape's handle takes hold of: a box's corner or side, a line's end. */
export type ShapeHandle = "x0y0" | "x1y0" | "x1y1" | "x0y1" | "x0" | "x1" | "y0" | "y1" | "start" | "end";

/** A shape's handles and where each is. */
export function handlesOf(s: ShapeGeometry): { handle: ShapeHandle; at: Vec2 }[] {
  if (!isBox(s.kind))
    return [
      { handle: "start", at: { x: s.x0, y: s.y0 } },
      { handle: "end", at: { x: s.x1, y: s.y1 } },
    ];
  const c = middleOf(s);
  return [
    { handle: "x0y0", at: { x: s.x0, y: s.y0 } },
    { handle: "x1y0", at: { x: s.x1, y: s.y0 } },
    { handle: "x1y1", at: { x: s.x1, y: s.y1 } },
    { handle: "x0y1", at: { x: s.x0, y: s.y1 } },
    { handle: "x0", at: { x: s.x0, y: c.y } },
    { handle: "x1", at: { x: s.x1, y: c.y } },
    { handle: "y0", at: { x: c.x, y: s.y0 } },
    { handle: "y1", at: { x: c.x, y: s.y1 } },
  ];
}

/**
 * `s` with its handle `h` dragged to `p`: a box's corner or side there, the
 * opposite one staying where it is - no smaller than `least` either way,
 * and, `even`, a corner keeping its proportions; a line's end there, `even`
 * at a whole step of 15 degrees from the other.
 */
export function reshaped<T extends ShapeGeometry>(s: T, h: ShapeHandle, p: Vec2, least: number, even = false): T {
  if (h === "start" || h === "end") {
    const fixed = h === "start" ? { x: s.x1, y: s.y1 } : { x: s.x0, y: s.y0 };
    const moved = drawnShape(s.kind, fixed, p, even);
    return h === "start" ? { ...s, x0: moved.x1, y0: moved.y1 } : { ...s, x1: moved.x1, y1: moved.y1 };
  }
  // (the side or corner held, and the one across from it that stays)
  const takesX = h.includes("x0") ? "x0" : h.includes("x1") ? "x1" : null;
  const takesY = h.includes("y0") ? "y0" : h.includes("y1") ? "y1" : null;
  let { x0, y0, x1, y1 } = s;
  if (takesX === "x0") x0 = Math.min(p.x, x1 - least);
  if (takesX === "x1") x1 = Math.max(p.x, x0 + least);
  if (takesY === "y0") y0 = Math.min(p.y, y1 - least);
  if (takesY === "y1") y1 = Math.max(p.y, y0 + least);
  if (even && takesX && takesY) {
    // (as large as the further of the two the pointer went, its proportions kept)
    const w0 = s.x1 - s.x0;
    const h0 = s.y1 - s.y0;
    const f = Math.max((x1 - x0) / w0, (y1 - y0) / h0);
    const w = w0 * f;
    const hh = h0 * f;
    if (takesX === "x0") x0 = x1 - w;
    else x1 = x0 + w;
    if (takesY === "y0") y0 = y1 - hh;
    else y1 = y0 + hh;
  }
  return { ...s, x0, y0, x1, y1 };
}

/** `s` moved by `d`. */
export function moved<T extends ShapeGeometry>(s: T, d: Vec2): T {
  return { ...s, x0: s.x0 + d.x, y0: s.y0 + d.y, x1: s.x1 + d.x, y1: s.y1 + d.y };
}

/**
 * `s` carried round `about` by `angle`: a line's ends turned with it; a
 * box upright - the page never tilts - its middle carried round.
 */
export function turned<T extends ShapeGeometry>(s: T, about: Vec2, angle: number): T {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const turn = (q: Vec2): Vec2 => ({ x: about.x + (q.x - about.x) * c - (q.y - about.y) * sn, y: about.y + (q.x - about.x) * sn + (q.y - about.y) * c });
  if (!isBox(s.kind)) {
    const a = turn({ x: s.x0, y: s.y0 });
    const b = turn({ x: s.x1, y: s.y1 });
    return { ...s, x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }
  const m = middleOf(s);
  const to = turn(m);
  return moved(s, { x: to.x - m.x, y: to.y - m.y });
}

/** The colours of a shape's paler fills: each colour as far toward white as `share` says (0, white; 1, the colour). */
export function tintOf(hex: string, share = 0.25): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (k: number) => Math.round(255 - (255 - ((n >> k) & 0xff)) * share);
  return `#${[16, 8, 0].map((k) => ch(k).toString(16).padStart(2, "0")).join("")}`;
}
