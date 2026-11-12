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
import { ELEMENTS } from "../chem/elements";
import { VARIABLE_NAMES } from "../chem/abbreviations";
import { narrowestBox, shapesOf, type Blob, type Box, type Curve, type FigureDrawn, type FigureLetter, type Point, type Shapes, type Stroke, type Wedge } from "./drawn";

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
  /** A radical's dots drawn by it: one, or two for a pair. */
  dots?: number;
  box?: Box;
  unsure?: string[];
  /** An atom of a repeat unit drawn in brackets with a whole count - (CH2)6 - to be read that many times (lib/figure/structure): its pair of brackets, by number in the figure, and the count. */
  repeat?: { group: number; n: number };
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
  /** A bond one of a repeat unit's brackets crosses, by the number of its pair of brackets (`ReadAtom.repeat`). */
  repeat?: { group: number };
};

/** A figure read: its atoms and bonds, how long its bonds are drawn, in points, and the letters in it not read as labels. */
/** A figure read: its atoms and bonds, how long its bonds are drawn, the letters no atom took - and the cells of a table drawn in it (`tableLines`), where one is. */
export type FigureRead = { atoms: ReadAtom[]; bonds: ReadBond[]; bond: number; left: { letters: FigureLetter[] }; table?: Box[] };

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
// (a hash's first strokes, at its narrow end, may be dots: no way of their own - a small filled
// shape not twice as long as wide; a line stroked has its path's way, however short, unless it is
// next to nothing long - a dot drawn as a line's round ends)
const dotOf = (s: Stroke, filled: ReadonlySet<Stroke>) => len(s) < (filled.has(s) ? 2 : 0.5) * s.w;

/** Two short strokes side by side as a hash's are: one way (or one a dot), near, the step from one to the next across them. */
function sideBySide(s: Stroke, t: Stroke, bond: number, filled: ReadonlySet<Stroke>): boolean {
  const [sDot, tDot] = [dotOf(s, filled), dotOf(t, filled)];
  if (sDot && tDot) return false;
  const [line, other] = sDot ? [t, s] : [s, t];
  const u = unit(line.a, line.b);
  if (!(sDot || tDot) && Math.abs(cross(u, unit(other.a, other.b))) > Math.sin((12 * Math.PI) / 180)) return false;
  const m = mid(s.a, s.b);
  const n = mid(t.a, t.b);
  const d = dist(m, n);
  // (a twenty-fifth of a bond apart at the least - or, a long bond's many lines set close, two and a half lines' widths)
  if (d > 0.4 * bond || d < Math.min(0.04 * bond, 2.5 * Math.max(s.w, t.w))) return false;
  // (the step from one to the next is across them)
  return Math.abs(dot(unit(m, n), u)) < Math.sin((35 * Math.PI) / 180);
}

