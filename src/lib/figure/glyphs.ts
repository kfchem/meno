/**
 * Letters drawn as their outlines (docs/PDF.md, *Stage 5*): some figures
 * carry no text, their labels' letters turned into filled shapes. Each
 * shape is read by matching it against the shapes of letters as a typeface
 * draws them - given by whoever asks (the window draws them in the
 * system's typefaces: no letter's shape is carried in Meno) - and how
 * sure the match is is kept, as are the letters it might be besides.
 */
import { boxOf, type Box, type FigureLetter, type Point, type Shapes, type Stroke } from "./drawn";

/** The side of the grid a letter's ink is laid on, stretched to fill it. */
export const GRID = 20;

/**
 * A letter's shape, as a typeface draws it: its ink on the grid, how wide
 * its ink is for how tall, how tall for the typeface's capitals, and how
 * far its ink's foot lies below the line, for the capitals' height.
 */
export type GlyphShape = { c: string; ink: Float32Array; aspect: number; height: number; drop: number };

/** The letters a label is written with: Latin letters, digits, signs and brackets. */
export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-()";

/** Whether a point lies inside outlines, by the even-odd rule. */
function inside(parts: readonly Point[][], x: number, y: number): boolean {
  let n = 0;
  for (const pts of parts) {
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) n++;
    }
  }
  return n % 2 === 1;
}

/** Outlines' ink on the grid, the box stretched to fill it: each cell how much of it is inked, from four samples. */
export function inkOf(parts: readonly Point[][], box: Box): Float32Array {
  const ink = new Float32Array(GRID * GRID);
  const w = Math.max(1e-6, box[2] - box[0]);
  const h = Math.max(1e-6, box[3] - box[1]);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      let n = 0;
      for (const [u, v] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        if (inside(parts, box[0] + ((i + u) / GRID) * w, box[1] + ((j + v) / GRID) * h)) n++;
      }
      ink[j * GRID + i] = n / 4;
    }
  }
  return ink;
}

/** How alike two grids of ink are: the ink they share over the ink either has. */
function alike(a: Float32Array, b: Float32Array): number {
  let both = 0;
  let either = 0;
  for (let k = 0; k < a.length; k++) {
    both += Math.min(a[k], b[k]);
    either += Math.max(a[k], b[k]);
  }
  return either ? both / either : 0;
}

/** A letter drawn as shapes: its outlines, the box round them, and the shapes they came from. */
type Drawn = { parts: Point[][]; box: Box; from: object[]; among?: string };

/**
 * Shapes read as letters, joined as one letter where one lies within
 * another (a hole, an O's), or right over a narrow one (an i's dot).
 */
function lettersDrawn(outlines: readonly { pts: Point[]; from: object }[]): Drawn[] {
  const items = outlines.map((o) => ({ parts: [o.pts], box: boxOf(o.pts), from: o.from })).sort((p, q) => area(q.box) - area(p.box));
  const out: Drawn[] = [];
  for (const it of items) {
    const host = out.find((g) => within(it.box, g.box) || dotOver(it.box, g.box));
    if (host) {
      host.parts.push(...it.parts);
      host.box = [Math.min(host.box[0], it.box[0]), Math.min(host.box[1], it.box[1]), Math.max(host.box[2], it.box[2]), Math.max(host.box[3], it.box[3])];
      if (!host.from.includes(it.from)) host.from.push(it.from);
    } else out.push({ parts: [...it.parts], box: [...it.box], from: [it.from] });
  }
  return out;
}
const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
const within = (a: Box, b: Box) => {
  const e = 0.05 * Math.max(b[2] - b[0], b[3] - b[1]);
  return a[0] >= b[0] - e && a[1] >= b[1] - e && a[2] <= b[2] + e && a[3] <= b[3] + e;
};
/** A small shape just over a narrow one: a dot over its stem. */
const dotOver = (dot: Box, stem: Box) => {
  const w = dot[2] - dot[0];
  const h = stem[3] - stem[1];
  return w < 0.4 * h && dot[3] <= stem[1] + 0.05 * h && stem[1] - dot[3] < 0.35 * h && Math.min(dot[2], stem[2]) - Math.max(dot[0], stem[0]) > 0.5 * w;
};

/** A letter read from its shape: the letter, how sure, the others it might be, likeliest first, and the shapes it was drawn with. */
export type ShapeLetter = FigureLetter & { sure: number; alts: string[]; from: object[] };

/** How sure a reading must be to be taken as one; and how near a second reading must come to be offered besides. */
const TAKEN = 0.55;
const NEAR = 0.08;

/**
 * Letters read from shapes drawn as letters: the figure's filled shapes
 * as tall as letters are beside its bonds (a fifth to a whole bond), their
 * holes and dots with them - a word drawn as one shape, letter by letter - and bars as thick as a letter's stem beside
 * them - each matched against `known`, the shapes of the letters as a
 * typeface draws them. A shape no letter matches well is left out.
 */
