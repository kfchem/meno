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

/**
 * How far inside a set what it holds stays from its frame - its ink, half a
 * bond (docs/LOOK.md, *Room*: 24 px at 48 px a bond); how far below its top -
 * under its name - it begins; and how far below its top its name stands.
 */
export const SET_PAD = NOMINAL_BOND_LENGTH / 2;
export const SET_TOP = 36 * PX;
/** A set holding a table, inside its frame, in px (TableBody): its first rows, and what it is. */
export const TABLE_PX = { w: 400, h: 196 };
/** How large a chart is drawn inside its set's frame, in px at the page's own size: its axes, labels and points. */
export const CHART_PX = { w: 360, h: 260 };
/** A large result set's summary inside its frame, in px (SummaryBody): what it holds - that it is on no page, and *Open as a table* - a grid of four by three structures, and a chart. */
export const SUMMARY_PX = { w: 480, h: 448 };
export const NAME_DOWN = 18 * PX;
/** A result set's distance from its step, and between molecules in it: between their ink, half a bond (docs/LOOK.md, *Room*). */
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
 * The least run across - from where a wire leaves to its input, to the
 * right - over which a wire given its ends goes on, turning as its curve
 * does: half a bond (`BETWEEN`), the least that a turn up or down between
 * them is seen across as a turn, not a line down their sides. Less - its
 * input level with where it leaves, or behind it - it goes round them, the
 * once it turns over from the one to the other eased by the drawing.
 */
export const WIRE_TURNS = BETWEEN;

/** `f` and `g` the same frame. */
const same = (f?: Side, g?: Side) => !!f && !!g && f.x0 === g.x0 && f.x1 === g.x1 && f.y0 === g.y0 && f.y1 === g.y1;
/** Whether `p` is well inside `f`: not on its sides, where a wire meets what it leaves or comes into. */
const within = (f: Side, p: Pt) => p.x > f.x0 + 1e-9 && p.x < f.x1 - 1e-9 && p.y > f.y0 + 1e-9 && p.y < f.y1 - 1e-9;

/**
 * A wire's curve from `p` to `q`, leaving and arriving level: `n` + 1
 * points along it, the closer together the more it turns, so that every
 * bend is drawn as one (`byTurn`). Going on to the right, a cubic Bézier,
 * its handles half the run across - 40 px at least, and more on a long run
 * up or down, half of it to 240 px, so that it turns in an arc as wide as
 * its run is long, never a tight hook - but never more than its run across,
 * so that it runs on across all the way, never swinging back out over what
 * is beside its ends, however near its input. Coming back - its input less
 * than `WIRE_TURNS` to the right of where it leaves, or to the left of it -
 * where what it leaves and what it comes into are given (`ends`: a set's frame, a step's card), round them
 * rather than over them (`roundEnds`). And where it would cross any other
 * of `around` - the page's sets and cards - round that too, at whichever
 * level clear of them is the shortest way (`levelsFor`): never over a set,
 * a card, or what a set holds, where it can go round.
 */
export function wireCurve(p: Pt, q: Pt, n = 48, ends?: { from?: Side; to?: Side; lead?: number }, around: readonly Side[] = []): Pt[] {
  return byTurn(wirePath(p, q, ends, around), n);
}

/**
 * How far a wire going round keeps from what it goes round, and the radius
 * of its turns: a bond, as the page draws it - so that its turns are arcs
 * at any zoom - its turns, where two come closer than that, both shrunk
 * alike (`rounded`). Its turns cut in no nearer than half a bond (`BETWEEN`,
 * docs/LOOK.md *Room*).
 */
export const WIRE_ROOM = NOMINAL_BOND_LENGTH;

/** How many points a wire's path is first worked out as, before they are spread by how it turns (`byTurn`). */
const DENSE = 256;

/** A wire's path (`wireCurve`) as `DENSE` + 1 points or so, close enough everywhere to stand for it. */
export function wirePath(p: Pt, q: Pt, ends?: { from?: Side; to?: Side; lead?: number }, around: readonly Side[] = []): Pt[] {
  return wireRoute(p, q, ends, around).pts;
}

