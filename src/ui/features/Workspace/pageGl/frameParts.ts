import type { Frame } from "../workflow/entries";
import { NAME_DOWN, SET_PAD } from "../workflow/look";
import { COLORS } from "../../../theme/colors";
import type { PageIcon } from "./icons";
import { textWidth, type PageText } from "./texts";
import type { Region, Side } from "./hits";
import type { Shape } from "./shapes";
import { pagePx } from "./units";

/**
 * A frame on the page with a tab along its top, as a set's is drawn
 * (workflow/SetFrame): what a conversation sees (docs/CONVERSATIONS.md),
 * and - later - a set and a closed card. `tabOnly`: its tab alone, a box of
 * its own, where it has no frame (a conversation of the whole page). Its
 * line's colour by `tone`; its tab's words its `icon`, `name`, `status` and
 * - in Meno's warning colour, with the warning icon - `warn`; below the
 * zoom words are read at, its icon alone. `edges`: its sides and corners
 * take the pointer, to size it. `opacity`: as present as the caller fades
 * it (DURATION, EASE).
 */
export type FrameTab = {
  key: string;
  box: Frame;
  tabOnly?: true;
  tone: "rest" | "hover" | "chosen";
  tab: { icon: string; name: string; status?: string; warn?: string };
  /** Its icon only where its words are too small to read, standing in for them: a set's tab says its name alone, read. */
  iconWhenSmall?: true;
  edges?: true;
  opacity?: number;
  /** Going - fading out, as it last was: drawn, never taken hold of. */
  noHits?: true;
};

/** Meno's colours as its HTML has them (theme/colors, docs/LOOK.md *Colours*): the line at rest, under the pointer and chosen; the words; the warning. */
export const FRAME_COLORS = { line: COLORS.hairline, hover: COLORS.quiet, chosen: COLORS.base, words: COLORS.ink, quiet: COLORS.quiet, warn: COLORS.attention, fill: COLORS.background } as const;

/** A frame's corners, its line, and its tab's words and icons, in page pixels: as a set's (rounded-xl, the hair line, text-[11px], h-3.5, gap-1.5). */
export const FRAME_PX = { radius: 12, line: 1, words: 11, icon: 14, gap: 6, edge: 8 } as const;

const SIDES: readonly Side[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const CURSOR: Record<Side, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

/** Its tab's band: along its frame's top, 2 * NAME_DOWN high. */
const BAND = 2 * NAME_DOWN;

/** How wide a tab's words are, in page pixels: its icon, and - read - its name, status and warning, each after a gap. */
export function tabWidthPx(tab: FrameTab["tab"], read: boolean, iconWhenSmall = false): number {
  if (!read) return FRAME_PX.icon;
  const word = (t: string | undefined, weight: 400 | 500 = 400) => (t ? FRAME_PX.gap + textWidth(t, FRAME_PX.words, weight) : 0);
  // (no icon before its words, read: they start where the icon would)
  if (iconWhenSmall) return word(tab.name, 500) - FRAME_PX.gap + word(tab.status) + (tab.warn ? FRAME_PX.gap + FRAME_PX.icon + 4 + textWidth(tab.warn, FRAME_PX.words) : 0);
  return FRAME_PX.icon + word(tab.name, 500) + word(tab.status) + (tab.warn ? FRAME_PX.gap + FRAME_PX.icon + 4 + textWidth(tab.warn, FRAME_PX.words) : 0);
}

/** Where a frame's tab's words start - its left, and the middle of its band - in the page's units: a set's name, read, starts there, and so does the field it is written anew in (pageGl/PageField). */
export function tabStart(box: Frame): { x: number; y: number } {
  return { x: box.x0 + SET_PAD, y: box.y1 - BAND / 2 };
}

/**
 * The parts `items` are drawn and taken hold of by - boxes, words, icons
 * and the places that take the pointer - with their words `read` or their
 * icons alone. The frame's inside takes nothing: the page under it stays
 * the page's.
 */
export function frameTabParts(items: readonly FrameTab[], read: boolean): { shapes: Shape[]; texts: PageText[]; icons: PageIcon[]; regions: Region[] } {
  const shapes: Shape[] = [];
  const texts: PageText[] = [];
  const icons: PageIcon[] = [];
  const regions: Region[] = [];
  for (const it of items) {
    const { x0, y0, x1, y1 } = it.box;
    const color = it.tone === "chosen" ? FRAME_COLORS.chosen : it.tone === "hover" ? FRAME_COLORS.hover : FRAME_COLORS.line;
    const line = { widthPx: FRAME_PX.line, color };
    const fade = it.opacity != null ? { opacity: it.opacity } : {};
    const top = y1;
    const { x: left, y: mid } = tabStart(it.box);
    const tabRight = left + pagePx(tabWidthPx(it.tab, read, it.iconWhenSmall)) + SET_PAD;
    // (its frame - or, of the whole page, its tab alone, a box of its own)
    if (it.tabOnly) shapes.push({ kind: "box", key: `${it.key}:tab`, x0, y0: top - BAND, x1: tabRight, y1: top, radiusPx: FRAME_PX.radius, fill: FRAME_COLORS.fill, line, z: 1, ...fade });
    else shapes.push({ kind: "box", key: `${it.key}:frame`, x0, y0, x1, y1, radiusPx: FRAME_PX.radius, line, z: 0, ...fade });
    // (its tab's words: its icon, then - read - its name, its status, its warning)
    let x = left;
    if (!it.iconWhenSmall || !read) {
      icons.push({ key: `${it.key}:icon`, icon: it.tab.icon, x: x + pagePx(FRAME_PX.icon / 2), y: mid, sizePx: FRAME_PX.icon, color: FRAME_COLORS.quiet, ...fade });
      x += pagePx(FRAME_PX.icon);
    } else x -= pagePx(FRAME_PX.gap);
    if (read) {
      const words = (part: string, text: string | undefined, colour: string, weight: 400 | 500 = 400) => {
        if (!text) return;
        x += pagePx(FRAME_PX.gap);
        texts.push({ key: `${it.key}:${part}`, x, y: mid, anchor: "start", baseline: "middle", text, sizePx: FRAME_PX.words, color: colour, weight, ...fade });
        x += pagePx(textWidth(text, FRAME_PX.words, weight));
      };
      words("name", it.tab.name, FRAME_COLORS.words, 500);
      words("status", it.tab.status, FRAME_COLORS.quiet);
      if (it.tab.warn) {
        x += pagePx(FRAME_PX.gap);
        icons.push({ key: `${it.key}:warn-icon`, icon: "warning", x: x + pagePx(FRAME_PX.icon / 2), y: mid, sizePx: FRAME_PX.icon, color: FRAME_COLORS.warn, ...fade });
        x += pagePx(FRAME_PX.icon + 4) - pagePx(FRAME_PX.gap);
        words("warn", it.tab.warn, FRAME_COLORS.warn);
      }
    }
    // (what takes the pointer: its tab - along the frame's whole top, or its own box - and, where it is sized, its edges)
    if (it.noHits) continue;
    regions.push({ key: it.key, part: "tab", rect: { x0, y0: top - BAND, x1: it.tabOnly ? tabRight : x1, y1: top }, z: 1, cursor: "default" });
    if (it.edges && !it.tabOnly) for (const side of SIDES) regions.push({ key: it.key, part: `edge:${side}`, band: { x0, y0, x1, y1, widthPx: FRAME_PX.edge, side }, z: 0, cursor: CURSOR[side] });
  }
  return { shapes, texts, icons, regions };
}