export function shapeLetters(shapes: Shapes, bond: number, known: readonly GlyphShape[], taken: ReadonlySet<object> = new Set()): ShapeLetter[] {
  if (!known.length) return [];
  const tall = (b: Box) => b[3] - b[1] >= 0.18 * bond && b[3] - b[1] <= 1.1 * bond;
  const sized = (b: Box) => tall(b) && b[2] - b[0] <= 1.1 * bond;
  // (a word drawn as one shape - its letters each an outline of one path, as some typesetters set a label: Boc, MeO - as tall as a
  // letter however wide, its letters each sized on their own)
  const word = new Set<object>(shapes.blobs.filter((b) => !taken.has(b) && !sized(b.box) && tall(b.box) && b.parts.length > 1));
  const outlines = shapes.blobs.filter((b) => !taken.has(b) && (sized(b.box) || word.has(b))).flatMap((b) => b.parts.filter((p) => p.length > 2).map((pts) => ({ pts, from: b })));
  const glyphs = lettersDrawn(outlines).filter((g) => !g.from.some((f) => word.has(f)) || sized(g.box));
  // (a stem with a dot over it, drawn as one shape - an i or a j, however it leans: the nearer of the two)
  for (const g of glyphs) {
    if (g.parts.length !== 2) continue;
    const [p, q] = g.parts.map(boxOf).sort((x, y) => y[3] - y[1] - (x[3] - x[1]));
    if (p[2] - p[0] < 0.5 * (p[3] - p[1]) && dotOver(q, p)) g.among = "ij";
  }
  // bars that are letters: a stem - an l, an I, a 1 - upright, as tall as a letter and thicker than a
  // bond's line, beside the letters or touching no bond; a minus, short and level, set high beside a letter
  const widths = shapes.strokes.map((s) => s.w).sort((a, b) => a - b);
  const line = widths.length ? widths[Math.floor(widths.length / 2)] : 0;
  const ends = [...shapes.strokes.flatMap((s) => [s.a, s.b]), ...shapes.wedges.flatMap((w) => [w.tip, w.base])];
  const free = (s: Stroke) => [s.a, s.b].every((p) => !ends.some((q) => q !== s.a && q !== s.b && Math.hypot(p.x - q.x, p.y - q.y) < 0.08 * bond));
  const besideOf = (b: Box) =>
    glyphs.find((g) => Math.abs(g.box[3] - b[3]) < 0.25 * (g.box[3] - g.box[1]) && Math.min(Math.abs(g.box[0] - b[2]), Math.abs(b[0] - g.box[2])) < 0.4 * (g.box[3] - g.box[1]));
  const bars = shapes.strokes.filter((s) => !taken.has(s) && s.outline);
  for (const s of bars) {
    const b = boxOf(s.outline!);
    const upright = Math.abs(s.a.x - s.b.x) < 0.2 * Math.abs(s.a.y - s.b.y);
    if (!upright || s.w < 1.3 * line || !sized(b)) continue;
    if (besideOf(b) || free(s)) glyphs.push({ parts: [s.outline!], box: b, from: [s] });
  }
  // (and a stem however thin with a dot just over it - an i, a j, set small and italic as the i of an iPr is - each of its own)
  const dots = shapes.blobs.filter((d) => !taken.has(d) && !sized(d.box) && d.box[3] - d.box[1] < 0.18 * bond);
  for (const s of bars) {
    const b = boxOf(s.outline!);
    // (upright, or leaning as an italic one does)
    if (glyphs.some((g) => g.from.includes(s)) || Math.abs(s.a.x - s.b.x) >= 0.3 * Math.abs(s.a.y - s.b.y)) continue;
    // (its ends meeting no line, and no line ending at its dot: a short bond with a joint's dot over its end is none)
    const dot = free(s) ? dots.find((d) => dotOver(d.box, b) && !ends.some((p) => p !== s.a && p !== s.b && p.x >= d.box[0] - 0.08 * bond && p.x <= d.box[2] + 0.08 * bond && p.y >= d.box[1] - 0.08 * bond && p.y <= d.box[3] + 0.08 * bond)) : undefined;
    if (!dot) continue;
    const box: Box = [Math.min(b[0], dot.box[0]), dot.box[1], Math.max(b[2], dot.box[2]), b[3]];
    if (box[3] - box[1] >= 0.18 * bond && box[3] - box[1] <= 1.1 * bond) glyphs.push({ parts: [s.outline!, ...dot.parts], box, from: [s, dot], among: "ij" });
  }
  for (const s of bars) {
    const b = boxOf(s.outline!);
    const level = Math.abs(s.a.y - s.b.y) < 0.2 * Math.abs(s.a.x - s.b.x);
    if (!level || b[2] - b[0] > 0.45 * bond) continue;
    const mid = (b[1] + b[3]) / 2;
    const high =
      glyphs.some((g) => {
        const h = g.box[3] - g.box[1];
        return mid < g.box[1] + 0.45 * h && mid > g.box[1] - 0.4 * h && b[0] >= g.box[2] - 0.1 * h && b[0] - g.box[2] < 0.5 * h;
      }) ||
      // (or set high after a subscript's digit, by the letter before it: the - of a PF6-)
      glyphs.some((g) => {
        const h = g.box[3] - g.box[1];
        const sub = glyphs.find((d) => d !== g && d.box[3] - d.box[1] < 0.85 * h && d.box[3] > g.box[3] - 0.1 * h && d.box[0] - g.box[2] < 0.3 * h && d.box[0] >= g.box[2] - 0.1 * h);
        return !!sub && mid < g.box[1] + 0.35 * h && mid > g.box[1] - 0.4 * h && b[0] >= sub.box[2] - 0.1 * h && b[0] - sub.box[2] < 0.5 * h;
      });
    if (high) glyphs.push({ parts: [s.outline!], box: b, from: [s] });
  }
  const tallest = glyphs.reduce((m, g) => Math.max(m, g.box[3] - g.box[1]), 0);
  const out: ShapeLetter[] = [];
  for (const g of glyphs) {
    const ink = inkOf(g.parts, g.box);
    const w = g.box[2] - g.box[0];
    const h = g.box[3] - g.box[1];
    const aspect = w / Math.max(h, 1e-6);
    const scored = known
      .filter((k) => !g.among || g.among.includes(k.c))
      .map((k) => {
        // (a sign or a bar as thin as a line has no shape to speak of: told by its proportions alone)
        const shape = alike(ink, k.ink);
        const prop = Math.abs(Math.log(Math.max(aspect, 0.02) / Math.max(k.aspect, 0.02)));
        return { k, score: shape - 0.35 * Math.min(prop, 2) };
      })
      .sort((p, q) => q.score - p.score);
    const best = scored[0];
    // (a stem with a dot over it is an i or a j by its shape alone, however it leans: the nearer of the two, taken surely)
    if (!best || (best.score < 0.35 && !g.among)) continue;
    // its size from how tall the letter is in the typeface: an x as tall as an X would be twice its size
    const capital = h / Math.max(best.k.height, 0.2);
    const size = Math.min(capital, tallest * 1.2) / 0.72;
    const foot = g.box[3] - best.k.drop * capital;
    out.push({
      c: best.k.c,
      box: [...g.box],
      at: [g.box[0], foot],
      size,
      sure: g.among ? Math.max(best.score, TAKEN) : best.score,
      alts: scored
        .slice(1)
        .filter((s) => s.score > best.score - NEAR)
        .map((s) => s.k.c)
        .filter((c, i, all) => c !== best.k.c && all.indexOf(c) === i),
      from: g.from,
    });
  }
  // (a letter whose small form is its capital made smaller - c C, o O, s S, v V, w W, x X, z Z - is told by the capitals beside it on its
  // line, of shapes of their own: as tall as they, a capital; well under, a small letter - the c of a Boc)
  const alike2 = "cosvwxz";
  for (const l of out) {
    if (!alike2.includes(l.c.toLowerCase())) continue;
    const h = l.box[3] - l.box[1];
    const beside = out.filter((m) => {
      const mh = m.box[3] - m.box[1];
      return m !== l && /[A-Z]/.test(m.c) && !alike2.includes(m.c.toLowerCase()) && Math.abs(m.box[3] - l.box[3]) < 0.2 * mh && Math.min(Math.abs(m.box[0] - l.box[2]), Math.abs(l.box[0] - m.box[2])) < 1.5 * mh;
    });
    if (!beside.length) continue;
    const small = h < 0.85 * Math.max(...beside.map((m) => m.box[3] - m.box[1]));
    const c = small ? l.c.toLowerCase() : l.c.toUpperCase();
    if (c === l.c) continue;
    const k = known.find((g) => g.c === c);
    l.alts = [l.c, ...l.alts.filter((a) => a !== c)];
    l.c = c;
    if (k) l.size = Math.min(h / Math.max(k.height, 0.2), tallest * 1.2) / 0.72;
  }
  return out;
}

/** Whether a letter read from its shape is sure enough to say nothing of. */
export const sureEnough = (l: { sure?: number }) => l.sure == null || l.sure >= TAKEN;

/**
 * A letter's shape from its outlines as a typeface draws it - in its own
 * units, y down, its line at naught - and the height of the typeface's
 * capitals in the same units.
 */
export function glyphShape(c: string, parts: readonly Point[][], cap: number): GlyphShape {
  const box = boxOf(parts.flat());
  const h = box[3] - box[1];
  return { c, ink: inkOf(parts, box), aspect: (box[2] - box[0]) / Math.max(h, 1e-6), height: h / cap, drop: box[3] / cap };
}
