/**
 * How large a workflow's parts are on the page (docs/WORKFLOWS.md, *How
 * each looks*): in world units, at the page's scale - so they zoom with it,
 * as all on the page does. The specification's sizes are in pixels at the
 * zoom a canvas opens at in the default style; `PX` is one of them.
 */
import { PAGE_PX } from "../utils/pageScale";

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

/** How far inside a set what it holds stays from its frame; how far below its top - under its name - it begins; and how far below its top its name stands. */
export const SET_PAD = 14 * PX;
export const SET_TOP = 36 * PX;
/** A set holding a table, inside its frame, in px (TableBody): its first rows, and what it is. */
export const TABLE_PX = { w: 400, h: 196 };
/** How large a chart is drawn inside its set's frame, in px at the page's own size: its axes, labels and points. */
export const CHART_PX = { w: 360, h: 260 };
export const NAME_DOWN = 18 * PX;
/** A result set's distance from its step, and between molecules in it. */
export const GAP = 64 * PX;
export const BETWEEN = 24 * PX;
/** The room a molecule's frames chip takes below it, where it has one: the chip and the gap above it (Frames3D). */
export const CHIP = 40 * PX;
/** A frames chip's text, about how wide a character of it is - generously - and the room either side of it (Frames3D: 11-pixel text, 10 pixels and a border each side). */
export const CHIP_CHAR = 5.5 * PX;
export const CHIP_SIDES = 22 * PX;
