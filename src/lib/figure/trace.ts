/**
 * A picture of a drawing traced (docs/PDF.md, *A picture traced*): its ink
 * found, each patch of it apart, and the centre lines of what is drawn as
 * lines - with how wide each is along it - given as the shapes a PDF's
 * paths make (./drawn `Shapes`), for the figure reader (./read) to read as
 * it reads a PDF's:
 *
 * - a straight piece of an even width, a stroke; much wider than the rest,
 *   a bold one (the reader tells it by its width);
 * - a piece widening evenly from one end, a wedge, narrow at that end;
 * - a short bar or a dot on its own - a hash's line, a charge's - a stroke
 *   of its own;
 * - a round line closed on itself, a curve (an aromatic ring's circle);
 * - anything else small - a letter - its outlines, as a letter drawn as a
 *   shape is (./glyphs reads it).
 *
 * The bonds of a structure that touch are one patch of ink: its outline is
 * no use to the reader, its centre lines are - each bond a line from one
 * join to the next.
 *
 * Written from the papers, no program's code (each named exactly in
 * docs/PDF.md, *A picture traced*): the threshold between ink and paper by
 * the histogram's two classes (Otsu 1979); patches by two passes over the
 * pixels (Rosenfeld and Pfaltz 1966); how far each pixel of ink is from
 * the paper exactly (./inkFit `distances`; Felzenszwalb and Huttenlocher
 * 2012); centre lines by thinning (T. Y. Zhang, C. Y. Suen, Commun. ACM 27
 * (1984) 236-239, as Lü and Wang amend it: H. E. Lü, P. S. P. Wang,
 * Commun. ACM 29 (1986) 239-242); each line fitted by straight pieces
 * (Ramer 1972; Douglas and Peucker 1973); a wedge told by the rank
 * correlation of its widths (Kendall 1938) and its ends' widths by the
 * median of slopes (Theil 1950; Sen 1968). How wide a line is is read from
 * how much ink lies across it, so to a fraction of a pixel. Every
 * tolerance is in the drawing's own line width or bond, none in pixels.
 *
 * Places are in the picture's pixels from its top left, a pixel's middle
 * half a pixel in (`onPage` takes them to a page's points).
 */
import { distances, type Pixels } from "./inkFit";
import { boxOf, type Blob, type Box, type Curve, type Point, type Shapes, type Stroke, type Wedge } from "./drawn";
import { shapeLetters, sureEnough, type GlyphShape } from "./glyphs";
import { figureBond, type FigureRead } from "./read";

/** A picture traced: its shapes, how wide its lines are drawn and how long its bonds, in its pixels. */
export type Traced = { shapes: Shapes; line: number; bond: number; shaded: number };

/** Why a picture gave nothing to read. */
export type Untraced = { none: string };

/** Ink lighter than this - its farthest channel from the paper's, of 255 - is no ink, whatever the histogram says: a picture's noise. */
const FAINTEST = 40;
/** A spur - a short branch of a centre line where lines meet or a wedge's corners are - goes when shorter than this many times the ink's depth where it branches, and a line's width. */
const SPUR = 2;
/** Pieces of a centre line turning by less than this, in degrees, are one straight line. */
const STRAIGHT_DEG = 8;
/** Two lines from one join running within this, in degrees, of each other are a double bond's two lines (a fork): each kept on its own line. */
const FORK_DEG = 15;
/** A line widening from one end is a wedge where its wide end is this many times its figure's line, and its narrow end at most this share of its wide end. */
const WEDGE_WIDE = 2;
const WEDGE_NARROW = 0.5;
/**
 * ... and it widens one way all along it this surely: Kendall's rank correlation of its widths with where they lie, at the least. Ranks, not a
 * straight line's fit: at 300 dpi a wedge's widths are measured in bins a line wide, the pixels' grid making them uneven by a fifth or more.
 */
const WEDGE_EVEN = 0.3;
/**
 * A short line, free at both ends, whose ink swells to at least `WEDGE_WIDE` of the figure's line inside it and thins again to
 * `ARROW_THIN` of that at both of its ends - steadily on one side, a head's point; at once on the other, its line - is a line with a
 * filled head: a dative bond's arrow drawn between two labels, traced as one piece. No wedge narrows again at its wide end, nor a line
 * swells inside. It is at most `ARROW_LONG` of a bond, as such an arrow is (lib/figure/read `dativeArrows`).
 */
const ARROW_THIN = 0.6;
const ARROW_LONG = 1.2;
/** A patch smaller across than this share of a bond is a bar, a dot or a small letter, not lines. */
const SMALL = 0.3;
/** A patch smaller than this share of a bond, all of its pieces shorter than this other share, and joined, bent or closed as a letter's strokes are, is a letter. */
const LETTER = 1;
const LETTER_PIECE = 0.85;
/** A closed line is a circle where it bends at this many points or more and lies round its middle within this share of its radius. */
const ROUND_POINTS = 9;
const ROUND_WITHIN = 0.1;
/**
 * ... and has this many lines of other patches larger than a letter round it, each running across the way out from its middle (within 30 degrees of
 * square to it) with its middle within a bond of its line - a ring's bonds round its circle: an O, an o or a 0 is as round, but
 * stands at a bond's end, the lines by it pointing at it.
 */
const ROUND_RINGED = 4;
/** The bond is measured on the patches at least this share as large as the largest: a structure's, not its letters' (an H's or a D's strokes are as many as a small molecule's bonds). */
const BOND_PATCH = 0.6;
/** A picture whose bond is shorter than this many of its pixels is drawn too small to read: read, it is more often wrong than said. */
const LEAST_BOND = 25;
/** A picture this much of whose ink is shaded (`shadedOf`) is a photograph or a rendering, not a drawing. */
const SHADED = 0.1;
/**
 * A patch one piece of which spans at least this share of its extent, every other piece of it at most `LINE_REST` of that piece, is a line
 * - a reaction arrow, its head - not a structure: the largest patch the bond is measured beside is the largest that is not one.
 */
const LINE_SPAN = 0.75;
const LINE_REST = 0.35;
/**
 * A patch letter-sized, of two short pieces bent at a corner, with no line of a patch larger than a letter within this share of a bond of
 * it - a 7, a 1 with its flag, standing apart - is matched as a letter first where the system's letters are given; read as one surely, it
 * is a letter (a compound's number is words, not bonds), else lines. One straight piece alone is never: a bond from a label to its free
 * end - a methyl's, a CH2OH's - is one, and would be read as an l or an I.
 */
const APART = 0.3;
/**
 * A letter-sized patch of three lines or more, joined - an N, a W - whose pieces are longer than `LETTER_PIECE`'s (a letter printed
 * large beside short bonds: its slant longer than a bond's share), is a letter where two lines of a structure or more stop short of it,
 * pointing at it, each end within this share of a bond of its box: bonds to a label. Never lines: read as bonds, its strokes join those
 * ends as carbons, and the label's element is lost with nothing to say so.
 */
const LABEL_STOPS = 0.5;
/** A piece between two joints shorter than this, in the bond, is a joint thinning left open: `closedJoints`. */
const JOINT_SHORT = 0.35;

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

/** A picture's ink: which pixels are ink, and how much of each is inked, from naught to one. */
type Ink = { width: number; height: number; ink: Uint8Array; cover: Float32Array };

/**
 * Which of a picture's pixels are ink: those farther from the paper's
 * colour - the commonest colour in the picture - than the threshold that
 * best parts the picture into two classes (Otsu 1979). By their distance
 * from the paper, not their greyness: a coloured atom's letters and bonds
 * are ink, and light lines on a dark ground are as dark on light. None,
 * where nothing stands out from the paper.
 */
