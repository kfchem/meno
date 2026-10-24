/**
 * How large a workflow's parts are on the page (docs/WORKFLOWS.md, *How
 * each looks*): in world units, at the page's scale - so they zoom with it,
 * as all on the page does. The specification's sizes are in pixels at the
 * zoom a canvas opens at in the default style; `PX` is one of them.
 */
import { PAGE_PX } from "../utils/pageScale";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

/** One of the specification's pixels: a page pixel, a bond being 48 of them as a canvas opens in ACS 1996 style (utils/pageScale). */
export const PX = PAGE_PX;
/** drei's Html, drawing a pixel as `PX` world units (it draws one as distanceFactor / 400). */
export const HTML_DISTANCE = PX * 400;

/**
 * Where a set or a step lies on the workflow's layer of HTML, its top left
 * at (x, y) on the page - and, `above`, over the parts drawn after it: a
 * step's card opened, its form growing down over the cards below it, which
 * are drawn later and so over it otherwise.
 */
/**
 * The ports' layer's place among what is laid over the page (drei's Html
 * `zIndexRange`): over the molecules' chips (20-30), their pointed cards
 * (30-40) and the marks of magnified drawings (25-35) - so that a port is
 * pressed, lit and let go on whatever lies over it. The sets and steps
 * themselves stay at 18, under what the molecules say.
 */
export const PORTS_Z = 45;

/**
 * Whether a port at `p` lies under a step's card opened over the rest
 * (`card`, its frame on the page): its circle, `r` across from its middle,
 * reaching inside it. Such a port is not drawn - the card is over it, and
 * takes the press - though the ports lie over all else.
 */
export function underCard(p: { x: number; y: number }, card: { x0: number; x1: number; y0: number; y1: number } | null, r: number): boolean {
  return !!card && p.x + r > card.x0 && p.x - r < card.x1 && p.y + r > card.y0 && p.y - r < card.y1;
}

export const onLayer = (x: number, y: number, above = false): { position: "absolute"; left: number; top: number; zIndex?: number } => ({
  position: "absolute",
  left: x / PX,
  top: -y / PX,
  ...(above ? { zIndex: 1 } : {}),
});

/**
 * The card just shut, kept over the others while it shrinks back (`ms`,
 * `DURATION.base`) rather than dropped under the card below mid-way: told
 * each card opened in turn (`open`), it says which card is shutting
 * (`onShutting`) - null once that one is down.
 */
export function shuttingCard(onShutting: (id: number | null) => void, ms: number): (open: number | null) => void {
  let was: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (open) => {
    if (open === was) return;
    const shut = was;
    was = open;
    clearTimeout(timer);
    onShutting(shut);
    if (shut != null) timer = setTimeout(() => onShutting(null), ms);
  };
}

/** A step's card: how wide, and how tall closed, about. */
export const CARD_W = 208 * PX;
export const CARD_H = 76 * PX;
/** How far below its top a step's ports stand: wires join where they always did as its card opens. */
export const PORT_DOWN = 28 * PX;
/** How far apart a card's inputs are, where it takes more than one: each under the one before. */
export const PORT_STEP = 20 * PX;
/** How far down a card's top its `k`th input is (from 0). */
export const portDown = (k: number) => PORT_DOWN + k * PORT_STEP;
/**
 * How far to the left of its input a wire comes in level, where the card
 * names its inputs (more than one, StepCard): past the name - 10 px
 * letters, 6 px each at most, 8 px out from the card - and 4 px more.
 */
export const inputLead = (name: string) => (8 + 6 * name.length + 4) * PX;
/** A port's diameter. */
export const PORT = 11 * PX;

/** How far inside a set what it holds stays from its frame; how far below its top - under its name - it begins; and how far below its top its name stands. */
export const SET_PAD = 14 * PX;
export const SET_TOP = 36 * PX;
/** A set holding a table, inside its frame, in px (TableBody): its first rows, and what it is. */
export const TABLE_PX = { w: 400, h: 196 };
/** How large a chart is drawn inside its set's frame, in px at the page's own size: its axes, labels and points. */
export const CHART_PX = { w: 360, h: 260 };
/** A large result set's summary inside its frame, in px (SummaryBody): what it holds - that it is on no page, and *Open as a table* - a grid of four by three structures, and a chart. */
export const SUMMARY_PX = { w: 480, h: 448 };
export const NAME_DOWN = 18 * PX;
/** A result set's distance from its step, and between molecules in it. */
export const GAP = 64 * PX;
export const BETWEEN = 24 * PX;
/** The room a molecule's frames chip takes below it, where it has one: the chip and the gap above it (Frames3D). */
export const CHIP = 40 * PX;
/** A frames chip's text, about how wide a character of it is - generously - and the room either side of it (Frames3D: 11-pixel text, 10 pixels and a border each side). */
export const CHIP_CHAR = 5.5 * PX;
export const CHIP_SIDES = 22 * PX;

