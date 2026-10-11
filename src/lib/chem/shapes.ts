/**
 * Shapes on the page (docs/PRESENTING.md, *Shapes*): rectangles, rounded
 * rectangles, ellipses, lines, arrows - one head or two - and callouts, a
 * rounded box with a tail pointing at something. What each draws - the line
 * it follows, broken into dashes where it is dashed, its arrowheads and the
 * area it fills - is worked out here, once, for the canvas, for SVG and for
 * EMF alike; and where a press takes it, how far it reaches, where its words
 * go, and how it is drawn out, made larger or smaller, moved and turned.
 *
 * Everything is in the page's units; a line's width is in points, as the
 * drawing's labels' size is, `pointPx` page units to the point.
 */
import type { Vec2 } from "./layout2d";

export type ShapeKind = "rect" | "rounded" | "ellipse" | "line" | "arrow" | "callout";

/** The kinds, in the order Quick Add offers them, and their names. */
export const SHAPE_KINDS: readonly ShapeKind[] = ["rect", "rounded", "ellipse", "line", "arrow", "callout"];
export const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: "Rectangle",
  rounded: "Rounded rectangle",
  ellipse: "Ellipse",
  line: "Line",
  arrow: "Arrow",
  callout: "Callout",
};

/** How heavy a shape's line is: thin, regular (as one is made) or thick. */
export type ShapeWeight = "thin" | "regular" | "thick";
/** Each weight's line, in points: a thin one as heavy as a bond's (ACS 1996: 0.6 pt). */
export const WEIGHT_PT: Record<ShapeWeight, number> = { thin: 0.6, regular: 1.2, thick: 2.4 };

/**
 * What a shape's drawing depends on. A box - a rectangle, a rounded one, an
 * ellipse, a callout - lies between two corners, `x0` < `x1` and `y0` < `y1`;
 * a line or an arrow runs from (`x0`, `y0`) to (`x1`, `y1`), an arrow's head
 * at the end - and, `heads` 2, at the start too. A callout's tail reaches to
 * `tail`.
 */
export type ShapeGeometry = {
  kind: ShapeKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tail?: Vec2;
  weight?: "thin" | "thick";
  dash?: true;
  heads?: 2;
};

/** Whether it is a box, which holds words and can be filled - not a line or an arrow. */
export function isBox(kind: ShapeKind): boolean {
  return kind !== "line" && kind !== "arrow";
}

/** Its line's width, in page units. */
export function lineWidthOf(s: Pick<ShapeGeometry, "weight">, pointPx: number): number {
  return WEIGHT_PT[s.weight ?? "regular"] * pointPx;
}

/** A rounded box's corners' radius at most, in points; less in a small box. */
const ROUND_PT = 9;
const ROUND_SHARE = 0.18;
/** The points round a corner, and round an ellipse. */
const ARC_STEPS = 8;
const ELLIPSE_STEPS = 72;
/** A callout tail's base, half of it, in points at least and at most, and as a share of its side. */
const TAIL_HALF_PT: [number, number] = [4, 11];
const TAIL_HALF_SHARE = 0.1;

/** A box's corners' radius, in page units: none but a rounded rectangle's and a callout's. */
export function cornerRadius(s: ShapeGeometry, pointPx: number): number {
  if (s.kind !== "rounded" && s.kind !== "callout") return 0;
  return Math.max(0, Math.min(Math.min(s.x1 - s.x0, s.y1 - s.y0) * ROUND_SHARE, ROUND_PT * pointPx));
}

/** A box's middle. */
export function middleOf(s: Pick<ShapeGeometry, "x0" | "y0" | "x1" | "y1">): Vec2 {
  return { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 };
}

