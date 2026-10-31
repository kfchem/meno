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

/** How large a port is on the screen, in its pixels, where the page is near. */
const PORT_SCREEN_PX = 9;
/** The most a port may be, as a share of its set's or its card's height, on the page. */
export const PORT_SHARE = 1 / 6;

/**
 * How large a port is, in the screen's pixels - it is laid out in them,
 * the page's layer's scale (`--scale`, Workflow2D) undone on it (Port): as
 * large as `PORT_SCREEN_PX` while the page is near; zoomed out, never more
 * than the port's own size on the page (look `PORT`, 11 px) - it shrinks
 * with the page from there - nor than `PORT_SHARE` of its set's or card's
 * height (`of`, page px). The same at every zoom otherwise: round, a ring a
 * pixel thick - or a fifth of it across, where it is that small - or
 * filled, as its state says (the maintainer, 2026-10-28: zoomed out, ports
 * were far too big for their sets).
 */
export function portSize(of?: number): string {
  const most = Math.min(PORT / PX, of != null && of > 0 ? of * PORT_SHARE : Infinity);
  return `min(${PORT_SCREEN_PX}px, calc(var(--scale, 1) * ${most.toFixed(2)}px))`;
}

/**
 * How far inside a set what it holds stays from its frame - its ink, half a
 * bond (docs/LOOK.md, *Room*: 24 px at 48 px a bond); how far below its top -
 * under its name - it begins; and how far below its top its name stands.
 */
export const SET_PAD = NOMINAL_BOND_LENGTH / 2;
export const SET_TOP = 36 * PX;
/** A set holding a table, inside its frame, in px (TableBody): its first rows, and what it is. */
export const TABLE_PX = { w: 400, h: 196 };
/** How many of a table's rows its frame shows (ValueBody `TableBody`; model `tableSetSize`). */
export const TABLE_SHOWN_ROWS = 6;
/**
 * A table's body (ValueBody `TableBody`), in its own pixels, each height set
 * on it as it is drawn - never left to its text: its heads' line, the gap
 * under it, each row's line, and the line saying what it is - as tall as
 * its text, so that the set's frame stands as far below its last letters as
 * beside its first (`SET_PAD`); and the room
 * before each column after the first, so that a number column's last digit
 * and the next column's first letter do not run together.
 */
export const TABLE_HEAD_PX = 19;
export const TABLE_GAP_PX = 6;
export const TABLE_ROW_PX = 16;
export const TABLE_FOOT_PX = 12;
export const TABLE_COLUMN_GAP_PX = 16;
/** How tall a table's body draws, showing up to `TABLE_SHOWN_ROWS` of `rows`: a table's set is made as tall (model `tableSetSize`), and its frame scales it to that (SetFrame). */
export const tableBodyPx = (rows: number) => TABLE_HEAD_PX + TABLE_GAP_PX + TABLE_ROW_PX * Math.min(rows, TABLE_SHOWN_ROWS) + TABLE_FOOT_PX;
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
 * rather than over them (`roundWay`). And where it would cross any other
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

/** Which way a wire goes (`wireRoute`): the curve; straight across at the level of the one end or the other, turning twice; or round what it leaves, comes into and has between - passing them on one side (`WireSide`). */
export type WireWay = "plain" | "straight" | WireSide;
/** Which side a wire going round passes what it goes round: above both, below both, or between them. */
export type WireSide = "above" | "below" | "between";
/**
 * A wire's way (`wireRoute`): its path, which way it went - and, where it
 * goes round, the corners of its way before they are rounded, for it to be
 * moved into a lane of its own beside others (`wireLanes`).
 */
export type WireRouted = { pts: Pt[]; way: WireWay; corners?: Pt[] };

/**
 * A wire's path (`wirePath`), and which way it went - kept the way it went
 * before (`was`), where that is still clear of all and no more than a fifth
 * longer than the way it would go now: so that a card dragged past
 * something does not make its wires flip from one way to the other and
 * back (the drawing's; placement goes the one way, as it is now).
 */