/** Which way a wire goes (`wireRoute`): the curve, or round what it leaves, comes into and has between - passing them on one side (`WireSide`). */
export type WireWay = "plain" | WireSide;
/** Which side a wire going round passes what it goes round: above both, below both, or between them. */
export type WireSide = "above" | "below" | "between";

/**
 * A wire's path (`wirePath`), and which way it went - kept the way it went
 * before (`was`), where that is still clear of all and no more than a fifth
 * longer than the way it would go now: so that a card dragged past
 * something does not make its wires flip from one way to the other and
 * back (the drawing's; placement goes the one way, as it is now).
 */
export function wireRoute(p: Pt, q: Pt, ends?: { from?: Side; to?: Side; lead?: number }, around: readonly Side[] = [], was?: WireWay): { pts: Pt[]; way: WireWay } {
  // (into an input named beside it: level for as long as its name - under it, never through it - the rest as any wire to where that begins)
  if (ends?.lead) {
    const at = { x: q.x - ends.lead, y: q.y };
    const to = ends.to && { ...ends.to, x0: Math.min(ends.to.x0, at.x) };
    const r = wireRoute(p, at, { from: ends.from, to }, around, was);
    return { pts: [...r.pts, q], way: r.way };
  }
  // (the side it passed before, where it went round)
  const wasSide = was && was !== "plain" ? was : undefined;
  // (going on, never more than its run across - so that it runs on across all the way, never swinging back on itself, however near its input)
  const d = Math.max(Math.abs(q.x - p.x) / 2, Math.min(Math.max(Math.abs(q.y - p.y) / 2, 40 * PX), 240 * PX, q.x > p.x ? q.x - p.x : 40 * PX));
  const c1 = { x: p.x + d, y: p.y };
  const c2 = { x: q.x - d, y: q.y };
  const at = (t: number): Pt => {
    const u = 1 - t;
    return {
      x: u * u * u * p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * q.x,
      y: u * u * u * p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * q.y,
    };
  };
  // (worked out finer first, then spread by how it turns: a tight turn - its input near - drawn through as many points as a wide one)
  const curve = byTurn(Array.from({ length: 2 * DENSE + 1 }, (_, i) => at(i / (2 * DENSE))), DENSE);
  if (!ends) return { pts: curve, way: "plain" };
  // (half a bond clear of every other frame's line - docs/LOOK.md, *Room* - but where it meets them, beside its ends)
  const near = (f: Side) => ({ x0: f.x0 - BETWEEN, x1: f.x1 + BETWEEN, y0: f.y0 - BETWEEN, y1: f.y1 + BETWEEN });
  // (where it meets them: as far from its ends as its curve's handles reach, a bond at least - leaving and arriving level)
  const reach = Math.max(WIRE_ROOM, d);
  // (a point nearer its ends than that kept clear by as much more: smoothly, so that it never jumps)
  const meets = (pt: Pt) => Math.max(0, reach - Math.min(Math.hypot(pt.x - p.x, pt.y - p.y), Math.hypot(pt.x - q.x, pt.y - q.y)));
  // (how far it keeps from them, past where it meets them: none where it goes inside one)
  const outside = (f: Side, pt: Pt) => (within(f, pt) ? 0 : Math.hypot(Math.max(f.x0 - pt.x, 0, pt.x - f.x1), Math.max(f.y0 - pt.y, 0, pt.y - f.y1)));
  // (going on, the curve; coming back - or too near to turn - round what it leaves and comes into)
  const shape = q.x - p.x < WIRE_TURNS ? roundEnds(p, q, DENSE, ends, wasSide).pts : curve;
  const others = around.filter((f) => !same(f, ends.from) && !same(f, ends.to));
  // (each grown by half a bond once, not for every point it is looked at for)
  const grown = new Map(others.map((f) => [f, near(f)]));
  // (only what meets the box round its points looked at point by point)
  const boxOf = (pts: readonly Pt[]): Side => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const pt of pts) [x0, x1, y0, y1] = [Math.min(x0, pt.x), Math.max(x1, pt.x), Math.min(y0, pt.y), Math.max(y1, pt.y)];
    return { x0, x1, y0, y1 };
  };
  const meet = (a: Side, b: Side) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  // (what it has to go round: where the curve would cross anything, all that stands between its ends - across from one to the other, up and
  //  down from the one to the other - not only what the curve happens to cross, which a step dragged a pixel changes)
  // (near what is beside its ends where it meets them - coming down past one exit's set into the next: no more than its way in; but inside any, however near its ends)
  const shapeBox = boxOf(shape);
  const touched = others.filter((f) => meet(grown.get(f)!, shapeBox) && shape.some((pt) => within(grown.get(f)!, pt) && (within(f, pt) || outside(f, pt) + meets(pt) < BETWEEN)));
  const span = { x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x), y0: Math.min(p.y, q.y), y1: Math.max(p.y, q.y) };
  const crossed = touched.length ? others.filter((f) => touched.includes(f) || (f.x0 < span.x1 && f.x1 > span.x0 && f.y0 < span.y1 && f.y1 > span.y0)) : [];
  // (round it all: what it leaves, what it comes into, and what stands between - the side it passed before, where it still can)
  const nearIn = (pts: readonly Pt[]) => {
    const box = boxOf(pts);
    return others.filter((f) => meet(grown.get(f)!, box));
  };
  const over = (pts: readonly Pt[]) => {
    const fs = nearIn(pts);
    return fs.length ? pts.reduce((k, pt) => k + fs.reduce((j, f) => j + (within(grown.get(f)!, pt) ? (within(f, pt) ? 10 : 1) : 0), 0), 0) : 0;
  };
  if (!crossed.length) {
    // (the curve clear: kept, unless it went round before and still can, no more than a fifth longer)
    if (was && was !== "plain") {
      const kept = roundEnds(p, q, DENSE, ends, wasSide, touchedBefore(others, p, q));
      if (over(kept.pts) === 0 && lengthOf(kept.pts) * 0.8 <= lengthOf(shape)) return { pts: kept.pts, way: kept.side };
    }
    return { pts: shape, way: "plain" };
  }
  // (every level it may cross at, gone round all it would cross - the shortest first, by its corners, and no further than the first clear of all,
  //  and of the side it passed before; where none is clear, again with what any of them crosses then, twice at most)
  type Tried = { pts: Pt[]; side: WireSide; box: Side; over: number; length: number };
  const tried: Tried[] = [];
  const tryAll = (past: readonly Side[]) => {
    const ways = levelsFor(p, q, ends, past)
      .map(([sd, y]) => roundWay(p, q, ends, sd, past, y))
      .map((w) => ({ ...w, length: lengthOf(w.corners) }))
      .sort((a, b) => a.length - b.length);
    let clear = false;
    let clearKept = !wasSide;
    for (const w of ways) {
      if (clear && clearKept) break;
      if (clear && w.side !== wasSide) continue;
      const pts = rounded(w.corners, WIRE_ROOM, DENSE);
      const r = { pts, side: w.side, box: boxOf(pts), over: over(pts), length: lengthOf(pts) };
      tried.push(r);
      if (r.over === 0) {
        clear = true;
        if (r.side === wasSide) clearKept = true;
      }
    }
  };
  let past: readonly Side[] = crossed;
  tryAll(past);
  // (again only where none of them is clear of all)
  for (let i = 0; i < 2 && tried.every((r) => r.over > 0); i++) {
    const more = others.filter((f) => !past.includes(f) && tried.some((r) => meet(grown.get(f)!, r.box) && r.pts.some((pt) => within(grown.get(f)!, pt))));
    if (!more.length) break;
    past = [...past, ...more];
    tryAll(past);
  }
  const scored = tried;
  const best = scored.reduce((x, y) => (y.over < x.over || (y.over === x.over && y.length < x.length) ? y : x));
  // (the side it passed before, kept where it is clear - or no worse - and the other is not a fifth shorter)
  const kept = wasSide && scored.filter((r) => r.side === wasSide).reduce<(typeof scored)[number] | undefined>((x, y) => (!x || y.over < x.over || (y.over === x.over && y.length < x.length) ? y : x), undefined);
  if (kept && kept !== best && (kept.over === 0 || kept.over <= best.over) && kept.length * 0.8 <= best.length) return { pts: kept.pts, way: kept.side };
  return { pts: best.pts, way: best.side };
}

