import type { Frame } from "../workflow/entries";
import { NAME_DOWN, TAB_INSET } from "../workflow/look";
import { COLORS } from "../../../theme/colors";
import type { PageIcon } from "./icons";
import { textWidth, type PageText } from "./texts";
import type { Region, Side } from "./hits";
import type { Shape } from "./shapes";
import { pagePx } from "./units";
import { NAME_PX, inReadingOrder, namesKept, onPage, type Band, type NameBox } from "./cardBands";
import { PAGE_PX } from "../utils/pageScale";

/**
 * A frame on the page with a tab along its top, as a set's is drawn
 * (workflow/SetFrame): what a conversation sees (docs/CONVERSATIONS.md),
 * and - later - a set and a closed card. `tabOnly`: its tab alone, a box of
 * its own, where it has no frame (a conversation of the whole page). Its
 * line's colour by `tone`; its tab's words its `icon`, `name`, `status` and
 * - in Meno's warning colour, with the warning icon - `warn`; below the
 * zoom words are read at, its icon alone. `edges`: its sides and corners
 * take the pointer, to size it. `opacity`: as present as the caller fades
 * it (DURATION, EASE). `outward`: what lies inside it may be sent away
 * from this computer - a conversation's scope - its line dashed, in Meno's
 * colour, never a set's hairline (the maintainer, 2026-11-07).
 */