export function wireRoute(p: Pt, q: Pt, ends?: { from?: Side; to?: Side; lead?: number }, around: readonly Side[] = [], was?: WireWay): WireRouted {
  // (the same wire among the same frames goes the same way: worked out once - a page of sixty steps placed each result set
  //  routing every wire on it again, each time, the same; and a drag draws each frame the wires it did not move)
  const key = routeKey(p, q, ends, around, was);
  const kept = ROUTES.get(key);
  if (kept) return kept;
  const routed = routeOf(p, q, ends, around, was);
  if (ROUTES.size >= ROUTES_MOST) ROUTES.clear();
  ROUTES.set(key, routed);
  return routed;
}

/** Routes worked out (`wireRoute`), by all they depend on; cleared whole once this many are kept. */
const ROUTES = new Map<string, WireRouted>();
const ROUTES_MOST = 20_000;

/** All a wire's way depends on, as a key: its ends, the frames it leaves and comes into, its lead, what it goes round, the way it went before. */
function routeKey(p: Pt, q: Pt, ends: { from?: Side; to?: Side; lead?: number } | undefined, around: readonly Side[], was?: WireWay): string {
  const side = (f?: Side) => (f ? `${f.x0},${f.x1},${f.y0},${f.y1}` : "-");
  return `${p.x},${p.y};${q.x},${q.y};${side(ends?.from)};${side(ends?.to)};${ends?.lead ?? "-"};${was ?? "-"};${ends ? "e" : "-"};${around.map(side).join("|")}`;
}