/** What a wire going round may have gone round before: what stands between its ends, as it does now. */
function touchedBefore(others: readonly Side[], p: Pt, q: Pt): Side[] {
  const span = { x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x), y0: Math.min(p.y, q.y), y1: Math.max(p.y, q.y) };
  return others.filter((f) => f.x0 < span.x1 && f.x1 > span.x0 && f.y0 < span.y1 && f.y1 > span.y0);
}

/** How long a line through `pts` is. */
const lengthOf = (pts: readonly Pt[]) => pts.reduce((k, pt, i) => (i ? k + Math.hypot(pt.x - pts[i - 1].x, pt.y - pts[i - 1].y) : 0), 0);

/** How much a turn counts for, as a length (`byTurn`): a radian of it as much as 48 px of straight - a quarter turn about 75 px of points. */
const TURN = 48 * PX;

/**
 * `n` + 1 points along a line through `pts`, from its first to its last,
 * spread by how long it runs and how much it turns (`TURN`): close together
 * where it bends, further apart where it runs straight - so that a bend is
 * drawn as a bend, never a kink, however long the run beside it.
 */
export function byTurn(given: readonly Pt[], n: number): Pt[] {
  // (a point where the one before is - two rounded corners meeting - turns nowhere: one of them)
  const pts = given.filter((pt, i) => i === 0 || Math.hypot(pt.x - given[i - 1].x, pt.y - given[i - 1].y) > 1e-9);
  if (pts.length < 2) return Array.from({ length: n + 1 }, () => given[0]);
  // (each step along it weighed by its length, and by half the turn at either end of it)
  const angle = (i: number) => {
    if (i <= 0 || i >= pts.length - 1) return 0;
    const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    const b = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
    let t = Math.abs(b - a);
    if (t > Math.PI) t = 2 * Math.PI - t;
    return t;
  };
  const w = [0];
  for (let i = 1; i < pts.length; i++) w.push(w[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) + (TURN * (angle(i - 1) + angle(i))) / 2);
  const total = w[w.length - 1] || 1;
  let k = 1;
  return Array.from({ length: n + 1 }, (_, i) => {
    if (i === n) return pts[pts.length - 1];
    const want = (total * i) / n;
    while (k < pts.length - 1 && w[k] < want) k++;
    const span = w[k] - w[k - 1] || 1;
    const t = Math.min(1, Math.max(0, (want - w[k - 1]) / span));
    return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * t };
  });
}

