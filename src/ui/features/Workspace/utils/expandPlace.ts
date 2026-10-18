/**
 * Where a label's group, drawn out (document `expandAbbreviation`), goes:
 * turned about the label's atom - and seen in a mirror, where it has no
 * stereo of its own to change - so that it lies in free space, clear of
 * the drawing's atoms, its bonds, the inside of the label's own ring and
 * every other label as far as the layout sets its letters (./freePlace
 * `labelBoxes`, as what is put down on the page is kept clear of them).
 * The turn it is laid out with comes first; others only where it is not
 * clear, the nearest the most clear.
 */
import type { Model } from "../store/types";
import type { DrawingStyle } from "../../../../lib/chem/style";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { labelBoxes, labelledPart } from "./freePlace";

type P = { x: number; y: number };

/** A way to set a group down: turned by `turn` (radians, anticlockwise) about its attachment, mirrored first across the line it was laid out along where `mirror`. */
export type GroupTurn = { turn: number; mirror: boolean };

/** The turns tried, a fifteenth of a half turn apart, the smaller first. */
const TURNS = Array.from({ length: 24 }, (_, k) => ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 12).filter((t, i, all) => all.indexOf(t) === i);

/**
 * How a group laid out about `at` - its atoms `group` (the attachment
 * itself left out) and the bonds among them and to the attachment - is best
 * set down beside the drawing `model`, the label's atom `label` in it, its
 * group laid out along `axis` (from the attachment). No turn where it is
 * clear as it was laid out.
 */
export function groupTurn(
  model: Model,
  label: number,
  at: P,
  group: readonly P[],
  bonds: readonly [P, P][],
  axis: P,
  style: DrawingStyle,
  mirrorable: boolean,
): GroupTurn {
  const L = NOMINAL_BOND_LENGTH;
  const others = model.atoms.filter((a) => a.id !== label);
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  // (the drawing's bonds, those to the label's atom aside: the group's own bond leaves from it)
  const lines = model.bonds.filter((b) => b.a !== label && b.b !== label).flatMap((b) => {
    const p = byId.get(b.a);
    const q = byId.get(b.b);
    return p && q ? [[p, q] as [P, P]] : [];
  });
  const rings = ringsThrough(model, label);
  const letters = labelBoxes(labelledPart({ atoms: others, bonds: model.bonds.filter((b) => b.a !== label && b.b !== label) }), style);
  const cost = (pts: readonly P[], segs: readonly [P, P][]) => {
    let c = 0;
    for (const p of pts) {
      for (const q of others) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < 0.5 * L) c += 4;
        else if (d < 0.8 * L) c += 1;
      }
      for (const [a, b] of lines) if (toSegment(p, a, b) < 0.3 * L) c += 2;
      for (const r of rings) if (inside(p, r)) c += 5;
      for (const b of letters) if (p.x > b.x0 - 0.1 * L && p.x < b.x1 + 0.1 * L && p.y > b.y0 - 0.1 * L && p.y < b.y1 + 0.1 * L) c += 3;
    }
    for (const [a, b] of segs) for (const [p, q] of lines) if (cross(a, b, p, q)) c += 3;
    return c;
  };
  const u = unit(axis);
  const set = (p: P, t: GroupTurn): P => {
    let x = p.x - at.x;
    let y = p.y - at.y;
    if (t.mirror) {
      const along = x * u.x + y * u.y;
      x = 2 * along * u.x - x;
      y = 2 * along * u.y - y;
    }
    const c = Math.cos(t.turn);
    const s = Math.sin(t.turn);
    return { x: at.x + x * c - y * s, y: at.y + x * s + y * c };
  };
  const tryOf = (t: GroupTurn) => cost(group.map((p) => set(p, t)), bonds.map(([p, q]) => [set(p, t), set(q, t)]));
  const none = { turn: 0, mirror: false };
  let best = { t: none, c: tryOf(none) };
  if (best.c === 0) return none;
  for (const turn of TURNS) {
    for (const mirror of mirrorable ? [false, true] : [false]) {
      const t = { turn, mirror };
      const c = tryOf(t);
      if (c < best.c) best = { t, c };
      if (best.c === 0) return best.t;
    }
  }
  return best.t;
}

/** The label's atom's rings, each its atoms in order: through two of its neighbours, the shortest way round from one to the other. */
function ringsThrough(model: Model, id: number): P[][] {
  const near = new Map<number, number[]>();
  for (const b of model.bonds) {
    near.set(b.a, [...(near.get(b.a) ?? []), b.b]);
    near.set(b.b, [...(near.get(b.b) ?? []), b.a]);
  }
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const mine = near.get(id) ?? [];
  const out: P[][] = [];
  for (let i = 0; i < mine.length; i++) {
    for (let j = i + 1; j < mine.length; j++) {
      // (breadth first from one neighbour to the other, the label's atom passed by)
      const from = new Map<number, number>([[mine[i], mine[i]]]);
      const todo = [mine[i]];
      while (todo.length && !from.has(mine[j])) {
        const k = todo.shift()!;
        for (const n of near.get(k) ?? []) {
          if (n === id || from.has(n)) continue;
          from.set(n, k);
          todo.push(n);
        }
      }
      if (!from.has(mine[j])) continue;
      const path = [mine[j]];
      while (path[path.length - 1] !== mine[i]) path.push(from.get(path[path.length - 1])!);
      const ring = [id, ...path].map((k) => byId.get(k)!).filter(Boolean);
      if (ring.length >= 3) out.push(ring);
    }
  }
  return out;
}

const unit = (v: P): P => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

/** How far a point is from a line between two points. */
function toSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether a point lies inside a ring drawn through these points (crossings counted). */
function inside(p: P, ring: readonly P[]): boolean {
  let n = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) n = !n;
  }
  return n;
}

/** Whether two lines cross between their ends - not merely meeting at one. */
function cross(a: P, b: P, c: P, d: P): boolean {
  const s = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = s(c, d, a);
  const d2 = s(c, d, b);
  const d3 = s(a, b, c);
  const d4 = s(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