function arc(c: Vec2, r: number, from: number, to: number, out: Vec2[]): void {
  if (r <= 0) {
    out.push({ x: c.x, y: c.y });
    return;
  }
  for (let k = 0; k <= ARC_STEPS; k++) {
    const a = from + ((to - from) * k) / ARC_STEPS;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
}

type Side = "bottom" | "right" | "top" | "left";

/** Which side of a box a callout's tail leaves from, and the points it puts there - none, with its tip within the box. */
function tailOf(s: ShapeGeometry, r: number, pointPx: number): { side: Side; points: Vec2[] } | null {
  const t = s.tail;
  if (!t || s.kind !== "callout") return null;
  const { x0, y0, x1, y1 } = s;
  if (t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1) return null;
  const c = middleOf(s);
  const u = (t.x - c.x) / Math.max((x1 - x0) / 2, 1e-9);
  const v = (t.y - c.y) / Math.max((y1 - y0) / 2, 1e-9);
  const side: Side = Math.abs(u) >= Math.abs(v) ? (u > 0 ? "right" : "left") : v > 0 ? "top" : "bottom";
  const across = side === "bottom" || side === "top";
  // (along the straight of its side, clear of the corners)
  const lo = (across ? x0 : y0) + r;
  const hi = (across ? x1 : y1) - r;
  const length = across ? x1 - x0 : y1 - y0;
  const half = Math.min(Math.max(TAIL_HALF_PT[0] * pointPx, Math.min(TAIL_HALF_PT[1] * pointPx, length * TAIL_HALF_SHARE)), Math.max(0, (hi - lo) / 2));
  const want = across ? t.x : t.y;
  const at = hi - lo < 2 * half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, want));
  const tip = { x: t.x, y: t.y };
  switch (side) {
    case "bottom":
      return { side, points: [{ x: at - half, y: y0 }, tip, { x: at + half, y: y0 }] };
    case "right":
      return { side, points: [{ x: x1, y: at - half }, tip, { x: x1, y: at + half }] };
    case "top":
      return { side, points: [{ x: at + half, y: y1 }, tip, { x: at - half, y: y1 }] };
    case "left":
      return { side, points: [{ x: x0, y: at + half }, tip, { x: x0, y: at - half }] };
  }
}

/** A box's edge, round it the way the page's angles go (anticlockwise, y up) - a callout's tail within it. */
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
  const tail = tailOf(s, r, pointPx);
  const out: Vec2[] = [];
  const side = (which: Side) => {
    if (tail?.side === which) out.push(...tail.points);
  };
  arc({ x: x0 + r, y: y0 + r }, r, Math.PI, 1.5 * Math.PI, out);
  side("bottom");
  arc({ x: x1 - r, y: y0 + r }, r, 1.5 * Math.PI, 2 * Math.PI, out);
  side("right");
  arc({ x: x1 - r, y: y1 - r }, r, 0, 0.5 * Math.PI, out);
  side("top");
  arc({ x: x0 + r, y: y1 - r }, r, 0.5 * Math.PI, Math.PI, out);
  side("left");
  // (no point twice over: a square corner's arc is its corner alone)
  return out.filter((p, i) => {
    const q = out[(i + out.length - 1) % out.length];
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-9;
  });
}

/** An arrowhead's length, and how far its line stops short of its tip - in page units, for a line `width` wide. */
function headLength(width: number, pointPx: number): number {
  return Math.max(6 * pointPx, 4.5 * width);
}
const HEAD_HALF = 0.4;
const HEAD_BACK = 0.8;

/** The line a shape follows - closed round a box; a line's or an arrow's, short of its heads - in page units. */
export function outlineOf(s: ShapeGeometry, pointPx: number): { points: Vec2[]; closed: boolean } {
  if (isBox(s.kind)) return { points: boxOutline(s, pointPx), closed: true };
  let a = { x: s.x0, y: s.y0 };
  let b = { x: s.x1, y: s.y1 };
  if (s.kind === "arrow") {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const back = Math.min(headLength(lineWidthOf(s, pointPx), pointPx) * HEAD_BACK, len / (s.heads === 2 ? 2 : 1));
    if (len > 1e-9) {
      const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      b = { x: b.x - u.x * back, y: b.y - u.y * back };
      if (s.heads === 2) a = { x: a.x + u.x * back, y: a.y + u.y * back };
    }
  }
  return { points: [a, b], closed: false };
}