export function inkOf(p: Pixels): Ink | null {
  const { width, height, data } = p;
  const n = width * height;
  if (!n) return null;
  // (laid on white, where a pixel is see-through)
  const rgb = new Uint8Array(3 * n);
  for (let i = 0; i < n; i++) {
    const a = data[4 * i + 3] ?? 255;
    for (let c = 0; c < 3; c++) rgb[3 * i + c] = Math.round((data[4 * i + c] * a + 255 * (255 - a)) / 255);
  }
  // (the paper: the commonest colour, four bits a channel, and the mean of the pixels of it)
  const bins = new Uint32Array(4096);
  const keyOf = (i: number) => ((rgb[3 * i] >> 4) << 8) | ((rgb[3 * i + 1] >> 4) << 4) | (rgb[3 * i + 2] >> 4);
  for (let i = 0; i < n; i++) bins[keyOf(i)]++;
  let mode = 0;
  for (let k = 1; k < 4096; k++) if (bins[k] > bins[mode]) mode = k;
  const paper = [0, 0, 0];
  for (let i = 0; i < n; i++) if (keyOf(i) === mode) for (let c = 0; c < 3; c++) paper[c] += rgb[3 * i + c];
  for (let c = 0; c < 3; c++) paper[c] /= bins[mode];
  const far = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.max(Math.abs(rgb[3 * i] - paper[0]), Math.abs(rgb[3 * i + 1] - paper[1]), Math.abs(rgb[3 * i + 2] - paper[2])));
    far[i] = v;
    hist[v]++;
  }
  const t = Math.max(otsu(hist, n), FAINTEST);
  const ink = new Uint8Array(n);
  let inked = 0;
  for (let i = 0; i < n; i++)
    if (far[i] > t) {
      ink[i] = 1;
      inked++;
    }
  if (!inked) return null;
  // (a pixel wholly inked: as far from the paper as the darkest quarter of the ink is)
  const above: number[] = [];
  let k = 0;
  for (let v = 255; v > t && k < 0.25 * inked; v--) {
    k += hist[v];
    above.push(v);
  }
  const full = Math.max(above[above.length - 1] ?? 255, t + 1);
  const cover = new Float32Array(n);
  for (let i = 0; i < n; i++) cover[i] = Math.min(1, far[i] / full);
  return { width, height, ink, cover };
}

/**
 * How much of a picture's ink is shaded: the share of its inked pixels (a fifth inked or more) that are grey - between a fifth and
 * four fifths inked - with all eight pixels round them grey too. A drawing's grey is at the edges of its lines, beside paper or full
 * ink; a photograph's or a rendering's lies in fields.
 */
export function shadedOf(ink: Ink): number {
  const { width, height, cover } = ink;
  const grey = (v: number) => v >= 0.2 && v <= 0.8;
  let [inked, fields] = [0, 0];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = cover[y * width + x];
      if (v < 0.2) continue;
      inked++;
      if (!grey(v) || x === 0 || y === 0 || x === width - 1 || y === height - 1) continue;
      let all = true;
      for (let j = -1; j <= 1 && all; j++) for (let i = -1; i <= 1 && all; i++) all = grey(cover[(y + j) * width + x + i]);
      if (all) fields++;
    }
  return inked ? fields / inked : 0;
}

/** The threshold that best parts a histogram into two classes: the one with the greatest variance between them (Otsu 1979). Above it, the second class. */
function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let [sumB, wB, best, at] = [0, 0, -1, 0];
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) [best, at] = [between, t];
  }
  return at;
}

/** The ink's patches: each pixel's patch by number (-1 paper), touching at a side or a corner, found in two passes (Rosenfeld and Pfaltz 1966), and how many. */
export function patchesOf(ink: Uint8Array, width: number, height: number): { patch: Int32Array; count: number } {
  const patch = new Int32Array(width * height).fill(-1);
  const parent: number[] = [];
  const root = (k: number): number => {
    while (parent[k] !== k) k = parent[k] = parent[parent[k]];
    return k;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!ink[i]) continue;
      let own = -1;
      for (const [dx, dy] of [
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
      ]) {
        const [u, v] = [x + dx, y + dy];
        if (u < 0 || u >= width || v < 0) continue;
        const q = patch[v * width + u];
        if (q < 0) continue;
        if (own < 0) own = root(q);
        else {
          const [a, b] = [root(own), root(q)];
          if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
          own = Math.min(a, b);
        }
      }
      if (own < 0) {
        own = parent.length;
        parent.push(own);
      }
      patch[i] = own;
    }
  const number = new Map<number, number>();
  for (let i = 0; i < patch.length; i++) {
    if (patch[i] < 0) continue;
    const r = root(patch[i]);
    let k = number.get(r);
    if (k == null) number.set(r, (k = number.size));
    patch[i] = k;
  }
  return { patch, count: number.size };
}

/**
 * The ink thinned to its centre lines, a pixel wide, joined as it was (Zhang and Suen 1984), a pixel taken away only with three to six of
 * its neighbours inked, not two (Lü and Wang 1986): a slanting line two pixels thick - a bond at 300 dpi - is kept, not thinned away.
 */
export function thinned(ink: Uint8Array, width: number, height: number): Uint8Array {
  const s = ink.slice();
  const at = (x: number, y: number) => (x >= 0 && x < width && y >= 0 && y < height ? s[y * width + x] : 0);
  let live: number[] = [];
  for (let i = 0; i < s.length; i++) if (s[i]) live.push(i);
  const gone: number[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const step of [0, 1]) {
      gone.length = 0;
      for (const i of live) {
        const [x, y] = [i % width, Math.floor(i / width)];
        // (round it from above, clockwise: P2 to P9)
        const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        const b = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
        if (b < 3 || b > 6) continue;
        let a = 0;
        for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
        if (a !== 1) continue;
        const [n, e, so, w] = [p[0], p[2], p[4], p[6]];
        if (step === 0 ? n * e * so || e * so * w : n * e * w || n * so * w) continue;
        gone.push(i);
      }
      for (const i of gone) s[i] = 0;
      if (gone.length) {
        changed = true;
        live = live.filter((i) => s[i]);
      }
    }
  }
  return s;
}

/**
 * A centre line's pixels next to one: those at its sides, and those at its
 * corners that no pixel at a side joins to it already - so that a line
 * stepping across the pixels has two next to each pixel along it, and
 * only where lines meet more.
 */
function nextTo(s: Uint8Array, width: number, height: number, i: number): number[] {
  const [x, y] = [i % width, Math.floor(i / width)];
  const on = (u: number, v: number) => u >= 0 && u < width && v >= 0 && v < height && s[v * width + u] === 1;
  const out: number[] = [];
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ])
    if (on(x + dx, y + dy)) out.push((y + dy) * width + x + dx);
  for (const [dx, dy] of [
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ])
    if (on(x + dx, y + dy) && !on(x + dx, y) && !on(x, y + dy)) out.push((y + dy) * width + x + dx);
  return out;
}

/** A point where centre lines end or meet: where, how deep in the ink it lies, and the lines from it. */
type Node = { at: Point; deep: number; chains: Chain[]; gone?: true };
/** A centre line from one node to another, or closed on itself: its pixels' middles in order, and its patch. */
type Chain = { pts: Point[]; from: Node | null; to: Node | null; patch: number; gone?: true };

const middle = (i: number, width: number): Point => ({ x: (i % width) + 0.5, y: Math.floor(i / width) + 0.5 });
const lengthOf = (pts: readonly Point[]) => {
  let l = 0;
  for (let k = 1; k < pts.length; k++) l += dist(pts[k - 1], pts[k]);
  return l;
};

/** The centre lines as lines between nodes: where they end, where three or more meet, and closed ones on their own. */
function chainsOf(s: Uint8Array, width: number, height: number, patch: Int32Array, deep: Float64Array): { nodes: Node[]; chains: Chain[] } {
  const n = width * height;
  const links = new Map<number, number[]>();
  const of = (i: number) => {
    let l = links.get(i);
    if (!l) links.set(i, (l = nextTo(s, width, height, i)));
    return l;
  };
  // (each pixel that is no plain step along a line: an end, or where lines meet - those touching taken as one)
  const nodeOf = new Int32Array(n).fill(-1);
  const nodes: Node[] = [];
  const pixelsOf: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (!s[i] || of(i).length === 2 || nodeOf[i] >= 0) continue;
    const k = nodes.length;
    const group = [i];
    nodeOf[i] = k;
    if (of(i).length > 2)
      for (let g = 0; g < group.length; g++)
        for (const j of of(group[g]))
          if (nodeOf[j] < 0 && of(j).length > 2) {
            nodeOf[j] = k;
            group.push(j);
          }
    const pts = group.map((j) => middle(j, width));
    nodes.push({ at: { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length }, deep: Math.max(...group.map((j) => deep[j])), chains: [] });
    pixelsOf.push(group);
  }
  const chains: Chain[] = [];
  const walked = new Uint8Array(n);
  const steps = new Set<number>();
  const stepKey = (i: number, j: number) => Math.min(i, j) * n + Math.max(i, j);
  nodes.forEach((node, k) => {
    for (const p of pixelsOf[k])
      for (const q of of(p)) {
        if (nodeOf[q] === k || steps.has(stepKey(p, q))) continue;
        steps.add(stepKey(p, q));
        const path = [p];
        let [prev, cur] = [p, q];
        while (nodeOf[cur] < 0 && !walked[cur]) {
          walked[cur] = 1;
          path.push(cur);
          const next = of(cur).find((j) => j !== prev);
          if (next == null) break;
          steps.add(stepKey(cur, next));
          [prev, cur] = [cur, next];
        }
        if (nodeOf[cur] < 0) continue;
        path.push(cur);
        const to = nodes[nodeOf[cur]];
        const pts = path.map((j) => middle(j, width));
        pts[0] = node.at;
        pts[pts.length - 1] = to.at;
        const c: Chain = { pts, from: node, to, patch: patch[p] };
        node.chains.push(c);
        if (to !== node) to.chains.push(c);
        else node.chains.push(c);
        chains.push(c);
      }
  });
  // (lines closed on themselves, meeting nothing)
  for (let i = 0; i < n; i++) {
    if (!s[i] || nodeOf[i] >= 0 || walked[i]) continue;
    const path = [i];
    walked[i] = 1;
    let [prev, cur] = [-1, i];
    for (;;) {
      const next = of(cur).find((j) => j !== prev && !walked[j]);
      if (next == null) break;
      walked[next] = 1;
      path.push(next);
      [prev, cur] = [cur, next];
    }
    if (path.length > 2) chains.push({ pts: path.map((j) => middle(j, width)), from: null, to: null, patch: patch[i] });
  }
  return { nodes, chains };
}