export type FrameTab = {
  key: string;
  box: Frame;
  tabOnly?: true;
  tone: "rest" | "hover" | "chosen";
  /** What lies inside it may be sent away from this computer: its own line, not a set's. */
  outward?: true;
  /** How far its tone has come, eased (0 at rest, 1 pointed at, 2 chosen): an outward line's weight follows it. */
  level?: number;
  tab: { icon: string; name?: string; status?: string; warn?: string };
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

/** An outward frame's line (`FrameTab.outward`): dashed in Meno's colour - a little heavier pointed at, heavier chosen - in page px. */
export const OUTWARD_LINE = { color: COLORS.base, rest: 1, hover: 1.5, chosen: 2, dashed: { onPx: 6, offPx: 4 } } as const;

/** A frame's line as its tone has it: a set's hairline, darker pointed at, Meno's colour chosen; an outward one's dashes. */
export function frameLine(it: Pick<FrameTab, "tone" | "outward" | "level">): { widthPx: number; color: string; dashed?: { onPx: number; offPx: number } } {
  if (it.outward) {
    const level = it.level ?? { rest: 0, hover: 1, chosen: 2 }[it.tone];
    const widthPx = level <= 1 ? OUTWARD_LINE.rest + (OUTWARD_LINE.hover - OUTWARD_LINE.rest) * level : OUTWARD_LINE.hover + (OUTWARD_LINE.chosen - OUTWARD_LINE.hover) * (level - 1);
    return { widthPx, color: OUTWARD_LINE.color, dashed: OUTWARD_LINE.dashed };
  }
  return { widthPx: FRAME_PX.line, color: it.tone === "chosen" ? FRAME_COLORS.chosen : it.tone === "hover" ? FRAME_COLORS.hover : FRAME_COLORS.line };
}

/**
 * How a set's tab is drawn zoomed out (`frameTabParts`): the page's scale, the band it is drawn in (pageGl/cardBands), how far its words are
 * read (1) or not (0), eased - its name stands in for them, as large on the screen as the page's smallest words - and how far each name
 * is shown (`labels`, by key, 1 where none is said), eased, where it would overlap one before it.
 */
export type FarTabs = { scale: number; band: Band; words: number; labels?: ReadonlyMap<string, number> };

/** Its tab's band: along its frame's top, 2 * NAME_DOWN high. */
const BAND = 2 * NAME_DOWN;

/** The widest a set's name runs zoomed out, in page px: its frame's width less its tab's inset either side - cut with an ellipsis, so that it never lies beyond its frame. */
const farWidest = (box: Frame): number => Math.max(0, Math.abs(box.x1 - box.x0) / PAGE_PX - (2 * TAB_INSET) / PAGE_PX);

/**
 * Where a set's name's middle is, zoomed out, in the page's units: in its tab's band where it is no higher than the band; larger, it rises - its
 * lower edge from the band's lower edge, the whole of the band, up to its frame's top where it is twice as high as the band - so that
 * it never lies down over what the frame holds, and, as large on the screen as it is, wholly above its frame when the page is far off.
 */
const farNameY = (box: Frame, scale: number): number => {
  const size = pagePx(onPage(NAME_PX, scale));
  const lower = box.y1 - BAND * Math.min(1, Math.max(0, 2 - size / BAND));
  return Math.max(tabStart(box).y, lower + size / 2);
};

/** Where a set's name lies on the page, zoomed out, in the world's units: from where its tab's words start, as wide as it is at its size on the screen, or as its frame allows. */
export function tabNameBox(it: Pick<FrameTab, "key" | "box" | "tab">, scale: number): NameBox & { fits: boolean } {
  const size = onPage(NAME_PX, scale);
  const natural = textWidth(it.tab.name, size, 500);
  const { x } = tabStart(it.box);
  const y = farNameY(it.box, scale);
  const wide = Math.min(natural, farWidest(it.box));
  return { key: it.key, x0: x, x1: x + pagePx(wide), y0: y - pagePx(size) / 2, y1: y + pagePx(size) / 2, fits: natural <= farWidest(it.box) };
}

/**
 * The keys of the sets whose names stay, zoomed out: in the order their tabs are read, one that overlaps one before it is left out, one that
 * would lie over another frame or anything in `clear` (the page's cards: boxes in the page's units) - and, only marked, one that would be cut
 * short. A name is shown whole inside its frame's width and clear of everything beside it, or not at all.
 */
export function tabNamesKept(items: readonly FrameTab[], scale: number, band: Band, clear: readonly Frame[] = []): Set<string> {
  const among = items.filter((it) => it.iconWhenSmall && !it.noHits);
  const ordered = inReadingOrder(among.map((it) => ({ x: it.box.x0, y: it.box.y1, key: it.key, it })));
  const over = (b: NameBox, other: Frame) => {
    const x0 = Math.min(other.x0, other.x1);
    const x1 = Math.max(other.x0, other.x1);
    const y0 = Math.min(other.y0, other.y1);
    const y1 = Math.max(other.y0, other.y1);
    return b.x0 < x1 && x0 < b.x1 && b.y0 < y1 && y0 < b.y1;
  };
  // (a frame that holds this one whole is no neighbour of its name)
  const holds = (o: Frame, it: Frame) => Math.min(o.x0, o.x1) <= Math.min(it.x0, it.x1) && Math.max(o.x0, o.x1) >= Math.max(it.x0, it.x1) && Math.min(o.y0, o.y1) <= Math.min(it.y0, it.y1) && Math.max(o.y0, o.y1) >= Math.max(it.y0, it.y1);
  const clearOf = (it: FrameTab, b: NameBox) => !items.some((o) => o.key !== it.key && !o.noHits && !o.tabOnly && !holds(o.box, it.box) && over(b, o.box)) && !clear.some((c) => over(b, c));
  return namesKept(ordered.map((o) => ({ o, b: tabNameBox(o.it, scale) })).filter(({ o, b }) => (band !== "marked" || b.fits) && clearOf(o.it, b)).map(({ b }) => b));
}

const SIDES: readonly Side[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const CURSOR: Record<Side, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

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
  return { x: box.x0 + TAB_INSET, y: box.y1 - BAND / 2 };
}

/**
 * The parts `items` are drawn and taken hold of by - boxes, words, icons
 * and the places that take the pointer - with their words `read` or their
 * icons alone. The frame's inside takes nothing: the page under it stays
 * the page's.
 */
export function frameTabParts(items: readonly FrameTab[], read: boolean, far?: FarTabs): { shapes: Shape[]; texts: PageText[]; icons: PageIcon[]; regions: Region[] } {
  const shapes: Shape[] = [];
  const texts: PageText[] = [];
  const icons: PageIcon[] = [];
  const regions: Region[] = [];
  for (const it of items) {
    const { x0, y0, x1, y1 } = it.box;
    const line = frameLine(it);
    const fade = it.opacity != null ? { opacity: it.opacity } : {};
    // (a set's words, as far as they are read while the page is zoomed out of reading them: its name instead - as large on the screen as the page's smallest words)
    // (a set's words are there while they fade, `far.words`; others', as the page reads them)
    const shown = it.iconWhenSmall && far ? far.words > 0 : read;
    const readFade = far && it.iconWhenSmall ? { opacity: (it.opacity ?? 1) * far.words } : fade;
    const top = y1;
    const { x: left, y: mid } = tabStart(it.box);
    const tabRight = left + pagePx(tabWidthPx(it.tab, shown, it.iconWhenSmall)) + TAB_INSET;
    // (its frame - or, of the whole page, its tab alone, a box of its own)
    if (it.tabOnly) shapes.push({ kind: "box", key: `${it.key}:tab`, x0, y0: top - BAND, x1: tabRight, y1: top, radiusPx: FRAME_PX.radius, fill: FRAME_COLORS.fill, line, z: 1, ...fade });
    else shapes.push({ kind: "box", key: `${it.key}:frame`, x0, y0, x1, y1, radiusPx: FRAME_PX.radius, line, z: 0, ...fade });
    // (its tab's words: its icon, then - read - its name, its status, its warning)
    let x = left;
    if (!it.iconWhenSmall || (!shown && !far)) {
      icons.push({ key: `${it.key}:icon`, icon: it.tab.icon, x: x + pagePx(FRAME_PX.icon / 2), y: mid, sizePx: FRAME_PX.icon, color: it.outward ? OUTWARD_LINE.color : FRAME_COLORS.quiet, ...fade });
      x += pagePx(FRAME_PX.icon);
    } else x -= pagePx(FRAME_PX.gap);
    if (shown) {
      const words = (part: string, text: string | undefined, colour: string, weight: 400 | 500 = 400) => {
        if (!text) return;
        x += pagePx(FRAME_PX.gap);
        texts.push({ key: `${it.key}:${part}`, x, y: mid, anchor: "start", baseline: "middle", text, sizePx: FRAME_PX.words, color: colour, weight, ...readFade });
        x += pagePx(textWidth(text, FRAME_PX.words, weight));
      };
      words("name", it.tab.name, FRAME_COLORS.words, 500);
      words("status", it.tab.status, FRAME_COLORS.quiet);
      if (it.tab.warn) {
        x += pagePx(FRAME_PX.gap);
        icons.push({ key: `${it.key}:warn-icon`, icon: "warning", x: x + pagePx(FRAME_PX.icon / 2), y: mid, sizePx: FRAME_PX.icon, color: FRAME_COLORS.warn, ...readFade });
        x += pagePx(FRAME_PX.icon + 4) - pagePx(FRAME_PX.gap);
        words("warn", it.tab.warn, FRAME_COLORS.warn);
      }
    }
    // (zoomed out: its name, from where its words start, in its band or - larger than it - raised over its frame's top, cut at its frame's width inside its inset)
    if (far && it.iconWhenSmall && far.words < 1) {
      const opacity = (it.opacity ?? 1) * (1 - far.words) * (far.labels?.get(it.key) ?? 1);
      if (opacity > 0) texts.push({ key: `${it.key}:nameFar`, x: left, y: farNameY(it.box, far.scale), anchor: "start", baseline: "middle", text: it.tab.name, sizePx: onPage(NAME_PX, far.scale), color: FRAME_COLORS.words, weight: 500, maxWidthPx: farWidest(it.box), opacity });
    }
    // (what takes the pointer: its tab - along the frame's whole top, or its own box - and, where it is sized, its edges)
    if (it.noHits) continue;
    regions.push({ key: it.key, part: "tab", rect: { x0, y0: top - BAND, x1: it.tabOnly ? tabRight : x1, y1: top }, z: 1, cursor: "default" });
    if (it.edges && !it.tabOnly) for (const side of SIDES) regions.push({ key: it.key, part: `edge:${side}`, band: { x0, y0, x1, y1, widthPx: FRAME_PX.edge, side }, z: 0, cursor: CURSOR[side] });
  }
  return { shapes, texts, icons, regions };
}