/** A point on the page; a frame's sides. */
type Pt = { x: number; y: number };
type Side = { x0: number; x1: number; y0: number; y1: number };

/** Where a set gives - its right side, half way down; where a result set takes - its left. */
export const setGives = (b: Side): Pt => ({ x: b.x1, y: (b.y0 + b.y1) / 2 });
export const setTakes = (b: Side): Pt => ({ x: b.x0, y: (b.y0 + b.y1) / 2 });
/** Where a step's `k`th input takes, from 0; and where its card meets the lines to its exits' sets. */
export const stepTakes = (s: { x: number; y: number }, k: number): Pt => ({ x: s.x, y: s.y - portDown(k) });
export const stepGives = (s: { x: number; y: number }): Pt => ({ x: s.x + CARD_W, y: s.y - PORT_DOWN });

/**
 * The band of runs across - from where a wire leaves to its input, to the
 * right - over which a wire given its ends turns from going round them to
 * the curve going on: at the band's start or less - its input level with
 * where it leaves, or behind it - round; at its end or more, the curve, as
 * a step's line to its set beside it (`GAP` across) always is; between,
 * the one eased into the other point by point, so that a step moved
 * across it never makes its wire jump.
 */
export const WIRE_BAND = { from: 0, to: 40 * PX };

/** `f` and `g` the same frame. */
const same = (f?: Side, g?: Side) => !!f && !!g && f.x0 === g.x0 && f.x1 === g.x1 && f.y0 === g.y0 && f.y1 === g.y1;
/** Whether `p` is well inside `f`: not on its sides, where a wire meets what it leaves or comes into. */
const within = (f: Side, p: Pt) => p.x > f.x0 + 1e-9 && p.x < f.x1 - 1e-9 && p.y > f.y0 + 1e-9 && p.y < f.y1 - 1e-9;
/** The frame round frames, and `at` where none. */
const union = (fs: readonly Side[], at: Pt): Side =>
  fs.length ? { x0: Math.min(...fs.map((f) => f.x0)), x1: Math.max(...fs.map((f) => f.x1)), y0: Math.min(...fs.map((f) => f.y0)), y1: Math.max(...fs.map((f) => f.y1)) } : { x0: at.x, x1: at.x, y0: at.y, y1: at.y };

/**
 * A wire's curve from `p` to `q`, leaving and arriving level: `n` + 1
 * points along it. Going on to the right, a cubic Bézier, its handles half
 * the run across, 40 px at least. Coming back - its input to the left of
 * where it leaves, or too near to turn (`WIRE_BAND`) - where what it leaves
 * and what it comes into are given (`ends`: a set's frame, a step's card),
 * round them rather than over them (`roundEnds`). And where it would cross
 * any other of `around` - the page's sets and cards - round that too, taken
 * with the end it is nearer as one (`roundEnds` again): never over a set,
 * a card, or what a set holds, where it can go round.
 */
