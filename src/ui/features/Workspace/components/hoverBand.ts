/**
 * The highlight round a bond under the pointer, as an outline: drawn behind
 * the bond, so it has to reach past whatever the bond draws (HoverOverlay2D).
 */
import type { BondReach } from "../../../../lib/chem/layout2d";

type P = { x: number; y: number };

/** The convex hull of `pts`, anticlockwise (monotone chain). */
export function hull(pts: P[]): P[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: P[]) => {
    const out: P[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(s), ...half([...s].reverse())];
}

/**
 * The highlight round a bond from `p` to `q`: a band whose ends are rounded,
 * each end as wide as the drawing reaches there (`reach`) and `margin` more,
 * all of it `scale` of that - so a wedge's band widens with the wedge, and a
 * double bond's takes in its second line. Each end's round sits where a plain
 * bond's does, `ext` past the atom at its far side, so a plain bond's band is
 * as it always was. Points in the drawing's coordinates.
 */
export function bandAround(p: P, q: P, reach: BondReach, margin: number, plainHalf: number, ext: number, scale: number): P[] {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const u = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
  const n = { x: -u.y, y: u.x };
  const ends = [
    { at: p, out: { x: -u.x, y: -u.y }, left: reach.left1, right: reach.right1 },
    { at: q, out: u, left: reach.left2, right: reach.right2 },
  ];
  const pts: P[] = [];
  for (const e of ends) {
    const r = scale * ((e.left + e.right) / 2 + margin);
    const across = (scale * (e.left - e.right)) / 2;
    const back = ext - plainHalf;
    const c = {
      x: e.at.x + e.out.x * back + n.x * across,
      y: e.at.y + e.out.y * back + n.y * across,
    };
    for (let i = 0; i < 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      pts.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
    }
  }
  return hull(pts);
}

/** The longest step one frame takes a band's motion, in seconds: a frame held up mid-way (the canvas busy) takes it no further. */
export const BAND_STEP_MOST = 1 / 20;

/**
 * A band's own clock, in milliseconds of the page's time: when it last moved, or null where it is at rest. Its motion is counted in the
 * time between its own frames - never from a frame drawn long before it began, which after a zoom, a pause or a pinch would bring it in
 * all at once, faster or slower each time (no abrupt changes: the maintainer, 2026-11-16).
 */
export type BandClock = { last: number | null };

/**
 * How far a band moves this frame, in seconds: none at the first frame of a motion (it starts where it was), then the time since its last
 * frame, at most `BAND_STEP_MOST`. Its clock is left at rest - null - where `moving` is false, so the next motion starts afresh.
 */
export function bandStep(clock: BandClock, now: number, moving: boolean): number {
  if (!moving) {
    clock.last = null;
    return 0;
  }
  const dt = clock.last == null ? 0 : Math.min(Math.max(0, (now - clock.last) / 1000), BAND_STEP_MOST);
  clock.last = now;
  return dt;
}