/** Two chains meeting at a node joined into one through it; a chain from a node back to it closed. */
function joinedThrough(node: Node, chains: Chain[]): void {
  const [c, d] = node.chains;
  node.gone = true;
  if (c === d) {
    c.from = c.to = null;
    c.pts = c.pts.slice(0, -1);
    return;
  }
  const out = (x: Chain) => (x.to === node ? x.pts : [...x.pts].reverse());
  const into = (x: Chain) => (x.from === node ? x.pts : [...x.pts].reverse());
  const far = (x: Chain) => (x.from === node ? x.to : x.from);
  const [a, b] = [far(c), far(d)];
  const joined: Chain = { pts: [...out(c), ...into(d).slice(1)], from: a, to: b, patch: c.patch };
  c.gone = d.gone = true;
  // (both far ends one node: the joined line runs from it back to it, and counts twice there, as c and d did)
  for (const m of new Set([a, b])) if (m) m.chains = m.chains.map((x) => (x === c || x === d ? joined : x));
  chains.push(joined);
}

/**
 * The centre lines with their spurs gone - short branches where lines meet
 * at an angle, or to a wedge's wide corners, no longer than the ink is
 * deep there - and two nodes close together, joined by a line no longer
 * than they are deep, taken as one: thinning makes both where lines meet.
 */
function pruned(nodes: Node[], chains: Chain[], line: number): void {
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of chains) {
      if (c.gone || !c.from || !c.to || c.from === c.to) continue;
      const [a, b] = [c.from, c.to];
      const length = lengthOf(c.pts);
      // (a node close by another: one)
      if (a.chains.length > 2 && b.chains.length > 2 && length < Math.max(2 * a.deep, 2 * b.deep, 2 * line)) {
        c.gone = true;
        const kept = a;
        kept.at = { x: (a.at.x + b.at.x) / 2, y: (a.at.y + b.at.y) / 2 };
        kept.deep = Math.max(a.deep, b.deep);
        kept.chains = [...a.chains.filter((x) => x !== c), ...b.chains.filter((x) => x !== c)];
        for (const x of b.chains) {
          if (x === c) continue;
          if (x.from === b) x.from = kept;
          if (x.to === b) x.to = kept;
        }
        b.gone = true;
        changed = true;
        continue;
      }
    }
    // (spurs: short lines from an end to where three or more meet - all of a node's at once, so that a wedge's two corners go
    // together, and its longest kept where every line from it is one)
    const spurs = new Map<Node, Chain[]>();
    for (const c of chains) {
      if (c.gone || !c.from || !c.to || c.from === c.to) continue;
      const [a, b] = [c.from, c.to];
      const [end, join] = a.chains.length === 1 && b.chains.length > 2 ? [a, b] : b.chains.length === 1 && a.chains.length > 2 ? [b, a] : [null, null];
      if (!end || !join || lengthOf(c.pts) >= SPUR * join.deep + line) continue;
      (spurs.get(join) ?? spurs.set(join, []).get(join)!).push(c);
    }
    for (const [join, cs] of spurs) {
      const gone = cs.length === join.chains.length ? [...cs].sort((p, q) => lengthOf(p.pts) - lengthOf(q.pts)).slice(0, -1) : cs;
      for (const c of gone) {
        c.gone = true;
        (c.from === join ? c.to : c.from)!.gone = true;
        join.chains = join.chains.filter((x) => x !== c);
        changed = true;
      }
    }
    for (const node of nodes) {
      if (node.gone || node.chains.length !== 2) continue;
      // (two lines left where three met: one line through it)
      joinedThrough(node, chains);
      changed = true;
    }
  }
}

/** A centre line's points each moved to the middle of it and the two beside it, its ends kept: thinning steps across the pixels a pixel either way. */
function smoothed(pts: readonly Point[]): Point[] {
  return pts.map((p, k) => (k === 0 || k === pts.length - 1 ? p : { x: (pts[k - 1].x + p.x + pts[k + 1].x) / 3, y: (pts[k - 1].y + p.y + pts[k + 1].y) / 3 }));
}

/** The points a line is fitted by, straight pieces within `eps` of it (Ramer 1972; Douglas and Peucker 1973): their places in it, first and last kept. */
function corners(pts: readonly Point[], eps: number): number[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const [p, q] = [pts[i], pts[j]];
    const l = dist(p, q);
    let [far, at] = [-1, -1];
    for (let k = i + 1; k < j; k++) {
      const d = l ? Math.abs((q.x - p.x) * (p.y - pts[k].y) - (p.x - pts[k].x) * (q.y - p.y)) / l : dist(p, pts[k]);
      if (d > far) [far, at] = [d, k];
    }
    if (far > eps) {
      keep[at] = 1;
      stack.push([i, at], [at, j]);
    }
  }
  const out: number[] = [];
  keep.forEach((k, i) => k && out.push(i));
  return out;
}

/** A point straight pieces meet at: a node, or a bend along a line - where the centre line has it, then where the pieces' own lines cross. */
export type Vertex = { at: Point; deep: number; free: boolean; pieces: Piece[] };
/** A straight piece of a centre line: its two ends, the pixels along it, its patch; the line it is fitted to; and, where one end is set on its own line (a fork's), that end. */
export type Piece = { a: Vertex; b: Vertex; pts: Point[]; patch: number; inner?: Point[]; fit?: { c: Point; u: Point }; endA?: Point; endB?: Point };