export function wireCurve(p: Pt, q: Pt, n = 48, ends?: { from?: Side; to?: Side; lead?: number }, around: readonly Side[] = []): Pt[] {
  // (into an input named beside it: level for as long as its name - under it, never through it - the rest as any wire to where that begins)
  if (ends?.lead) {
    const at = { x: q.x - ends.lead, y: q.y };
    const to = ends.to && { ...ends.to, x0: Math.min(ends.to.x0, at.x) };
    const most = Math.max(4, Math.round(n / 8));
    const run = wireCurve(p, at, n - most, { from: ends.from, to }, around);
    return [...run, ...Array.from({ length: most }, (_, i) => ({ x: at.x + ((i + 1) / most) * ends.lead!, y: q.y }))];
  }
  const d = Math.max(Math.abs(q.x - p.x) / 2, 40 * PX);
  const c1 = { x: p.x + d, y: p.y };
  const c2 = { x: q.x - d, y: q.y };
  const at = (t: number): Pt => {
    const u = 1 - t;
    return {
      x: u * u * u * p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * q.x,
      y: u * u * u * p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * q.y,
    };
  };
  const curve = Array.from({ length: n + 1 }, (_, i) => at(i / n));
  if (!ends) return curve;
  // (across the band, the one eased into the other: smoothly, at each end the one or the other whole)
  const run = q.x - p.x;
  let shape = curve;
  if (run < WIRE_BAND.to) {
    const round = roundEnds(p, q, n, ends);
    const u = Math.min(1, Math.max(0, (run - WIRE_BAND.from) / (WIRE_BAND.to - WIRE_BAND.from)));
    const k = u * u * (3 - 2 * u);
    shape = k === 0 ? round : round.map((a, i) => ({ x: a.x + (curve[i].x - a.x) * k, y: a.y + (curve[i].y - a.y) * k }));
  }
  const others = around.filter((f) => !same(f, ends.from) && !same(f, ends.to));
  const crossed = others.filter((f) => shape.some((pt) => within(f, pt)));
  if (!crossed.length) return shape;
  // (what it would cross taken each with the end it is nearer - by its middle - and gone round as one; else all with what it leaves, else all with what it comes into;
  //  and each of those again with what it crosses then. The first clear of all; where none is, the one over least of them - each point of it over a frame counted - then the shortest)
  const mid = (f: Side) => ({ x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 });
  const nearer = (f: Side) => Math.hypot(mid(f).x - p.x, mid(f).y - p.y) <= Math.hypot(mid(f).x - q.x, mid(f).y - q.y);
  const over = (pts: readonly Pt[]) => pts.reduce((k, pt) => k + others.filter((f) => within(f, pt)).length, 0);
  const length = (pts: readonly Pt[]) => pts.reduce((k, pt, i) => (i ? k + Math.hypot(pt.x - pts[i - 1].x, pt.y - pts[i - 1].y) : 0), 0);
  let best = { pts: shape, over: over(shape), length: length(shape) };
  const tried = (withFrom: readonly Side[], withTo: readonly Side[]) => {
    const e = { from: union([...(ends.from ? [ends.from] : []), ...withFrom], p), to: union([...(ends.to ? [ends.to] : []), ...withTo], q) };
    const pts = roundEnds(p, q, n, e);
    const k = over(pts);
    const l = length(pts);
    if (k < best.over || (k === best.over && l < best.length)) best = { pts, over: k, length: l };
    return pts;
  };
  for (const withFrom of [crossed.filter(nearer), crossed, []]) {
    const withTo = crossed.filter((f) => !withFrom.includes(f));
    const pts = tried(withFrom, withTo);
    if (best.over === 0) return best.pts;
    // (and with what that crosses too, taken with the same ends)
    const more = others.filter((f) => !crossed.includes(f) && pts.some((pt) => within(f, pt)));
    if (!more.length) continue;
    tried([...withFrom, ...more.filter(nearer)], [...withTo, ...more.filter((f) => !nearer(f))]);
    if (best.over === 0) return best.pts;
  }
  return best.pts;
}

/**
 * A wire from `p` to `q` round what it leaves and comes into (`ends`): out
 * to the right of the one, across between the two - one above the other -
 * or above or below both, whichever way is shorter, and into the other from
 * its left, half a bond clear of each (`BETWEEN`), its corners rounded:
 * `n` + 1 points along it.
 */
function roundEnds(p: Pt, q: Pt, n: number, ends: { from?: Side; to?: Side }): Pt[] {
  const from = ends.from ?? { x0: p.x, x1: p.x, y0: p.y, y1: p.y };
  const to = ends.to ?? { x0: q.x, x1: q.x, y0: q.y, y1: q.y };
  const out = Math.max(p.x, from.x1) + BETWEEN;
  const into = Math.min(q.x, to.x0) - BETWEEN;
  // (the level it crosses at: between the two, one above the other; else above both, or below both - whichever is the shorter way)
  const levels = [Math.max(from.y1, to.y1) + BETWEEN, Math.min(from.y0, to.y0) - BETWEEN];
  if (to.y0 > from.y1) levels.push((from.y1 + to.y0) / 2);
  if (from.y0 > to.y1) levels.push((to.y1 + from.y0) / 2);
  const way = (y: number) => Math.abs(p.y - y) + Math.abs(y - q.y);
  const level = levels.reduce((a, b) => (way(b) < way(a) ? b : a));
  return rounded([p, { x: out, y: p.y }, { x: out, y: level }, { x: into, y: level }, { x: into, y: q.y }, q], BETWEEN, n);
}

/**
 * The frames of `around` near enough to a wire from `p` to `q` - leaving and
 * coming into `ends` - for it to cross or go round: those that meet the box
 * round its ends, grown by as far as its curve can swing past them (half
 * its run across, 40 px at least) and as far again as it goes round,
 * `WIRE_NEAR` more. What `wireCurve` is given as `around`, by the drawing
 * and by placement alike.
 */
export function nearWire(p: Pt, q: Pt, ends: { from?: Side; to?: Side; lead?: number } | undefined, around: readonly Side[]): Side[] {
  const fs = [ends?.from, ends?.to].filter((f): f is Side => !!f);
  const swing = Math.max(Math.abs(q.x - p.x) / 2, 40 * PX) + (ends?.lead ?? 0) + WIRE_NEAR;
  const box = {
    x0: Math.min(p.x, q.x, ...fs.map((f) => f.x0)) - swing,
    x1: Math.max(p.x, q.x, ...fs.map((f) => f.x1)) + swing,
    y0: Math.min(p.y, q.y, ...fs.map((f) => f.y0)) - swing,
    y1: Math.max(p.y, q.y, ...fs.map((f) => f.y1)) + swing,
  };
  return around.filter((f) => f.x0 < box.x1 && f.x1 > box.x0 && f.y0 < box.y1 && f.y1 > box.y0);
}
/** How much further than its swing a wire looks for what it may go round (`nearWire`): a few cards' room. */
const WIRE_NEAR = 4 * CARD_W;