/**
 * How many points a wire through `pts` is drawn through at `zoom` (screen
 * pixels to a page unit): about one every 3 screen pixels of it, and every
 * 2 degrees it turns - 48 at the least, 800 at the most.
 */
export function pointsFor(pts: readonly Pt[], zoom: number): number {
  let turn = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    const b = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
    let t = Math.abs(b - a);
    if (t > Math.PI) t = 2 * Math.PI - t;
    turn += t;
  }
  return Math.min(800, Math.max(48, Math.ceil((lengthOf(pts) * zoom) / 3 + (turn * 180) / Math.PI / 2)));
}

/**
 * A wire from `p` to `q` round what it leaves and comes into (`ends`) and
 * what stands in its way (`past`): out a bond to the right of the one, up
 * or down to a level clear of all - above all, below all, or between the
 * two, one above the other, where that leaves half a bond either side and
 * nothing stands there - across, and down or up into the other from a bond
 * to its left (`WIRE_ROOM`); each way up or down stepped aside, past what
 * stands in it. The side it passes (`prefer`) kept where it still can be,
 * else the shorter way. Its corners rounded as wide: `n` + 1 points along
 * it.
 */
function roundEnds(p: Pt, q: Pt, n: number, ends: { from?: Side; to?: Side }, prefer?: WireSide, past: readonly Side[] = [], at?: number): { pts: Pt[]; side: WireSide } {
  const w = roundWay(p, q, ends, prefer, past, at);
  return { pts: rounded(w.corners, WIRE_ROOM, n), side: w.side };
}