/** The straight line through points that lies nearest all of them: a point on it and its way. */
function fitLine(pts: readonly Point[]): { c: Point; u: Point } {
  const c = { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
  let [xx, xy, yy] = [0, 0, 0];
  for (const p of pts) {
    xx += (p.x - c.x) ** 2;
    xy += (p.x - c.x) * (p.y - c.y);
    yy += (p.y - c.y) ** 2;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  return { c, u: { x: Math.cos(angle), y: Math.sin(angle) } };
}

/** The angle between two ways, in degrees, from naught to 180. */
const between = (u: Point, v: Point) => (Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * 180) / Math.PI;

/** A piece's way from one of its ends, along its fitted line. */
function wayFrom(p: Piece, v: Vertex): Point {
  const other = v === p.a ? p.b : p.a;
  const u = p.fit!.u;
  const s = (other.at.x - v.at.x) * u.x + (other.at.y - v.at.y) * u.y >= 0 ? 1 : -1;
  return { x: s * u.x, y: s * u.y };
}

/** Where a point falls on a line, at right angles. */
function onLine(p: Point, line: { c: Point; u: Point }): Point {
  const t = (p.x - line.c.x) * line.u.x + (p.y - line.c.y) * line.u.y;
  return { x: line.c.x + t * line.u.x, y: line.c.y + t * line.u.y };
}

/**
 * The straight pieces of the centre lines: each line cut where it bends
 * (no bend within the ink's depth of where lines meet, where thinning
 * curves them), each piece fitted to its own pixels away from its ends,
 * and each point where pieces meet set where their lines cross - the
 * atom's place. Two pieces from one point running nearly the same way are
 * a double bond's two lines, drawn into one joint: each keeps its own line.
 */
function piecesOf(nodes: readonly Node[], chains: readonly Chain[], line: number, deepAt: (p: Point) => number): { vertices: Vertex[]; pieces: Piece[] } {
  const eps = Math.max(1, line / 2);
  const vertexOf = new Map<Node, Vertex>();
  const vertices: Vertex[] = [];
  const vertex = (at: Point, deep: number, free: boolean): Vertex => {
    const v = { at, deep, free, pieces: [] };
    vertices.push(v);
    return v;
  };
  for (const node of nodes) if (!node.gone && node.chains.length) vertexOf.set(node, vertex(node.at, node.deep, node.chains.length === 1));
  const pieces: Piece[] = [];
  for (const c of chains) {
    if (c.gone || c.pts.length < 2) continue;
    let pts = c.pts;
    let cut: number[];
    if (!c.from) {
      // (closed: begun at its point farthest from its middle, cut again at the point farthest from that)
      const m = { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
      const i0 = pts.reduce((b, p, k) => (dist(p, m) > dist(pts[b], m) ? k : b), 0);
      pts = [...pts.slice(i0), ...pts.slice(0, i0), pts[i0]];
      const i1 = pts.reduce((b, p, k) => (dist(p, pts[0]) > dist(pts[b], pts[0]) ? k : b), 0);
      const even = smoothed(pts);
      cut = [...corners(even.slice(0, i1 + 1), eps), ...corners(even.slice(i1), eps).slice(1).map((k) => k + i1)];
    } else cut = corners(smoothed(pts), eps);
    // (no bend close by where lines meet: thinning bends them there)
    const nearJoin = (k: number) => {
      for (const [end, node] of [
        [0, c.from],
        [pts.length - 1, c.to],
      ] as const)
        if (node && node.chains.length > 2 && dist(pts[k], pts[end]) < Math.max(2, 2 * node.deep)) return true;
      return false;
    };
    cut = cut.filter((k, i) => i === 0 || i === cut.length - 1 || !nearJoin(k));
    // (nor two pieces running on the same way, nor a piece shorter than two lines are wide - where thinning cuts a corner; a closed
    // line's first point as any other, it being begun anywhere)
    const closed = !c.from;
    const turns = closed ? cut.slice(0, -1) : cut;
    const least = Math.max(2, 2 * line);
    for (let again = true; again && turns.length > (closed ? 3 : 2); ) {
      again = false;
      for (let i = closed ? 0 : 1; i < (closed ? turns.length : turns.length - 1); i++) {
        const m = turns.length;
        const [p, q, r] = [pts[turns[(i + m - 1) % m]], pts[turns[i]], pts[turns[(i + 1) % m]]];
        const [lp, lr] = [dist(p, q), dist(q, r)];
        const turn = lp && lr ? between({ x: (q.x - p.x) / lp, y: (q.y - p.y) / lp }, { x: (r.x - q.x) / lr, y: (r.y - q.y) / lr }) : 0;
        if (turn < STRAIGHT_DEG || Math.min(lp, lr) < least) {
          turns.splice(i, 1);
          again = true;
          break;
        }
      }
    }
    if (closed) {
      // (begun again at its first point kept)
      const m = pts.length - 1;
      const s0 = turns[0];
      pts = [...pts.slice(s0, m), ...pts.slice(0, s0), pts[s0]];
      cut = [...turns.map((k) => (k - s0 + m) % m).sort((p, q) => p - q), m];
    } else cut = turns;
    // (a last piece to a free end no longer than the ink is deep where it bends off - thinning turning into one corner of a wedge's
    // wide end - is no line: the line ends at the bend, and goes on to its ink's end from there)
    for (const [end, last] of [
      [c.from, 0],
      [c.to, 1],
    ] as const) {
      if (closed || !end || end.chains.length !== 1 || cut.length < 3) continue;
      const [k, j] = last ? [cut[cut.length - 2], cut[cut.length - 1]] : [cut[1], cut[0]];
      if (dist(pts[k], pts[j]) >= SPUR * deepAt(pts[k]) + line) continue;
      end.at = pts[k];
      if (last) {
        pts = pts.slice(0, k + 1);
        cut = cut.slice(0, -1);
      } else {
        pts = pts.slice(k);
        cut = cut.slice(1).map((x) => x - k);
      }
      vertexOf.get(end)!.at = end.at;
    }
    const ends = cut.map((k, i) => {
      if (i === 0 && c.from) return vertexOf.get(c.from)!;
      if (i === cut.length - 1 && c.to) return vertexOf.get(c.to)!;
      if (i === cut.length - 1 && !c.from) return null;
      return vertex(pts[k], deepAt(pts[k]), false);
    });
    // (a closed line's last end is its first)
    if (!c.from) ends[ends.length - 1] = ends[0];
    for (let i = 1; i < cut.length; i++) {
      const piece: Piece = { a: ends[i - 1]!, b: ends[i]!, pts: pts.slice(cut[i - 1], cut[i] + 1), patch: c.patch };
      piece.a.pieces.push(piece);
      piece.b.pieces.push(piece);
      pieces.push(piece);
    }
  }
  // (each piece fitted away from where it meets others)
  for (const p of pieces) {
    const trim = (v: Vertex) => (v.free ? 0 : Math.max(1.5, 1.5 * v.deep, line));
    const inner = p.pts.filter((q) => dist(q, p.a.at) >= trim(p.a) && dist(q, p.b.at) >= trim(p.b));
    p.inner = inner.length >= 3 ? inner : p.pts;
    p.fit = fitLine(p.inner);
  }
  // (where pieces meet: where their lines cross - a fork's two lines taken as their middle line, each end set on its own)
  for (const v of vertices) {
    if (v.free || v.pieces.length < 2) continue;
    const ways = v.pieces.map((p) => wayFrom(p, v));
    const groups: number[][] = [];
    ways.forEach((w, i) => {
      const g = groups.find((g) => between(ways[g[0]], w) < FORK_DEG);
      if (g) g.push(i);
      else groups.push([i]);
    });
    if (groups.length < 2) continue;
    let [mxx, mxy, myy, rx, ry] = [0, 0, 0, 0, 0];
    for (const g of groups) {
      const c = { x: g.reduce((t, i) => t + v.pieces[i].fit!.c.x, 0) / g.length, y: g.reduce((t, i) => t + v.pieces[i].fit!.c.y, 0) / g.length };
      const u = { x: g.reduce((t, i) => t + ways[i].x, 0), y: g.reduce((t, i) => t + ways[i].y, 0) };
      const l = Math.hypot(u.x, u.y) || 1;
      const nx = -u.y / l;
      const ny = u.x / l;
      mxx += nx * nx;
      mxy += nx * ny;
      myy += ny * ny;
      const d = nx * c.x + ny * c.y;
      rx += nx * d;
      ry += ny * d;
    }
    const det = mxx * myy - mxy * mxy;
    if (det < 1e-3 * (mxx + myy) ** 2) continue;
    const at = { x: (myy * rx - mxy * ry) / det, y: (mxx * ry - mxy * rx) / det };
    if (dist(at, v.at) > Math.max(3, 3 * v.deep, 2 * line)) continue;
    v.at = at;
    for (const g of groups)
      if (g.length > 1)
        for (const i of g) {
          const p = v.pieces[i];
          const e = onLine(at, p.fit!);
          if (p.a === v) p.endA = e;
          if (p.b === v) p.endB = e;
        }
  }
  return { vertices, pieces };
}

/** Ink across a straight piece, along it: how wide it is drawn at points along it, from how much ink lies across it there - only its own patch's, clear of where it meets others. */
function widthsAlong(ink: Ink, patch: Int32Array, own: number, a: Point, b: Point, reach: number, clearA: number, clearB: number, step: number): { t: number; w: number }[] {
  const { width, height, cover } = ink;
  const l = dist(a, b);
  if (!l) return [];
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  const bins = Math.max(1, Math.min(16, Math.floor(l / Math.max(2, step))));
  const size = l / bins;
  const sum = new Float64Array(bins);
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach - 1));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + reach + 1));
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach - 1));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + reach + 1));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      // (its own patch's, and the paper's pixels partly inked at its edges)
      if ((patch[i] !== own && patch[i] >= 0) || !cover[i]) continue;
      const [dx, dy] = [x + 0.5 - a.x, y + 0.5 - a.y];
      const t = dx * u.x + dy * u.y;
      if (t < 0 || t >= l || Math.abs(dx * u.y - dy * u.x) > reach) continue;
      sum[Math.min(bins - 1, Math.floor(t / size))] += cover[i];
    }
  const out: { t: number; w: number }[] = [];
  for (let k = 0; k < bins; k++) {
    const [t0, t1] = [k * size, (k + 1) * size];
    if (t0 < clearA || t1 > l - clearB) continue;
    out.push({ t: (t0 + t1) / 2, w: sum[k] / size });
  }
  return out;
}

/**
 * How wide a line is drawn along it, a pixel at a time: in each step along it the ink within `reach` of it, by the paper it covers there -
 * no step's width counting a row of pixels twice, as steps a pixel and a bit long do.
 */
