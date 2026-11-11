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
import type { Shape } from "./shapes";
import { lineOf, type PageText } from "./texts";
import { PAGE_PX } from "../utils/pageScale";
import { pagePx } from "./units";

/** The room a line, a box or a chip fades over at the view's edge where there is more beyond it: one line of the card's, so that it goes as it is scrolled out, never cut in two. */
export const EDGE_FADE = CARD.line;

/** How present - 0 to 1 - what lies `y` to `y + h` in a view `view` tall is, where more lies beyond the edge `earlier` (above) and `later` (below): none touching one, all of it one `EDGE_FADE` in. */
export function edgeFade(y: number, h: number, view: number, earlier: boolean, later: boolean): number {
  const room = Math.min(earlier ? y : Infinity, later ? view - (y + h) : Infinity);
  return Math.min(1, Math.max(0, room / EDGE_FADE));
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
  opacity?: number;
  z?: number;
};

/** A card as drawn: its parts, where it lies, and how far it is scrolled as drawn (`cardWindow`): None of them where its frame leaves no room. */
export type ConversationCardDrawn = { shapes: Shape[]; texts: PageText[]; regions: Region[]; rect: Rect | null; offset: number; max: number };

const NOTHING: ConversationCardDrawn = { shapes: [], texts: [], regions: [], rect: null, offset: 0, max: 0 };

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
  const regions: Region[] = [{ key: c.key, part: "card", rect, z, cursor: "default" }];
  /** A length from its top left, y down, in the page's units from its top left. */
  const at = (x: number, y: number) => ({ x: rect.x0 + P(x), y: rect.y1 - P(y) });
  if (c.words < 1) {
    // (too small to read: how many turns it holds, and its state, large enough to read at that zoom - as a step's card shows its icons)
    const mid = at(widthPx / 2, view / 2);
    texts.push(...lineOf(`${c.key}:turns`, mid.x, mid.y, "middle", [{ text: turnsSaid(c.turns, c.running, c.changed), color: COLORS.quiet }], 24, { baseline: "middle", opacity: o * (1 - c.words), z: z + 1 }));
  }
  const w = cardWindow(c.layout, c.offset, view);
  if (c.words > 0) {
    const fade = (y: number, h: number) => o * c.words * edgeFade(y, h, view, w.earlier, w.later);
    for (const [i, b] of w.boxes.entries()) {
      const f = fade(b.y, b.h);
      if (f > 0) shapes.push({ kind: "box", key: `${c.key}:ground:${i}`, x0: rect.x0 + P(b.x), y0: rect.y1 - P(b.y + b.h), x1: rect.x0 + P(b.x + b.w), y1: rect.y1 - P(b.y), radiusPx: b.radius, fill: b.fill, opacity: f, z: z + 1 });
    }
    for (const [i, l] of w.lines.entries()) {
      const f = fade(l.y, l.size === CARD.size ? CARD.line : CARD.quietLine);
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
  // (its ask field's room at its foot: set off from the history by a hairline - the field itself is drawn over it)
  shapes.push({ kind: "box", key: `${c.key}:ask`, x0: rect.x0, x1: rect.x1, y0: rect.y0 + P(CARD.ask), y1: rect.y0 + P(CARD.ask) + P(1), radiusPx: 0, fill: COLORS.hairline, opacity: o * c.words, z: z + 1 });
  return { shapes, texts, regions, rect, offset: w.offset, max: w.max };
}