/** Frames said as one number - each side to a thousandth of a page unit - for what is worked out from them to be kept while they stay where they are: one pass, however many there are. */
export function framesHash(fs: readonly (Side | undefined)[]): number {
  let h = fs.length;
  for (const f of fs) {
    if (!f) {
      h = (Math.imul(h, 31) + 7) | 0;
      continue;
    }
    for (const v of [f.x0, f.x1, f.y0, f.y1]) h = (Math.imul(h, 31) + Math.round(v * 1000)) | 0;
  }
  return h;
}

/**
 * What a wire's points are worked out from, said as a key: its ends' points,
 * the frames it leaves and comes into, its lead - and the page's sets and
 * cards near it (`nearWire`), as one number (`framesHash`). The same key,
 * the same points: a wire is worked out again only where it, or something
 * near it, moved.
 */
export const wireKey = (p: Pt, q: Pt, ends: { from?: Side; to?: Side; lead?: number } | undefined, around: number): string =>
  `${p.x},${p.y},${q.x},${q.y},${framesHash([ends?.from, ends?.to])},${ends?.lead ?? 0},${around}`;

/**
 * A line through `corners`, each corner rounded - as far as `r` from it, or
 * half the shorter side - as `n` + 1 points evenly along it.
 */
function rounded(corners: readonly Pt[], r: number, n: number): Pt[] {
  const pts = corners.filter((c, i) => i === 0 || Math.hypot(c.x - corners[i - 1].x, c.y - corners[i - 1].y) > 1e-9);
  const fine: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, c, b] = [pts[i - 1], pts[i], pts[i + 1]];
    const la = Math.hypot(c.x - a.x, c.y - a.y);
    const lb = Math.hypot(b.x - c.x, b.y - c.y);
    const k = Math.min(r, la / 2, lb / 2);
    const s = { x: c.x + ((a.x - c.x) / la) * k, y: c.y + ((a.y - c.y) / la) * k };
    const e = { x: c.x + ((b.x - c.x) / lb) * k, y: c.y + ((b.y - c.y) / lb) * k };
    // (a quarter turn: a quadratic Bézier from where it starts turning to where it ends, the corner its control)
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      const u = 1 - t;
      fine.push({ x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, y: u * u * s.y + 2 * u * t * c.y + t * t * e.y });
    }
  }
  fine.push(pts[pts.length - 1]);
  // (evenly along it, by length)
  const run = [0];
  for (let i = 1; i < fine.length; i++) run.push(run[i - 1] + Math.hypot(fine[i].x - fine[i - 1].x, fine[i].y - fine[i - 1].y));
  const total = run[run.length - 1] || 1;
  let k = 1;
  return Array.from({ length: n + 1 }, (_, i) => {
    const want = (total * i) / n;
    while (k < fine.length - 1 && run[k] < want) k++;
    const span = run[k] - run[k - 1] || 1;
    const t = Math.min(1, Math.max(0, (want - run[k - 1]) / span));
    return { x: fine[k - 1].x + (fine[k].x - fine[k - 1].x) * t, y: fine[k - 1].y + (fine[k].y - fine[k - 1].y) * t };
  });
}

/**
 * How many structures drawn a step's result set puts on the page (the
 * maintainer, 2026-10-23): as many, in the step's order, as take no more
 * than `area` of it between them - each its drawing's box, with its
 * number's room, in square bond lengths: about a dozen drug-sized
 * structures, many more small ones - and `most` at that. The rest are held
 * in the set, off the page (`WorkflowSet.drawnCollection`), and reached by
 * its table; the set says how many it shows of how many.
 */
export const DRAWN_ON_PAGE = { area: 400 * NOMINAL_BOND_LENGTH ** 2, most: 50 };

/** How many of structures drawn, each taking `rooms` of the page in turn, a result set shows on it (`DRAWN_ON_PAGE`): one at least. */
export function drawnShown(rooms: readonly { x0: number; x1: number; y0: number; y1: number; chip: number }[]): number {
  let area = 0;
  let n = 0;
  for (const r of rooms) {
    area += (r.x1 - r.x0) * (r.y1 - r.y0 + r.chip);
    if (n >= DRAWN_ON_PAGE.most || (n > 0 && area > DRAWN_ON_PAGE.area)) break;
    n++;
  }
  return n;
}
