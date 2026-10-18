/**
 * An η3-allyl as it is drawn bound to its metal (the maintainer,
 * 2026-10-18; IUPAC 2008, GR-1.7.2 and GR-6): its three carbons a bent
 * chain of two single bonds, its middle carbon away from the metal; just
 * inside it, on the metal's side, a curve parallel to it - the
 * delocalisation curve, shallow, solid, as wide as a single bond (GR-6.2),
 * nowhere nearer its bonds than a double bond's spacing (GR-6.1), shorter
 * than the chain as a double bond's inner line is; and one plain line from
 * the metal towards the curve's middle, stopping short of it as a bond
 * stops short of a label. A ring bound so (Cp, an arene) keeps its line to its
 * centre. Only the drawing: the file keeps the multi-centre bond (ENDPTS,
 * ATTACH=ALL) as ever.
 */

type Pt = { x: number; y: number };

/** How far the curve keeps from the chain's bonds, as a share of their length, where no style says: about a double bond's spacing (GR-6.1). */
export const CURVE_GAP = 0.18;
/** How far along each bond, from the middle carbon, the curve reaches (the maintainer, 2026-10-18: 80%, picked by eye from 68% to 84% - short of the end carbons, as a double bond's inner line is). */
export const CURVE_REACH = 0.8;
/** How many straight pieces the curve is drawn in. */
const PIECES = 16;

/**
 * The delocalisation curve of an allyl whose end carbons are at `a` and
 * `b` and its middle one at `mid`: points along it from `a`'s end to
 * `b`'s, just inside the chain - on the side of its angle - parallel to
 * it, and its middle, where the metal's line points. Nowhere is it nearer
 * the chain's bonds than `gap` - a double bond's spacing in the style
 * (GR-6.1); where none is given, `CURVE_GAP` of the bonds' length - and its
 * ends are that far inside their bonds, `reach` of the way along them.
 */
export function allylCurve(a: Pt, mid: Pt, b: Pt, gap?: number, reach = CURVE_REACH): { points: Pt[]; middle: Pt } {
  const la = Math.hypot(a.x - mid.x, a.y - mid.y);
  const lb = Math.hypot(b.x - mid.x, b.y - mid.y);
  if (la < 1e-9 || lb < 1e-9) return { points: [mid, mid], middle: mid };
  const g = gap ?? CURVE_GAP * ((la + lb) / 2);
  const ua = { x: (a.x - mid.x) / la, y: (a.y - mid.y) / la };
  const ub = { x: (b.x - mid.x) / lb, y: (b.y - mid.y) / lb };
  // (each point's distance from the nearer bond: the gap the curve keeps, measured where it comes nearest - by its middle,
  // the apex - and its middle moved out until that is the gap)
  const fromBonds = (p: Pt) =>
    Math.min(Math.abs((p.x - mid.x) * ua.y - (p.y - mid.y) * ua.x), Math.abs((p.x - mid.x) * ub.y - (p.y - mid.y) * ub.x));
  let out = g;
  let made = curveThrough(mid, ua, ub, la, lb, g, out, reach);
  for (let k = 0; k < 8; k++) {
    const near = Math.min(...made.points.map(fromBonds));
    if (Math.abs(near - g) < 1e-9 * Math.max(la, lb)) break;
    out += g - near;
    made = curveThrough(mid, ua, ub, la, lb, g, out, reach);
  }
  // (and anywhere else it would come nearer - between an end and the middle, where a circle dips towards the bond - held
  // out at the gap, along that bond's inward normal: nowhere nearer than the gap)
  const inward = (u: Pt) => {
    let n = { x: -u.y, y: u.x };
    if (n.x * (made.middle.x - mid.x) + n.y * (made.middle.y - mid.y) < 0) n = { x: -n.x, y: -n.y };
    return n;
  };
  const na = inward(ua);
  const nb = inward(ub);
  const points = made.points.map((p) => {
    const da = (p.x - mid.x) * na.x + (p.y - mid.y) * na.y;
    const db = (p.x - mid.x) * nb.x + (p.y - mid.y) * nb.y;
    let q = p;
    if (da < g) q = { x: q.x + na.x * (g - da), y: q.y + na.y * (g - da) };
    const db2 = (q.x - mid.x) * nb.x + (q.y - mid.y) * nb.y;
    if (db2 < g && db < g) q = { x: q.x + nb.x * (g - db2), y: q.y + nb.y * (g - db2) };
    return q;
  });
  return { points, middle: made.middle };
}

/** The curve with its ends `gap` inside their bonds and its middle `out` from both, on the bisector. */
function curveThrough(mid: Pt, ua: Pt, ub: Pt, la: number, lb: number, gap: number, out: number, reach: number): { points: Pt[]; middle: Pt } {
  // (inside the angle: along its bisector, as far from both bonds as the gap - a straight chain, to one side)
  let bis = { x: ua.x + ub.x, y: ua.y + ub.y };
  let bl = Math.hypot(bis.x, bis.y);
  if (bl < 1e-6) {
    bis = { x: -ua.y, y: ua.x };
    bl = 1;
  }
  bis = { x: bis.x / bl, y: bis.y / bl };
  const sinHalf = Math.max(0.2, Math.abs(ua.x * bis.y - ua.y * bis.x));
  const middle = { x: mid.x + (bis.x * out) / sinHalf, y: mid.y + (bis.y * out) / sinHalf };
  // (each end the gap inside its bond, most of the way to its end carbon)
  const inside = (u: Pt, l: number) => {
    let n = { x: -u.y, y: u.x };
    if (n.x * bis.x + n.y * bis.y < 0) n = { x: -n.x, y: -n.y };
    return { x: mid.x + u.x * l * reach + n.x * gap, y: mid.y + u.y * l * reach + n.y * gap };
  };
  const p = inside(ua, la);
  const q = inside(ub, lb);
  // the circle through both ends and the middle, and the arc of it between them through the middle
  const d = 2 * (p.x * (middle.y - q.y) + middle.x * (q.y - p.y) + q.x * (p.y - middle.y));
  if (Math.abs(d) < 1e-12) return { points: [p, middle, q], middle };
  const s = (v: Pt) => v.x * v.x + v.y * v.y;
  const centre = {
    x: (s(p) * (middle.y - q.y) + s(middle) * (q.y - p.y) + s(q) * (p.y - middle.y)) / d,
    y: (s(p) * (q.x - middle.x) + s(middle) * (p.x - q.x) + s(q) * (middle.x - p.x)) / d,
  };
  const r = Math.hypot(p.x - centre.x, p.y - centre.y);
  const angle = (v: Pt) => Math.atan2(v.y - centre.y, v.x - centre.x);
  const norm = (t: number) => {
    while (t > Math.PI) t -= 2 * Math.PI;
    while (t <= -Math.PI) t += 2 * Math.PI;
    return t;
  };
  const t0 = angle(p);
  const toMiddle = norm(angle(middle) - t0);
  const toEnd = norm(angle(q) - t0);
  // (from p through the middle to q: the way round that passes the middle first)
  const sweep = Math.sign(toEnd) === Math.sign(toMiddle) && Math.abs(toEnd) > Math.abs(toMiddle) ? toEnd : toEnd - Math.sign(toEnd || 1) * 2 * Math.PI;
  const points = Array.from({ length: PIECES + 1 }, (_, k) => {
    if (k === 0) return p;
    if (k === PIECES) return q;
    const t = t0 + (sweep * k) / PIECES;
    return { x: centre.x + r * Math.cos(t), y: centre.y + r * Math.sin(t) };
  });
  return { points, middle };
}