function widthsFine(ink: Ink, patch: Int32Array, own: number, a: Point, b: Point, reach: number): { t: number; w: number }[] {
  const { width, height, cover } = ink;
  const l = dist(a, b);
  const bins = Math.floor(l);
  if (bins < 1) return [];
  const size = l / bins;
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  const [sum, area] = [new Float64Array(bins), new Float64Array(bins)];
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach - 1));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + reach + 1));
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach - 1));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + reach + 1));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const [dx, dy] = [x + 0.5 - a.x, y + 0.5 - a.y];
      const t = dx * u.x + dy * u.y;
      if (t < 0 || t >= l || Math.abs(dx * u.y - dy * u.x) > reach) continue;
      const k = Math.min(bins - 1, Math.floor(t / size));
      area[k]++;
      const i = y * width + x;
      if ((patch[i] === own || patch[i] < 0) && cover[i]) sum[k] += cover[i];
    }
  const out: { t: number; w: number }[] = [];
  for (let k = 0; k < bins; k++) if (area[k]) out.push({ t: (k + 0.5) * size, w: (sum[k] / area[k]) * 2 * reach });
  return out;
}

const median = (v: readonly number[]) => {
  const s = [...v].sort((p, q) => p - q);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** How far a line goes on from a point, the way given, before its ink gives out - to its drawn end, past where thinning stops it. */
function inkEnd(ink: Ink, patch: Int32Array, own: number, from: Point, u: Point, most: number): Point {
  const { width, height, cover } = ink;
  const covered = (p: Point) => {
    const [x, y] = [Math.floor(p.x), Math.floor(p.y)];
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    const i = y * width + x;
    return patch[i] === own || patch[i] < 0 ? cover[i] : 0;
  };
  let last = from;
  for (let s = 0.25; s <= most; s += 0.25) {
    const p = { x: from.x + u.x * s, y: from.y + u.y * s };
    if (covered(p) < 0.5) break;
    last = p;
  }
  return last;
}

/** A patch's outlines, round its pixels' edges - its border and each hole's - each closed, its straight runs one side. */
function outlinesOf(patch: Int32Array, own: number, width: number, box: [number, number, number, number]): Point[][] {
  const [x0, y0, x1, y1] = box;
  const on = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && patch[y * width + x] === own;
  // (each edge between a pixel of it and one not, the patch to its right as the picture is drawn, y down)
  const out = new Map<string, [number, number][]>();
  const add = (fx: number, fy: number, tx: number, ty: number) => {
    const k = `${fx},${fy}`;
    (out.get(k) ?? out.set(k, []).get(k)!).push([tx, ty]);
  };
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) add(x, y, x + 1, y);
      if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!on(x - 1, y)) add(x, y + 1, x, y);
    }
  const loops: Point[][] = [];
  for (const [start, list] of out) {
    while (list.length) {
      const [sx, sy] = start.split(",").map(Number);
      const loop: Point[] = [{ x: sx, y: sy }];
      let [px, py] = [sx, sy];
      let [nx, ny] = list.pop()!;
      for (let guard = 0; guard < 1e6; guard++) {
        const [dx, dy] = [nx - px, ny - py];
        loop.push({ x: nx, y: ny });
        if (nx === sx && ny === sy) break;
        const next = out.get(`${nx},${ny}`);
        if (!next?.length) break;
        // (at a corner two pixels touch at: turned left, keeping them one patch)
        const left = next.findIndex(([qx, qy]) => qx - nx === dy && qy - ny === -dx);
        const k = next.length > 1 && left >= 0 ? left : next.length - 1;
        [px, py] = [nx, ny];
        [nx, ny] = next.splice(k, 1)[0];
      }
      // (corners only: points along a straight run dropped)
      const pts = loop.slice(0, -1).filter((q, i, all) => {
        const [p, r] = [all[(i + all.length - 1) % all.length], all[(i + 1) % all.length]];
        return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x) !== 0;
      });
      if (pts.length >= 3) loops.push(pts);
    }
  }
  return loops;
}

/**
 * A picture traced: the shapes its ink makes, as the figure reader takes a
 * PDF's (see the head of this file); or why it gave none. Ink lying within
 * `drop` - boxes in its pixels, where a PDF's own letters lie over the
 * picture - is left out: those letters are read as written. `known`, the
 * system's letters: a patch that may be a letter or lines (`APART`) is
 * matched against them first.
 */