function hashesOf(short: Stroke[], bond: number, filled: ReadonlySet<Stroke>): { hashes: Drawn[]; used: Set<Stroke>; groups: Stroke[][] } {
  const used = new Set<Stroke>();
  const hashes: Drawn[] = [];
  const groups: Stroke[][] = [];
  const dot_ = (s: Stroke) => dotOf(s, filled);
  const near = (s: Stroke, t: Stroke) => sideBySide(s, t, bond, filled);
  const left = new Set(short);
  // (each in turn - those a group let go again at the end, to group anew)
  const queue = [...short];
  const letGo = new Set<Stroke>();
  for (let q = 0; q < queue.length; q++) {
    const s = queue[q];
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
    // (its lines all one way, as thick as the rest: lines another way, reached through a dot - two hashes meeting at
    // an atom, joined by its joints' dots - are another's, let go)
    const widest = Math.max(0, ...group.filter((g) => !dot_(g)).map((g) => g.w));
    const ways = group.filter((g) => !dot_(g) && g.w >= 0.5 * widest);
    const oneWay = (g: Stroke, h: Stroke) => Math.abs(cross(unit(g.a, g.b), unit(h.a, h.b))) < Math.sin((15 * Math.PI) / 180);
    const most = ways.reduce<Stroke | null>((p, g) => (!p || ways.filter((h) => oneWay(g, h)).length > ways.filter((h) => oneWay(p, h)).length ? g : p), null);
    if (most && ways.filter((h) => oneWay(most, h)).length * 2 > ways.length) {
      for (const g of ways) {
        if (oneWay(most, g)) continue;
        group.splice(group.indexOf(g), 1);
        left.add(g);
        queue.push(g);
        letGo.add(g);
      }
    }
    // (three at the least, one a line of some width: the dots of joints by a bond's end and a sliver of nothing - a
    // C=O's joints - are none)
    // (lines let go by another hash - its first dot kept there - may be two)
    if (group.length < (group.every((g) => letGo.has(g)) ? 2 : 3) || !group.some((g) => !dot_(g) && g.w > 1e-3 * bond)) {
      for (const t of group) if (t !== s) left.add(t);
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
    // (which end is narrow, by its lines as thick as the rest - not its dots, nor a thinner piece: a joint of the bonds
    // at either end, its wide end's too, may be drawn as one)
    const thickest = Math.max(0, ...order.filter((o) => !dot_(o.g)).map((o) => o.g.w));
    const lines = order.filter((o) => !dot_(o.g) && o.g.w >= 0.5 * thickest);
    const [r0, r1] = lines.length >= 2 ? [lines[0], lines[lines.length - 1]] : [first, last];
    const l0 = len(r0.g);
    const l1 = len(r1.g);
    let [a, b] = [at(first.t - step / 2), at(last.t + step / 2)];
    if (l0 > l1 * 1.25) [a, b] = [b, a];
    const either = l1 <= l0 * 1.25 && l0 <= l1 * 1.25;
    for (const o of order) used.add(o.g);
    hashes.push({ a, b, order: 1, stereo: "down", ...(either ? { either: true } : {}) });
    groups.push(order.map((o) => o.g));
  }
  return { hashes, used, groups };
}

/**
 * Lines side by side - parallel, a fifth of a bond or so apart, alongside
 * each other for most of the shorter - are one bond, double or triple.
 * Its ends are those of the longest line where one is longer (a ring's
 * double bond, its second line inside and shorter), or of the line through
 * their middle where none is.
 */
function multiples(lines: Stroke[], bond: number, bold: (s: Stroke) => boolean = () => false): { bonds: Drawn[]; used: Set<Stroke> } {
  const used = new Set<Stroke>();
  const bonds: Drawn[] = [];
  const pair = (s: Stroke, t: Stroke) => {
    // (a bold line is the near edge of a double bond - its second line a thin one, shorter, inside it - or a single bond; a thin line as
    // long as it, a chair's back bond beside its front one, is another bond's, and a bold line is never one of three)
    const [longer, shorter] = len(s) >= len(t) ? [s, t] : [t, s];
    if (bold(shorter) || (bold(longer) && len(shorter) >= 0.85 * len(longer))) return false;
    const u = unit(s.a, s.b);
    if (Math.abs(cross(u, unit(t.a, t.b))) > Math.sin((8 * Math.PI) / 180)) return false;
    const off = Math.abs(cross(u, { x: mid(t.a, t.b).x - s.a.x, y: mid(t.a, t.b).y - s.a.y }));
    if (off < 0.06 * bond || off > 0.4 * bond) return false;
    const ta = dot(u, { x: t.a.x - s.a.x, y: t.a.y - s.a.y });
    const tb = dot(u, { x: t.b.x - s.a.x, y: t.b.y - s.a.y });
    const overlap = Math.min(len(s), Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb));
    return overlap > 0.7 * Math.min(len(s), len(t));
  };
  const left = new Set(lines);
  for (const s of lines) {
    if (!left.has(s)) continue;
    const group = [s];
    left.delete(s);
    for (let i = 0; i < group.length && group.length < 3; i++) {
      for (const t of [...left]) {
        if (group.length < (group.some(bold) ? 2 : 3) && pair(group[i], t)) {
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
      // (the longer line's ends, the second drawn inside it - but where the two end together at one end and the longer runs on alone
      // past the other, to nothing, while the shorter ends there by other lines' ends, it ran on past its atom: that end is the
      // shorter's, taken onto the longer)
      const [l0, l1] = sorted;
      const along = (p: Point) => dot(u, { x: p.x - l0.a.x, y: p.y - l0.a.y });
      const on = (t: number): Point => ({ x: l0.a.x + u.x * t, y: l0.a.y + u.y * t });
      const [s0, s1] = [along(l1.a), along(l1.b)].sort((p, q) => p - q);
      const [e0, e1] = [along(l0.a), along(l0.b)].sort((p, q) => p - q);
      const others = lines.filter((m) => !group.includes(m)).flatMap((m) => [m.a, m.b]);
      const byOthers = (p: Point, r: number) => others.some((q) => dist(p, q) < r * bond);
      const ranOn = (alone: Point, short: Point) => !byOthers(alone, 0.15) && byOthers(short, 0.25);
      if (Math.abs(s1 - e1) < 0.1 * bond && s0 - e0 > 0.2 * bond && ranOn(on(e0), on(s0))) ends = [on(s0), on(e1)];
      else if (Math.abs(s0 - e0) < 0.1 * bond && e1 - s1 > 0.2 * bond && ranOn(on(e1), on(s1))) ends = [on(e0), on(s1)];
      else ends = [l0.a, l0.b];
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
    bonds.push({ a: ends[0], b: ends[1], order: group.length as 2 | 3, ...(group.some(bold) ? { bold: true } : {}) });
  }
  return { bonds, used };
}

/**
 * Whether line `s` lies along line `t`: within 3 degrees of its direction, its middle within 0.06 of a bond of the line through `t`, and both its ends
 * within `t`'s stretch, 0.05 of a bond past either end at the most (a bold bar's hairline: the same line, never a second one).
 */
export function lyingAlong(s: Stroke, t: Stroke, bond: number): boolean {
  const u = unit(t.a, t.b);
  if (Math.abs(cross(u, unit(s.a, s.b))) > Math.sin((3 * Math.PI) / 180)) return false;
  const off = (p: Point) => Math.abs(cross(u, { x: p.x - t.a.x, y: p.y - t.a.y }));
  const at = (p: Point) => dot(u, { x: p.x - t.a.x, y: p.y - t.a.y });
  return off(mid(s.a, s.b)) < 0.06 * bond && [s.a, s.b].every((p) => at(p) > -0.05 * bond && at(p) < len(t) + 0.05 * bond);
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

/** How thin a round-capped mark is at the most, in bonds, to be a hash's: its line or its dot. */
const THIN_MARK = 0.16;

/** How many times the thin lines' width a line is, at the least, to be bold: a perspective drawing's near edge is a little over twice it. */
const BOLD_TIMES = 1.8;

const SYMBOLS = new Set(ELEMENTS.map((e) => e.symbol));
/** Whether a label is an element's symbol alone, with its H and charge (N, OH, Cl-): no group's name (Me is one). */
const isElementSymbolLike = (text: string) => {
  const m = /^([A-Z][a-z]?)(H\d*)?[+-]?$/.exec(text);
  return !!m && SYMBOLS.has(m[1]);
};

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
      // (a smaller letter set high or low - a charge, a count - its, however little of it lies level with the word: a serif's capitals are lower)
      const small = l.size < 0.85 * w.size ? l.box : w.size < 0.85 * l.size ? w.box : null;
      const other = small === l.box ? w.box : l.box;
      const setOff = !!small && (small[1] < other[1] || small[3] > other[3]);
      // (two capitals as large, not on one line - two labels drawn over each other, two H's of atoms side by side - are two)
      const capital = (x: FigureLetter) => /^[A-IK-PR-Z]$/.test(x.c);
      if (!small && capital(l) && capital(last) && Math.abs(l.box[3] - last.box[3]) > 0.25 * big) return false;
      // (nor a letter as large as the word's own whose line is not theirs: its baseline a tenth of a letter off theirs, however the
      // word ends - a small count, an H set a little lower beside another)
      const base = (x: FigureLetter) => x.at?.[1] ?? x.box[3];
      const own = w.letters.filter((x) => x.size >= 0.85 * big);
      if (l.size >= 0.85 * big && own.length && Math.abs(base(l) - base(own[own.length - 1])) > 0.1 * big) return false;
      // (or as the PDF sets them, each letter's room: a 1's ink stands well inside its room, and small letters may be set apart)
      const looseGap = last.loose && l.loose ? l.loose[0] - last.loose[2] : Infinity;
      // (two letters as large set over each other, their rooms well into each other - two labels drawn on top of each other, two H's of
      // atoms side by side - are two; a smaller letter set high or low may stand in its letter's room)
      if (!small && looseGap < -0.15 * big) return false;
      const near = (gap > -0.3 * big && gap < 0.3 * big) || (looseGap > -0.3 * big && looseGap < 0.15 * big);
      return near && (overlap > 0.25 * Math.min(lh, w.box[3] - w.box[1]) || (setOff && overlap > 0));
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

/** What tells whether a label reads as an atom or a group (Meno's label reader): the figure reader is given it, and asks it where a small number is a count or an atom's. */
export type LabelReads = (label: string) => boolean;

/** How far a letter is raised, in the label's letter size, at the least, to be set high - a charge, a mass number, an atom's number: labelText's own constant. */
const HIGH = 0.25;

/**
 * Where a small digit is an atom's number and not a count, a charge's or a name's (the small numbers beside atoms in a drawing):
 *  - `locants`: digits set clearly HIGH (raised `HIGH` of the letter size or more), after anything but a variable's name and with no charge's sign
 *    after them: an atom's number. A count is never set high.
 *  - `uncertain`: digits set about level or a little low - not more than a tenth of the letter size below - where the place cannot say: left out only
 *    if the label reads as nothing with them and reads without them (`labelText`).
 * A digit after a variable's name (VARIABLE_NAMES: R, X, Ar, Het1 ...) is part of it, wherever it is set; one with a charge's sign after it is the
 * charge's (Ca2+); one before the label's first letter a mass number (13C). Their places in `w.letters`.
 */
function locantsOf(w: Word, base: number): { locants: Set<number>; uncertain: Set<number> } {
  const locants = new Set<number>();
  const uncertain = new Set<number>();
  const small = (l: FigureLetter) => l.size < 0.85 * w.size;
  const digit = (l: FigureLetter) => /^\d$/.test(l.c);
  const y = (l: FigureLetter) => l.at?.[1] ?? l.box[3];
  const high = (l: FigureLetter) => y(l) < base - HIGH * w.size;
  const level = (l: FigureLetter) => y(l) < base + 0.1 * w.size;
  let letter = false;
  for (let i = 0; i < w.letters.length; i++) {
    const l = w.letters[i];
    if (!small(l)) {
      letter = true;
      continue;
    }
    if (!letter || !digit(l) || !level(l)) continue;
    // (the unit just before the digit - the last capital with its small letters, the label's own size, a number after the one before it and primes left out - is a variable's name: R1, OR2, NR1R2, CO2R1, OAr1, R2O)
    const before = w.letters.slice(0, i).filter((x) => !small(x)).map((x) => x.c).join("").replace(/['\u2032\u2033]+$/, "");
    const name = /[A-Z][a-z]*$/.exec(before)?.[0];
    const named = !!name && VARIABLE_NAMES.has(name);
    // (the run of such digits, and what follows it)
    let j = i;
    while (j + 1 < w.letters.length && small(w.letters[j + 1]) && digit(w.letters[j + 1]) && level(w.letters[j + 1])) j++;
    const next = w.letters[j + 1];
    const charge = !!next && small(next) && /^[+\-\u2212\u2013]$/.test(next.c);
    if (!named && !charge) {
      const run = w.letters.slice(i, j + 1);
      for (let k = i; k <= j; k++) (run.every(high) ? locants : uncertain).add(k);
    }
    i = j;
  }
  return { locants, uncertain };
}

/**
 * A word as a label is typed: a smaller letter set low a subscript's digit,
 * set high a charge - written as they are typed, NH2, N+, O- - and digits
 * set high before its first letter an isotope's mass number (13C), so that
 * Meno reads it as it reads a label typed. A count set low before any
 * letter is a letter's left out of the word (the H of an H3N, a box cut
 * across it), and is left out with it: never a mass number. A number set
 * small by an atom's label - the locants beside atoms, "Me7" for a Me and its
 * number 7 - is left out where it is clearly high (and no variable's name
 * or charge's sign is by it: `locantsOf`), and where it is about level or a
 * little low only if the label reads as nothing with it and reads without it
 * (`reads`: no reader given, none is taken for a locant - a count is kept).
 */
export function labelText(w: Word, reads: LabelReads = () => true): string {
  const main = w.letters.filter((l) => l.size >= 0.85 * w.size);
  const base = main.length ? main.map((l) => l.at?.[1] ?? l.box[3]).sort((a, b) => a - b)[Math.floor(main.length / 2)] : 0;
  const { locants, uncertain } = locantsOf(w, base);
  const plain = typed(w, base, locants);
  if (!uncertain.size) return plain;
  const without = typed(w, base, new Set([...locants, ...uncertain]));
  return !reads(plain) && reads(without) ? without : plain;
}

/** A word's letters as a label is typed, those at `left` out (`labelText`). */
function typed(w: Word, base: number, left: ReadonlySet<number>): string {
  let lead = true;
  return w.letters
    .map((l, k) => {
      if (left.has(k)) return "";
      // (a letter the PDF gives no character for - a control code - drawn flat, more than twice as wide as tall, is a minus: a
      // hyphen printed so by WebKit)
      const code = l.c.length === 1 ? l.c.charCodeAt(0) : -1;
      const flat = (code >= 0 && code < 0x20) || code === 0xfffd ? l.box[2] - l.box[0] > 2 * (l.box[3] - l.box[1]) : false;
      const c = l.c === "\u2212" || l.c === "\u2013" || flat ? "-" : l.c;
      if (l.size >= 0.85 * w.size) {
        lead = false;
        return c;
      }
      const y = l.at?.[1] ?? l.box[3];
      // (set high: a charge, or a mass number; set low, or as low: a count - one before any letter, no one's here)
      if (y < base - HIGH * w.size) return c === "+" || c === "-" ? c : `^${c}`;
      return lead && /\d/.test(c) ? "" : c;
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
function labelOf(w: Word, reads: LabelReads = () => true): Pick<ReadAtom, "label" | "alts" | "unsure"> {
  const label = labelText(w, reads);
  const shaped = w.letters.filter((l): l is ShapeLetter => "sure" in l);
  if (!shaped.length) return { label };
  const as = (swap: Map<number, string>) => labelText({ ...w, letters: w.letters.map((l, k) => (swap.has(k) ? { ...l, c: swap.get(k)! } : l)) }, reads);
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
function reaches(p: Point, out: Point, b: Box, bond: number, within = 0.35): boolean {
  const pad = 0.08 * bond;
  const [x0, y0, x1, y1] = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
  if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) return true;
  // (where the ray from p meets the box: slab by slab)
  let t0 = 0;
  let t1 = within * bond;
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
 * Whether a word goes on as a line of text past it, rightward or leftward:
 * another word on its baseline beyond it, a space and a comma off at most,
 * that reads as no label - the line of a caption, "3aa, R = H, 73%", whose
 * sign between two of its words is no bond, as it is where the line goes on
 * past both (a row of labels, HO-P-O-P, is a chain).
 */
function lineGoesOn(w: Word, words: readonly Word[], right: boolean, reads: (label: string) => boolean): boolean {
  return words.some((v) => {
    if (v === w || Math.abs(v.box[3] - w.box[3]) > 0.3 * w.size || reads(labelText(v, reads))) return false;
    const gap = right ? v.box[0] - w.box[2] : w.box[0] - v.box[2];
    return gap > -0.1 * w.size && gap < 1.2 * w.size;
  });
}

/**
 * Bonds between two labels drawn so close that little of them is left - a
 * sulfonyl's S=O: a bit between two words, each on its other side, is a
 * bond between them; two bits side by side, a double one.
 */
function dashes(bits: readonly Stroke[], words: readonly Word[], bond: number, reads: (label: string) => boolean): Drawn[] {
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
    // (a sign between two words of a line of text is none: lineGoesOn)
    const [l, r] = pair[0].c.x < pair[1].c.x ? pair : [pair[1], pair[0]];
    if (Math.abs(unit(l.c, r.c).x) >= 0.9 && lineGoesOn(words[l.k], words, false, reads) && lineGoesOn(words[r.k], words, true, reads)) continue;
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
 * lines do not), longer than its letters are tall and no more than six
 * times as long as its labels' letters would have a bond.
 */
export function figureBond(shapes: Shapes, letters: readonly FigureLetter[]): number {
  // (another's end: a line's in a path of several meets the next's, though they share the point)
  const tips = [...shapes.strokes.flatMap((s) => [{ p: s.a, of: s as object }, { p: s.b, of: s as object }]), ...shapes.wedges.flatMap((w) => [{ p: w.tip, of: w as object }, { p: w.base, of: w as object }])];
  const meets = (s: Stroke) => {
    const r = 0.12 * len(s);
    return [s.a, s.b].some((p) => tips.some((q) => q.of !== s && dist(p, q.p) < r));
  };
  const joined = shapes.strokes.filter(meets);
  // (of those, the ones meeting another other than square: a frame's sides and a graph's axes meet square)
  const angled = joined.filter((s) => {
    const r = 0.12 * len(s);
    return [s.a, s.b].some((p) => shapes.strokes.some((t) => t !== s && [t.a, t.b].some((q) => dist(p, q) < r && !square(s, p, t, q))));
  });
  const sizes = letters.map((l) => l.size).sort((a, b) => a - b);
  const least = sizes.length ? 0.6 * sizes[Math.floor(sizes.length / 2)] : 0;
  // (and no longer than six bonds as long as its labels are set would have them: a page's rules, a graph's frame, are none. The
  // labels: capitals by a line's end - a caption's letters, set larger or smaller, at none - or, there being none, every letter)
  const ends = [...shapes.strokes.flatMap((s) => [s.a, s.b]), ...shapes.wedges.flatMap((w) => [w.tip, w.base])];
  const byEnd = letters.filter((l) => /[A-Z]/.test(l.c) && ends.some((p) => fromBox(p, l.box) < l.size));
  const labelSizes = (byEnd.length ? byEnd : letters).map((l) => l.size).sort((a, b) => a - b);
  const most = labelSizes.length ? 6 * BOND_PER_SIZE * labelSizes[Math.floor(labelSizes.length / 2)] : Infinity;
  // (lines meeting, every one of them square - a frame, a graph's axes - and no wedge: no structure is drawn, no bond; a cyclobutane
  // drawn alone, a square, is so too)
  if (joined.length && !angled.length && !shapes.wedges.length) return 0;
  const lengths = [...(joined.length ? joined : shapes.strokes).map(len), ...shapes.wedges.map((w) => dist(w.tip, w.base))].filter((l) => l <= most);
  let found = bondLength(lengths, least);
  // (where every line of the length found meets the others only square - a frame's sides, round a graph or a part of the figure - it is
  // none: the length of the rest)
  const squareOnly = (s: Stroke) => {
    const r = 0.12 * len(s);
    const met = [s.a, s.b].flatMap((p) => shapes.strokes.flatMap((t) => (t === s ? [] : [t.a, t.b].filter((q) => dist(p, q) < r).map((q) => ({ p, t, q })))));
    return met.length > 0 && met.every(({ p, t, q }) => square(s, p, t, q));
  };
  const ofFound = joined.filter((s) => Math.abs(len(s) - found) <= found / 8);
  if (found && ofFound.length && ofFound.every(squareOnly)) found = bondLength(lengths.filter((l) => Math.abs(l - found) > found / 8), least);
  if (found) return found;
  // (every line drawn short of a label at either end - a metal's bonds, Pt to N and Cl: each measured on to the middles of the letters it is cut short of)
  const by = (p: Point) => {
    const near = letters.filter((l) => /[A-Za-z]/.test(l.c) && fromBox(p, l.box) < 0.5 * l.size);
    return near.length ? Math.min(...near.map((l) => dist(p, centre(l.box)))) : 0;
  };
  return bondLength(
    shapes.strokes.map((s) => len(s) + by(s.a) + by(s.b)).filter((l) => l <= most),
    least,
  );
}

/**
 * A table's lines (`readFigure`): level and upright lines bounding cells -
 * two level lines, each over the other's stretch, and two upright between
 * them reaching from one to the other - where two cells or more share a
 * side, as a table's rows and columns do; and short level or upright
 * lines set within such a cell, its dashes - and its cells, whose words
 * are the table's. Cells are looked for between a level line and the next
 * below it, so that a table of many rows is read in time.
 */
function tableLines(strokes: readonly Stroke[], bond: number): { lines: Set<Stroke>; cells: Box[] } {
  const out = new Set<Stroke>();
  const none = { lines: out, cells: [] };
  const tol = 0.12 * bond;
  const level = (s: Stroke) => len(s) > 0.3 * bond && Math.abs(s.a.y - s.b.y) <= 0.03 * len(s);
  const upright = (s: Stroke) => len(s) > 0.3 * bond && Math.abs(s.a.x - s.b.x) <= 0.03 * len(s);
  const hs = strokes.filter(level).map((s) => ({ s, y: (s.a.y + s.b.y) / 2, x0: Math.min(s.a.x, s.b.x), x1: Math.max(s.a.x, s.b.x) }));
  const vs = strokes.filter(upright).map((s) => ({ s, x: (s.a.x + s.b.x) / 2, y0: Math.min(s.a.y, s.b.y), y1: Math.max(s.a.y, s.b.y) }));
  if (hs.length < 2 || vs.length < 3) return none;
  hs.sort((p, q) => p.y - q.y);
  vs.sort((p, q) => p.x - q.x);
  type Cell = { box: [number, number, number, number]; sides: Stroke[] };
  const cells: Cell[] = [];
  for (let i = 0; i < hs.length; i++) {
    const top = hs[i];
    // (the next level lines below it over the same stretch, depth by depth - a dash in a cell is passed over, its row's line below
    // making the cell - until a cell is made, or four bonds down)
    let made = false;
    for (let j = i + 1; j < hs.length && !made; ) {
      if (hs[j].y - top.y <= tol) {
        j++;
        continue;
      }
      if (hs[j].y - top.y > 4 * bond) break;
      const depth = hs[j].y;
      const below: typeof hs = [];
      for (; j < hs.length && hs[j].y - depth <= tol; j++) if (Math.min(top.x1, hs[j].x1) - Math.max(top.x0, hs[j].x0) > tol) below.push(hs[j]);
      for (const bot of below) {
        const [x0, x1] = [Math.max(top.x0, bot.x0) - tol, Math.min(top.x1, bot.x1) + tol];
        const sides = vs.filter((v) => v.x >= x0 && v.x <= x1 && v.y0 <= top.y + tol && v.y1 >= bot.y - tol);
        for (let k = 0; k + 1 < sides.length; k++) {
          if (sides[k + 1].x - sides[k].x <= tol) continue;
          cells.push({ box: [sides[k].x, top.y, sides[k + 1].x, bot.y], sides: [top.s, bot.s, sides[k].s, sides[k + 1].s] });
          made = true;
        }
      }
    }
  }
  // (cells sharing a side: a table's)
  const count = new Map<Stroke, number>();
  for (const c of cells) for (const s of c.sides) count.set(s, (count.get(s) ?? 0) + 1);
  const ofTable = cells.filter((c) => c.sides.some((s) => (count.get(s) ?? 0) > 1));
  if (ofTable.length < 2) return none;
  for (const c of ofTable) for (const s of c.sides) out.add(s);
  // (and a short line, level or upright, within one of its cells, alone - no other line ending at either of its ends, as a bond's
  // do: a dash in it)
  const ends = strokes.flatMap((t) => [t.a, t.b].map((p) => ({ p, t })));
  const alone = (s: Stroke) => [s.a, s.b].every((p) => !ends.some((e) => e.t !== s && dist(e.p, p) < tol));
  for (const s of strokes) {
    if (out.has(s) || len(s) > 0.8 * bond || !(Math.abs(s.a.y - s.b.y) <= 0.03 * len(s) || Math.abs(s.a.x - s.b.x) <= 0.03 * len(s)) || !alone(s)) continue;
    const m = mid(s.a, s.b);
    if (ofTable.some((c) => m.x > c.box[0] && m.x < c.box[2] && m.y > c.box[1] && m.y < c.box[3])) out.add(s);
  }
  return { lines: out, cells: ofTable.map((c) => c.box) };
}

/** Whether two lines meet square at their ends `p` (of `s`) and `q` (of `t`): between 75 and 105 degrees, as a frame's sides and a graph's axes do. */
function square(s: Stroke, p: Point, t: Stroke, q: Point): boolean {
  const u = unit(p, dist(s.a, p) < dist(s.b, p) ? s.b : s.a);
  const v = unit(q, dist(t.a, q) < dist(t.b, q) ? t.b : t.a);
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI;
  return angle >= 75 && angle <= 105;
}

/** How far apart two boxes lie: nothing where they meet. */
function boxGap(a: Box, b: Box): number {
  return Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
}

/** How many bonds an element in a label takes, its hydrogens and charge aside: an NH2's N one, an OH's O one. */
const BONDS_LEFT: Record<string, number> = { N: 3, O: 2, S: 2, P: 3, B: 3, Si: 4, Se: 2 };

/** How large a radical's dot is drawn at most, in bonds (at least half as wide again as a line). */
const DOT = 0.16;

/** How far an ion is set from the structure at most - or from the ion before it, in a row of them - in bonds, the gap between them. */
const ION_BY = 2.5;
const BOND_PER_SIZE = 1.4;

/**
 * A repeat unit drawn in brackets with its count - (CH2)6 drawn out, a
 * polymer's [ ]n (docs/PDF.md, *A repeat unit in brackets*): a pair of
 * brackets, each a line or a curve across a bond, the count - digits, or
 * one small letter - at the lower end of one. Its brackets are read as no
 * bonds and its count as no word. Found where a line or a curve half a
 * bond to two and a half long crosses a line of the figure square enough,
 * away from both their ends - or a wedge's, a hash's (`hashed`) or a wavy
 * bond's, from end to end, as its bond lies - with a count by its lower end; its partner,
 * where there is one, the nearest other such line or curve that crosses
 * one, with no count (`pairs`). What the figure makes of each pair, as it
 * reads its bonds (`repeatsRead`): a whole count's unit read that many
 * times, where the brackets cut it off as one; else - a letter's, a
 * polymer's n, or a shape no unit is cut off by - the unit drawn once, the
 * atoms of each bond a bracket crosses marked, saying why.
 */
export type RepeatBrackets = { strokes: Set<Stroke>; curves: Set<Curve>; counts: Set<number>; pairs: { count: string; brackets: { ends: [Point, Point]; crosses: Stroke[] }[] }[] };

/** What the atoms of a bond a polymer's bracket crosses are marked with: its count a letter (`repeatsRead`). */
export const REPEAT_UNREAD = (count: string) => `A repeat unit in brackets, counted ${count}, is not read: it is drawn here once.`;

/** What the atoms of a bond a bracket crosses are marked with, where its whole count's unit cannot be read so many times: why (`repeatsRead`). */
export const REPEAT_REFUSED = (count: string, why: string) => `A repeat unit in brackets, counted ${count}, is not read: ${why}. It is drawn here once.`;

/**
 * Where two segments cross, as how far along each they meet - none where they do not, or meet at or near an end of either;
 * `piece`: `s` a piece of a curve, taken anywhere along it from its start to short of its end - a curve's pieces end where
 * the next begins, so that a crossing where two meet is its own.
 */
function crossing(s: { a: Point; b: Point }, t: { a: Point; b: Point }, piece = false): { u: number; v: number } | null {
  const r = { x: s.b.x - s.a.x, y: s.b.y - s.a.y };
  const q = { x: t.b.x - t.a.x, y: t.b.y - t.a.y };
  const d = cross(r, q);
  if (Math.abs(d) < 1e-9) return null;
  const w = { x: t.a.x - s.a.x, y: t.a.y - s.a.y };
  const u = cross(w, q) / d;
  const v = cross(w, r) / d;
  const along = piece ? u >= 0 && u < 1 : u > 0.1 && u < 0.9;
  return along && v > 0.1 && v < 0.9 ? { u, v } : null;
}

export function repeatBrackets(shapes: Shapes, words: readonly Word[], bond: number, hashed: readonly Drawn[] = []): RepeatBrackets {
  const out: RepeatBrackets = { strokes: new Set(), curves: new Set(), counts: new Set(), pairs: [] };
  // (a wedge, hashes or a wavy line, as the line its bond lies along: a bracket across one is one - no line of it a bond, its
  //  count no word - for the unit to be refused as it is read (`repeatsRead`); a hash's strokes run along a bracket, crossing none)
  const stereoLines = [
    ...shapes.wedges.map((w) => ({ a: w.tip, b: w.base })),
    ...hashed.map((h) => ({ a: h.a, b: h.b })),
    ...shapes.curves.flatMap((c) => {
      const d = wavy(c, bond);
      return d ? [{ a: d.a, b: d.b }] : [];
    }),
  ].map((l): Stroke => ({ ...l, w: 0 }));
  const bondLines = [...shapes.strokes.filter((t) => len(t) >= 0.3 * bond), ...stereoLines];
  // (a bracket: a line, or a curve's chord, of half a bond to two and a half, across a bond line at more than 45 degrees)
  type Bracket = { ends: [Point, Point]; stroke?: Stroke; curve?: Curve; crosses: Stroke[] };
  const across = (seg: { a: Point; b: Point }, not?: Stroke, piece = false) =>
    bondLines.filter((t) => t !== not && crossing(seg, t, piece) && Math.abs(cross(unit(seg.a, seg.b), unit(t.a, t.b))) > Math.SQRT1_2);
  // (its ends free: at no other line's end but its own ticks', and into no label - a bond's meet others', or a label)
  const counts = (w: Word) => /^(\d{1,3}|[a-z])$/.test(w.letters.map((l) => l.c).join(""));
  const free = (p: Point, not?: Stroke) =>
    !shapes.strokes.some((t) => t !== not && len(t) >= 0.45 * bond && Math.min(dist(p, t.a), dist(p, t.b)) < 0.1 * bond) &&
    !shapes.wedges.some((w) => Math.min(dist(p, w.tip), dist(p, w.base)) < 0.1 * bond) &&
    !words.some((w) => !counts(w) && fromBox(p, w.box) < 0.15 * bond);
  const brackets: Bracket[] = [];
  for (const s of shapes.strokes) {
    if (len(s) < 0.5 * bond || len(s) > 2.5 * bond || !free(s.a, s) || !free(s.b, s)) continue;
    const crosses = across(s, s);
    if (crosses.length) brackets.push({ ends: [s.a, s.b], stroke: s, crosses });
  }
  for (const c of shapes.curves) {
    if (c.closed || c.pts.length < 2) continue;
    const ends: [Point, Point] = [c.pts[0], c.pts[c.pts.length - 1]];
    const chord = dist(ends[0], ends[1]);
    if (chord < 0.5 * bond || chord > 2.5 * bond || !free(ends[0]) || !free(ends[1])) continue;
    const crosses = [...new Set(c.pts.slice(1).flatMap((p, i) => across({ a: c.pts[i], b: p }, undefined, true)))];
    if (crosses.length) brackets.push({ ends, curve: c, crosses });
  }
  // (a line that crosses brackets alone is none: a double bond's second line, across a bracket over it - each bracket's
  //  crossings its bonds, not another bracket)
  const ofBrackets = new Set<Stroke>(brackets.flatMap((b) => (b.stroke ? [b.stroke] : [])));
  const real = brackets.filter((b) => b.crosses.some((t) => !ofBrackets.has(t)));
  const realLines = new Set<Stroke>(real.flatMap((b) => (b.stroke ? [b.stroke] : [])));
  brackets.splice(0, brackets.length, ...real.map((b) => ({ ...b, crosses: b.crosses.filter((t) => !realLines.has(t)) })));
  // (its count: digits, or one small letter, set by its lower end - the page's y running down - the nearest, where two
  //  brackets' counts are set close)
  const lowOf = (b: Bracket) => (b.ends[0].y > b.ends[1].y ? b.ends[0] : b.ends[1]);
  const countAt = (b: Bracket) => {
    const low = lowOf(b);
    let best = -1;
    words.forEach((w, k) => {
      if (counts(w) && fromBox(low, w.box) < 0.6 * bond && centre(w.box).y > low.y - 0.25 * bond && (best < 0 || fromBox(low, w.box) < fromBox(low, words[best].box))) best = k;
    });
    return best;
  };
  const take = (b: Bracket) => {
    if (b.stroke) out.strokes.add(b.stroke);
    if (b.curve) out.curves.add(b.curve);
    // (a square bracket's ticks: the short lines from its ends)
    for (const t of shapes.strokes) if (len(t) < 0.45 * bond && b.ends.some((e) => Math.min(dist(e, t.a), dist(e, t.b)) < 0.1 * bond)) out.strokes.add(t);
  };
  const near = brackets.flatMap((b) => {
    const k = countAt(b);
    return k >= 0 ? [{ b, k, d: fromBox(lowOf(b), words[k].box) }] : [];
  });
  // (a count is the bracket's whose foot it is nearest: another that has it in reach is uncounted - its partner, where it is one)
  const counted = near.filter((c) => !near.some((o) => o.k === c.k && o.d < c.d));
  const mid = (b: Bracket) => ({ x: (b.ends[0].x + b.ends[1].x) / 2, y: (b.ends[0].y + b.ends[1].y) / 2 });
  for (const { b, k } of counted) {
    if (out.counts.has(k)) continue;
    const count = words[k].letters.map((l) => l.c).join("");
    out.counts.add(k);
    // (its partner: the nearest other line or curve across a bond, uncounted)
    const partner = brackets
      .filter((o) => o !== b && !counted.some((c) => c.b === o) && !(o.stroke && out.strokes.has(o.stroke)) && !(o.curve && out.curves.has(o.curve)))
      .sort((x, y) => dist(mid(x), mid(b)) - dist(mid(y), mid(b)))[0];
    for (const one of partner ? [b, partner] : [b]) take(one);
    out.pairs.push({ count, brackets: (partner ? [b, partner] : [b]).map((one) => ({ ends: one.ends, crosses: one.crosses })) });
  }
  return out;
}

/**
 * Each pair of a repeat unit's brackets (`repeatBrackets`) as the figure's
 * atoms and bonds read it: where its count is a whole number and its two
 * brackets cut a unit off - each crossing one bond of the figure (a line
 * of the figure, a wedge or hashes no bracket's), the two bonds other
 * bonds, of one order, and what lies between them
 * joined to the rest by those two bonds alone - the unit's atoms and the
 * two bonds marked, to be read that many times (`ReadAtom.repeat`,
 * `ReadBond.repeat`; lib/figure/structure); else the atoms of each bond a
 * bracket crosses marked, saying why it is drawn once: a letter's, a
 * polymer's n (`REPEAT_UNREAD`), or the rule its shape breaks
 * (`REPEAT_REFUSED`) - among them a unit within another, or holding one,
 * and two units whose brackets cross one bond.
 */
export function repeatsRead(pairs: RepeatBrackets["pairs"], atoms: ReadAtom[], bonds: ReadBond[], bond: number, near: (a: ReadAtom, p: Point) => number): void {
  const atomAt = (p: Point) => {
    let best = -1;
    for (let i = 0; i < atoms.length; i++) if (near(atoms[i], p) < 0.3 * bond && (best < 0 || near(atoms[i], p) < near(atoms[best], p))) best = i;
    return best;
  };
  const say = (lines: readonly Stroke[], said: string) => {
    for (const line of lines)
      for (const end of [line.a, line.b]) {
        const i = atomAt(end);
        if (i >= 0 && !atoms[i].unsure?.includes(said)) atoms[i] = { ...atoms[i], unsure: [...(atoms[i].unsure ?? []), said] };
      }
  };
  // (each pair's unit, where it reads as one - marked only once none is found to hold, lie in, or share a crossed bond with another)
  const found: { group: number; n: number; count: string; lines: Stroke[]; unit: number[]; cross: [number, number] }[] = [];
  pairs.forEach(({ count, brackets }, group) => {
    const lines = brackets.flatMap((b) => b.crosses);
    if (!/^\d+$/.test(count)) return say(lines, REPEAT_UNREAD(count));
    const n = Number.parseInt(count, 10);
    const refuse = (why: string) => say(lines, REPEAT_REFUSED(count, why));
    if (n < 1) return refuse("a count of 0 is no unit");
    if (brackets.length < 2) return refuse("it has one bracket, and no other is found across a bond to close the unit");
    // (the bonds each crosses: the one between the atoms at each line's ends - a double bond's two lines one bond)
    const bondOf = (line: Stroke) => {
      const [i, j] = [atomAt(line.a), atomAt(line.b)];
      return i < 0 || j < 0 ? -1 : bonds.findIndex((b) => (b.a === i && b.b === j) || (b.a === j && b.b === i));
    };
    const crossing = brackets.map((b) => [...new Set(b.crosses.map(bondOf))]);
    if (crossing.some((c) => c.includes(-1))) return refuse("a bracket crosses a line that is no bond");
    if (crossing.some((c) => c.length !== 1)) return refuse("each of its two brackets must cross one bond, and one crosses more");
    const [k1, k2] = crossing.map((c) => c[0]);
    if (k1 === k2) return refuse("its two brackets cross the same bond");
    // (a wedge's, a hash's or a wavy bond's: which way each copy's would face is not drawn)
    if (bonds[k1].stereo || bonds[k2].stereo) return refuse("a bracket crosses a wedged, hashed or wavy bond");
    if (bonds[k1].order !== bonds[k2].order || bonds[k1].aromatic || bonds[k2].aromatic) return refuse("the two bonds its brackets cross are not of one order");
    // (what lies between them: the atoms joined to an end of each by other bonds, and to neither other end)
    const up = atoms.map((_, i) => i);
    const top = (i: number): number => (up[i] === i ? i : (up[i] = top(up[i])));
    bonds.forEach((b, k) => {
      if (k !== k1 && k !== k2) up[top(b.a)] = top(b.b);
    });
    const [e1, e2] = [k1, k2].map((k) => [bonds[k].a, bonds[k].b]);
    // (each way the two bonds' ends can pair, the unit's on one side of both brackets: the other bracket's)
    const side = (b: (typeof brackets)[number], p: Point) => Math.sign(cross(unit(b.ends[0], b.ends[1]), { x: p.x - b.ends[0].x, y: p.y - b.ends[0].y }));
    const mid = (b: (typeof brackets)[number]) => ({ x: (b.ends[0].x + b.ends[1].x) / 2, y: (b.ends[0].y + b.ends[1].y) / 2 });
    const between = (ids: number[]) => {
      const c = { x: ids.reduce((t, i) => t + atoms[i].x, 0) / ids.length, y: ids.reduce((t, i) => t + atoms[i].y, 0) / ids.length };
      return side(brackets[0], c) === side(brackets[0], mid(brackets[1])) && side(brackets[1], c) === side(brackets[1], mid(brackets[0]));
    };
    const units = e1.flatMap((h) =>
      e2.flatMap((t) => {
        const [outH, outT] = [e1.find((x) => x !== h)!, e2.find((x) => x !== t)!];
        if (top(h) !== top(t) || top(outH) === top(h) || top(outT) === top(h)) return [];
        const ids = atoms.flatMap((_, i) => (top(i) === top(h) ? [i] : []));
        return between(ids) ? [ids] : [];
      }),
    );
    if (units.length !== 1) return refuse("what lies between its brackets is not cut off from the rest by the two bonds they cross");
    if (n === 1) return;
    found.push({ group, n, count, lines, unit: units[0], cross: [k1, k2] });
  });
  // (brackets within brackets, or two units side by side across one bond: neither read - a copy of the one would not carry the
  //  other's marks, and one bond cannot join two runs of copies)
  for (const f of found) {
    const others = found.filter((o) => o !== f);
    if (others.some((o) => o.unit.some((i) => f.unit.includes(i)))) {
      say(f.lines, REPEAT_REFUSED(f.count, "it lies within another repeat unit in brackets, or holds one"));
      continue;
    }
    if (others.some((o) => o.cross.some((k) => f.cross.includes(k)))) {
      say(f.lines, REPEAT_REFUSED(f.count, "a bond its brackets cross is crossed by another repeat unit's brackets too"));
      continue;
    }
    for (const i of f.unit) atoms[i] = { ...atoms[i], repeat: { group: f.group, n: f.n } };
    for (const k of f.cross) bonds[k] = { ...bonds[k], repeat: { group: f.group } };
  }
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
    // (a round-capped mark - a hash's lines drawn as filled stadiums, or its dot - too: thin, no letter's shape)
    .filter((b) => Math.max(b.box[2] - b.box[0], b.box[3] - b.box[1]) < 0.3 * bond && (!b.curved || narrowestBox(b.pts).short < THIN_MARK * bond))
    .map((b): Stroke => {
      const n = narrowestBox(b.pts);
      const s = { a: { x: n.mid.x - (n.u.x * n.long) / 2, y: n.mid.y - (n.u.y * n.long) / 2 }, b: { x: n.mid.x + (n.u.x * n.long) / 2, y: n.mid.y + (n.u.y * n.long) / 2 }, w: n.short };
      blobOf.set(s, b);
      return s;
    });
  // (a twenty-fifth of a bond at the least - or a line's width and a half: a long bond's hash, its lines set close - or shorter than it is
  // wide: a dot drawn as a line's round ends)
  const short = [...shapes.strokes.filter((s) => len(s) < 0.45 * bond && (len(s) > Math.min(0.04 * bond, 1.5 * s.w) || len(s) < s.w)), ...bits];
  // (a line's piece, broken where another passes in front of it - a double bond's by a bridge - is no hash's line)
  const brokenPiece = new Set(short.filter((s) => shapes.strokes.some((t) => t !== s && brokenAcross(s, t, shapes.strokes, bond))));
  const { hashes: hashed, used: inHashes, groups: hashGroups } = hashesOf(short.filter((s) => !brokenPiece.has(s)), bond, new Set(bits));
  // letters drawn as shapes, where the figure has none written there: read from their shapes
  const inLetters = new Set<object>();
  const fromShapes = known.length
    ? shapeLetters(shapes, bond, known, new Set([...inHashes].map((s) => blobOf.get(s) ?? s))).filter(
        (l) => !drawn.letters.some((t) => Math.min(t.box[2], l.box[2]) > Math.max(t.box[0], l.box[0]) && Math.min(t.box[3], l.box[3]) > Math.max(t.box[1], l.box[1])),
      )
    : [];
  for (const l of fromShapes) for (const f of l.from) inLetters.add(f);
  const written = wordsOf([...drawn.letters, ...fromShapes]);
  // (a repeat unit in brackets with its count: its brackets no bonds, its count no word - what is read of it, below)
  const repeats = repeatBrackets(shapes, written, bond, hashed);
  const words = written.filter((_, k) => !repeats.counts.has(k));
  // (two labels set touching, the first ending in its charge - Cl- HN+ - are two: a word that reads as nothing is cut after a
  // charge written before a capital, where both pieces read)
  const sign = (l: FigureLetter) => /^[+-]$/.test(labelText({ letters: [l], box: l.box, size: l.size }, reads));
  const wordFrom = (ls: FigureLetter[]): Word => ({ letters: ls, box: boxOfBoxes(ls.map((l) => l.box)), size: Math.max(...ls.map((l) => l.size)) });
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (reads(labelText(w, reads))) continue;
    const k = w.letters.findIndex((l, j) => j > 0 && j < w.letters.length - 1 && sign(l) && /[A-Z]/.test(w.letters[j + 1].c));
    if (k < 0) continue;
    const [p, q] = [wordFrom(w.letters.slice(0, k + 1)), wordFrom(w.letters.slice(k + 1))];
    if (reads(labelText(p, reads)) && reads(labelText(q, reads))) words.splice(i, 1, p, q);
  }
  // (an H set right over or under an element's letter - an NH with its H stacked, as Meno sets one between two bonds - is
  // that label's: one word, NH, a bond to either part its atom's)
  for (let i = words.length - 1; i >= 0; i--) {
    const h = words[i];
    if (!/^H\d?$/.test(labelText(h, reads))) continue;
    const hc = centre(h.box);
    const k = words.findIndex((w, j) => {
      if (j === i || !/^[NOSP]$/.test(labelText(w, reads))) return false;
      const c = centre(w.box);
      const gap = Math.max(w.box[1] - h.box[3], h.box[1] - w.box[3]);
      return Math.abs(c.x - hc.x) < 0.3 * w.size && gap > -0.1 * w.size && gap < 0.3 * w.size;
    });
    if (k < 0) continue;
    const w = words[k];
    words[k] = { letters: [...w.letters, ...h.letters], box: boxOfBoxes([w.box, h.box]), size: w.size };
    words.splice(i, 1);
  }
  const labelled = (p: Point, out: Point) => words.some((w) => reaches(p, out, w.box, bond));
  // (a short line between two labels - or from a joint of bonds to a label stacked tall, an NH with its H over it, cut back
  // short of it)
  const stacked = (p: Point, out: Point) => words.some((w) => w.box[3] - w.box[1] > 1.15 * w.size && reaches(p, out, w.box, bond, 0.6));
  const atJoint = (s: Stroke, p: Point) => shapes.strokes.some((t) => t !== s && (dist(t.a, p) < 0.2 * bond || dist(t.b, p) < 0.2 * bond));
  // (but a sign between two words of a line of text - a caption's "3aa, R = H, 73%" - is none: lineGoesOn)
  const textAt = (p: Point, out: Point) => {
    const w = words.find((v) => reaches(p, out, v.box, bond));
    return !!w && Math.abs(out.x) >= 0.9 && lineGoesOn(w, words, out.x > 0, reads);
  };
  const inText = (s: Stroke) => textAt(s.a, unit(s.b, s.a)) && textAt(s.b, unit(s.a, s.b));
  const between = (s: Stroke) =>
    // (two different words: a line within one word's box is no bond between labels)
    (words.some((v, i) => reaches(s.a, unit(s.b, s.a), v.box, bond) && words.some((x, j) => j !== i && reaches(s.b, unit(s.a, s.b), x.box, bond))) && !inText(s)) ||
    (atJoint(s, s.a) && stacked(s.b, unit(s.a, s.b))) ||
    (atJoint(s, s.b) && stacked(s.a, unit(s.b, s.a)));
  // (short lines side by side, each from one label to another - N≡N+ - are a bond between them, double or triple, not a hash)
  const betweenLabels = hashGroups.map((g) => g.every((s) => between(s)));
  hashGroups.forEach((g, i) => {
    if (betweenLabels[i]) for (const s of g) inHashes.delete(s);
  });
  const hashes = hashed.filter((_, i) => !betweenLabels[i]);
  // (but a short line side by side with another that is no such line - a hash's widest stroke by an H set close, the hash
  // too short to be told as one, two lines and the dots at its narrow end - is no bond between labels)
  const filled = new Set(bits);
  const dash = (s: Stroke) =>
    between(s) && !short.some((t) => t !== s && !inHashes.has(t) && len(t) > 0.04 * bond && sideBySide(s, t, bond, filled) && !between(t));
  // (a short line running straight out of a label to nothing - a methyl's bond squeezed short and cut back at the label, an
  // N-methyl in a bridge - is a bond too)
  const tipsOf = shapes.strokes.flatMap((t) => [t.a, t.b].map((p) => ({ p, of: t })));
  const outOf = (s: Stroke, p: Point, q: Point) => {
    const from = words.find((w) => fromBox(p, w.box) < 0.15 * bond && dot(unit(centre(w.box), q), unit(p, q)) > 0.9);
    return !!from && !words.some((w) => w !== from && fromBox(q, w.box) < 0.3 * bond) && !tipsOf.some((t) => t.of !== s && dist(t.p, q) < 0.2 * bond);
  };
  const stub = (s: Stroke) => len(s) > 0.15 * bond && (outOf(s, s.a, s.b) || outOf(s, s.b, s.a));
  // (a short line between two words of a line of text - a caption's = - is its sign, however long a bond's line it might be)
  const textSign = (s: Stroke) => len(s) < 0.6 * bond && labelled(s.a, unit(s.b, s.a)) && labelled(s.b, unit(s.a, s.b)) && inText(s);
  // (and a line more than six bonds long is none - a table's rule, a graph's axis, a frame round a part of the figure: a bond is drawn at
  // about its length, stretched in a large ring to five at most, and an arrow's line is the arrow's)
  const ruled = (s: Stroke) => len(s) > 6 * bond;
  // (a line more than two and a half bonds long meeting others only square, or none - a frame's side, a graph's axis, a page's rule - is
  // no bond: a long bond, a large ring's, meets its neighbours as a ring's do)
  const meetings: { t: Stroke | null; q: Point }[] = [...shapes.strokes.flatMap((t) => [t.a, t.b].map((q) => ({ t, q }))), ...shapes.wedges.flatMap((w) => [w.tip, w.base].map((q) => ({ t: null, q })))];
  const framing = (s: Stroke) =>
    len(s) > 2.5 * bond && [s.a, s.b].every((p) => meetings.every(({ t, q }) => t === s || dist(p, q) >= 0.12 * bond || (t !== null && square(s, p, t, q))));
  // (and a table's lines - two cells or more side by side, their sides level and upright, and dashes set within them - are none: a
  // ring is never drawn so; a cyclobutane alone, one square, is no table)
  const { lines: table, cells: tableCells } = tableLines(shapes.strokes, bond);
  // (and a short line alongside a longer, within its stretch - a double bond's second line, the bond drawn short)
  const inner = (s: Stroke) =>
    len(s) > 0.15 * bond &&
    shapes.strokes.some((t) => {
      if (t === s || len(t) < 0.3 * bond || Math.abs(cross(unit(t.a, t.b), unit(s.a, s.b))) > Math.sin((8 * Math.PI) / 180)) return false;
      const u = unit(t.a, t.b);
      const off = Math.abs(cross(u, { x: mid(s.a, s.b).x - t.a.x, y: mid(s.a, s.b).y - t.a.y }));
      const at = (p: Point) => dot(u, { x: p.x - t.a.x, y: p.y - t.a.y });
      return off > 0.06 * bond && off < 0.4 * bond && [s.a, s.b].every((p) => at(p) > -0.05 * bond && at(p) < len(t) + 0.05 * bond);
    });
  // (and a line over three twentieths of a bond long, from a joint - another line's end at its own - into a label: a bond cut back at the
  // label further than most)
  const others = [...hashed.flatMap((h) => [h.a, h.b]), ...shapes.wedges.flatMap((w) => [w.tip, w.base])];
  const endAt = (s: Stroke, p: Point) => tipsOf.some((t) => t.of !== s && dist(t.p, p) < 0.1 * bond) || others.some((q) => dist(q, p) < 0.1 * bond);
  const toLabel = (s: Stroke) =>
    len(s) > 0.15 * bond && ((endAt(s, s.a) && labelled(s.b, unit(s.a, s.b))) || (endAt(s, s.b) && labelled(s.a, unit(s.b, s.a))));
  const lines = shapes.strokes.filter((s) => !repeats.strokes.has(s) && !inHashes.has(s) && !inLetters.has(s) && !textSign(s) && !ruled(s) && !framing(s) && !table.has(s) && (len(s) >= 0.3 * bond || (len(s) > 0.04 * bond && dash(s)) || stub(s) || toLabel(s) || inner(s)));
  // (a line broken where another passes in front, one piece short - a cage's back edge - joined again too; a short piece joined to nothing stays out)
  const loose = shapes.strokes.filter((s) => !repeats.strokes.has(s) && !inHashes.has(s) && !inLetters.has(s) && !lines.includes(s) && !ruled(s) && !table.has(s) && len(s) > 0.04 * bond);
  const joined = joinedAcross([...lines, ...loose], bond);
  // (a line lying along another - the same middle line, within a sixteenth of a bond, as long as the other or shorter, within its stretch -
  // is that line: a bold bar has a hairline drawn along it. It is never a second line of a multiple bond)
  const along = (s: Stroke, t: Stroke) => {
    if (s === t || len(t) < len(s) || (len(t) === len(s) && joined.indexOf(t) > joined.indexOf(s))) return false;
    return lyingAlong(s, t, bond);
  };
  const whole = joined.filter((s) => !loose.includes(s) && !joined.some((t) => along(s, t)));
  const used = loose.filter((s) => !joined.includes(s));
  // (a line much thicker than most - a Haworth ring's front, a perspective drawing's near edge - is bold: a bond drawn thick, toward
  // the viewer, single or double - the double with a thin inner line, shorter, beside it - never one line of three)
  const widths = whole.map((s) => s.w).sort((a, b) => a - b);
  const thin = widths.length ? widths[Math.floor(widths.length / 2)] : 0;
  const bold = (s: Stroke) => s.w > BOLD_TIMES * thin && s.w > 0.12 * bond;
  const { bonds: multi, used: inMulti } = multiples(whole, bond, bold);
  const drawnBonds: Drawn[] = [
    ...whole.filter((s) => !inMulti.has(s)).map((s): Drawn => ({ a: s.a, b: s.b, order: 1, ...(bold(s) ? { bold: true } : {}) })),
    ...multi,
    ...hashes,
    // (a short wedge too, where it points into a label - a stereocentre's H set close, the wedge cut back at it)
    ...shapes.wedges
      .filter((w) => dist(w.tip, w.base) > 0.3 * bond || (dist(w.tip, w.base) > 0.1 * bond && labelled(w.base, unit(w.tip, w.base))))
      .map((w: Wedge): Drawn => ({ a: w.tip, b: w.base, order: 1, stereo: "up" })),
    ...shapes.curves.filter((c) => !repeats.curves.has(c)).map((c) => wavy(c, bond)).filter((d): d is Drawn => !!d),
    ...dashes(bitsLeft(short, inHashes, [...lines, ...used]).filter((s) => !inLetters.has(blobOf.get(s) ?? s)), words, bond, (l) => reads(l)),
  ];

  // bonds' ends where they meet; an end alone, its bond pointing into a word, the word's
  type End = { bond: number; side: 0 | 1; p: Point };
  // (a hash's narrow end set off from its atom - its first lines a joint's dots, taken by another - and a double or triple
  // bond's ends, its lines set off from the ring it leaves: each carried on to the bond end it comes to)
  const carry = (d: Drawn, end: "a" | "b") => {
    const [p, from] = end === "a" ? [d.a, d.b] : [d.b, d.a];
    const others = drawnBonds.filter((o) => o !== d).flatMap((o) => [o.a, o.b]);
    if (others.some((q) => dist(q, p) < 0.2 * bond)) return;
    // (a double bond's end inside a label's box comes to the label, not to a bond's end by it - a P=O's to its P)
    const pad = 0.08 * bond;
    if (!d.stereo && words.some((w) => fromBox(p, [w.box[0] - pad, w.box[1] - pad, w.box[2] + pad, w.box[3] + pad]) === 0)) return;
    const way = unit(from, p);
    // (a hash's on along its way, a little under half a bond at most - a figure's bonds short to its labels make a bond
    // short; a double bond's, its middle line's end a little off its atom - its lines run past it, or stop short - within a
    // quarter of a bond)
    const ahead = d.stereo
      ? others.filter((q) => dist(q, p) < 0.45 * bond && dot(way, unit(p, q)) > Math.cos(Math.PI / 6))
      : others.filter((q) => dist(q, p) < 0.25 * bond);
    if (ahead.length) d[end] = ahead.reduce((r, q) => (dist(q, p) < dist(r, p) ? q : r));
  };
  for (const d of drawnBonds) {
    if (d.stereo === "down" && !d.either) carry(d, "a");
    else if (d.order > 1 && !d.stereo) for (const end of ["a", "b"] as const) carry(d, end);
  }
  const ends: End[] = drawnBonds.flatMap((d, i) => [
    { bond: i, side: 0 as const, p: d.a },
    { bond: i, side: 1 as const, p: d.b },
  ]);
  const tol = 0.2 * bond;
  const meeting = new Map<End, number>();
  // (two ends both pointing into one label - bonds to a metal, drawn short of it from two sides - do not meet each other there)
  const into = new Map<End, number[]>(
    ends.map((e) => {
      const d = drawnBonds[e.bond];
      const out = unit(e.side === 0 ? d.b : d.a, e.p);
      return [e, words.flatMap((w, k) => (reaches(e.p, out, w.box, bond) ? [k] : []))];
    }),
  );
  // (and an end by both ends of a bond shorter than that - a hash to an H set close - meets the nearer)
  const otherEnd = (e: End) => (e.side === 0 ? drawnBonds[e.bond].b : drawnBonds[e.bond].a);
  for (const e of ends)
    meeting.set(e, ends.filter((f) => f.bond !== e.bond && dist(f.p, e.p) < tol && dist(f.p, e.p) <= dist(f.p, otherEnd(e)) && !into.get(e)!.some((k) => into.get(f)!.includes(k))).length);
  const wordOf = new Map<End, number>();
  // (a compound's number set close under a bond - 1, 2a, 3' - is no atom's label)
  const isNumber = words.map((w) => COMPOUND_NUMBER.test(labelText(w, reads)));
  for (const e of ends) {
    const d = drawnBonds[e.bond];
    const out = unit(e.side === 0 ? d.b : d.a, e.p);
    let best = -1;
    let bestD = Infinity;
    // (a word it points away from, by it - its way only clipping the corner of the room round a label set close, an H under
    // the N it goes to - only where no other takes it)
    let away = -1;
    let awayD = Infinity;
    // (not the word its bond comes out of - its other end in it - however near this end lies to its corner)
    const other = e.side === 0 ? d.b : d.a;
    words.forEach((w, k) => {
      if (isNumber[k]) return;
      // (both ends in it - a bond so short it lies within its label's box - the end nearer its element takes it)
      if (fromBox(other, w.box) === 0) {
        const els = w.letters.filter((l) => /[A-Z]/.test(l.c) && l.c !== "H");
        if (!els.length || fromBox(e.p, w.box) > 0) return;
        const to = (p: Point) => Math.min(...els.map((l) => dist(centre(l.box), p)));
        if (to(e.p) >= to(other)) return;
        // (and its other end comes to another label: a metal's)
        const back = unit(e.p, other);
        if (!words.some((v, j) => j !== k && reaches(other, back, v.box, bond))) return;
      }
      const dd = fromBox(e.p, w.box);
      // (not at its hydrogen: a bond comes to a label's element - the O of an HO - and an end outside it, much nearer its H, is
      // another's - a methyl's set close)
      const caps = w.letters.filter((l) => /[A-Z]/.test(l.c) && l.size >= 0.85 * w.size);
      const toH = Math.min(...caps.filter((l) => l.c === "H").map((l) => dist(centre(l.box), e.p)));
      const toEl = Math.min(...caps.filter((l) => l.c !== "H").map((l) => dist(centre(l.box), e.p)));
      // (unless it points on at the element - an H stacked over its N, the bond coming past the H)
      const atEl = caps.some((l) => l.c !== "H" && reaches(e.p, out, l.box, bond, 1));
      if (dd > 0 && Number.isFinite(toEl) && toH < 0.6 * toEl && !atEl) return;
      // (where other bonds meet it, an end is a carbon - unless it lies on a capital of the word, its bonds drawn to its middle under it)
      const onCapital = w.letters.some((l) => /[A-Z]/.test(l.c) && dist(centre(l.box), e.p) < 0.35 * w.size);
      // (a bond drawn short - under half a bond, cut back at a label stacked tall, an NH with its H over it - may stop farther off)
      const within = len({ a: d.a, b: d.b }) < 0.5 * bond ? 0.6 : 0.35;
      if ((meeting.get(e)! === 0 || onCapital) && reaches(e.p, out, w.box, bond, within)) {
        const q = { x: Math.min(Math.max(e.p.x, w.box[0]), w.box[2]), y: Math.min(Math.max(e.p.y, w.box[1]), w.box[3]) };
        if (dd > 0 && dot(out, unit(e.p, q)) < 0) {
          if (dd < awayD) [away, awayD] = [k, dd];
        } else if (dd < bestD) [best, bestD] = [k, dd];
      }
    });
    if (best >= 0 || away >= 0) wordOf.set(e, best >= 0 ? best : away);
  }
  // (two labels set side by side, read as one word that reads as nothing - H H - are each
  // their own, where their bonds come to different capitals of it, cut where both read)
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const at = ends.filter((e) => wordOf.get(e) === k);
    if (at.length < 2 || reads(labelText(w, reads)) || (labelOf(w, reads).alts ?? []).some(reads)) continue;
    const caps = w.letters.map((l, i) => ({ l, i })).filter(({ l }) => /[A-Z]/.test(l.c) && l.size >= 0.85 * w.size);
    // (no capital to cut it at - its letters read as small ones, as a turned page's may be: one word)
    if (!caps.length) continue;
    const nearest = (e: End) => caps.reduce((p, c) => (dist(centre(c.l.box), e.p) < dist(centre(p.l.box), e.p) ? c : p)).i;
    const starts = [...new Set(at.map(nearest))].sort((a, b) => a - b);
    if (starts.length < 2) continue;
    const cuts = caps.map((c) => c.i).filter((i) => starts.includes(i) || i === caps[0].i);
    // (two of them: cut where both read - a label on its bond's left starts before the capital its bond comes to, NH2 H2N)
    if (starts.length === 2) {
      const piece = (from: number, to: number) => labelText({ ...w, letters: w.letters.slice(from, to) }, reads);
      const at = caps.map((c) => c.i).find((c) => c > starts[0] && c <= starts[1] && reads(piece(caps[0].i, c)) && reads(piece(c, w.letters.length)));
      if (at != null) cuts.splice(0, cuts.length, caps[0].i, at);
    }
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
  // (a label with its hydrogens written - NH2, OH, SH - takes no more bonds than they leave it, and an O alone two, a double
  // bond's counted twice: the ends that come nearest its element, a stray one - a methyl's set close - a carbon of its own.
  // An NH's bonds are counted as one each: a ring's, its charge drawn by it, may be double)
  const overFull = new Set<number>();
  words.forEach((w, k) => {
    const m = /^(?:H(\d*))?([A-Z][a-z]?)(?:H(\d*))?$/.exec(labelText(w, reads));
    if (!m || !(m[2] in BONDS_LEFT)) return;
    const bare = m[1] == null && m[3] == null;
    if (bare && m[2] !== "O") return;
    const hs = (m[1] == null ? 0 : m[1] === "" ? 1 : Number.parseInt(m[1])) + (m[3] == null ? 0 : m[3] === "" ? 1 : Number.parseInt(m[3]));
    const room = BONDS_LEFT[m[2]] - hs;
    const at = ends.filter((e) => wordOf.get(e) === k);
    const order = (e: End) => (bare ? drawnBonds[e.bond].order : 1);
    if (room < 1 || at.reduce((t, e) => t + order(e), 0) <= room) return;
    const el = w.letters.find((l) => l.c === m[2][0]);
    const to = (e: End) => (el ? dist(centre(el.box), e.p) : fromBox(e.p, w.box));
    let left = room;
    let kept = 0;
    for (const e of [...at].sort((p, q) => to(p) - to(q))) {
      if (order(e) <= left) {
        left -= order(e);
        kept = to(e);
      } else {
        wordOf.delete(e);
        // (one let go as near as those kept, all but: which is the label's is a guess, said)
        if (to(e) < 1.2 * kept) overFull.add(k);
      }
    }
  });
  // (a lone H takes one bond: a wedge's or a hash's first, else the nearest)
  words.forEach((w, k) => {
    if (labelText(w, reads) !== "H") return;
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
        const read = labelOf(words[k], reads);
        const said = overFull.has(k) ? ["More bonds come to it than it takes: those nearest its letter kept."] : [];
        atoms.push({ x: 0, y: 0, ...read, ...(said.length || read.unsure ? { unsure: [...(read.unsure ?? []), ...said] } : {}), box: words[k].box });
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

  // (a lone H at no bond's end, a short hash to it - a line or two across the way from an atom by it, the rest hidden by
  // the joint at the atom and the H itself: its bond, behind)
  const spare = bitsLeft(short, inHashes, [...lines, ...used]);
  words.forEach((w, k) => {
    if (atomOfWord.has(k) || labelText(w, reads) !== "H") return;
    const h = centre(w.box);
    let best: { i: number; across: Stroke[] } | null = null;
    atoms.forEach((a, i) => {
      if (a.label || dist(a, h) > 1.3 * bond) return;
      const u = unit(a, h);
      const span = dist(a, h);
      const across = spare.filter((s) => {
        const m = { x: (s.a.x + s.b.x) / 2 - a.x, y: (s.a.y + s.b.y) / 2 - a.y };
        const t = dot(m, u);
        return t > 0.2 * span && t < span && Math.abs(cross(u, m)) < 0.15 * bond && Math.abs(dot(unit(s.a, s.b), u)) < 0.5 && len(s) < 0.4 * bond;
      });
      if (across.length && (!best || across.length > best.across.length || (across.length === best.across.length && dist(a, h) < dist(atoms[best.i], h)))) best = { i, across };
    });
    if (!best) return;
    const found: { i: number; across: Stroke[] } = best;
    atomOfWord.set(k, atoms.length);
    atoms.push({ x: h.x, y: h.y, ...labelOf(w, reads), box: w.box });
    bonds.push({ a: found.i, b: atoms.length - 1, order: 1, stereo: "down" });
  });
  // words at no bond's end but by the structure, with a charge - written, or drawn in a ring beside them: ions,
  // standing alone; several set in a row (K+ K+ K+) each by the one before
  // (measured from their ink - their labels' boxes, not only their middles - as Meno sets a salt's pieces apart, ink to ink)
  const placed = atoms.length ? boxOfBoxes(atoms.map((a): Box => a.box ?? [a.x, a.y, a.x, a.y])) : null;
  // (an H right by an atom's label - set under an N - is that label's, never an ion; an element's ion set close is still one)
  const labels = atoms.flatMap((a) => (a.box ? [a.box] : []));
  const byLabel = (w: Word) => /^H\d*[+-]/.test(labelText(w, reads)) && labels.some((b) => fromBox(centre(w.box), b) < 0.6 * bond);
  // (or several, counted: (Cl-)2)
  const charged = (w: Word) =>
    /^[A-Z][A-Za-z0-9]*[+-]$/.test(labelText(w, reads)) || /^\([A-Z][A-Za-z0-9]*[+-]\)\d$/.test(labelText(w, reads)) || (/^[A-Z][A-Za-z0-9]*$/.test(labelText(w, reads)) && marks.some((m) => fromBox(m.at, w.box) < m.r + 0.3 * bond));
  // (measured by bonds - or, all of them drawn short to labels, by the labels' letters: a bond is drawn half as long again as they are set)
  const sizes = drawn.letters.map((l) => l.size).sort((a, b) => a - b);
  const ionBy = ION_BY * Math.max(bond, sizes.length ? BOND_PER_SIZE * sizes[Math.floor(sizes.length / 2)] : 0);
  const ions = new Set<number>();
  for (let more = !!placed; more; ) {
    more = false;
    words.forEach((w, k) => {
      if (atomOfWord.has(k) || ions.has(k) || !charged(w) || byLabel(w)) return;
      if (boxGap(w.box, placed!) < ionBy || [...ions].some((i) => boxGap(w.box, words[i].box) < ionBy)) {
        ions.add(k);
        more = true;
      }
    });
  }
  // (a group's name set right over or under a heteroatom's label, no bond drawn to it - a MOM written over its imidazole's N - is
  // bonded to that atom, where it has a bond to spare; standing alone on its line: one of a line's words - the Me of an R = Me - is the line's)
  const SPARE: Record<string, number> = { N: 3, P: 3, O: 2, S: 2 };
  const onLineWith = (w: Word, k: number) =>
    words.some((v, j) => {
      if (j === k || atomOfWord.has(j)) return false;
      const overlap = Math.min(w.box[3], v.box[3]) - Math.max(w.box[1], v.box[1]);
      const gap = Math.max(v.box[0] - w.box[2], w.box[0] - v.box[2]);
      return overlap > 0.5 * Math.min(w.box[3] - w.box[1], v.box[3] - v.box[1]) && gap < Math.max(w.size, v.size);
    });
  words.forEach((w, k) => {
    const text = labelText(w, reads);
    if (atomOfWord.has(k) || ions.has(k) || isElementSymbolLike(text) || !reads(text) || onLineWith(w, k)) return;
    const c = centre(w.box);
    const width = w.box[2] - w.box[0];
    const i = atoms.findIndex((a) => {
      const el = a.label && SPARE[a.label];
      if (!el || !a.box) return false;
      const gap = Math.max(a.box[1] - w.box[3], w.box[1] - a.box[3]);
      const used = bonds.filter((b) => b.a === atoms.indexOf(a) || b.b === atoms.indexOf(a)).reduce((t, b) => t + b.order, 0);
      return used < el && Math.abs(centre(a.box).x - c.x) < 0.5 * Math.max(width, a.box[2] - a.box[0]) && gap > -0.1 * w.size && gap < 0.5 * w.size;
    });
    if (i < 0) return;
    atomOfWord.set(k, atoms.length);
    atoms.push({ x: c.x, y: c.y, ...labelOf(w, reads), box: w.box });
    bonds.push({ a: i, b: atoms.length - 1, order: 1 });
  });
  const left: FigureLetter[] = [];
  words.forEach((w, k) => {
    if (atomOfWord.has(k)) return;
    if (ions.has(k)) {
      const c = centre(w.letters.find((l) => /[A-Z]/.test(l.c))?.box ?? w.box);
      atoms.push({ x: c.x, y: c.y, ...labelOf(w, reads), box: w.box });
    } else left.push(...w.letters);
  });
  // (each charge drawn in a ring, the nearest atom's - a labelled one's measured from its label, as the ring is set by it)
  const from = (a: ReadAtom, p: Point) => (a.box ? fromBox(p, a.box) : dist(a, p));
  for (const m of marks) {
    let best = -1;
    for (let i = 0; i < atoms.length; i++) if (from(atoms[i], m.at) < 1.2 * bond && (best < 0 || from(atoms[i], m.at) < from(atoms[best], m.at))) best = i;
    if (best >= 0) atoms[best] = { ...atoms[best], marked: (atoms[best].marked ?? 0) + m.charge };
  }
  // (a radical's electron: a small round dot by an atom, alone - two side by side for a pair - not a letter's, a hash's, nor a
  // line's round end or joint: a dot is drawn half as wide again as a line, or more, and lies at no line's end. Round: curved, or
  // a polygon of a dozen corners or more, as some drawings have one)
  const lineWidths = shapes.strokes.map((s) => s.w).sort((a, b) => a - b);
  const lineWidth = lineWidths.length ? lineWidths[Math.floor(lineWidths.length / 2)] : 0;
  const lineEnds = shapes.strokes.flatMap((s) => [s.a, s.b]);
  const ofHashes = new Set([...inHashes].map((s) => blobOf.get(s)));
  const round = (b: Blob) => b.curved || b.pts.filter((p, i) => !b.pts.slice(0, i).some((q) => dist(p, q) < 1e-3)).length >= 12;
  const dots = shapes.blobs.filter((b) => {
    const [w, h] = [b.box[2] - b.box[0], b.box[3] - b.box[1]];
    const size = Math.max(w, h);
    if (!round(b) || inLetters.has(b) || ofHashes.has(b) || size > DOT * bond || Math.min(w, h) < 0.7 * size || size < 1.4 * lineWidth) return false;
    return !lineEnds.some((p) => dist(p, centre(b.box)) < size);
  });
  for (const d of dots) {
    const at = centre(d.box);
    let best = -1;
    for (let i = 0; i < atoms.length; i++) if (from(atoms[i], at) < 0.6 * bond && (best < 0 || from(atoms[i], at) < from(atoms[best], at))) best = i;
    if (best >= 0) atoms[best] = { ...atoms[best], dots: (atoms[best].dots ?? 0) + 1 };
  }
  // (each repeat unit in brackets: a whole count's unit marked to be read so many times, else the atoms its brackets cross saying why not)
  repeatsRead(repeats.pairs, atoms, bonds, bond, from);
  return { atoms, bonds, bond, left: { letters: left }, ...(tableCells.length ? { table: tableCells } : {}) };
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
      const whole = brokenAcross(out[i], out[j], out, bond);
      if (!whole) continue;
      out[i] = { ...whole, w: Math.max(out[i].w, out[j].w) };
      out.splice(j, 1);
      j = i;
    }
  }
  return out;
}

/** Two lines on one line, a little apart, a third of `all` crossing the gap: one line broken where another passes in front - its ends, or none. */
function brokenAcross(s: Stroke, t: Stroke, all: readonly Stroke[], bond: number): { a: Point; b: Point } | null {
  const u = unit(s.a, s.b);
  if (Math.abs(cross(u, unit(t.a, t.b))) > Math.sin((4 * Math.PI) / 180)) return null;
  if (Math.abs(cross(u, { x: t.a.x - s.a.x, y: t.a.y - s.a.y })) > 0.03 * bond) return null;
  // (their nearest ends, and the gap between them)
  const pairs: [Point, Point, Point, Point][] = [
    [s.a, s.b, t.a, t.b],
    [s.a, s.b, t.b, t.a],
    [s.b, s.a, t.a, t.b],
    [s.b, s.a, t.b, t.a],
  ];
  const [near0, far0, near1, far1] = pairs.reduce((p, q) => (dist(q[0], q[2]) < dist(p[0], p[2]) ? q : p));
  const gap = dist(near0, near1);
  // (near half a bond at most: a figure with many labels, more of its lines cut short of them than whole, has its bonds read short)
  if (gap < 0.05 * bond || gap > 0.45 * bond) return null;
  // (it must lie between them, not past one: the far ends further apart than the near ones)
  if (dist(far0, far1) < dist(near0, near1) + len(s) + len(t) - 0.01 * bond) return null;
  const m = mid(near0, near1);
  return all.some((o) => o !== s && o !== t && segmentsCross(o.a, o.b, near0, near1, m)) ? { a: far0, b: far1 } : null;
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
