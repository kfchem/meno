/**
 * A mark's box on the page (ChemMarks2D) as WebGL draws it: its outline a
 * band `width` wide just inside the box - as a CSS border is - round its
 * corners, or round it whole where it is `round`; dashed, where it is,
 * `dash` on and `gap` off along its middle. All in the page's units. Pure.
 */
export type MarkBoxShape = { w: number; h: number; radius: number; round: boolean };

/** Points round the box's outline `inset` in from its edge, anticlockwise, from its right side's middle; about `steps` to a whole turn of a corner. */
export function outlineAround(box: MarkBoxShape, inset: number, step: number): { x: number; y: number }[] {
  const a = Math.max(0, box.w / 2 - inset);
  const b = Math.max(0, box.h / 2 - inset);
  const out: { x: number; y: number }[] = [];
  if (box.round) {
    const n = Math.max(24, Math.ceil((2 * Math.PI * Math.max(a, b)) / step));
    for (let k = 0; k < n; k++) out.push({ x: a * Math.cos((2 * Math.PI * k) / n), y: b * Math.sin((2 * Math.PI * k) / n) });
    return out;
  }
  const r = Math.max(0, Math.min(box.radius - inset, a, b));
  // each corner's quarter, its middle at a corner of the box less its radius; the sides between are straight
  const corners: [number, number, number][] = [
    [a - r, b - r, 0],
    [-(a - r), b - r, Math.PI / 2],
    [-(a - r), -(b - r), Math.PI],
    [a - r, -(b - r), (3 * Math.PI) / 2],
  ];
  const line = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
    for (let k = 0; k < n; k++) out.push({ x: from.x + ((to.x - from.x) * k) / n, y: from.y + ((to.y - from.y) * k) / n });
  };
  line({ x: a, y: 0 }, { x: a, y: b - r });
  corners.forEach(([cx, cy, from], i) => {
    const n = r > 0 ? Math.max(4, Math.ceil(((Math.PI / 2) * r) / step)) : 1;
    for (let k = 0; k < n; k++) out.push({ x: cx + r * Math.cos(from + ((Math.PI / 2) * k) / n), y: cy + r * Math.sin(from + ((Math.PI / 2) * k) / n) });
    const [nx, ny, to] = corners[(i + 1) % 4];
    const end = { x: cx + r * Math.cos(from + Math.PI / 2), y: cy + r * Math.sin(from + Math.PI / 2) };
    const next = { x: nx + r * Math.cos(to), y: ny + r * Math.sin(to) };
    line(end, i === 3 ? { x: a, y: 0 } : next);
  });
  return out;
}

/**
 * The outline's band as triangles (x, y pairs, three to a triangle): `width`
 * wide, its outer edge on the box's; dashed - `dash` on, `gap` off, along
 * its middle, from its right side's middle - where both are given.
 */
export function outlineBand(box: MarkBoxShape, width: number, dash?: { on: number; off: number }): number[] {
  const step = Math.max(width, Math.min(box.w, box.h) / 24, 1e-9);
  const mid = outlineAround(box, width / 2, dash ? Math.min(step, dash.on / 3) : step);
  const n = mid.length;
  if (n < 3 || !(width > 0)) return [];
  // each point's way out from the box, half the band either side of it
  const normal = (i: number) => {
    const p = mid[(i - 1 + n) % n];
    const q = mid[(i + 1) % n];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dy / l, y: -dx / l };
  };
  const out: number[] = [];
  let along = 0;
  for (let i = 0; i < n; i++) {
    const p = mid[i];
    const q = mid[(i + 1) % n];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const on = !dash || (along + len / 2) % (dash.on + dash.off) < dash.on;
    along += len;
    if (!on) continue;
    const [np, nq] = [normal(i), normal((i + 1) % n)];
    const h = width / 2;
    const po = { x: p.x + np.x * h, y: p.y + np.y * h };
    const pi = { x: p.x - np.x * h, y: p.y - np.y * h };
    const qo = { x: q.x + nq.x * h, y: q.y + nq.y * h };
    const qi = { x: q.x - nq.x * h, y: q.y - nq.y * h };
    out.push(po.x, po.y, qo.x, qo.y, qi.x, qi.y, po.x, po.y, qi.x, qi.y, pi.x, pi.y);
  }
  return out;
}

/** The box filled, as triangles (x, y pairs): a fan from its middle. */
export function boxFill(box: MarkBoxShape): number[] {
  const edge = outlineAround(box, 0, Math.min(box.w, box.h) / 24 || 1);
  const out: number[] = [];
  edge.forEach((p, i) => {
    const q = edge[(i + 1) % edge.length];
    out.push(0, 0, p.x, p.y, q.x, q.y);
  });
  return out;
}
