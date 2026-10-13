/**
 * A vector figure read as a structure (docs/PDF.md, *Stage 5*): its strokes,
 * wedges, hashes and curves read as bonds, its letters as atoms' labels,
 * where a drawing program put them. No picture is looked at: only what the
 * figure is drawn with, as PDFium reads it (lib/figure/drawn).
 *
 * What cannot be read for certain is not guessed at silently: it is read
 * the likeliest way, and said (`unsure`).
 */
import { shapeLetters, sureEnough, type GlyphShape, type ShapeLetter } from "./glyphs";
import { chargeMarks, withoutMarks } from "./charges";
import { boxOf, narrowestBox, shapesOf, type Box, type Curve, type FigureDrawn, type FigureLetter, type Point, type Shapes, type Stroke, type Wedge } from "./drawn";

/**
 * An atom read: where it lies on the page, its label as drawn - none for a
 * carbon at bonds' meeting - what else the label might read as, its letters
 * drawn as shapes, and what is unsure of it.
 */
export type ReadAtom = {
  x: number;
  y: number;
  label?: string;
  alts?: string[];
  /** Read as an element, with its charge, rather than a label as drawn: as a picture's reader gives it. */
  el?: string;
  charge?: number;
  /** A charge drawn by it in a ring (lib/figure/charges), beside what its label says. */
  marked?: number;
  box?: Box;
  unsure?: string[];
};

/** A bond read, between atoms by index, `a` at a wedge's or a hash's narrow end. */
export type ReadBond = {
  a: number;
  b: number;
  order: 1 | 2 | 3;
  stereo?: "up" | "down" | "wavy";
  /** Its hashes even: which end is narrow is not drawn. */
  either?: true;
  /** Only which end lies nearer is known - as a picture's reader gives it - not which is narrow: `up`, `b` nearer than `a`. */
  facing?: true;
  /** In a ring drawn with a circle in it: its order is the ring's to work out. */
  aromatic?: true;
  bold?: boolean;
  unsure?: string[];
};

/** A figure read: its atoms and bonds, how long its bonds are drawn, in points, and the letters in it not read as labels. */
export type FigureRead = { atoms: ReadAtom[]; bonds: ReadBond[]; bond: number; left: { letters: FigureLetter[] } };

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
const len = (s: { a: Point; b: Point }) => dist(s.a, s.b);
const mid = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const unit = (p: Point, q: Point): Point => {
  const l = Math.max(1e-9, dist(p, q));
  return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
};
const dot = (u: Point, v: Point) => u.x * v.x + u.y * v.y;
const cross = (u: Point, v: Point) => u.x * v.y - u.y * v.x;

/**
 * How long the figure's bonds are drawn: the length most strokes and
 * wedges share, within an eighth of it - the longer where two are as
 * common, a ring's inner lines and a hash's strokes being shorter - and
 * longer than `least`: a bond is drawn longer than its labels' letters
 * are tall.
 */
export function bondLength(lengths: readonly number[], least = 0): number {
  const ls = lengths.filter((l) => l > least).sort((a, b) => a - b);
  if (!ls.length) return 0;
  let best = { n: 0, l: ls[ls.length - 1] };
  for (const l of ls) {
    const n = ls.filter((m) => Math.abs(m - l) <= l / 8).length;
    if (n > best.n || (n === best.n && l > best.l)) best = { n, l };
  }
  const near = ls.filter((m) => Math.abs(m - best.l) <= best.l / 8);
  return near[Math.floor(near.length / 2)];
}

/** A bond as drawn, before its ends are atoms: its ends, what kind it is, and how sure. */
type Drawn = { a: Point; b: Point; order: 1 | 2 | 3; stereo?: "up" | "down" | "wavy"; either?: true; bold?: boolean; unsure?: string[] };

/**
 * Hashes: three or more short strokes side by side, each across the line
 * through their middles, evenly spaced - a bond behind the page, narrow
 * where the strokes are shortest. Equal throughout, its narrow end is not
 * told by the strokes.
 */