/** A way round (`roundEnds`) as its corners, before they are rounded. */
function roundWay(p: Pt, q: Pt, ends: { from?: Side; to?: Side }, prefer?: WireSide, past: readonly Side[] = [], at?: number): { corners: Pt[]; side: WireSide } {
  const from = ends.from ?? { x0: p.x, x1: p.x, y0: p.y, y1: p.y };
  const to = ends.to ?? { x0: q.x, x1: q.x, y0: q.y, y1: q.y };
  const levels = levelsFor(p, q, ends, past);
  const way = (y: number) => Math.abs(p.y - y) + Math.abs(y - q.y);
  // (the side it went before, where it still can: else the shorter way)
  const shortest = (ls: [WireSide, number][]) => ls.reduce((a, b) => (way(b[1]) < way(a[1]) ? b : a));
  const [side, level]: [WireSide, number] = at !== undefined ? [prefer ?? "between", at] : levels.some(([sd]) => sd === prefer) ? shortest(levels.filter(([sd]) => sd === prefer)) : shortest(levels);
  // (a way up or down, a bond out from its end's `edge`, from the level it leaves or comes in at (`ya`) to `yb`, stepped aside - right or left,
  //  as `dir` - past each frame in it, a bond clear; but kept short of the first that stands between - not the other end - between it and
  //  the edge, where that leaves half a bond either side, and short of any across the level it leaves or comes in at, however near: else
  //  the way along to it would cross it)
  const aside = (edge: number, ya: number, yb: number, dir: 1 | -1, own: Side) => {
    const [y0, y1] = [Math.min(ya, yb), Math.max(ya, yb)];
    const other = own === from ? to : from;
    let x = edge + dir * WIRE_ROOM;
    for (let k = 0; k < 8; k++) {
      const hit = [...past, other].find((f) => f.x0 - BETWEEN < x && f.x1 + BETWEEN > x && f.y0 - BETWEEN < y1 && f.y1 + BETWEEN > y0);
      if (!hit) break;
      const near = dir > 0 ? hit.x0 : hit.x1;
      const short = (near - edge) * dir;
      if (hit !== other && short > 0 && ((k === 0 && short >= 2 * BETWEEN) || (hit.y0 - BETWEEN < ya && hit.y1 + BETWEEN > ya))) return (edge + near) / 2;
      x = dir > 0 ? hit.x1 + WIRE_ROOM : hit.x0 - WIRE_ROOM;
    }
    return x;
  };
  const out = aside(Math.max(p.x, from.x1), p.y, level, 1, from);
  const into = aside(Math.min(q.x, to.x0), q.y, level, -1, to);
  return { corners: [p, { x: out, y: p.y }, { x: out, y: level }, { x: into, y: level }, { x: into, y: q.y }, q], side };
}

/**
 * The levels a wire from `p` to `q` going round what it leaves and comes
 * into (`ends`) and what stands in its way (`past`) may cross at: a bond
 * above all of them, a bond below all, and - between - the middle of each
 * gap between them, across from the one end to the other, that leaves half
 * a bond either side (`BETWEEN`).
 */
function levelsFor(p: Pt, q: Pt, ends: { from?: Side; to?: Side }, past: readonly Side[]): [WireSide, number][] {
  const from = ends.from ?? { x0: p.x, x1: p.x, y0: p.y, y1: p.y };
  const to = ends.to ?? { x0: q.x, x1: q.x, y0: q.y, y1: q.y };
  const all = [from, to, ...past];
  const levels: [WireSide, number][] = [
    ["above", Math.max(...all.map((f) => f.y1)) + WIRE_ROOM],
    ["below", Math.min(...all.map((f) => f.y0)) - WIRE_ROOM],
  ];
  // (what stands across from the one end to the other - its way out and in a bond beyond them - each half a bond taller and deeper: the gaps left between them)
  const x0 = Math.min(p.x, q.x) - WIRE_ROOM;
  const x1 = Math.max(p.x, q.x) + WIRE_ROOM;
  const spans = all.filter((f) => f.x1 > x0 && f.x0 < x1).map((f) => [f.y0 - BETWEEN, f.y1 + BETWEEN]).sort((a, b) => a[0] - b[0]);
  let top = spans.length ? spans[0][1] : 0;
  for (const [y0, y1] of spans.slice(1)) {
    if (y0 > top) levels.push(["between", (top + y0) / 2]);
    top = Math.max(top, y1);
  }
  return levels;
}

