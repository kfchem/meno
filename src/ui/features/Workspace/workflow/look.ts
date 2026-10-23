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

/** A wire's curve from `p` to `q`, leaving and arriving level (a cubic Bézier, its handles half the run across, 40 px at least): `n` + 1 points along it. */
export function wireCurve(p: Pt, q: Pt, n = 48): Pt[] {
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
  return Array.from({ length: n + 1 }, (_, i) => at(i / n));
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