export function tracePicture(pixels: Pixels, drop: readonly Box[] = [], known: readonly GlyphShape[] = []): Traced | Untraced {
  const ink = inkOf(pixels);
  if (!ink) return { none: "Nothing is drawn in the picture." };
  const shaded = shadedOf(ink);
  if (shaded > SHADED) return { none: "The picture is shaded, as a photograph or a rendering is: it is not a drawing to read." };
  const { width, height } = ink;
  const { patch, count } = patchesOf(ink.ink, width, height);
  // (each patch's box and ink; those lying within the letters given left out)
  const boxes = Array.from({ length: count }, () => [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number]);
  const size = new Uint32Array(count);
  const given = new Uint32Array(count);
  for (let i = 0; i < patch.length; i++) {
    const k = patch[i];
    if (k < 0) continue;
    const [x, y] = [i % width, Math.floor(i / width)];
    const b = boxes[k];
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x);
    b[3] = Math.max(b[3], y);
    size[k]++;
    if (drop.some((d) => x + 0.5 >= d[0] - 1 && x + 0.5 <= d[2] + 1 && y + 0.5 >= d[1] - 1 && y + 0.5 <= d[3] + 1)) given[k]++;
  }
  const dropped = new Uint8Array(count);
  for (let k = 0; k < count; k++) if (given[k] >= 0.7 * size[k]) dropped[k] = 1;
  const kept = ink.ink.map((v, i) => (v && !dropped[patch[i]] ? 1 : 0));
  // (how deep each pixel of ink lies: how far from the paper)
  const paper = kept.map((v) => 1 - v);
  const deep = distances(paper, width, height);
  const skeleton = thinned(kept, width, height);
  // (the line most is drawn with, roughly: the ink over the length of its centre lines)
  let [inked, along] = [0, 0];
  for (let i = 0; i < skeleton.length; i++) {
    if (kept[i] || (patch[i] < 0 && ink.cover[i])) inked += ink.cover[i];
    if (!skeleton[i]) continue;
    const [x, y] = [i % width, Math.floor(i / width)];
    for (const j of nextTo(skeleton, width, height, i)) along += (j % width === x || Math.floor(j / width) === y ? 1 : Math.SQRT2) / 2;
  }
  if (!inked) return { none: "Nothing is drawn in the picture." };
  const line0 = Math.max(1, inked / Math.max(along, 1));
  const { nodes, chains } = chainsOf(skeleton, width, height, patch, deep);
  pruned(nodes, chains, line0);
  const { pieces } = piecesOf(nodes, chains, line0, (q) => deep[Math.min(height - 1, Math.floor(q.y)) * width + Math.min(width - 1, Math.floor(q.x))] ?? 0);
  // (each piece's two ends: where pieces meet, the point found; a fork's, on its own line; a free end, on along its line to where its ink ends)
  type Laid = { piece: Piece; a: Point; b: Point; length: number };
  const laid: Laid[] = pieces.map((p) => {
    let a = p.endA ?? (p.a.free ? onLine(p.a.at, p.fit!) : p.a.at);
    let b = p.endB ?? (p.b.free ? onLine(p.b.at, p.fit!) : p.b.at);
    const l = dist(a, b) || 1;
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    if (p.a.free) a = inkEnd(ink, patch, p.patch, a, { x: -u.x, y: -u.y }, 4 * line0 + 4);
    if (p.b.free) b = inkEnd(ink, patch, p.patch, b, u, 4 * line0 + 4);
    return { piece: p, a, b, length: dist(a, b) };
  });
  // (how wide each is drawn along it)
  const profiles = laid.map(({ piece, a, b }) => {
    const deepest = Math.max(...piece.inner!.map((q) => deep[Math.min(height - 1, Math.floor(q.y)) * width + Math.min(width - 1, Math.floor(q.x))] ?? 0));
    const reach = 2 * deepest + 2;
    const clear = (v: Vertex) => (v.free ? line0 : reach + line0);
    return widthsAlong(ink, patch, piece.patch, a, b, reach, clear(piece.a), clear(piece.b), line0);
  });
  // (a short line free at both ends, measured finely - a pixel's bins - for a head on it: its line and its head, where it has one)
  const headed = (i: number): { stroke: Stroke; head: Wedge } | null => {
    const { piece, a, b, length } = laid[i];
    if (!piece.a.free || !piece.b.free || piece.a === piece.b || length > ARROW_LONG * bond) return null;
    const deepest = Math.max(...piece.inner!.map((q) => deep[Math.min(height - 1, Math.floor(q.y)) * width + Math.min(width - 1, Math.floor(q.x))] ?? 0));
    return arrowOf(widthsFine(ink, patch, piece.patch, a, b, 2 * deepest + 2), a, b, line);
  };
  const line = median(laid.flatMap((_, k) => (profiles[k].length ? [median(profiles[k].map((s) => s.w))] : []))) || line0;
  // (a line closed on itself, meeting nothing, cut at many points and round: a circle - told first, its many short pieces no bonds)
  const byPatch = new Map<number, number[]>();
  laid.forEach((l, k) => (byPatch.get(l.piece.patch) ?? byPatch.set(l.piece.patch, []).get(l.piece.patch)!).push(k));
  const circles = new Map<number, Chain>();
  for (const c of chains) {
    if (c.gone || c.from || (byPatch.get(c.patch) ?? []).length < ROUND_POINTS || chains.some((d) => d !== c && !d.gone && d.patch === c.patch)) continue;
    const m = { x: c.pts.reduce((t, p) => t + p.x, 0) / c.pts.length, y: c.pts.reduce((t, p) => t + p.y, 0) / c.pts.length };
    const r = c.pts.map((p) => dist(p, m));
    const mean = r.reduce((t, v) => t + v, 0) / r.length;
    if (Math.sqrt(r.reduce((t, v) => t + (v - mean) ** 2, 0) / r.length) < ROUND_WITHIN * mean) circles.set(c.patch, c);
  }
  // (the bond: as the reader measures it, on the pieces of patches near as large as the largest - a structure's, not its letters')
  const extent = (k: number) => Math.max(boxes[k][2] - boxes[k][0], boxes[k][3] - boxes[k][1]) + 1;
  const lines = laid.filter((l) => !circles.has(l.piece.patch));
  const largest = Math.max(0, ...lines.map((l) => extent(l.piece.patch)));
  const asStrokes = (ls: readonly Laid[]): Stroke[] => ls.map((l) => ({ a: l.a, b: l.b, w: line }));
  const empty = { wedges: [], curves: [], blobs: [] };
  // (a scheme's reaction arrow may be far longer than any of its structures: the largest patch that is not a line - one piece spanning
  //  it, the others short - is what a structure's patch is near as large as; where every patch is one, the largest of them)
  const isLine = (k: number) => {
    const own = (byPatch.get(k) ?? []).map((i) => laid[i].length).sort((p, q) => q - p);
    return own.length > 0 && own[0] >= LINE_SPAN * extent(k) && own.slice(1).every((v) => v <= LINE_REST * own[0]);
  };
  const sized = Math.max(0, ...lines.filter((l) => !isLine(l.piece.patch)).map((l) => extent(l.piece.patch))) || largest;
  const structural = (k: number) => extent(k) >= BOND_PATCH * sized;
  const bond = figureBond({ strokes: asStrokes(lines.filter((l) => structural(l.piece.patch))), ...empty }, []) || figureBond({ strokes: asStrokes(lines), ...empty }, []) || largest;
  if (bond < LEAST_BOND) return { none: "The picture is drawn too small to read." };
  const gone = closedJoints(laid, bond);
  // (a circle's ring: lines of other patches whose middles lie within half a bond of its line)
  const ringed = (k: number) => {
    const c = circles.get(k);
    if (!c) return false;
    const m = { x: c.pts.reduce((t, p) => t + p.x, 0) / c.pts.length, y: c.pts.reduce((t, p) => t + p.y, 0) / c.pts.length };
    const r = c.pts.reduce((t, p) => t + dist(p, m), 0) / c.pts.length;
    const round = (l: Laid) => {
      const mid = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
      const d = dist(mid, m);
      if (l.piece.patch === k || extent(l.piece.patch) < LETTER * bond || d < r || d > r + bond || !l.length) return false;
      // (across the way out: the line's direction nearly square to the way from the middle to its own middle)
      return Math.abs(((l.b.x - l.a.x) * (mid.x - m.x) + (l.b.y - l.a.y) * (mid.y - m.y)) / (l.length * d)) < Math.sin(Math.PI / 6);
    };
    return lines.filter(round).length >= ROUND_RINGED;
  };
  const shapes: Shapes = { strokes: [], wedges: [], curves: [], blobs: [] };
  const stems: { k: number; box: [number, number, number, number]; stroke: Stroke }[] = [];
  // (a patch that may be a letter or lines, as `APART`: its lines, for where it is read as no letter)
  const maybe: { k: number; box: [number, number, number, number]; strokes: Stroke[] }[] = [];
  const near = (p: Point, l: Laid) => {
    const [dx, dy] = [l.b.x - l.a.x, l.b.y - l.a.y];
    const t = Math.max(0, Math.min(1, ((p.x - l.a.x) * dx + (p.y - l.a.y) * dy) / (dx * dx + dy * dy || 1)));
    return dist(p, { x: l.a.x + t * dx, y: l.a.y + t * dy });
  };
  const apart = (k: number, own: readonly number[]) =>
    lines.every((l) => l.piece.patch === k || extent(l.piece.patch) < LETTER * bond || own.every((i) => [laid[i].a, laid[i].b].every((p) => near(p, l) > APART * bond)));
  // (whether two lines of a structure or more stop short of patch `k`, as bonds to a label do: each a free end within `LABEL_STOPS` of
  //  its box, the line pointing into the box)
  const stoppedAt = (k: number, box: readonly number[]) => {
    const reach = LABEL_STOPS * bond;
    const inBox = (p: Point, pad: number) => p.x >= box[0] - pad && p.x <= box[2] + pad && p.y >= box[1] - pad && p.y <= box[3] + pad;
    const stops = lines.filter((l) => {
      if (l.piece.patch === k || extent(l.piece.patch) < LETTER * bond || !l.length) return false;
      return ([[l.piece.a, l.a, l.b], [l.piece.b, l.b, l.a]] as const).some(([v, end, from]) => {
        if (!v.free || !inBox(end, reach) || inBox(end, 0)) return false;
        // (the line carried on past its end by `reach` comes into the box)
        const t = reach / l.length;
        return inBox({ x: end.x + (end.x - from.x) * t, y: end.y + (end.y - from.y) * t }, 0);
      });
    });
    return stops.length >= 2;
  };
  for (let k = 0; k < count; k++) {
    if (dropped[k]) continue;
    const own = byPatch.get(k) ?? [];
    const box = boxes[k];
    const across = extent(k);
    const circle = ringed(k) ? circles.get(k) : undefined;
    if (circle) {
      shapes.curves.push({ pts: circle.pts.filter((_, i) => i % Math.max(1, Math.round(line)) === 0), closed: true, w: line } satisfies Curve);
      continue;
    }
    // (small: a bar or a dot - a hash's line, a charge's, an i's dot - a stroke as long and as wide as its ink; else a small letter)
    if (across < SMALL * bond || !own.length) {
      const bar = barOf(ink, patch, k, box);
      if (bar) {
        shapes.strokes.push(bar);
        continue;
      }
    }
    const longest = Math.max(0, ...own.map((i) => laid[i].length));
    const joined = own.some((i) => [laid[i].piece.a, laid[i].piece.b].some((v) => !v.free && v.pieces.length > 2));
    const closed = own.some((i) => laid[i].piece.a === laid[i].piece.b) || chains.some((c) => !c.gone && c.patch === k && !c.from);
    // (a letter: small, its strokes short and joined, bent or closed - its outlines, for the letters' matcher; or of three lines or more,
    //  as large as a letter, where a structure's bonds stop short of it - `LABEL_STOPS`)
    const letter = across < LETTER * bond && (joined || closed || own.length >= 3) && (longest < LETTER_PIECE * bond || (own.length >= 3 && stoppedAt(k, box)));
    if (across < SMALL * bond || letter) {
      const parts = outlinesOf(patch, k, width, box);
      const all = parts.flat();
      if (all.length) shapes.blobs.push({ pts: all, parts, box: boxOf(all), curved: true } satisfies Blob);
      continue;
    }
    // (one line alone with a filled head on it: a dative bond's arrow - its line and its head, as a drawing's own are)
    const arrow = own.length === 1 && !gone.has(own[0]) ? headed(own[0]) : null;
    if (arrow) {
      shapes.strokes.push(arrow.stroke);
      shapes.wedges.push(arrow.head);
      continue;
    }
    // (one upright line alone, as tall as a letter, its ends free: an l, an I or a 1 - or a bond; told after the letters are known)
    if (own.length === 1 && !gone.has(own[0])) {
      const { a, b, piece } = laid[own[0]];
      const tall = box[3] - box[1] + 1;
      if (piece.a.free && piece.b.free && Math.abs(a.x - b.x) < 0.2 * Math.abs(a.y - b.y) && tall >= SMALL * bond && tall <= LETTER * bond) {
        stems.push({ k, box, stroke: { a, b, w: profiles[own[0]].length ? median(profiles[own[0]].map((q) => q.w)) : line } });
        continue;
      }
    }
    // (a 1 with its flag, a 7 standing apart - two pieces meeting at a corner: matched as a letter first, where the letters are given)
    const bent = own.length === 2 && [laid[own[0]].piece.a, laid[own[0]].piece.b].some((v) => v === laid[own[1]].piece.a || v === laid[own[1]].piece.b);
    if (known.length && across < LETTER * bond && longest < LETTER_PIECE * bond && bent && apart(k, own)) {
      maybe.push({ k, box, strokes: own.filter((i) => !gone.has(i)).map((i) => ({ a: laid[i].a, b: laid[i].b, w: profiles[i].length ? median(profiles[i].map((q) => q.w)) : line })) });
      continue;
    }
    for (const i of own) {
      if (gone.has(i)) continue;
      const { a, b } = laid[i];
      const s = profiles[i];
      const w = s.length ? median(s.map((q) => q.w)) : line;
      const headed1 = headed(i);
      if (headed1) {
        shapes.strokes.push(headed1.stroke);
        shapes.wedges.push(headed1.head);
        continue;
      }
      const wedge = s.length >= 3 ? widening(s, dist(a, b)) : null;
      if (wedge && Math.max(wedge.wa, wedge.wb) >= WEDGE_WIDE * line && Math.min(wedge.wa, wedge.wb) <= WEDGE_NARROW * Math.max(wedge.wa, wedge.wb)) {
        const [tip, base, wide] = wedge.wa < wedge.wb ? [a, b, wedge.wb] : [b, a, wedge.wa];
        shapes.wedges.push({ tip, base, w: wide } satisfies Wedge);
        continue;
      }
      shapes.strokes.push({ a, b, w });
    }
  }
  // (each that may be a letter, matched among the letters traced: a letter where read as one surely, else its lines - before the stems,
  //  which a letter so read may stand beside)
  if (maybe.length) {
    const asBlob = maybe.map(({ k, box }) => {
      const parts = outlinesOf(patch, k, width, box);
      return parts.flat().length ? ({ pts: parts.flat(), parts, box: boxOf(parts.flat()), curved: true } satisfies Blob) : null;
    });
    const read = new Set(shapeLetters({ ...shapes, blobs: [...shapes.blobs, ...asBlob.flatMap((b) => (b ? [b] : []))] }, bond, known).filter(sureEnough).flatMap((l) => l.from));
    maybe.forEach((m, i) => {
      const b = asBlob[i];
      if (b && read.has(b)) shapes.blobs.push(b);
      else shapes.strokes.push(...m.strokes);
    });
  }
  // (a stem beside a letter, as tall as it, on its line - the l of Cl, the 1 of 13 - is a letter too: its outline for the matcher; else a line)
  const letterBoxes = shapes.blobs.map((b) => b.box);
  for (const { k, box, stroke } of stems) {
    const tall = box[3] - box[1] + 1;
    const beside = letterBoxes.some((o) => {
      const h = o[3] - o[1];
      return h >= 0.6 * tall && h <= 1.4 * tall && Math.abs(o[3] - box[3]) <= 0.25 * tall && Math.min(Math.abs(o[0] - box[2]), Math.abs(box[0] - o[2])) <= 0.5 * tall;
    });
    const parts = beside ? outlinesOf(patch, k, width, box) : [];
    if (parts.flat().length) shapes.blobs.push({ pts: parts.flat(), parts, box: boxOf(parts.flat()), curved: true } satisfies Blob);
    else shapes.strokes.push(stroke);
  }
  return { shapes, line, bond, shaded };
}