/**
 * Time to work wires out in, frame by frame: `ms` of each - the rest left
 * for drawing them. Each frame is said as it begins (`frame`), by its time
 * as the drawing has it, the same for all that is done in it. What waits
 * for time is served the longest waiting first, so that none waits behind
 * others for ever.
 */
export class FrameBudget {
  private at: number | undefined;
  private used = 0;
  /** What waits for time, by who waits - in the order they came: the longest waiting first. */
  private readonly line = new Map<object, () => void>();
  constructor(private readonly ms: number) {}
  /** The frame at `at` begun - its time given anew - where it is not the one begun already. */
  frame(at: number): void {
    if (at === this.at) return;
    this.at = at;
    this.used = 0;
  }
  /** Whether there is time left in this frame. */
  left(): boolean {
    return this.used < this.ms;
  }
  /** `ms` of this frame's time spent. */
  spend(ms: number): void {
    this.used += ms;
  }
  /** How many wait. */
  get waiting(): number {
    return this.line.size;
  }
  /** `who` waits for time, to be served by `serve` - in its place, where it waits already. */
  wait(who: object, serve: () => void): void {
    if (!this.line.has(who)) this.line.set(who, serve);
  }
  /** `who` no longer waits. */
  leave(who: object): void {
    this.line.delete(who);
  }
  /** Those waiting served, the longest waiting first, while this frame has time. */
  serve(): void {
    for (const [who, serve] of this.line) {
      if (!this.left()) return;
      this.line.delete(who);
      serve();
    }
  }
}

/**
 * How far a wire's shape moved from `from` to `to` - the same number of
 * points - its ends aside: each point's move less its ends' moves, eased
 * from the one end's into the other's along it. A wire dragged by its end
 * moves none; one gone round something else now, as far as that.
 */
export function shapeMoved(from: readonly Pt[], to: readonly Pt[]): number {
  let most = 0;
  for (let i = 0; i < to.length; i++) {
    const r = offEnds(from, to, i);
    most = Math.max(most, Math.hypot(r.x, r.y));
  }
  return most;
}

/**
 * A wire on its way from `from` to `to` - the same number of points - `k`
 * of the way (0 to 1): its ends where `to`'s are, always, so that a wire
 * never comes away from its port; the rest `k` of the way from where it was
 * - its ends' moves taken with it - to where it goes.
 */
export function wireToward(from: readonly Pt[], to: readonly Pt[], k: number): Pt[] {
  return to.map((pt, i) => {
    const r = offEnds(from, to, i);
    return { x: pt.x - (1 - k) * r.x, y: pt.y - (1 - k) * r.y };
  });
}

/** How far a wire's point `i` moved from `from` to `to` less its ends' moves, eased from the one into the other by how far along it is. */
function offEnds(from: readonly Pt[], to: readonly Pt[], i: number): Pt {
  const n = to.length - 1;
  const s = n > 0 ? i / n : 0;
  const ex = (to[0].x - from[0].x) * (1 - s) + (to[n].x - from[n].x) * s;
  const ey = (to[0].y - from[0].y) * (1 - s) + (to[n].y - from[n].y) * s;
  return { x: to[i].x - from[i].x - ex, y: to[i].y - from[i].y - ey };
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
/** How much further than its swing a wire looks for what it may go round (`nearWire`): two cards' room. */
const WIRE_NEAR = 2 * CARD_W;

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
 * half the shorter side - as `n` + 1 points along it, closer at its corners
 * (`byTurn`).
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
    for (let j = 0; j <= 24; j++) {
      const t = j / 24;
      const u = 1 - t;
      fine.push({ x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, y: u * u * s.y + 2 * u * t * c.y + t * t * e.y });
    }
  }
  fine.push(pts[pts.length - 1]);
  // (spread by how it runs and turns: its corners drawn round)
  return byTurn(fine, n);
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