function hashesOf(short: Stroke[], bond: number): { hashes: Drawn[]; used: Set<Stroke> } {
  const used = new Set<Stroke>();
  const hashes: Drawn[] = [];
  // (a hash's first strokes, at its narrow end, may be dots: no way of their own)
  const dot_ = (s: Stroke) => len(s) < 2 * s.w;
  const near = (s: Stroke, t: Stroke) => {
    if (dot_(s) && dot_(t)) return false;
    const [line, other] = dot_(s) ? [t, s] : [s, t];
    const u = unit(line.a, line.b);
    if (!dot_(other) && Math.abs(cross(u, unit(other.a, other.b))) > Math.sin((12 * Math.PI) / 180)) return false;
    const m = mid(s.a, s.b);
    const n = mid(t.a, t.b);
    const d = dist(m, n);
    if (d > 0.4 * bond || d < 0.04 * bond) return false;
    // (the step from one to the next is across them)
    return Math.abs(dot(unit(m, n), u)) < Math.sin((35 * Math.PI) / 180);
  };
  const left = new Set(short);
  for (const s of short) {
    if (!left.has(s)) continue;
    const group = [s];
    left.delete(s);
    for (let i = 0; i < group.length; i++) {
      for (const t of [...left]) {
        if (near(group[i], t)) {
          group.push(t);
          left.delete(t);
        }
      }
    }
    if (group.length < 3) {
      for (const t of group.slice(1)) left.add(t);
      continue;
    }
    // ordered along the line through their middles
    const ms = group.map((g) => mid(g.a, g.b));
    const c = ms.reduce((p, q) => ({ x: p.x + q.x / ms.length, y: p.y + q.y / ms.length }), { x: 0, y: 0 });
    const longest = group.reduce((p, g) => (len(g) > len(p) ? g : p));
    const across = unit(longest.a, longest.b);
    const axis = { x: -across.y, y: across.x };
    const order = group.map((g, i) => ({ g, t: dot({ x: ms[i].x - c.x, y: ms[i].y - c.y }, axis) })).sort((p, q) => p.t - q.t);
    const first = order[0];
    const last = order[order.length - 1];
    const step = (last.t - first.t) / (order.length - 1);
    const at = (t: number): Point => ({ x: c.x + axis.x * t, y: c.y + axis.y * t });
    const l0 = len(first.g);
    const l1 = len(last.g);
    let [a, b] = [at(first.t - step / 2), at(last.t + step / 2)];
    if (l0 > l1 * 1.25) [a, b] = [b, a];
    const either = l1 <= l0 * 1.25 && l0 <= l1 * 1.25;
    for (const o of order) used.add(o.g);
    hashes.push({ a, b, order: 1, stereo: "down", ...(either ? { either: true } : {}) });
  }
  return { hashes, used };
}

/**
 * Lines side by side - parallel, a fifth of a bond or so apart, alongside
 * each other for most of the shorter - are one bond, double or triple.
 * Its ends are those of the longest line where one is longer (a ring's
 * double bond, its second line inside and shorter), or of the line through
 * their middle where none is.
 */
function multiples(lines: Stroke[], bond: number): { bonds: Drawn[]; used: Set<Stroke> } {
  const used = new Set<Stroke>();
  const bonds: Drawn[] = [];
  const pair = (s: Stroke, t: Stroke) => {
    const u = unit(s.a, s.b);
    if (Math.abs(cross(u, unit(t.a, t.b))) > Math.sin((8 * Math.PI) / 180)) return false;
    const off = Math.abs(cross(u, { x: mid(t.a, t.b).x - s.a.x, y: mid(t.a, t.b).y - s.a.y }));
    if (off < 0.06 * bond || off > 0.4 * bond) return false;
    const ta = dot(u, { x: t.a.x - s.a.x, y: t.a.y - s.a.y });
    const tb = dot(u, { x: t.b.x - s.a.x, y: t.b.y - s.a.y });
    const overlap = Math.min(len(s), Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb));
    return overlap > 0.5 * Math.min(len(s), len(t));
  };
  const left = new Set(lines);
  for (const s of lines) {
    if (!left.has(s)) continue;
    const group = [s];
    left.delete(s);
    for (let i = 0; i < group.length && group.length < 3; i++) {
      for (const t of [...left]) {
        if (group.length < 3 && pair(group[i], t)) {
          group.push(t);
          left.delete(t);
        }
      }
    }
    if (group.length < 2) continue;
    for (const g of group) used.add(g);
    const sorted = [...group].sort((p, q) => len(q) - len(p));
    const u = unit(sorted[0].a, sorted[0].b);
    const offs = group.map((g) => cross(u, { x: mid(g.a, g.b).x - sorted[0].a.x, y: mid(g.a, g.b).y - sorted[0].a.y }));
    let ends: [Point, Point];
    if (group.length === 3) {
      // (a triple bond's ends are its middle line's)
      const middle = group[offs.indexOf([...offs].sort((p, q) => p - q)[1])];
      ends = [middle.a, middle.b];
    } else if (len(sorted[1]) < 0.85 * len(sorted[0])) {
      ends = [sorted[0].a, sorted[0].b];
    } else {
      // (the line through their middle, along the first)
      const o = (offs[0] + offs[1]) / 2;
      const n = { x: -u.y, y: u.x };
      const s0 = group[0];
      const shift = o - cross(u, { x: s0.a.x - sorted[0].a.x, y: s0.a.y - sorted[0].a.y });
      const f = (p: Point): Point => ({ x: p.x + n.x * shift, y: p.y + n.y * shift });
      const t1 = group[1];
      const along = (p: Point) => dot(u, { x: p.x - s0.a.x, y: p.y - s0.a.y });
      const lo = Math.min(along(s0.a), along(s0.b), along(t1.a), along(t1.b));
      const hi = Math.max(along(s0.a), along(s0.b), along(t1.a), along(t1.b));
      const p0 = { x: s0.a.x + u.x * lo, y: s0.a.y + u.y * lo };
      const p1 = { x: s0.a.x + u.x * hi, y: s0.a.y + u.y * hi };
      ends = [f(p0), f(p1)];
    }
    bonds.push({ a: ends[0], b: ends[1], order: group.length as 2 | 3 });
  }
  return { bonds, used };
}