/**
 * Joints thinning left open, closed again: where lines meet, thinning may
 * leave the joint as two or three nodes joined by short pieces - a wedge's
 * wide end turned into one corner of it, a centred double bond's two lines
 * each run into a node of their own. A piece between two joints, shorter
 * than `JOINT_SHORT` of the bond, is no bond: its ends are one joint, set
 * where the other lines into it cross (or their middle, where those lie
 * along one line), each of those lines' ends moved there. The pieces so
 * gone, by their places in `laid`.
 */
export function closedJoints(laid: { piece: Piece; a: Point; b: Point; length: number }[], bond: number): Set<number> {
  const short = (k: number) => {
    const { piece, length } = laid[k];
    return !piece.a.free && !piece.b.free && piece.a !== piece.b && length < JOINT_SHORT * bond;
  };
  const up = new Map<Vertex, Vertex>();
  const root = (v: Vertex): Vertex => {
    let r = v;
    while (up.has(r) && up.get(r) !== r) r = up.get(r)!;
    return r;
  };
  const gone = new Set<number>();
  laid.forEach((_, k) => {
    if (!short(k)) return;
    gone.add(k);
    const [ra, rb] = [root(laid[k].piece.a), root(laid[k].piece.b)];
    if (ra !== rb) up.set(ra, rb);
  });
  if (!gone.size) return gone;
  // (each joint so made: the ends of the lines into it, and where the lines run)
  const into = new Map<Vertex, { k: number; end: "a" | "b" }[]>();
  laid.forEach((l, k) => {
    if (gone.has(k)) return;
    for (const end of ["a", "b"] as const) {
      const v = l.piece[end];
      if (!up.has(v) && ![...up.values()].includes(v)) continue;
      const r = root(v);
      (into.get(r) ?? into.set(r, []).get(r)!).push({ k, end });
    }
  });
  for (const ends of into.values()) {
    // (each line's end into the joint, and its way out of it; lines running one way - a fork, a double bond's two lines - one group)
    const lines = ends.map(({ k, end }) => {
      const l = laid[k];
      const [p, q] = end === "a" ? [l.a, l.b] : [l.b, l.a];
      const d = dist(p, q) || 1;
      return { k, end, p, u: { x: (q.x - p.x) / d, y: (q.y - p.y) / d } };
    });
    const groups: (typeof lines)[] = [];
    for (const l of lines) {
      const g = groups.find((g) => between(g[0].u, l.u) < FORK_DEG);
      if (g) g.push(l);
      else groups.push([l]);
    }
    // (where the groups' middle lines cross, as near all of them as may be; their ends' middle where they lie along one line)
    let [mxx, mxy, myy, rx, ry] = [0, 0, 0, 0, 0];
    const mid = { x: lines.reduce((t, l) => t + l.p.x, 0) / lines.length, y: lines.reduce((t, l) => t + l.p.y, 0) / lines.length };
    for (const g of groups) {
      const c = { x: g.reduce((t, l) => t + l.p.x, 0) / g.length, y: g.reduce((t, l) => t + l.p.y, 0) / g.length };
      const u = { x: g.reduce((t, l) => t + l.u.x, 0), y: g.reduce((t, l) => t + l.u.y, 0) };
      const n = Math.hypot(u.x, u.y) || 1;
      const [nx, ny] = [-u.y / n, u.x / n];
      mxx += nx * nx;
      mxy += nx * ny;
      myy += ny * ny;
      const d = nx * c.x + ny * c.y;
      rx += nx * d;
      ry += ny * d;
    }
    const det = mxx * myy - mxy * mxy;
    const cross = groups.length > 1 && det > 1e-3 * (mxx + myy) ** 2 ? { x: (myy * rx - mxy * ry) / det, y: (mxx * ry - mxy * rx) / det } : null;
    const at = cross && dist(cross, mid) <= JOINT_SHORT * bond ? cross : mid;
    // (each end there - a fork's each on its own line, as where pieces meet: the two lines of a double bond stay side by side)
    for (const g of groups)
      for (const l of g) {
        const t = (at.x - l.p.x) * l.u.x + (at.y - l.p.y) * l.u.y;
        laid[l.k][l.end] = g.length > 1 ? { x: l.p.x + t * l.u.x, y: l.p.y + t * l.u.y } : at;
        laid[l.k].length = dist(laid[l.k].a, laid[l.k].b);
      }
  }
  return gone;
}

/**
 * A small patch as a bar or a dot, by how its ink spreads (its moments, the
 * paper's pixels partly inked at its edge with it): a bar as long and as
 * wide as a box of that spread, and filled as one; a dot, a stroke of no
 * length. None, where it is neither - a small letter.
 */