/** A wire's way, worked out (`wireRoute`, which keeps each). */
function routeOf(p: Pt, q: Pt, ends?: { from?: Side; to?: Side; lead?: number }, around: readonly Side[] = [], was?: WireWay): WireRouted {
  // (into an input named beside it: level for as long as its name - under it, never through it - the rest as any wire to where that begins)
  if (ends?.lead) {
    const at = { x: q.x - ends.lead, y: q.y };
    const to = ends.to && { ...ends.to, x0: Math.min(ends.to.x0, at.x) };
    const r = wireRoute(p, at, { from: ends.from, to }, around, was);
    return { pts: [...r.pts, q], way: r.way, ...(r.corners ? { corners: [...r.corners, q] } : {}) };
  }
  // (the side it passed before, where it went round)
  const wasSide = was === "above" || was === "below" || was === "between" ? was : undefined;
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
  // (the side it passed before set aside: what it has to go round is found from the way it would go now, the same whichever side it
  //  passed before - else each side, kept, would find others in its way than the other does, and each frame take the other side)
  const back = q.x - p.x < WIRE_TURNS ? roundWay(p, q, ends) : undefined;
  // (going on, but steeply - up or down more than twice as far as across - not the curve, whose long middle would run slanting and bowed:
  //  across, straight up or down halfway to its input, and across into it, only its two turns rounded)
  const steep = !back && Math.abs(q.y - p.y) > 2 * (q.x - p.x) ? turnsOf([p, { x: (p.x + q.x) / 2, y: p.y }, { x: (p.x + q.x) / 2, y: q.y }, q]) : undefined;
  const shape = back ? rounded(back.corners, WIRE_ROOM, DENSE) : steep ? rounded(steep, WIRE_ROOM, DENSE) : curve;
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
  // (how far it runs over them, each point for half its steps either side: to weigh ways of different lengths - a longer way's points lie
  //  further apart, and counted, would take it for less over what it passes the same)
  const overAlong = (pts: readonly Pt[]) => {
    const fs = nearIn(pts);
    if (!fs.length) return 0;
    const step = (i: number) => (i > 0 && i < pts.length ? Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) : 0);
    return pts.reduce((k, pt, i) => k + ((step(i) + step(i + 1)) / 2) * fs.reduce((j, f) => j + (within(grown.get(f)!, pt) ? (within(f, pt) ? 10 : 1) : 0), 0), 0);
  };
  // (where one of its ends lies within half a bond of another frame - frames laid over each other - every way is over that, and how far
  //  says nothing of the way: the ways are taken as they were before, by how many of their points are over what they pass)
  const buried = others.some((f) => within(grown.get(f)!, p) || within(grown.get(f)!, q));
  // (straight across at the level of the one end or the other: up or down where it leaves, across at its input's level; or across at the
  //  level it leaves at, and up or down a bond before its input - where that runs on one way across)
  const straightWays = (): WireRouted[] =>
    [q.y, p.y].flatMap((y) => {
      const w = roundWay(p, q, ends, "between", others, y);
      const leg = y === q.y ? w.corners[1].x : w.corners[3].x;
      if (!(leg > p.x && leg < q.x)) return [];
      const corners = turnsOf([p, { x: leg, y: p.y }, { x: leg, y: q.y }, q]);
      return [{ pts: rounded(corners, WIRE_ROOM, DENSE), way: "straight" as const, corners }];
    });
  // (never out past both its ends and back again round nothing, nor turning more than it must: where the way it would go does the one,
  //  straight across instead, where that is over what it passes no further; where it turns more often than the way straight across, that
  //  way, where it is as clear - clear of all where it is, else over what it passes as far, to within half a bond - and by its corners no
  //  longer: one bend down and in, not a jog, nor down, across and down again. Kept as the sides are while dragged: gone straight before,
  //  kept while no more than a fifth longer; gone round, taken only where a fifth shorter)
  const straight = (r: WireRouted): WireRouted => {
    if (buried || !r.corners || r.way === "straight") return r;
    const back = doublesBack(r.corners, [...[ends.from, ends.to].filter((f): f is Side => !!f), ...others]);
    const clear = over(r.pts) === 0;
    const along = overAlong(r.pts);
    const long = lengthOf(r.corners);
    const by = was === "straight" ? 1.25 : wasSide ? 0.8 : 1;
    let best = r;
    let least = along;
    let bends = turnsOf(r.corners).length;
    for (const z of straightWays()) {
      const o = overAlong(z.pts);
      const take = back
        ? o < least || (o === least && lengthOf(z.pts) < lengthOf(best.pts))
        : z.corners!.length < bends && (clear && was !== "straight" ? over(z.pts) === 0 : o <= along + BETWEEN) && lengthOf(z.corners!) <= long * by + 1e-9;
      if (take) [best, least, bends] = [z, o, z.corners!.length];
    }
    return best;
  };
  if (!crossed.length) {
    // (the curve clear: kept, unless it went round before and still can, no more than a fifth longer)
    if (was === "straight") {
      const kept = straightWays().find((z) => overAlong(z.pts) <= BETWEEN && lengthOf(z.pts) * 0.8 <= lengthOf(shape));
      if (kept) return kept;
    }
    if (wasSide) {
      const kept = roundWay(p, q, ends, wasSide, touchedBefore(others, p, q));
      const pts = rounded(kept.corners, WIRE_ROOM, DENSE);
      if (overAlong(pts) <= BETWEEN && lengthOf(pts) * 0.8 <= lengthOf(shape)) return straight({ pts, way: kept.side, corners: kept.corners });
    }
    // (coming back - round what it leaves and comes into - said as the side it passes them: so that the next frame keeps that side, and does
    //  not, taking it for the curve, try the shortest side again - over something now, as like as not - and so flip from one to the other
    //  frame by frame)
    return back ? straight({ pts: shape, way: back.side, corners: back.corners }) : { pts: shape, way: "plain", ...(steep ? { corners: steep } : {}) };
  }
  // (every level it may cross at, gone round all it would cross - the shortest first, by its corners, and no further than the first clear of all,
  //  and of the side it passed before; where none is clear, again with what any of them crosses then, twice at most)
  type Tried = { pts: Pt[]; corners: Pt[]; side: WireSide; box: Side; over: number; length: number };
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
      const r = { pts, corners: w.corners, side: w.side, box: boxOf(pts), over: over(pts), length: lengthOf(pts) };
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
  // (over what they pass, weighed by how far each runs over it (`overAlong`) - ways over alike, to within half a bond, then the shorter: where
  //  every way must pass the same narrow gap, nearer a frame than half a bond, the way down past all and back is no less over than the way
  //  straight in, only longer)
  const scored = tried.map((r) => ({ ...r, along: buried ? r.over : r.over ? overAlong(r.pts) : 0 }));
  const better = (x: (typeof scored)[number] | undefined, y: (typeof scored)[number]) => {
    if (!x) return true;
    if ((x.over === 0) !== (y.over === 0)) return y.over === 0;
    if (buried ? y.along !== x.along : Math.abs(y.along - x.along) > BETWEEN) return y.along < x.along;
    return y.length < x.length;
  };
  const best = scored.reduce((x, y) => (better(x, y) ? y : x));
  // (the side it passed before, kept where it is clear - or no worse - and the other is not a fifth shorter)
  const kept = wasSide && scored.filter((r) => r.side === wasSide).reduce<(typeof scored)[number] | undefined>((x, y) => (better(x, y) ? y : x), undefined);
  if (kept && kept !== best && (kept.over === 0 || kept.along <= best.along + BETWEEN) && kept.length * 0.8 <= best.length) return straight({ pts: kept.pts, way: kept.side, corners: kept.corners });
  return straight({ pts: best.pts, way: best.side, corners: best.corners });
}