/** A wavy line: a curve that goes to and fro across a line between its ends, a few times, not far. */
function wavy(c: Curve, bond: number): Drawn | null {
  if (c.closed || c.pts.length < 6) return null;
  const a = c.pts[0];
  const b = c.pts[c.pts.length - 1];
  const l = dist(a, b);
  if (l < 0.3 * bond || l > 1.4 * bond) return null;
  const u = unit(a, b);
  const offs = c.pts.map((p) => cross(u, { x: p.x - a.x, y: p.y - a.y }));
  const most = Math.max(...offs.map(Math.abs));
  if (most > 0.3 * bond || most < 0.02 * bond) return null;
  let turns = 0;
  for (let i = 1; i < offs.length; i++) if (Math.sign(offs[i]) !== Math.sign(offs[i - 1]) && Math.abs(offs[i]) > most * 0.2) turns++;
  return turns >= 2 ? { a, b, order: 1, stereo: "wavy" } : null;
}

/** A compound's number as a figure writes it: digits, maybe a letter or two and primes, maybe in brackets - 1, 12b, 3', (4). */
export const COMPOUND_NUMBER = /^[([]?\d+[a-z]{0,2}['\u2032\u2033]*[)\]]?$/;

/** A word: letters on a line side by side - its subscripts and superscripts with it - as drawn. */
type Word = { letters: FigureLetter[]; box: Box; size: number };

/** Letters joined into words: each to the one before it on its line where they nearly touch. */
export function wordsOf(letters: readonly FigureLetter[]): Word[] {
  const ls = [...letters].sort((p, q) => p.box[0] - q.box[0]);
  const words: Word[] = [];
  for (const l of ls) {
    const lh = l.box[3] - l.box[1];
    const w = words.find((w) => {
      const last = w.letters[w.letters.length - 1];
      const gap = l.box[0] - last.box[2];
      const big = Math.max(w.size, l.size);
      const overlap = Math.min(w.box[3], l.box[3]) - Math.max(w.box[1], l.box[1]);
      return gap > -0.3 * big && gap < 0.3 * big && overlap > 0.25 * Math.min(lh, w.box[3] - w.box[1]);
    });
    if (w) {
      w.letters.push(l);
      w.box = [Math.min(w.box[0], l.box[0]), Math.min(w.box[1], l.box[1]), Math.max(w.box[2], l.box[2]), Math.max(w.box[3], l.box[3])];
      w.size = Math.max(w.size, l.size);
    } else {
      words.push({ letters: [l], box: [...l.box], size: l.size });
    }
  }
  return words;
}

/**
 * A word as a label is typed: a smaller letter set low a subscript's digit,
 * set high a charge - written as they are typed, NH2, N+, O- - so that
 * Meno reads it as it reads a label typed.
 */
export function labelText(w: Word): string {
  const main = w.letters.filter((l) => l.size >= 0.85 * w.size);
  const base = main.length ? main.map((l) => l.at?.[1] ?? l.box[3]).sort((a, b) => a - b)[Math.floor(main.length / 2)] : 0;
  return w.letters
    .map((l) => {
      const c = l.c === "−" || l.c === "–" ? "-" : l.c;
      if (l.size >= 0.85 * w.size) return c;
      const y = l.at?.[1] ?? l.box[3];
      // (set high: a charge; set low, or as low: a count)
      return y < base - 0.25 * w.size ? (c === "+" || c === "-" ? c : `^${c}`) : c;
    })
    .join("")
    .replace(/\^/g, "");
}

function boxOfBoxes(bs: readonly Box[]): Box {
  return bs.reduce((p, b) => [Math.min(p[0], b[0]), Math.min(p[1], b[1]), Math.max(p[2], b[2]), Math.max(p[3], b[3])]);
}

/**
 * A word as an atom's label: as it is written, and - its letters drawn as
 * shapes - what else it might read as, one or two letters read as the
 * next likeliest; unsure where one of them matched its letter weakly.
 */
function labelOf(w: Word): Pick<ReadAtom, "label" | "alts" | "unsure"> {
  const label = labelText(w);
  const shaped = w.letters.filter((l): l is ShapeLetter => "sure" in l);
  if (!shaped.length) return { label };
  const as = (swap: Map<number, string>) => labelText({ ...w, letters: w.letters.map((l, k) => (swap.has(k) ? { ...l, c: swap.get(k)! } : l)) });
  const open = w.letters.map((l, i) => ({ i, alts: "alts" in l ? (l as ShapeLetter).alts : [] })).filter((o) => o.alts.length);
  const alts: string[] = [];
  for (const o of open) for (const c of o.alts) alts.push(as(new Map([[o.i, c]])));
  for (let a = 0; a < open.length; a++) for (let b = a + 1; b < open.length; b++) alts.push(as(new Map([[open[a].i, open[a].alts[0]], [open[b].i, open[b].alts[0]]])));
  const others = [...new Set(alts)].filter((x) => x !== label).slice(0, 12);
  const weak = shaped.some((l) => !sureEnough(l));
  return { label, ...(others.length ? { alts: others } : {}), ...(weak ? { unsure: [`Its letters are drawn as shapes: read as "${label}".`] } : {}) };
}

/** The middle of a box. */
const centre = (b: Box): Point => ({ x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 });

/**
 * Whether a bond's end, going on the way it points (`out`), comes into a
 * word's box - a label's - soon: within a third of a bond, the box taken
 * a little wider, as a bond is cut short of its label.
 */
function reaches(p: Point, out: Point, b: Box, bond: number): boolean {
  const pad = 0.08 * bond;
  const [x0, y0, x1, y1] = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
  if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) return true;
  // (where the ray from p meets the box: slab by slab)
  let t0 = 0;
  let t1 = 0.35 * bond;
  for (const [o, d, lo, hi] of [
    [p.x, out.x, x0, x1],
    [p.y, out.y, y0, y1],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let [ta, tb] = [(lo - o) / d, (hi - o) / d];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** How far a point is from a box: none inside it. */
function fromBox(p: Point, b: Box): number {
  const dx = Math.max(b[0] - p.x, 0, p.x - b[2]);
  const dy = Math.max(b[1] - p.y, 0, p.y - b[3]);
  return Math.hypot(dx, dy);
}

/** The short strokes and bits no hash or bond took. */
function bitsLeft(short: readonly Stroke[], inHashes: ReadonlySet<Stroke>, lines: readonly Stroke[]): Stroke[] {
  const taken = new Set(lines);
  return short.filter((s) => !inHashes.has(s) && !taken.has(s));
}

/**
 * Bonds between two labels drawn so close that little of them is left - a
 * sulfonyl's S=O: a bit between two words, each on its other side, is a
 * bond between them; two bits side by side, a double one.
 */
function dashes(bits: readonly Stroke[], words: readonly Word[], bond: number): Drawn[] {
  const found = new Map<string, { a: Point; b: Point; n: number }>();
  for (const s of bits) {
    const c = mid(s.a, s.b);
    const near = words
      .map((w, k) => ({ k, d: fromBox(c, w.box), c: centre(w.box) }))
      .filter((w) => w.d < 0.3 * bond)
      .sort((p, q) => p.d - q.d);
    let pair: [typeof near[0], typeof near[0]] | null = null;
    for (let i = 0; i < near.length && !pair; i++)
      for (let j = i + 1; j < near.length && !pair; j++) if (dot(unit(c, near[i].c), unit(c, near[j].c)) < -0.5) pair = [near[i], near[j]];
    if (!pair) continue;
    const [p, q] = pair[0].k < pair[1].k ? pair : [pair[1], pair[0]];
    const key = `${p.k}:${q.k}`;
    const u = unit(p.c, q.c);
    const h = Math.max(len(s), s.w) / 2;
    const had = found.get(key);
    if (had) had.n++;
    else found.set(key, { a: { x: c.x - u.x * h, y: c.y - u.y * h }, b: { x: c.x + u.x * h, y: c.y + u.y * h }, n: 1 });
  }
  return [...found.values()].map((f) => ({ a: f.a, b: f.b, order: Math.min(3, f.n) as 1 | 2 | 3 }));
}

/**
 * How long a figure's bonds are drawn, from the shapes its paths make and
 * its letters: the length most of its lines that meet another share (a
 * bond's line meets another's end, as a hash's strokes and a ring's inner
 * lines do not), longer than its letters are tall.
 */
export function figureBond(shapes: Shapes, letters: readonly FigureLetter[]): number {
  // (another's end: a line's in a path of several meets the next's, though they share the point)
  const tips = [...shapes.strokes.flatMap((s) => [{ p: s.a, of: s as object }, { p: s.b, of: s as object }]), ...shapes.wedges.flatMap((w) => [{ p: w.tip, of: w as object }, { p: w.base, of: w as object }])];
  const meets = (s: Stroke) => {
    const r = 0.12 * len(s);
    return [s.a, s.b].some((p) => tips.some((q) => q.of !== s && dist(p, q.p) < r));
  };
  const joined = shapes.strokes.filter(meets);
  const lengths = [...(joined.length ? joined : shapes.strokes).map(len), ...shapes.wedges.map((w) => dist(w.tip, w.base))];
  const sizes = letters.map((l) => l.size).sort((a, b) => a - b);
  return bondLength(lengths, sizes.length ? 0.6 * sizes[Math.floor(sizes.length / 2)] : 0);
}

/**
 * A figure read: the shapes its paths make (or `given`: those a scheme's
 * arrows and signs were taken out of) read as bonds, their ends where they
 * meet as atoms, the words beside their ends as those atoms' labels, and a
 * word near the rest but at no bond's end - an ion - as an atom alone.
 */
export function readFigure(drawn: FigureDrawn, reads: (label: string) => boolean = () => true, known: readonly GlyphShape[] = [], given?: Shapes): FigureRead {
  const all = given ?? shapesOf(drawn);
  const bond = figureBond(all, drawn.letters);
  const empty: FigureRead = { atoms: [], bonds: [], bond, left: { letters: [...drawn.letters] } };
  if (!bond) return empty;
  // (a charge drawn in a ring by an atom - its ring and the strokes in it - is that atom's, and nothing else: lib/figure/charges)
  const marks = chargeMarks(all, bond);
  const shapes = withoutMarks(all, marks);

  // short strokes may be hashes; long ones bonds, side by side multiple -
  // and a short one between two labels a bond too, trimmed at both
  // (small filled shapes - a hash's first strokes drawn filled - as strokes too)
  const blobOf = new Map<Stroke, object>();
  const bits = shapes.blobs
    .filter((b) => !b.curved && Math.max(b.box[2] - b.box[0], b.box[3] - b.box[1]) < 0.3 * bond)
    .map((b): Stroke => {
      const n = narrowestBox(b.pts);
      const s = { a: { x: n.mid.x - (n.u.x * n.long) / 2, y: n.mid.y - (n.u.y * n.long) / 2 }, b: { x: n.mid.x + (n.u.x * n.long) / 2, y: n.mid.y + (n.u.y * n.long) / 2 }, w: n.short };
      blobOf.set(s, b);
      return s;
    });
  const short = [...shapes.strokes.filter((s) => len(s) < 0.45 * bond && len(s) > 0.04 * bond), ...bits];
  const { hashes, used: inHashes } = hashesOf(short, bond);
  // letters drawn as shapes, where the figure has none written there: read from their shapes
  const inLetters = new Set<object>();
  const fromShapes = known.length
    ? shapeLetters(shapes, bond, known, new Set([...inHashes].map((s) => blobOf.get(s) ?? s))).filter(
        (l) => !drawn.letters.some((t) => Math.min(t.box[2], l.box[2]) > Math.max(t.box[0], l.box[0]) && Math.min(t.box[3], l.box[3]) > Math.max(t.box[1], l.box[1])),
      )
    : [];
  for (const l of fromShapes) for (const f of l.from) inLetters.add(f);
  const words = wordsOf([...drawn.letters, ...fromShapes]);
  const labelled = (p: Point, out: Point) => words.some((w) => reaches(p, out, w.box, bond));
  const between = (s: Stroke) => labelled(s.a, unit(s.b, s.a)) && labelled(s.b, unit(s.a, s.b));
  const lines = shapes.strokes.filter((s) => !inHashes.has(s) && !inLetters.has(s) && (len(s) >= 0.3 * bond || (len(s) > 0.04 * bond && between(s))));
  const whole = joinedAcross(lines, bond);
  const { bonds: multi, used: inMulti } = multiples(whole, bond);
  // (a line much thicker than most - a Haworth ring's front - is bold)
  const widths = whole.map((s) => s.w).sort((a, b) => a - b);
  const thin = widths.length ? widths[Math.floor(widths.length / 2)] : 0;
  const bold = (s: Stroke) => s.w > 2.5 * thin && s.w > 0.12 * bond;
  const drawnBonds: Drawn[] = [
    ...whole.filter((s) => !inMulti.has(s)).map((s): Drawn => ({ a: s.a, b: s.b, order: 1, ...(bold(s) ? { bold: true } : {}) })),
    ...multi,
    ...hashes,
    ...shapes.wedges.filter((w) => dist(w.tip, w.base) > 0.3 * bond).map((w: Wedge): Drawn => ({ a: w.tip, b: w.base, order: 1, stereo: "up" })),
    ...shapes.curves.map((c) => wavy(c, bond)).filter((d): d is Drawn => !!d),
    ...dashes(bitsLeft(short, inHashes, lines).filter((s) => !inLetters.has(blobOf.get(s) ?? s)), words, bond),
  ];

  // bonds' ends where they meet; an end alone, its bond pointing into a word, the word's
  type End = { bond: number; side: 0 | 1; p: Point };
  const ends: End[] = drawnBonds.flatMap((d, i) => [
    { bond: i, side: 0 as const, p: d.a },
    { bond: i, side: 1 as const, p: d.b },
  ]);
  const tol = 0.2 * bond;
  const meeting = new Map<End, number>();
  for (const e of ends) meeting.set(e, ends.filter((f) => f.bond !== e.bond && dist(f.p, e.p) < tol).length);
  const wordOf = new Map<End, number>();
  // (a compound's number set close under a bond - 1, 2a, 3' - is no atom's label)
  const isNumber = words.map((w) => COMPOUND_NUMBER.test(labelText(w)));
  for (const e of ends) {
    const d = drawnBonds[e.bond];
    const out = unit(e.side === 0 ? d.b : d.a, e.p);
    let best = -1;
    let bestD = Infinity;
    words.forEach((w, k) => {
      if (isNumber[k]) return;
      const dd = fromBox(e.p, w.box);
      // (where other bonds meet it, an end is a carbon - unless it lies on a capital of the word, its bonds drawn to its middle under it)
      const onCapital = w.letters.some((l) => /[A-Z]/.test(l.c) && dist(centre(l.box), e.p) < 0.35 * w.size);
      if ((meeting.get(e)! === 0 || onCapital) && dd < bestD && reaches(e.p, out, w.box, bond)) {
        best = k;
        bestD = dd;
      }
    });
    if (best >= 0) wordOf.set(e, best);
  }
  // (two labels set side by side, read as one word that reads as nothing - H H - are each
  // their own, where their bonds come to different capitals of it)
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const at = ends.filter((e) => wordOf.get(e) === k);
    if (at.length < 2 || reads(labelText(w)) || (labelOf(w).alts ?? []).some(reads)) continue;
    const caps = w.letters.map((l, i) => ({ l, i })).filter(({ l }) => /[A-Z]/.test(l.c) && l.size >= 0.85 * w.size);
    const nearest = (e: End) => caps.reduce((p, c) => (dist(centre(c.l.box), e.p) < dist(centre(p.l.box), e.p) ? c : p)).i;
    const starts = [...new Set(at.map(nearest))].sort((a, b) => a - b);
    if (starts.length < 2) continue;
    const cuts = caps.map((c) => c.i).filter((i) => starts.includes(i) || i === caps[0].i);
    const pieces = cuts.map((from, j) => w.letters.slice(from, cuts[j + 1] ?? w.letters.length)).filter((ls) => ls.length);
    const made = pieces.map((ls): Word => ({ letters: ls, box: boxOfBoxes(ls.map((l) => l.box)), size: w.size }));
    words[k] = made[0];
    for (const m of made.slice(1)) words.push(m);
    for (const e of at) {
      const i = nearest(e);
      const piece = made.findIndex((m) => m.letters.includes(w.letters[i]));
      wordOf.set(e, piece === 0 ? k : words.length - made.length + piece);
    }
  }
  // (a lone H takes one bond: a wedge's or a hash's first, else the nearest)
  words.forEach((w, k) => {
    if (labelText(w) !== "H") return;
    const at = ends.filter((e) => wordOf.get(e) === k);
    if (at.length < 2) return;
    const rank = (e: End) => (drawnBonds[e.bond].stereo ? 0 : 1) * 1e6 + fromBox(e.p, w.box);
    const keep = at.reduce((p, e) => (rank(e) < rank(p) ? e : p));
    for (const e of at) if (e !== keep) wordOf.delete(e);
  });

  const atoms: ReadAtom[] = [];
  const atomOfWord = new Map<number, number>();
  const atomOfEnd = new Map<End, number>();
  for (const e of ends) {
    const k = wordOf.get(e);
    if (k != null) {
      if (!atomOfWord.has(k)) {
        atomOfWord.set(k, atoms.length);
        atoms.push({ x: 0, y: 0, ...labelOf(words[k]), box: words[k].box });
      }
      atomOfEnd.set(e, atomOfWord.get(k)!);
    }
  }
  const free = ends.filter((e) => !wordOf.has(e));
  const groups: End[][] = [];
  for (const e of free) {
    const g = groups.find((g) => g.some((f) => dist(f.p, e.p) < tol));
    if (g) g.push(e);
    else groups.push([e]);
  }
  // (groups that came to touch as they grew are one)
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < groups.length && !changed; i++) {
      for (let j = i + 1; j < groups.length && !changed; j++) {
        if (groups[i].some((e) => groups[j].some((f) => dist(e.p, f.p) < tol))) {
          groups[i].push(...groups.splice(j, 1)[0]);
          changed = true;
        }
      }
    }
  }
  for (const g of groups) {
    // (a wedge's or a hash's narrow end lies where the atom is; a bond's plain end may stop short of it)
    const narrow = g.filter((e) => e.side === 0 && drawnBonds[e.bond].stereo && drawnBonds[e.bond].stereo !== "wavy");
    const at = (narrow.length ? narrow : g).reduce((p, e) => ({ x: p.x + e.p.x / (narrow.length || g.length), y: p.y + e.p.y / (narrow.length || g.length) }), { x: 0, y: 0 });
    const n = atoms.length;
    atoms.push({ x: at.x, y: at.y });
    for (const e of g) atomOfEnd.set(e, n);
  }

  // a labelled atom lies at its label's letter nearest its bonds, a capital
  for (const [k, n] of atomOfWord) {
    const w = words[k];
    const reaching = ends.filter((e) => wordOf.get(e) === k).map((e) => e.p);
    const towards = reaching.reduce((p, q) => ({ x: p.x + q.x / reaching.length, y: p.y + q.y / reaching.length }), { x: 0, y: 0 });
    const caps = w.letters.filter((l) => /[A-Z]/.test(l.c) && l.size >= 0.85 * w.size);
    const pick = (caps.length ? caps : w.letters).reduce((p, l) => (dist(centre(l.box), towards) < dist(centre(p.box), towards) ? l : p));
    const c = centre(pick.box);
    atoms[n].x = c.x;
    atoms[n].y = c.y;
  }

  // bonds between the atoms their ends are
  const bonds: ReadBond[] = [];
  drawnBonds.forEach((d, i) => {
    const a = atomOfEnd.get(ends[2 * i])!;
    const b = atomOfEnd.get(ends[2 * i + 1])!;
    if (a === b) return;
    const same = bonds.find((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a));
    if (same) {
      (same.unsure ??= []).push("Drawn twice over: read as one bond.");
      return;
    }
    bonds.push({ a, b, order: d.order, ...(d.stereo ? { stereo: d.stereo } : {}), ...(d.either ? { either: true } : {}), ...(d.bold ? { bold: true } : {}), ...(d.unsure ? { unsure: [...d.unsure] } : {}) });
  });

  // a ring's circle: its bonds aromatic
  for (const c of shapes.curves) {
    const ring = circledRing(c, atoms, bonds, bond);
    for (const b of ring ?? []) b.aromatic = true;
  }

  // words at no bond's end but by the structure, with a charge: ions, standing alone
  const placed = atoms.length ? boxOf(atoms) : null;
  const left: FigureLetter[] = [];
  words.forEach((w, k) => {
    if (atomOfWord.has(k)) return;
    const text = labelText(w);
    if (placed && /^[A-Z][A-Za-z0-9]*[+-]$/.test(text) && fromBox(centre(w.box), placed) < 1.5 * bond) {
      const c = centre(w.letters.find((l) => /[A-Z]/.test(l.c))?.box ?? w.box);
      atoms.push({ x: c.x, y: c.y, ...labelOf(w), box: w.box });
    } else left.push(...w.letters);
  });
  // (each charge drawn in a ring, the nearest atom's)
  for (const m of marks) {
    let best = -1;
    for (let i = 0; i < atoms.length; i++) if (dist(atoms[i], m.at) < 1.2 * bond && (best < 0 || dist(atoms[i], m.at) < dist(atoms[best], m.at))) best = i;
    if (best >= 0) atoms[best] = { ...atoms[best], marked: (atoms[best].marked ?? 0) + m.charge };
  }
  return { atoms, bonds, bond, left: { letters: left } };
}

/**
 * Lines broken where another passes in front - a bridge drawn behind a
 * ring's bond, the gap left round it - joined again: two lines on one line,
 * a little apart, with a third crossing the gap.
 */
function joinedAcross(lines: readonly Stroke[], bond: number): Stroke[] {
  const out = [...lines];
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const s = out[i];
      const t = out[j];
      const u = unit(s.a, s.b);
      if (Math.abs(cross(u, unit(t.a, t.b))) > Math.sin((4 * Math.PI) / 180)) continue;
      if (Math.abs(cross(u, { x: t.a.x - s.a.x, y: t.a.y - s.a.y })) > 0.03 * bond) continue;
      // (their nearest ends, and the gap between them)
      const pairs: [Point, Point, Point, Point][] = [
        [s.a, s.b, t.a, t.b],
        [s.a, s.b, t.b, t.a],
        [s.b, s.a, t.a, t.b],
        [s.b, s.a, t.b, t.a],
      ];
      const [near0, far0, near1, far1] = pairs.reduce((p, q) => (dist(q[0], q[2]) < dist(p[0], p[2]) ? q : p));
      const gap = dist(near0, near1);
      if (gap < 0.05 * bond || gap > 0.4 * bond) continue;
      // (it must lie between them, not past one: the far ends further apart than the near ones)
      if (dist(far0, far1) < dist(near0, near1) + len(s) + len(t) - 0.01 * bond) continue;
      const m = mid(near0, near1);
      const crossed = out.some((o, k) => k !== i && k !== j && segmentsCross(o.a, o.b, near0, near1, m));
      if (!crossed) continue;
      out[i] = { a: far0, b: far1, w: Math.max(s.w, t.w) };
      out.splice(j, 1);
      j = i;
    }
  }
  return out;
}

