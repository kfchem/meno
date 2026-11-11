/**
 * A conversation's card as WebGL draws it (docs/WORKSPACE.md, *Drawn by
 * WebGL*): its box against its frame's right edge, the part of what was said
 * that its scroll offset shows (`cardWindow`), its chips, and the places
 * that take the pointer - or, where its words are too small to read, how
 * many turns it holds and its state alone. Pure, as `cardFace` is: the page
 * lays out nothing here.
 */
import { COLORS } from "../../../theme/colors";
import type { Rect, Region } from "./hits";
import { CARD, cardRect, cardWindow, historyHeight, type CardLayout } from "./conversationCard";
import { SCROLL_CHIP, thumbOf, TRACK } from "./conversationScroll";
import type { PageIcon } from "./icons";
import type { Shape } from "./shapes";
import { lineOf, textWidth, type PageText } from "./texts";
import { PAGE_PX } from "../utils/pageScale";
import { pagePx } from "./units";

/** The room a line, a box or a chip fades over at the view's edge where there is more beyond it: one line of the card's, so that it goes as it is scrolled out, never cut in two. */
export const EDGE_FADE = CARD.line;

/** How present - 0 to 1 - what lies `y` to `y + h` in a view `view` tall is, where more lies beyond the edge `earlier` (above) and `later` (below): none touching one, all of it one `EDGE_FADE` in. */
export function edgeFade(y: number, h: number, view: number, earlier: boolean, later: boolean): number {
  const room = Math.min(earlier ? y : Infinity, later ? view - (y + h) : Infinity);
  return Math.min(1, Math.max(0, room / EDGE_FADE));
}

/** How wide a card is for a frame, in page px: `CARD.w`, or what the frame leaves where that is less; none where the frame leaves no room (`cardRect`). Its words are laid out at this width. */
export function cardWidth(frame: Rect): number | null {
  const rect = cardRect(frame);
  return rect ? (rect.x1 - rect.x0) / PAGE_PX : null;
}

/** How tall a card's history view is for a frame, in page px - the card's height less its ask field's: none where the frame leaves no room (`cardRect`). */
export function cardView(frame: Rect): number | null {
  const rect = cardRect(frame);
  return rect ? historyHeight((rect.y1 - rect.y0) / PAGE_PX) : null;
}

/** What a card is told to be drawn: its key, its frame, what was said as laid out and how far it is scrolled, how far its words are read, what it holds. */
export type CardOf = {
  key: string;
  frame: Rect;
  layout: CardLayout;
  /** Its scroll offset, in page px; clamped as it is drawn. */
  offset: number;
  /** How far its words are read: 1 read, 0 too small - its turns and state alone, faded as the page's words are. */
  words: number;
  turns: number;
  running: boolean;
  changed: boolean;
  /**
   * How present its scroll's parts are, each 0 to 1 and eased by the caller: its track's thumb, as it is pointed at (0 at rest, 1 pointed
   * at or dragged), its *Earlier* and *Latest* chips - and whether *Latest* carries a dot, for what is new below.
   */
  scroll?: { track: number; earlier: number; latest: number; dot?: boolean };
  opacity?: number;
  z?: number;
};

/** A card as drawn: its parts, where it lies, and how far it is scrolled as drawn (`cardWindow`): None of them where its frame leaves no room. */
export type ConversationCardDrawn = {
  shapes: Shape[];
  texts: PageText[];
  icons: PageIcon[];
  regions: Region[];
  rect: Rect | null;
  offset: number;
  max: number;
  /** How tall its history's view is, and how long its track, in page px: what a drag along the track is measured against. */
  view: number;
  trackPx: number;
};

const NOTHING: ConversationCardDrawn = { shapes: [], texts: [], icons: [], regions: [], rect: null, offset: 0, max: 0, view: 0, trackPx: 0 };

/** The arrows on its *Earlier* and *Latest* chips (pageGl/icons). */
export const SCROLL_ICONS = { earlier: "scroll-earlier", latest: "scroll-latest" } as const;

/** What a card says, too small to read its words: how many turns it holds, and whether it works or has changes waiting. */
export function turnsSaid(turns: number, running: boolean, changed: boolean): string {
  const held = turns === 0 ? "Nothing said" : turns === 1 ? "One turn" : `${turns} turns`;
  return running ? `${held} · working` : changed ? `${held} · changes waiting` : held;
}

/**
 * The card `c`: its box, lighter than a step's card and solid where its frame is dashed; what lies in its history's view at its offset - a
 * question's ground, lines of words, the chips for the changes waiting - each as present as `edgeFade` leaves it; its ask field's room at
 * its foot, set off by a hairline. It takes the pointer over its box, and its chips over that.
 */