/** A way's corners with those it does not turn at left out: one where the one before is, or on the line on from it. */
function turnsOf(corners: readonly Pt[]): Pt[] {
  const c = corners.filter((pt, i) => i === 0 || Math.hypot(pt.x - corners[i - 1].x, pt.y - corners[i - 1].y) > 1e-9);
  return c.filter((b, i) => {
    if (i === 0 || i === c.length - 1) return true;
    const [a, d] = [c[i - 1], c[i + 1]];
    return Math.abs((b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x)) > 1e-12;
  });
}

/**
 * Whether a way through `corners` turns back on itself out past both its
 * ends round nothing: a run it comes into and leaves going opposite ways
 * - out and back - lying beyond both its ends that way, with none of
 * `frames` within the turn, for it to have gone round.
 */
export function doublesBack(corners: readonly Pt[], frames: readonly Side[]): boolean {
  const c = turnsOf(corners);
  const [p, q] = [c[0], c[c.length - 1]];
  for (let i = 1; i + 2 < c.length; i++) {
    const [a, b, d, e] = [c[i - 1], c[i], c[i + 1], c[i + 2]];
    // (a run across, or up and down: how it comes into it and leaves it, at right angles to it)
    const across = Math.abs(d.y - b.y) < 1e-9;
    const into = Math.sign(across ? b.y - a.y : b.x - a.x);
    const from = Math.sign(across ? e.y - d.y : e.x - d.x);
    if (!into || into !== -from) continue;
    const at = across ? b.y : b.x;
    if (!(across ? [p.y, q.y] : [p.x, q.x]).every((v) => (at - v) * into > 1e-9)) continue;
    const [lo, hi] = across ? [Math.min(b.x, d.x), Math.max(b.x, d.x)] : [Math.min(b.y, d.y), Math.max(b.y, d.y)];
    const round = frames.some((f) => (across ? f.x0 < hi && f.x1 > lo && (into < 0 ? f.y0 > at : f.y1 < at) : f.y0 < hi && f.y1 > lo && (into < 0 ? f.x0 > at : f.x1 < at)));
    if (!round) return true;
  }
  return false;
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
 * else the shorter way. Its corners, before they are rounded (`rounded`).
 */
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
 * A wire as drawn (Workflow2D `useEasedPoints`): where it is to be - and
 * where its shape changed by more than `jump` at once (it went round
 * something else now, or its ends came to be one above the other), eased
 * there from where it was over `ms` with `ease`, its ends where they are to
 * be all the way (`wireToward`). Worked out for the moment it is drawn at,
 * from where it is to be then: never from where it was to be a frame
 * before, so that it is never drawn off its ports, however slow the
 * frames, or however late what was worked out for them.
 */
export class WireEasing {
  private from: { pts: readonly Pt[]; at: number } | null = null;
  private was: readonly Pt[] | null = null;
  private shown: readonly Pt[] | null = null;
  constructor(
    private readonly ms: number,
    private readonly ease: (u: number) => number,
  ) {}
  /** Whether it is on its way. */
  get going(): boolean {
    return this.from !== null;
  }
  /** Its points drawn at `now` (ms), on their way to `target` - eased where its shape moved further than `jump` at once. */
  at(target: readonly Pt[], jump: number, now: number): readonly Pt[] {
    if (this.was !== target) {
      // (as many points as it is drawn through now: where that changed - zoomed, or grown - what it is eased from spread over as many)
      const spread = (pts: readonly Pt[]) => (pts.length === target.length ? pts : byTurn(pts, target.length - 1));
      const going = this.from;
      if (going) this.from = { pts: spread(going.pts), at: going.at };
      else if (this.shown) {
        const prior = spread(this.shown);
        this.from = shapeMoved(prior, target) > jump ? { pts: prior, at: now } : null;
      }
      this.was = target;
    }
    const f = this.from;
    const u = f ? Math.min(1, (now - f.at) / this.ms) : 1;
    if (u >= 1) this.from = null;
    this.shown = f && u < 1 ? wireToward(f.pts, target, this.ease(u)) : target;
    return this.shown;
  }
}

/**
 * How far apart wires running side by side are kept (`wireLanes`): half a
 * bond, as the page draws it - the room a wire keeps from a frame
 * (`BETWEEN`, docs/LOOK.md *Room*), so that two wires side by side read
 * as two at any zoom, as a wire beside a frame does, never as one line
 * drawn double.
 */
export const WIRE_LANE = BETWEEN;

/** Further than any page reaches, in page units: where the order of lanes is measured from (`wireLanes`). */
const FAR = 1e7;

/** A wire's straight run, in a lane of its own among others (`wireLanes`). */
type Run = {
  wire: number;
  /** Which of its corners it runs from: to the next. */
  at: number;
  /** Up and down ("v") or across ("h"). */
  dir: "v" | "h";
  /** Where it runs: its x up and down, its y across - where it was, and where it is put. */
  was: number;
  pos: number;
  /** How far it runs: from - to, along it. */
  lo: number;
  hi: number;
  /** How far to the side it may be moved: none, for a run into one of its wire's ends. */
  room: [number, number];
  /** How far it may be moved and its wire keep its way - halfway to the corners either side - frames aside: onto a bus (`wireLanes`). */
  span: [number, number];
  /** The order it takes in a lane among others: the less, the further to the left, or down. */
  order: number;
};

/**
 * Wires going round (`WireRouted` `corners`) moved apart where they would
 * run on one another: each straight run up or down, or across, that runs
 * within a lane's width (`WIRE_LANE`) of another wire's, along the same
 * stretch, is given a lane of its own, the lanes at least `WIRE_LANE` apart
 * and as near where they ran as that lets them be - as far as half a bond
 * from every frame of `frames` lets them (`BETWEEN`), and no further than
 * halfway to the corners either side, so that a wire keeps its way. A
 * wire's first and last runs, into its ends, are never moved: its ends are
 * where they were, and others take lanes beside them. The order of the
 * lanes is by where each turns in and out of them - one turning off to a
 * side the nearer that side the later it turns in, or the sooner it turns
 * out - so that wires in a lane cross each other no more than they must;
 * and by the order the wires are given, where that says nothing. Where
 * there is no room for lanes so far apart, they are left as they ran.
 * Moving some into lanes may bring them alongside others: those are then
 * given lanes together, three times at most. A wire `held` - one not on a
 * card being dragged - is held where it is given there, others put in
 * lanes beside it. A wire that would come nearer a frame than its way
 * (`ways`) went - its turn under a frame's corner - is taken only as far
 * into its lane as keeps that room, else left as its way went. The
 * corners of each wire, as many as it had.
 */
export function wireLanes(ways: readonly (readonly Pt[])[], frames: readonly Side[], held: readonly (readonly Pt[] | null | undefined)[] = []): Pt[][] {
  // (each wire from where it is held, else from its way)
  const wires = ways.map((c, w) => held[w] ?? c);
  const runs: Run[] = [];
  wires.forEach((c, w) => {
    for (let i = 0; i + 1 < c.length; i++) {
      const [a, b] = [c[i], c[i + 1]];
      const dir = Math.abs(a.x - b.x) < 1e-9 ? "v" : Math.abs(a.y - b.y) < 1e-9 ? "h" : null;
      if (!dir) continue;
      const along = (pt: Pt) => (dir === "v" ? pt.y : pt.x);
      const side = (pt: Pt) => (dir === "v" ? pt.x : pt.y);
      if (Math.abs(along(a) - along(b)) < 1e-9) continue;
      const pos = side(a);
      const [before, after] = [c[i - 1], c[i + 2]];
      // (a run between two that turn off it may be moved - they then run longer or shorter; one into an end, or on in line with the next, not)
      const turns = (o: Pt | undefined) => !!o && Math.abs(side(o) - pos) > 1e-9;
      const fixed = !!held[w] || !turns(before) || !turns(after);
      // (its ends in order along it, and which way it turns off at each: towards the greater side, or the less - or not at all)
      const [first, last, off0, off1] = along(a) <= along(b) ? [a, b, before, after] : [b, a, after, before];
      const turn0 = turns(off0) ? Math.sign(side(off0!) - pos) : 0;
      const turn1 = turns(off1) ? Math.sign(side(off1!) - pos) : 0;
      // (a run turning off to a side goes to that side the later it turns in, and the sooner it turns out - one turning in later, or out
      //  sooner, than another turning the other way, to its side before the other to the other's: measured from far off, `FAR`)
      const order = turn0 * (FAR + along(first)) + turn1 * (FAR - along(last));
      let room: [number, number] = [pos, pos];
      let span: [number, number] = [pos, pos];
      if (!fixed) {
        // (half a bond clear of every frame along it, and no more than halfway to the corners either side)
        let [lo, hi] = [-Infinity, Infinity];
        for (const f of frames) {
          const [f0, f1, g0, g1] = dir === "v" ? [f.y0, f.y1, f.x0, f.x1] : [f.x0, f.x1, f.y0, f.y1];
          if (f1 <= along(first) || f0 >= along(last)) continue;
          if (g1 + BETWEEN <= pos) lo = Math.max(lo, g1 + BETWEEN);
          else if (g0 - BETWEEN >= pos) hi = Math.min(hi, g0 - BETWEEN);
          else [lo, hi] = [Math.max(lo, pos), Math.min(hi, pos)];
        }
        span = [-Infinity, Infinity];
        for (const o of [side(before!), side(after!)]) {
          if (o < pos) [lo, span[0]] = [Math.max(lo, (o + pos) / 2), Math.max(span[0], (o + pos) / 2)];
          else [hi, span[1]] = [Math.min(hi, (o + pos) / 2), Math.min(span[1], (o + pos) / 2)];
        }
        room = [lo, hi];
      }
      runs.push({ wire: w, at: i, dir, was: pos, pos, lo: along(first), hi: along(last), room, span, order });
    }
  });
  // (wires out of one port are one signal: where their runs lie on one another - the way out of the port they share - those are one run,
  //  a bus, moved together as the first of them, never put in lanes apart; and runs of theirs near one another are never parted either.
  //  Lanes part wires out of different ports)
  const port = (w: number) => wires[w][0];
  const samePort = (a: number, b: number) => Math.hypot(port(a).x - port(b).x, port(a).y - port(b).y) < 1e-9;
  //  Those within a lane of one another, out of one port along the same stretch, are drawn onto one: the one nearest the port, where the
  //  others keep their ways moved there - however near the frames beside the port, which that one is as near)
  const leaderOf = new Map<Run, Run>();
  const leaders = new Set<Run>();
  const portSide = (r: Run) => Math.abs(r.pos - (r.dir === "v" ? port(r.wire).x : port(r.wire).y));
  for (const r of [...runs].sort((a, b) => portSide(a) - portSide(b))) {
    if (leaders.has(r)) continue;
    const lead = [...leaders].find(
      (o) => o.dir === r.dir && o.wire !== r.wire && samePort(o.wire, r.wire) && Math.abs(o.pos - r.pos) < WIRE_LANE - 1e-9 && r.span[0] <= o.pos + 1e-9 && o.pos <= r.span[1] + 1e-9 && Math.min(o.hi, r.hi) > Math.max(o.lo, r.lo),
    );
    if (!lead) {
      leaders.add(r);
      continue;
    }
    leaderOf.set(r, lead);
    [lead.lo, lead.hi] = [Math.min(lead.lo, r.lo), Math.max(lead.hi, r.hi)];
    lead.room = [Math.max(lead.room[0], r.room[0]), Math.min(lead.room[1], r.room[1])];
    if (lead.room[0] > lead.room[1]) lead.room = [lead.pos, lead.pos];
  }
  for (let round = 0; round < 3; round++) {
    let moved = false;
    for (const dir of ["v", "h"] as const) {
      const these = runs.filter((r) => r.dir === dir && !leaderOf.has(r)).sort((a, b) => a.pos - b.pos);
      // (runs of different wires within a lane of one another, along the same stretch: one lane each - and those of them within a lane of others, the same)
      const group = these.map((_, i) => i);
      const top = (i: number): number => (group[i] === i ? i : (group[i] = top(group[i])));
      for (let i = 0; i < these.length; i++)
        for (let j = i + 1; j < these.length && these[j].pos - these[i].pos < WIRE_LANE - 1e-9; j++) {
          const [a, b] = [these[i], these[j]];
          if (a.wire !== b.wire && !samePort(a.wire, b.wire) && Math.min(a.hi, b.hi) > Math.max(a.lo, b.lo)) group[top(j)] = top(i);
        }
      const groups = new Map<number, Run[]>();
      these.forEach((r, i) => groups.set(top(i), [...(groups.get(top(i)) ?? []), r]));
      for (const g of groups.values()) {
        if (new Set(g.map((r) => r.wire)).size < 2 || g.every((r) => r.room[0] === r.room[1])) continue;
        // (in the order they turn in and out, else as they lie)
        const byTurns = [...g].sort((a, b) => a.order - b.order || a.wire - b.wire || a.at - b.at);
        const asTheyLie = [...g].sort((a, b) => a.pos - b.pos || a.order - b.order || a.wire - b.wire);
        const put = inLanes(byTurns, WIRE_LANE) ?? inLanes(asTheyLie, WIRE_LANE);
        if (!put) continue;
        put.forEach((x, n) => {
          const r = byTurns === put.of ? byTurns[n] : asTheyLie[n];
          if (Math.abs(r.pos - x) > 1e-9) moved = true;
          r.pos = x;
        });
      }
    }
    if (!moved) break;
  }
  for (const [r, lead] of leaderOf) r.pos = lead.pos;
  const out = wires.map((c) => c.map((pt) => ({ ...pt })));
  for (const r of runs) {
    if (r.pos === r.was) continue;
    for (const i of [r.at, r.at + 1]) if (r.dir === "v") out[r.wire][i].x = r.pos;
    else out[r.wire][i].y = r.pos;
  }
  // (a wire its lane brings nearer a frame than its own way went: as far into its lane as keeps that room - three quarters, half, a quarter - else as it ran)
  return out.map((c, w) => {
    const was = ways[w];
    if (c.every((pt, i) => pt.x === was[i].x && pt.y === was[i].y)) return c;
    const room = clearOf(roundedWay(was), frames);
    for (const k of [1, 0.75, 0.5, 0.25]) {
      const part = k === 1 ? c : was.map((pt, i) => ({ x: pt.x + (c[i].x - pt.x) * k, y: pt.y + (c[i].y - pt.y) * k }));
      const now = clearOf(roundedWay(part), frames);
      if (now.every((d, f) => d >= Math.min(BETWEEN, room[f]) - 1e-9)) return part;
    }
    return was.map((pt) => ({ ...pt }));
  });
}

/**
 * How far a wire through `pts` keeps from each of `frames` - beyond where it
 * meets its ends, as far as its curve's least handle (40 px): what it leaves
 * and comes into it meets at its ends, and is never counted.
 */
function clearOf(pts: readonly Pt[], frames: readonly Side[]): number[] {
  const [p, q] = [pts[0], pts[pts.length - 1]];
  const meet = 40 * PX;
  const away = pts.filter((pt) => Math.min(Math.hypot(pt.x - p.x, pt.y - p.y), Math.hypot(pt.x - q.x, pt.y - q.y)) > meet);
  const xs = away.map((pt) => pt.x);
  const ys = away.map((pt) => pt.y);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  return frames.map((f) => {
    // (one its way ends on - what it leaves or comes into: not counted; one far off: as far as it is)
    const on = (e: Pt) => e.x >= f.x0 - 1e-9 && e.x <= f.x1 + 1e-9 && e.y >= f.y0 - 1e-9 && e.y <= f.y1 + 1e-9;
    if (on(p) || on(q)) return Infinity;
    if (f.x0 > box.x1 + BETWEEN || f.x1 < box.x0 - BETWEEN || f.y0 > box.y1 + BETWEEN || f.y1 < box.y0 - BETWEEN) return Infinity;
    let d = Infinity;
    for (const pt of away) d = Math.min(d, Math.hypot(Math.max(f.x0 - pt.x, 0, pt.x - f.x1), Math.max(f.y0 - pt.y, 0, pt.y - f.y1)));
    return d;
  });
}

/**
 * Where runs in one way go, in the order given, each `gap` past the one
 * before at least, each within its room - as near where each is as that
 * lets it be: their places, in order, or none where there is no room for
 * them so.
 */
function inLanes(runs: readonly Run[], gap: number): (number[] & { of: readonly Run[] }) | null {
  const k = runs.length;
  // (as near where each is, each `gap` past the one before: the nearest such, by pooling those that would come too close - Pool Adjacent Violators - on where each is less its place in the order)
  const blocks: { sum: number; n: number }[] = [];
  runs.forEach((r, i) => {
    blocks.push({ sum: r.pos - i * gap, n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
      const b = blocks.pop()!;
      blocks[blocks.length - 1].sum += b.sum;
      blocks[blocks.length - 1].n += b.n;
    }
  });
  const x: number[] = [];
  for (const b of blocks) for (let n = 0; n < b.n; n++) x.push(b.sum / b.n + x.length * gap);
  // (then each into its room, those after it pushed on, and those before it back: as often as it takes, a few times)
  for (let pass = 0; pass < 2 * k + 2; pass++) {
    let changed = false;
    for (let i = 0; i < k; i++) {
      const [lo, hi] = runs[i].room;
      let v = Math.min(Math.max(x[i], lo), hi);
      if (i > 0) v = Math.max(v, x[i - 1] + gap);
      if (v !== x[i]) [x[i], changed] = [v, true];
    }
    for (let i = k - 1; i >= 0; i--) {
      const [lo, hi] = runs[i].room;
      let v = Math.min(Math.max(x[i], lo), hi);
      if (i < k - 1) v = Math.min(v, x[i + 1] - gap);
      if (v !== x[i]) [x[i], changed] = [v, true];
    }
    if (!changed) break;
  }
  const fits = x.every((v, i) => v >= runs[i].room[0] - 1e-9 && v <= runs[i].room[1] + 1e-9 && (i === 0 || v - x[i - 1] >= gap - 1e-9));
  return fits ? Object.assign(x, { of: runs }) : null;
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

/** A wire going round's path through its corners (`WireRouted` `corners`, moved into lanes or not): each turn rounded a bond wide (`WIRE_ROOM`), as `wireRoute` draws it. */
export const roundedWay = (corners: readonly Pt[]): Pt[] => rounded(corners, WIRE_ROOM, DENSE);

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