/** Whether a line passes across the gap between two points, near its middle. */
function segmentsCross(a: Point, b: Point, p: Point, q: Point, m: Point): boolean {
  const d1 = cross(unit(a, b), { x: p.x - a.x, y: p.y - a.y });
  const d2 = cross(unit(a, b), { x: q.x - a.x, y: q.y - a.y });
  if (Math.sign(d1) === Math.sign(d2)) return false;
  const along = dot(unit(a, b), { x: m.x - a.x, y: m.y - a.y });
  return along > 0 && along < dist(a, b);
}

/**
 * The ring a circle is drawn in - an aromatic ring drawn with its circle,
 * not its double bonds: a round closed curve, as wide as a ring's inside,
 * its middle that of five to seven atoms round it in a cycle.
 */
function circledRing(c: Curve, atoms: readonly ReadAtom[], bonds: readonly ReadBond[], bond: number): ReadBond[] | null {
  if (!c.closed || c.pts.length < 8) return null;
  const m = c.pts.reduce((p, q) => ({ x: p.x + q.x / c.pts.length, y: p.y + q.y / c.pts.length }), { x: 0, y: 0 });
  const rs = c.pts.map((p) => dist(p, m));
  const r = rs.reduce((a, b) => a + b, 0) / rs.length;
  if (r < 0.3 * bond || r > 0.8 * bond || rs.some((x) => Math.abs(x - r) > 0.15 * r)) return null;
  const round = atoms.map((a, i) => ({ i, d: dist(a, m) })).filter((a) => a.d > r && a.d < 1.15 * bond).map((a) => a.i);
  if (round.length < 5 || round.length > 7) return null;
  const inRing = new Set(round);
  const ring = bonds.filter((b) => inRing.has(b.a) && inRing.has(b.b));
  // (a cycle: each atom with two of them)
  const n = new Map<number, number>();
  for (const b of ring) {
    n.set(b.a, (n.get(b.a) ?? 0) + 1);
    n.set(b.b, (n.get(b.b) ?? 0) + 1);
  }
  return ring.length === round.length && round.every((i) => n.get(i) === 2) ? ring : null;
}