function barOf(ink: Ink, patch: Int32Array, own: number, box: readonly number[]): Stroke | null {
  const { width, height, cover } = ink;
  let [m, sx, sy] = [0, 0, 0];
  const px: number[] = [];
  const mine = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && patch[y * width + x] === own;
  for (let y = Math.max(0, box[1] - 1); y <= Math.min(height - 1, box[3] + 1); y++)
    for (let x = Math.max(0, box[0] - 1); x <= Math.min(width - 1, box[2] + 1); x++) {
      const i = y * width + x;
      // (its own pixels, and the paper's touching them)
      if (!cover[i] || (patch[i] !== own && (patch[i] >= 0 || ![-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => mine(x + dx, y + dy)))))) continue;
      m += cover[i];
      sx += cover[i] * (x + 0.5);
      sy += cover[i] * (y + 0.5);
      px.push(i);
    }
  if (!m) return null;
  const c = { x: sx / m, y: sy / m };
  let [xx, xy, yy] = [0, 0, 0];
  for (const i of px) {
    const [dx, dy] = [(i % width) + 0.5 - c.x, Math.floor(i / width) + 0.5 - c.y];
    xx += cover[i] * dx * dx;
    xy += cover[i] * dx * dy;
    yy += cover[i] * dy * dy;
  }
  const [a, b, d] = [xx / m, xy / m, yy / m];
  const root = Math.sqrt(((a - d) / 2) ** 2 + b * b);
  // (a box of even ink spreads a twelfth of its side's square each way; a pixel's own spread taken off)
  const long = Math.sqrt(Math.max(0, 12 * ((a + d) / 2 + root) - 1));
  const short = Math.sqrt(Math.max(0, 12 * ((a + d) / 2 - root) - 1));
  if (!long || !short || m < 0.75 * long * short) return null;
  const angle = 0.5 * Math.atan2(2 * b, a - d);
  const u = { x: Math.cos(angle), y: Math.sin(angle) };
  const half = long >= 1.5 * short ? long / 2 : 0;
  return { a: { x: c.x - u.x * half, y: c.y - u.y * half }, b: { x: c.x + u.x * half, y: c.y + u.y * half }, w: short };
}

/**
 * How a piece widens along it: as wide at its first end and at its second, by the line through its widths that the most of them agree on
 * (the median of the slopes between each two, and of what that leaves) - where they widen one way surely enough (`WEDGE_EVEN`).
 */
export function widening(s: readonly { t: number; w: number }[], l: number): { wa: number; wb: number } | null {
  const n = s.length;
  let [agree, disagree] = [0, 0];
  const slopes: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const [dt, dw] = [s[j].t - s[i].t, s[j].w - s[i].w];
      if (!dt) continue;
      if (dt * dw > 0) agree++;
      else if (dt * dw < 0) disagree++;
      slopes.push(dw / dt);
    }
  const pairs = (n * (n - 1)) / 2;
  if (!pairs || Math.abs(agree - disagree) / pairs < WEDGE_EVEN) return null;
  const slope = median(slopes);
  const at0 = median(s.map((q) => q.w - slope * q.t));
  return { wa: Math.max(0, at0), wb: Math.max(0, at0 + slope * l) };
}

/**
 * A line with a filled head, from its widths along it from `a` to `b` (`ARROW_THIN`): its line, from its tail to the head's base, as
 * wide as it is drawn, and its head, its point at the far end; or null where the widths are not so - a wedge's, a line's.
 */
export function arrowOf(s: readonly { t: number; w: number }[], a: Point, b: Point, line: number): { stroke: Stroke; head: Wedge } | null {
  if (s.length < 5) return null;
  const peak = Math.max(...s.map((q) => q.w));
  if (peak < WEDGE_WIDE * line || s[0].w > ARROW_THIN * peak || s[s.length - 1].w > ARROW_THIN * peak) return null;
  // (how far it takes from its widest on each side to thin to `ARROW_THIN`: at once on its line's side, the head's base drawn square
  //  across it; steadily on the head's, to its point. Near as far both ways - a swelling, a blot, a letter - no arrow)
  let p = 0;
  for (let k = 1; k < s.length; k++) if (s[k].w > s[p].w) p = k;
  let [up, down] = [p, p];
  while (up > 0 && s[up].w > ARROW_THIN * peak) up--;
  while (down < s.length - 1 && s[down].w > ARROW_THIN * peak) down++;
  const [rise, fall] = [s[p].t - s[up].t, s[down].t - s[p].t];
  if (Math.max(rise, fall) < 1.5 * Math.min(rise, fall) + 1) return null;
  const toB = fall > rise;
  // (the head thinning on to its point, never widening again; the line, at least three steps of it, as thin as the figure's lines)
  const head = toB ? s.slice(p, down + 1) : s.slice(up, p + 1).reverse();
  if (head.some((q, k) => k && q.w > head[k - 1].w + 0.15 * peak)) return null;
  const shaft = toB ? s.slice(0, up + 1) : s.slice(down);
  if (shaft.length < 3 || shaft.some((q) => q.w > 1.5 * line)) return null;
  const l = dist(a, b);
  const at = (t: number): Point => ({ x: a.x + ((b.x - a.x) * t) / l, y: a.y + ((b.y - a.y) * t) / l });
  const base = at(s[p].t);
  const [tail, point] = toB ? [a, b] : [b, a];
  return { stroke: { a: tail, b: base, w: median(shaft.map((q) => q.w)) }, head: { tip: point, base, w: peak } };
}

/** Shapes traced in a picture's pixels laid on a page: each point `k` times as far from naught, then moved by `dx`, `dy` - as a picture's pixels are made a PDF page's points. */
export function onPage(s: Shapes, k: number, dx: number, dy: number): Shapes {
  const p = (q: Point): Point => ({ x: q.x * k + dx, y: q.y * k + dy });
  const box = (b: Box): Box => [b[0] * k + dx, b[1] * k + dy, b[2] * k + dx, b[3] * k + dy];
  return {
    strokes: s.strokes.map((t) => ({ ...t, a: p(t.a), b: p(t.b), w: t.w * k })),
    wedges: s.wedges.map((w) => ({ ...w, tip: p(w.tip), base: p(w.base), w: w.w * k })),
    curves: s.curves.map((c) => ({ ...c, pts: c.pts.map(p), w: c.w * k })),
    blobs: s.blobs.map((b) => ({ ...b, pts: b.pts.map(p), parts: b.parts.map((q) => q.map(p)), box: box(b.box) })),
  };
}

/** A letter-sized patch the letters' matcher reads as no letter, this near an atom read (in the bond), leaves that atom unsure. */
const UNREAD_NEAR = 0.6;
/** ... and a letter read but in no label, this near: a label whose bond was not read stands a bond off the atom it was drawn on. */
const LEFT_NEAR = 1.2;

/**
 * Ink a picture holds that was read as nothing, beside the structure read from it: a letter-sized patch of its traced shapes that no
 * letter matches, lying within `UNREAD_NEAR` of the bond of an atom read. A label the matcher cannot read (drawn too small, its
 * letters run together) is otherwise left out with its bond, and what is left can be a whole structure that is not the picture's:
 * the atom nearest each such patch is said instead. By the atoms' places in `read.atoms`, each with what to say. (`letters`: those the
 * matcher read from `shapes`, where they are known already.)
 */
export function unreadInk(read: FigureRead, shapes: Shapes, known: readonly GlyphShape[], letters?: readonly { from: object[] }[]): Map<number, string> {
  const out = new Map<number, string>();
  if (!read.bond || !read.atoms.length) return out;
  const used = new Set<object>((letters ?? shapeLetters(shapes, read.bond, known)).flatMap((l) => l.from));
  for (const b of shapes.blobs) {
    if (used.has(b)) continue;
    const m = { x: (b.box[0] + b.box[2]) / 2, y: (b.box[1] + b.box[3]) / 2 };
    let [best, at] = [Infinity, -1];
    read.atoms.forEach((a, i) => {
      const d = dist(a, m);
      if (d < best) [best, at] = [d, i];
    });
    if (at >= 0 && best <= UNREAD_NEAR * read.bond) out.set(at, "Ink beside it in the picture was read as no letter.");
  }
  // (letters read, but in no atom's label: a label whose bond was not read)
  for (const l of read.left.letters) {
    const m = { x: (l.box[0] + l.box[2]) / 2, y: (l.box[1] + l.box[3]) / 2 };
    let [best, at] = [Infinity, -1];
    read.atoms.forEach((a, i) => {
      const d = dist(a, m);
      if (d < best) [best, at] = [d, i];
    });
    if (at >= 0 && best <= LEFT_NEAR * read.bond && !out.has(at)) out.set(at, `"${l.c}" beside it in the picture was read in no label.`);
  }
  return out;
}