/** An arrow's heads, each a triangle, filled: at its end, and at its start too where it has two. */
export function headsOf(s: ShapeGeometry, pointPx: number): Vec2[][] {
  if (s.kind !== "arrow") return [];
  const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
  if (len < 1e-9) return [];
  const width = lineWidthOf(s, pointPx);
  const l = Math.min(headLength(width, pointPx), len / (s.heads === 2 ? 2 : 1));
  const head = (tip: Vec2, u: Vec2): Vec2[] => {
    const back = { x: tip.x - u.x * l, y: tip.y - u.y * l };
    const n = { x: -u.y * l * HEAD_HALF, y: u.x * l * HEAD_HALF };
    return [tip, { x: back.x + n.x, y: back.y + n.y }, { x: back.x - n.x, y: back.y - n.y }];
  };
  const u = { x: (s.x1 - s.x0) / len, y: (s.y1 - s.y0) / len };
  const heads = [head({ x: s.x1, y: s.y1 }, u)];
  if (s.heads === 2) heads.push(head({ x: s.x0, y: s.y0 }, { x: -u.x, y: -u.y }));
  return heads;
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

/** The area a box fills - its edge, round it; none for a line or an arrow. */
export function fillOutline(s: ShapeGeometry, pointPx: number): Vec2[] | null {
  return isBox(s.kind) ? boxOutline(s, pointPx) : null;
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
 * besides its own width, and on an arrow's heads - or inside it, where it is
 * filled (`filled`); else null. Its line is pressed as a whole, dashed or not.
 */
export function shapeHit(s: ShapeGeometry, p: Vec2, slack: number, pointPx: number, filled: boolean, lined = true): "line" | "inside" | null {
  const o = outlineOf(s, pointPx);
  const reach = slack + (lined ? lineWidthOf(s, pointPx) / 2 : 0);
  const pts = o.points;
  const segments = o.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segments; i++) if (distanceToSegment(p, pts[i], pts[(i + 1) % pts.length]) <= reach) return "line";
  for (const head of headsOf(s, pointPx)) if (insidePolygon(p, head)) return "line";
  if (filled && o.closed && insidePolygon(p, pts)) return "inside";
  return null;
}

/** The box round all a shape draws: its line, half its width either side of it, its heads and its tail. */
export function shapeBounds(s: ShapeGeometry, pointPx: number): { x0: number; y0: number; x1: number; y1: number } {
  const pts = [...outlineOf(s, pointPx).points, ...headsOf(s, pointPx).flat()];
  const h = lineWidthOf(s, pointPx) / 2;
  return {
    x0: Math.min(...pts.map((q) => q.x)) - h,
    y0: Math.min(...pts.map((q) => q.y)) - h,
    x1: Math.max(...pts.map((q) => q.x)) + h,
    y1: Math.max(...pts.map((q) => q.y)) + h,
  };
}

/**
 * Where a box's words go: about its middle, as wide as it is inside - the
 * rectangle within an ellipse - less `pad` either side; never narrower than
 * `pad`. None for a line or an arrow.
 */
export function wordsRoom(s: ShapeGeometry, pad: number): { x: number; y: number; width: number } | null {
  if (!isBox(s.kind)) return null;
  const inner = (s.x1 - s.x0) * (s.kind === "ellipse" ? Math.SQRT1_2 : 1);
  const c = middleOf(s);
  return { x: c.x, y: c.y, width: Math.max(pad, inner - 2 * pad) };
}

/** Steps a line drawn with Shift keeps to: 15 degrees. */
const STEP = Math.PI / 12;

/**
 * A shape drawn from `a` to `b`: a box between them as corners - a square
 * or a circle with `even` - or a line from one to the other, with `even` at
 * a whole step of 15 degrees. A callout's tail points down and to the left
 * of it, as one is usually seen.
 */
export function drawnShape(kind: ShapeKind, a: Vec2, b: Vec2, even = false): Pick<ShapeGeometry, "x0" | "y0" | "x1" | "y1" | "tail"> {
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
  const box = { x0: Math.min(a.x, a.x + dx), y0: Math.min(a.y, a.y + dy), x1: Math.max(a.x, a.x + dx), y1: Math.max(a.y, a.y + dy) };
  return kind === "callout" ? { ...box, tail: defaultTail(box) } : box;
}

/** A callout's tail as it is first drawn: below its box, toward its left. */
export function defaultTail(b: { x0: number; y0: number; x1: number; y1: number }): Vec2 {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  return { x: b.x0 + w * 0.22, y: b.y0 - Math.max(h * 0.55, Math.min(w, h) * 0.7) };
}

/** What a selected shape's handle takes hold of: a box's corner or side, a line's end, a callout's tail. */
export type ShapeHandle = "x0y0" | "x1y0" | "x1y1" | "x0y1" | "x0" | "x1" | "y0" | "y1" | "start" | "end" | "tail";

/** A shape's handles and where each is. */
export function handlesOf(s: ShapeGeometry): { handle: ShapeHandle; at: Vec2 }[] {
  if (!isBox(s.kind))
    return [
      { handle: "start", at: { x: s.x0, y: s.y0 } },
      { handle: "end", at: { x: s.x1, y: s.y1 } },
    ];
  const c = middleOf(s);
  const out: { handle: ShapeHandle; at: Vec2 }[] = [
    { handle: "x0y0", at: { x: s.x0, y: s.y0 } },
    { handle: "x1y0", at: { x: s.x1, y: s.y0 } },
    { handle: "x1y1", at: { x: s.x1, y: s.y1 } },
    { handle: "x0y1", at: { x: s.x0, y: s.y1 } },
    { handle: "x0", at: { x: s.x0, y: c.y } },
    { handle: "x1", at: { x: s.x1, y: c.y } },
    { handle: "y0", at: { x: c.x, y: s.y0 } },
    { handle: "y1", at: { x: c.x, y: s.y1 } },
  ];
  if (s.kind === "callout" && s.tail) out.push({ handle: "tail", at: s.tail });
  return out;
}

/**
 * `s` with its handle `h` dragged to `p`: a box's corner or side there, the
 * opposite one staying where it is - no smaller than `least` either way,
 * and, `even`, a corner keeping its proportions; a line's end there, `even`
 * at a whole step of 15 degrees from the other; a callout's tail there.
 */
export function reshaped<T extends ShapeGeometry>(s: T, h: ShapeHandle, p: Vec2, least: number, even = false): T {
  if (h === "tail") return { ...s, tail: { x: p.x, y: p.y } };
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

/** `s` moved by `d`, its tail with it. */
export function moved<T extends ShapeGeometry>(s: T, d: Vec2): T {
  return { ...s, x0: s.x0 + d.x, y0: s.y0 + d.y, x1: s.x1 + d.x, y1: s.y1 + d.y, ...(s.tail ? { tail: { x: s.tail.x + d.x, y: s.tail.y + d.y } } : {}) };
}

/**
 * `s` carried round `about` by `angle`: a line's and an arrow's ends turned
 * with it; a box upright - the page never tilts - its middle carried round,
 * and its tail turned with it.
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
  return { ...moved(s, { x: to.x - m.x, y: to.y - m.y }), ...(s.tail ? { tail: turn(s.tail) } : {}) };
}

/** The colours of a shape's paler fills: each colour as far toward white as `share` says (0, white; 1, the colour). */
export function tintOf(hex: string, share = 0.25): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (k: number) => Math.round(255 - (255 - ((n >> k) & 0xff)) * share);
  return `#${[16, 8, 0].map((k) => ch(k).toString(16).padStart(2, "0")).join("")}`;
}
