/**
 * A workflow's ports as WebGL draws them (docs/WORKSPACE.md, *Drawn by
 * WebGL*; docs/WORKFLOWS.md, *How it looks*): a small ring on a set's or a
 * card's edge, as large as a hand takes it - 9 screen pixels where the page
 * is near, never more than 11 page pixels zoomed out nor than a sixth of
 * what it is on (workflow/look `portSize`) - its line a control's; white
 * with a grey line, Meno's light colour as it is pointed at, filled with
 * Meno's colour where a wire being drawn may join it. Taken hold of over
 * 12 screen pixels about its middle, however small it is drawn.
 */
import { colourMix, COLORS } from "../../../theme/colors";
import { PORT, PORT_SHARE, PX } from "../workflow/look";
import type { Region } from "./hits";
import type { Ring } from "./shapes";
import type { Control } from "./units";

/** A port where it stands on the page; what it is on, how tall (page px); what it is called - for the page's tip and a screen reader, which say it from part 9 of drawing the page by WebGL: nothing reads it yet; whether it takes the pointer. */
export type PortAt = { key: string; x: number; y: number; ofPx?: number; label: string; noHits?: true };

/** The screen pixels a port is drawn at where the page is near, and taken hold of over. */
export const PORT_PX = { drawn: 9, taken: 12 } as const;

/** A port's size as a control (pageGl/units `Control`): workflow/look `portSize`'s. */
export function portControl(ofPx?: number): Control {
  return { screenPx: PORT_PX.drawn, mostPagePx: PORT / PX, ...(ofPx != null && ofPx > 0 ? { leastOfPx: { of: ofPx, share: PORT_SHARE } } : {}) };
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
    ring: { kind: "ring", key: p.key, x: p.x, y: p.y, diameterPx: size.mostPagePx, size, fill: c.fill, line: { widthPx: 1, color: c.line }, z: 5, opacity },
    region: p.noHits ? null : { key: p.key, part: "port", circle: { x: p.x, y: p.y, diameterPx: PORT_PX.taken, size }, z: 5, cursor: "crosshair" },
  };
}

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
