/**
 * A drawing's paths painted as a picture, as the tests of reading pictures want one: Meno's own drawings, or drawings made in a test,
 * at 300 dpi - so a test reads a picture made from a structure it states, never one from anywhere else.
 */
import type { FigureDrawn, Point } from "../lib/figure/drawn";

const DPI = 300;
const K = DPI / 72;

/** A drawing's paths painted as a picture at 300 dpi: each filled path's inside, each stroked path's line, 3 x 3 samples a pixel. */
export function painted(f: FigureDrawn): { pixels: { width: number; height: number; data: Uint8ClampedArray }; at: { scale: number; x: number; y: number } } {
  const inked = f.paths.filter((p) => (p.fill && !p.fill.startsWith("#ffffff")) || (p.stroke && !p.stroke.startsWith("#ffffff")));
  const polys = inked.map((p) => {
    const runs: Point[][] = [];
    for (const s of p.d) {
      if (s[0] === "M") runs.push([{ x: s[1] as number, y: s[2] as number }]);
      else if (s[0] !== "Z") runs[runs.length - 1].push({ x: s[s.length - 2] as number, y: s[s.length - 1] as number });
    }
    return { p, runs };
  });
  const all = polys.flatMap((q) => q.runs.flat());
  const [x0, y0] = [Math.min(...all.map((q) => q.x)) - 10, Math.min(...all.map((q) => q.y)) - 10];
  const [x1, y1] = [Math.max(...all.map((q) => q.x)) + 10, Math.max(...all.map((q) => q.y)) + 10];
  const [width, height] = [Math.ceil((x1 - x0) * K), Math.ceil((y1 - y0) * K)];
  const cover = new Float32Array(width * height);
  const segDist = (q: Point, a: Point, b: Point) => {
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy);
  };
  const inside = (q: Point, runs: Point[][]) => {
    let n = 0;
    for (const r of runs)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++)
        if (r[i].y > q.y !== r[j].y > q.y && q.x < ((r[j].x - r[i].x) * (q.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) n++;
    return n % 2 === 1;
  };
  for (const { p, runs } of polys) {
    const pts = runs.flat();
    const pad = (p.stroke ? p.width : 0) + 1;
    const bx0 = Math.max(0, Math.floor((Math.min(...pts.map((q) => q.x)) - pad - x0) * K));
    const bx1 = Math.min(width - 1, Math.ceil((Math.max(...pts.map((q) => q.x)) + pad - x0) * K));
    const by0 = Math.max(0, Math.floor((Math.min(...pts.map((q) => q.y)) - pad - y0) * K));
    const by1 = Math.min(height - 1, Math.ceil((Math.max(...pts.map((q) => q.y)) + pad - y0) * K));
    for (let y = by0; y <= by1; y++)
      for (let x = bx0; x <= bx1; x++) {
        let hit = 0;
        for (let sy = 0; sy < 3; sy++)
          for (let sx = 0; sx < 3; sx++) {
            const q = { x: x0 + (x + (sx + 0.5) / 3) / K, y: y0 + (y + (sy + 0.5) / 3) / K };
            const on = p.fill && !p.fill.startsWith("#ffffff") && inside(q, runs);
            const lined = p.stroke && runs.some((r) => r.some((a, i) => i > 0 && segDist(q, r[i - 1], a) <= p.width / 2));
            if (on || lined) hit++;
          }
        cover[y * width + x] = Math.max(cover[y * width + x], hit / 9);
      }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = Math.round(255 * (1 - cover[i]));
    data.set([v, v, v, 255], 4 * i);
  }
  return { pixels: { width, height, data }, at: { scale: 1 / K, x: x0, y: y0 } };
}

