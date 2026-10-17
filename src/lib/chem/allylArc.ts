/**
 * An η3-allyl as it is drawn bound to its metal (the maintainer,
 * 2026-10-18): its three carbons a bent chain of two single bonds, and on
 * the metal's side an arc from one end carbon to the other - the
 * delocalisation arc - whose middle the metal's one line meets. A ring
 * bound so (Cp, an arene) keeps its line to its centre. Only the drawing:
 * the file keeps the multi-centre bond (ENDPTS, ATTACH=ALL) as ever.
 */

type Pt = { x: number; y: number };

/** How deep the arc is: its sagitta, as a share of the distance between the end carbons. */
export const ARC_DEPTH = 0.22;
/** How many straight pieces the arc is drawn in. */
const PIECES = 16;

/**
 * The arc of an allyl whose end carbons are at `a` and `b`, its middle one
 * at `mid`, bound to a metal at `metal`: points along it from `a` to `b`,
 * bulging towards the metal (or, the metal on the line between the ends,
 * away from the middle carbon), and its middle, where the metal's line
 * ends.
 */
export function allylArc(a: Pt, b: Pt, mid: Pt, metal: Pt): { points: Pt[]; middle: Pt } {
  const c = Math.hypot(b.x - a.x, b.y - a.y);
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (c < 1e-9) return { points: [a, b], middle: m };
  let n = { x: -(b.y - a.y) / c, y: (b.x - a.x) / c };
  const towards = (p: Pt) => n.x * (p.x - m.x) + n.y * (p.y - m.y);
  const side = Math.abs(towards(metal)) > 1e-6 * c ? Math.sign(towards(metal)) : -Math.sign(towards(mid)) || 1;
  n = { x: n.x * side, y: n.y * side };
  const s = ARC_DEPTH * c;
  // (the circle through both ends and the arc's middle: its radius, its centre behind the chord)
  const r = (c * c) / 4 / (2 * s) + s / 2;
  const centre = { x: m.x - n.x * (r - s), y: m.y - n.y * (r - s) };
  const angle = (p: Pt) => Math.atan2(p.y - centre.y, p.x - centre.x);
  const t0 = angle(a);
  let sweep = angle(b) - t0;
  // (the short way round, through the arc's middle)
  const tm = angle({ x: m.x + n.x * s, y: m.y + n.y * s });
  const within = (t: number) => {
    let u = t - t0;
    while (u < 0) u += 2 * Math.PI;
    let w = sweep;
    while (w < 0) w += 2 * Math.PI;
    return u <= w;
  };
  if (!within(tm)) sweep = sweep > 0 ? sweep - 2 * Math.PI : sweep + 2 * Math.PI;
  else if (sweep < 0) sweep += 2 * Math.PI;
  const points = Array.from({ length: PIECES + 1 }, (_, k) => {
    if (k === 0) return a;
    if (k === PIECES) return b;
    const t = t0 + (sweep * k) / PIECES;
    return { x: centre.x + r * Math.cos(t), y: centre.y + r * Math.sin(t) };
  });
  return { points, middle: { x: m.x + n.x * s, y: m.y + n.y * s } };
}