export function cardParts(c: CardOf): ConversationCardDrawn {
  const rect = cardRect(c.frame);
  if (!rect) return NOTHING;
  const P = pagePx;
  const o = c.opacity ?? 1;
  const z = c.z ?? 0;
  const widthPx = (rect.x1 - rect.x0) / PAGE_PX;
  const heightPx = (rect.y1 - rect.y0) / PAGE_PX;
  const view = historyHeight(heightPx);
  const shapes: Shape[] = [{ kind: "box", key: `${c.key}:card`, ...rect, radiusPx: CARD.radius, fill: COLORS.background, line: { widthPx: 1, color: COLORS.hairline }, opacity: o, z }];
  const texts: PageText[] = [];
  const icons: PageIcon[] = [];
  const regions: Region[] = [{ key: c.key, part: "card", rect, z, cursor: "default" }];
  /** A length from its top left, y down, in the page's units from its top left. */
  const at = (x: number, y: number) => ({ x: rect.x0 + P(x), y: rect.y1 - P(y) });
  if (c.words < 1) {
    // (too small to read: how many turns it holds, and its state, large enough to read at that zoom - as a step's card shows its icons)
    const mid = at(widthPx / 2, view / 2);
    texts.push(...lineOf(`${c.key}:turns`, mid.x, mid.y, "middle", [{ text: turnsSaid(c.turns, c.running, c.changed), color: COLORS.quiet }], 24, { baseline: "middle", opacity: o * (1 - c.words), z: z + 1 }));
  }
  const w = cardWindow(c.layout, c.offset, view);
  // (where the scroll's chips lie, in page px from the card's top left, and how present they are: the words under one fade as it comes)
  const chipBox = (text: string, top: number) => {
    const wide = SCROLL_CHIP.padX + SCROLL_CHIP.icon + SCROLL_CHIP.gap + textWidth(text, SCROLL_CHIP.size) + SCROLL_CHIP.padX;
    return { left: (widthPx - wide) / 2, wide, top };
  };
  const chips = [
    { which: "earlier" as const, text: "Earlier", level: c.scroll?.earlier ?? 0, ...chipBox("Earlier", SCROLL_CHIP.from) },
    { which: "latest" as const, text: "Latest", level: c.scroll?.latest ?? 0, ...chipBox("Latest", view - SCROLL_CHIP.from - SCROLL_CHIP.h) },
  ];
  /** How much of a line - from `x` `width` wide, `y` from the top - a chip over it leaves: less as the chip is more there. */
  const underChip = (x: number, width: number, y: number, h: number) =>
    chips.reduce((left, k) => (x < k.left + k.wide && x + width > k.left && y < k.top + SCROLL_CHIP.h && y + h > k.top ? left * (1 - k.level) : left), 1);
  if (c.words > 0) {
    const fade = (y: number, h: number) => o * c.words * edgeFade(y, h, view, w.earlier, w.later);
    for (const [i, b] of w.boxes.entries()) {
      const f = fade(b.y, b.h);
      if (f > 0) shapes.push({ kind: "box", key: `${c.key}:ground:${i}`, x0: rect.x0 + P(b.x), y0: rect.y1 - P(b.y + b.h), x1: rect.x0 + P(b.x + b.w), y1: rect.y1 - P(b.y), radiusPx: b.radius, fill: b.fill, opacity: f, z: z + 1 });
    }
    for (const [i, l] of w.lines.entries()) {
      const high = l.size === CARD.size ? CARD.line : CARD.quietLine;
      const f = fade(l.y, high) * underChip(l.x, l.width, l.y, high);
      const p = at(l.x, l.baseline);
      if (f > 0) texts.push(...lineOf(`${c.key}:line:${i}`, p.x, p.y, "start", l.runs, l.size, { opacity: f, z: z + 2 }));
    }
    for (const [i, chip] of w.chips.entries()) {
      const f = fade(chip.y, chip.h);
      if (f <= 0) continue;
      const x0 = rect.x0 + P(chip.x);
      const x1 = x0 + P(chip.w);
      const y1 = rect.y1 - P(chip.y);
      const y0 = y1 - P(chip.h);
      const keep = chip.key === "keep";
      shapes.push({ kind: "box", key: `${c.key}:chip:${chip.key}`, x0, y0, x1, y1, radiusPx: chip.radius, fill: COLORS.background, line: { widthPx: 1, color: keep ? COLORS.base : COLORS.hairline }, opacity: f, z: z + 1 });
      texts.push(...lineOf(`${c.key}:chipText:${i}`, (x0 + x1) / 2, (y0 + y1) / 2, "middle", [{ text: chip.text, color: keep ? COLORS.base : COLORS.quiet }], CARD.chip.size, { baseline: "middle", opacity: f, z: z + 2 }));
      if (f >= 0.5) regions.push({ key: c.key, part: chip.key, rect: { x0, y0, x1, y1 }, z: z + 1, cursor: "pointer" });
    }
  }
  // (its track along its right edge, its thumb as thin as a hairline at rest and wider pointed at; and Earlier and Latest where there is more that way)
  const trackPx = Math.max(view - 2 * TRACK.ends, 0);
  const thumb = c.words > 0 ? thumbOf(trackPx, c.layout.height, view, w.offset) : null;
  const level = c.scroll?.track ?? 0;
  if (thumb) {
    const edge = widthPx - TRACK.edge;
    const wide = TRACK.rest + (TRACK.pointed - TRACK.rest) * level;
    const top = TRACK.ends + thumb.top;
    const strip = { x0: rect.x0 + P(edge - TRACK.grab / 2 - wide / 2), x1: rect.x0 + P(edge + TRACK.grab / 2 - wide / 2) };
    shapes.push({ kind: "box", key: `${c.key}:track`, x0: rect.x0 + P(edge - wide), x1: rect.x0 + P(edge), y0: rect.y1 - P(TRACK.ends + trackPx), y1: rect.y1 - P(TRACK.ends), radiusPx: wide / 2, fill: COLORS.hairline, opacity: o * c.words * level * 0.6, z: z + 1 });
    shapes.push({ kind: "box", key: `${c.key}:thumb`, x0: rect.x0 + P(edge - wide), x1: rect.x0 + P(edge), y0: rect.y1 - P(top + thumb.len), y1: rect.y1 - P(top), radiusPx: wide / 2, fill: COLORS.quiet, opacity: o * c.words * (0.45 + 0.4 * level), z: z + 2 });
    // (the strip a hand takes - wider than the thumb - the thumb over it)
    regions.push({ key: c.key, part: "track", rect: { ...strip, y0: rect.y1 - P(TRACK.ends + trackPx), y1: rect.y1 - P(TRACK.ends) }, z: z + 1, cursor: "default" });
    regions.push({ key: c.key, part: "thumb", rect: { ...strip, y0: rect.y1 - P(top + thumb.len), y1: rect.y1 - P(top) }, z: z + 2, cursor: "grab" });
  }
  if (c.words > 0 && c.scroll) {
    const chip = (k: (typeof chips)[number], dot?: boolean) => {
      const { which, text, level, top, wide, left } = k;
      if (level <= 0) return;
      const f = o * c.words * level;
      const box = { x0: rect.x0 + P(left), x1: rect.x0 + P(left + wide), y1: rect.y1 - P(top), y0: rect.y1 - P(top + SCROLL_CHIP.h) };
      shapes.push({ kind: "box", key: `${c.key}:${which}`, ...box, radiusPx: SCROLL_CHIP.radius, fill: COLORS.background, line: { widthPx: 1, color: COLORS.hairline }, shadow: CARD.chipShadow, opacity: f, z: z + 3 });
      const mid = rect.y1 - P(top + SCROLL_CHIP.h / 2);
      icons.push({ key: `${c.key}:${which}:icon`, icon: SCROLL_ICONS[which], x: rect.x0 + P(left + SCROLL_CHIP.padX + SCROLL_CHIP.icon / 2), y: mid, sizePx: SCROLL_CHIP.icon, color: COLORS.quiet, opacity: f, z: z + 4 });
      texts.push(...lineOf(`${c.key}:${which}:text`, rect.x0 + P(left + SCROLL_CHIP.padX + SCROLL_CHIP.icon + SCROLL_CHIP.gap), mid, "start", [{ text, color: COLORS.quiet }], SCROLL_CHIP.size, { baseline: "middle", opacity: f, z: z + 4 }));
      if (dot) shapes.push({ kind: "box", key: `${c.key}:${which}:dot`, x0: box.x1 - P(SCROLL_CHIP.dot + 1), x1: box.x1 - P(1), y1: box.y1 - P(1), y0: box.y1 - P(SCROLL_CHIP.dot + 1), radiusPx: SCROLL_CHIP.dot / 2, fill: COLORS.base, opacity: f, z: z + 4 });
      if (level >= 0.5) regions.push({ key: c.key, part: which, rect: box, z: z + 3, cursor: "pointer" });
    };
    chip(chips[0]);
    chip(chips[1], c.scroll.dot);
  }
  // (its ask field's room at its foot: set off from the history by a hairline - the field itself is drawn over it)
  shapes.push({ kind: "box", key: `${c.key}:ask`, x0: rect.x0, x1: rect.x1, y0: rect.y0 + P(CARD.ask), y1: rect.y0 + P(CARD.ask) + P(1), radiusPx: 0, fill: COLORS.hairline, opacity: o * c.words, z: z + 1 });
  return { shapes, texts, icons, regions, rect, offset: w.offset, max: w.max, view, trackPx };
}
