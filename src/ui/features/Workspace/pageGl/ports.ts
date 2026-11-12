/**
 * A workflow's ports as WebGL draws them (docs/WORKSPACE.md, *Drawn by
 * WebGL*; docs/WORKFLOWS.md, *How it looks*): a small ring on a set's or a
 * card's edge, 9 page pixels across - it grows and shrinks with the page,
 * never more than a sixth of what it is on, nor under 5 screen pixels where
 * the page is far (workflow/look `portSize`) - its line a control's; white
 * with a grey line, Meno's light colour as it is pointed at, filled with
 * Meno's colour where a wire being drawn may join it. Taken hold of over
 * 12 screen pixels about its middle, however small it is drawn.
 */
import { colourMix, COLORS } from "../../../theme/colors";
import { PORT_LEAST_SCREEN_PX, PORT_PAGE_PX, PORT_SHARE, PX } from "../workflow/look";
import type { Region } from "./hits";
import type { Ring } from "./shapes";
import type { PageText } from "./texts";
import type { Control } from "./units";

/** A port where it stands on the page; what it is on, how tall (page px); what it is called - for the page's tip and a screen reader, which say it from part 9 of drawing the page by WebGL: nothing reads it yet; whether it takes the pointer. */
export type PortAt = { key: string; x: number; y: number; ofPx?: number; label: string; noHits?: true };

/** The page pixels a port is drawn at, the least of the screen's it is drawn at, and the screen pixels it is taken hold of over. */
export const PORT_PX = { drawn: PORT_PAGE_PX, least: PORT_LEAST_SCREEN_PX, taken: 12 } as const;

/** A port's size as a control (pageGl/units `Control`): workflow/look `portSize`'s. */
export function portControl(ofPx?: number): Control {
  return { leastScreenPx: PORT_PX.least, onPagePx: PORT_PX.drawn, ...(ofPx != null && ofPx > 0 ? { leastOfPx: { of: ofPx, share: PORT_SHARE } } : {}) };
}

/**
 * A port's tone: 0 at rest, 1 pointed at, 2 lit - a wire being drawn may
 * join it - and between them as it eases; its fill and line at that tone.
 */
export function portColours(tone: number): { fill: string; line: string } {
  if (tone <= 1) return { fill: colourMix(COLORS.background, COLORS.lightBase, tone), line: colourMix(COLORS.quiet, COLORS.base, tone) };
  return { fill: colourMix(COLORS.lightBase, COLORS.base, tone - 1), line: COLORS.base };
}

/** A port drawn at `tone`, its ring and the place that takes the pointer (none where it takes none). */
export function portParts(p: PortAt, tone: number, opacity = 1): { ring: Ring; region: Region | null } {
  const size = portControl(p.ofPx);
  const c = portColours(tone);
  return {
    ring: { kind: "ring", key: p.key, x: p.x, y: p.y, diameterPx: size.onPagePx, size, fill: c.fill, line: { widthPx: 1, color: c.line }, z: 5, opacity },
    region: p.noHits ? null : { key: p.key, part: "port", circle: { x: p.x, y: p.y, diameterPx: PORT_PX.taken, size }, z: 5, cursor: "crosshair" },
  };
}

/** How far up and to the left of a port's middle a count of the wires into it stands (page units: 6 page px), where they come in. */
const COUNT_OFF = 6 * PX;

/**
 * How many wires come into a step's input, where two or more do
 * (docs/WORKFLOWS.md, *Several wires into one input*): a small count beside
 * its port, up and to the left where they come in, 9 page px, in the
 * port's line's colour at `tone`. None for one wire or none.
 */
export function portCount(p: PortAt, count: number, tone: number, opacity = 1): PageText | null {
  if (count < 2) return null;
  return { key: `${p.key}:count`, x: p.x - COUNT_OFF, y: p.y + COUNT_OFF, anchor: "end", text: String(count), sizePx: 9, color: portColours(tone).line, weight: 500, z: 5, opacity };
}

/** What the page's tip says of an input several wires come into, pointed at: each set wired in, numbered in the order its entries are taken (flow `wiresInto`) - "1 Round 1 · 2 Round 2". */
export const sourcesSaid = (names: readonly string[]): string => names.map((n, k) => `${k + 1} ${n}`).join(" \u00b7 ");

/** What a port's key says it is: a step's input, one of its exits, a set's giving, the selection's. */
export function portOfKey(key: string): { take: { step: number; port: string } } | { exit: { step: number; exit: string } } | { give: { set: number } } | { selection: true } | null {
  const [head, side, a, ...rest] = key.split(":");
  if (head !== "port") return null;
  if (side === "take" && a != null && rest.length) return { take: { step: Number(a), port: rest.join(":") } };
  if (side === "exit" && a != null && rest.length) return { exit: { step: Number(a), exit: rest.join(":") } };
  if (side === "give" && a != null) return { give: { set: Number(a) } };
  if (side === "selection") return { selection: true };
  return null;
}

/**
 * Where a wire let go lands: on a port the page's WebGL draws (`key`, found
 * by its shape) - an exit's taken as its set's giving - or else on one in
 * the page's HTML, an opened card's own (its `data-take` "step:port", its
 * `data-give-set`); none where neither is under the pointer.
 */
export function dropOn(
  key: string | null,
  html: { take?: string | null; give?: string | null },
  setOfExit: (exit: { step: number; exit: string }) => number | undefined,
): { take: { step: number; port: string } } | { give: { set: number } } | null {
  const of = key ? portOfKey(key) : null;
  if (of && "take" in of) return { take: of.take };
  if (of && "give" in of) return { give: of.give };
  if (of && "exit" in of) {
    const set = setOfExit(of.exit);
    if (set != null) return { give: { set } };
  }
  if (html.take) {
    const at = html.take.indexOf(":");
    if (at > 0) return { take: { step: Number(html.take.slice(0, at)), port: html.take.slice(at + 1) } };
  }
  if (html.give) return { give: { set: Number(html.give) } };
  return null;
}
