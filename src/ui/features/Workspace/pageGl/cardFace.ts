/**
 * A step's card, shut, as WebGL draws it (docs/WORKSPACE.md, *Drawn by
 * WebGL*): who does it with the icon of what it does, what it does and how,
 * its state in words and an icon - a log's last line under them, a thin bar
 * of how far its jobs are - and, where its words are too small to read, its
 * icons alone and large; its inputs' names beside it, where it takes more
 * than one. Laid out in page pixels as its HTML laid itself out
 * (workflow/StepCard), so that the one opened over it - HTML still - takes
 * its place unseen.
 */
import { COLORS } from "../../../theme/colors";
import { ICON_PX, MARK_PX, NAME_PX, onPage, type NameBox } from "./cardBands";
import { CARD_H, CARD_W, PORT_STEP, portDown, PX } from "../workflow/look";
import type { Region } from "./hits";
import type { PageIcon } from "./icons";
import type { PageTipAt } from "./PagePlaced";
import type { Shape } from "./shapes";
import { baselineIn, fitted, textWidth, wrapText, type PageText } from "./texts";
import { pagePx } from "./units";

/** Its lengths, in page px, as its HTML has them: its width and least height; its room inside (px-3 pt-2 pb-2.5), its icon column and the gap after it; its lines; the bar; the big icons, shut small. */
export const CARD = {
  w: CARD_W / PX,
  h: CARD_H / PX,
  hair: 1,
  side: 12,
  top: 8,
  bottom: 10,
  icon: 16,
  gap: 8,
  whoLine: 20,
  line: 16,
  stateTop: 6,
  stateIcon: 14,
  bar: 3,
  barTop: 6,
  radius: 12,
  big: 28,
  bigState: 24,
  bigGap: 12,
  shadow: { blurPx: 2, offsetYPx: 1, alpha: 0.05 },
} as const;

/** A state's tone: quiet (grey), Meno's colour (done, running), or attention (failed, refused). */
export type CardTone = "quiet" | "base" | "attention";
export const TONE: Record<CardTone, string> = { quiet: COLORS.quiet, base: COLORS.base, attention: COLORS.attention };

/** How wide a card's name runs at most: its box's width and half as much again, in page px. */
export const NAME_WIDEST = CARD.w * 1.5;
/** The gap between a card's icon and its name where it is named, in screen px. */
const NAME_GAP = 5;
/** How far a tinted box is tinted, a share of its state's colour. */
const TINT_ALPHA = 0.12;
/** How far a box with no state to tint it by is tinted: a share of the quiet ink. */
const TINT_QUIET = 0.06;

/** Whether a card's name is as wide as its box and half as much again, or less, at a page scale: where it is only marked, a name cut short is left out. */
export const nameFits = (who: string, scale: number): boolean => textWidth(who, onPage(NAME_PX, scale)) <= NAME_WIDEST;

/** Where its name starts, from its left, in page px, where it is named: after its icon. */
const nameLeft = (scale: number): number => CARD.hair + CARD.side + onPage(ICON_PX, scale) + onPage(NAME_GAP, scale);

/** How large its state's mark is on the page, zoomed out, in page px: `MARK_PX` on the screen, never more than two fifths of its least height. */
const markSize = (scale: number): number => Math.min(onPage(MARK_PX, scale), 0.4 * CARD.h);
/** How far its mark is in from its box's corner, in page px: five on the screen, never more than a seventh of its least height. */
const markInset = (scale: number): number => Math.min(onPage(5, scale), CARD.h / 7);

/** What the mark at a card's corner is, zoomed out: what it is of its state (running turns, done is filled in the quiet ink, failed in the alert tone with its count, waiting hollow), its colour, whether it tints a box that is only marked, and the count it says. */
export type Mark = { kind: "running" | "done" | "failed" | "waiting"; colour: string; tint: boolean; count?: number };
export function markOf(state: Pick<CardFaceOf["state"], "icon" | "turning">, failed?: number): Mark | null {
  // (entries failed, counted: said, whatever else it is)
  if (failed != null && failed > 0) return { kind: "failed", colour: COLORS.attention, tint: true, count: failed };
  switch (state.icon) {
    case "running":
      // (one that is only changed, run again, is waiting to be run, not running)
      return state.turning ? { kind: "running", colour: COLORS.base, tint: true } : { kind: "waiting", colour: COLORS.quiet, tint: false };
    case "done":
      return { kind: "done", colour: COLORS.quiet, tint: true };
    case "failed":
      return { kind: "failed", colour: COLORS.attention, tint: true };
    case "waiting":
    case "stopped":
      return { kind: "waiting", colour: COLORS.quiet, tint: false };
    default:
      return null;
  }
}

/** Where a card's name lies on the page, in the world's units, as `cardFace` draws it at a page scale: for the names that overlap to be found (`cardBands namesKept`). Where it is only marked its name is in the middle of its box. */
export function nameBoxOf(c: Pick<CardFaceOf, "key" | "x" | "y" | "who">, scale: number, named: boolean): NameBox {
  const P = pagePx;
  const size = onPage(NAME_PX, scale);
  const wide = Math.min(textWidth(c.who, size), NAME_WIDEST);
  const x0 = named ? nameLeft(scale) : (CARD.w - wide) / 2;
  const mid = c.y - P(CARD.h / 2);
  return { key: c.key, x0: c.x + P(x0), x1: c.x + P(x0 + wide), y0: mid - P(size) / 2, y1: mid + P(size) / 2 };
}

/** What a card says, shut, and how it stands (Workflow2D, from what StepCard is told). */
export type CardFaceOf = {
  key: string;
  /** Its top left on the page (the step's `x`, `y`). */
  x: number;
  y: number;
  /** The icon of what it does (workflow/icons `StepIcon`). */
  icon: string;
  who: string;
  /** What it does and how. */
  summary: string;
  /** Its state: its icon (pageGl/icons: running, done, waiting, failed, stopped) - turning while it runs - its words and their tone. */
  state: { icon?: string; turning?: boolean; text: string; tone: CardTone };
  /** What its log says last, while it runs. */
  said?: string;
  /** How far its jobs are, as a share, while it runs. */
  progress?: number;
  /** Its state's colour as it eases from one tone to the next (Workflow2D): its tone's, where none is given. */
  toneColour?: string;
  /** Its full words, said in the tip as its state is pointed at: the state's, and the run's name. */
  stateTip?: string;
  selected: boolean;
  /** How far its words are shown (1 read, 0 zoomed out: its name and state's mark instead, `named`), faded as the page's words are. */
  words: number;
  /** The page's scale, screen px to a page px (utils/pageScale): its name and its mark are as large on the screen whatever it is. 1 where none is said. */
  scale?: number;
  /** Zoomed out: how far it is named (1: its box, its icon and its name) rather than only marked (0: its box tinted by its state, its name where it lies clear), eased. 1 where none is said. */
  named?: number;
  /** Zoomed out: how far its name is shown (1) or left out (0), where it lies over a name before it (`cardBands namesKept`), eased. 1 where none is said. */
  label?: number;
  /** How many of its entries failed, where it counts them: its mark says so. */
  failed?: number;
  /** Its inputs' names, beside their ports on its left, where it takes more than one. */
  inputs: readonly string[];
  opacity?: number;
  z?: number;
};

/** `text` in at most `most` lines `maxPx` wide, the last cut with an ellipsis where more would follow (CSS's line-clamp). */
export function clamped(text: string, sizePx: number, maxPx: number, most: number): string[] {
  const lines = wrapText(text, sizePx, maxPx).map((l) => l.text);
  if (lines.length <= most) return lines.length ? lines : [""];
  const kept = lines.slice(0, most);
  kept[most - 1] = fitted(`${kept[most - 1]} ${lines.slice(most).join(" ")}`, sizePx, 400, maxPx);
  return kept;
}

/** How a card's words lie: each block's lines and the card's height, in page px (`cardFace`). */
export function cardLines(c: Pick<CardFaceOf, "summary" | "state" | "said" | "progress">): { summary: string[]; state: string[]; height: number; words: number } {
  const col = CARD.w - 2 * CARD.hair - 2 * CARD.side - CARD.icon - CARD.gap;
  const summary = clamped(c.summary, 11, col, 2);
  const state = clamped(c.state.text, 11, col, 2);
  const words = CARD.top + CARD.whoLine + summary.length * CARD.line + CARD.stateTop + state.length * CARD.line + (c.said ? CARD.line : 0) + (c.progress != null ? CARD.barTop + CARD.bar : 0) + CARD.bottom;
  // (its words in a grid at least as tall as a card, inside its hair of padding: as its HTML, StepCard)
  return { summary, state, height: Math.max(CARD.h, words) + 2 * CARD.hair, words };
}

/** A card as drawn: its box, words, icons and the places that take the pointer, and how tall it is; the tip, where its state is pointed at. */
export type CardDrawn = { shapes: Shape[]; texts: PageText[]; icons: PageIcon[]; regions: Region[]; heightPx: number; tip: PageTipAt | null };

/**
 * The card `c`, shut: its box from its top left; its words in two columns -
 * the icons, and who does it, what and how, its state, the log's line and
 * the bar beside them - or, its words too small to read, its icon of what
 * it does and its state's large in its middle, the one fading out as the
 * other fades in; its inputs' names left of it. It takes the pointer over
 * its box, and over its state's words for their tip (`statePointed`).
 */
export function cardFace(c: CardFaceOf, statePointed = false): CardDrawn {
  const P = pagePx;
  const o = c.opacity ?? 1;
  const z = c.z ?? 0;
  const laid = cardLines(c);
  const h = laid.height;
  const box = { x0: c.x, y0: c.y - P(h), x1: c.x + P(CARD.w), y1: c.y };
  const shapes: Shape[] = [
    { kind: "box", key: c.key, ...box, radiusPx: CARD.radius, fill: COLORS.background, line: { widthPx: CARD.hair, color: c.selected ? COLORS.base : COLORS.hairline }, shadow: CARD.shadow, opacity: o, z },
  ];
  const texts: PageText[] = [];
  const icons: PageIcon[] = [];
  const left = CARD.hair + CARD.side;
  const textLeft = left + CARD.icon + CARD.gap;
  const col = CARD.w - textLeft - CARD.side - CARD.hair;
  /** Words at `x` page px from its left, their line's top `top` page px below its top. */
  const text = (key: string, x: number, top: number, line: number, t: string, size: number, color: string, more?: Partial<PageText>) => {
    if (t) texts.push({ key: `${c.key}:${key}`, x: c.x + P(x), y: c.y - P(top + baselineIn(line, size)), anchor: "start", text: t, sizePx: size, color, opacity: o * c.words, z: z + 1, ...more });
  };
  const icon = (key: string, name: string, x: number, midTop: number, size: number, color: string, opacity: number, spin?: boolean) =>
    icons.push({ key: `${c.key}:${key}`, icon: name, x: c.x + P(x), y: c.y - P(midTop), sizePx: size, color, opacity: o * opacity, z: z + 1, ...(spin ? { spin: 0.5 } : {}) });
  let y = CARD.hair + CARD.top;
  // who does it, with the icon of what it does
  if (c.words > 0) icon("kind", c.icon, left + CARD.icon / 2, y + CARD.whoLine / 2, CARD.icon, COLORS.quiet, c.words);
  text("who", textLeft, y, CARD.whoLine, c.who, 13, COLORS.ink, { weight: 500, maxWidthPx: col });
  y += CARD.whoLine;
  // what it does and how
  laid.summary.forEach((l, i) => text(`summary:${i}`, textLeft, y + i * CARD.line, CARD.line, l, 11, COLORS.quiet));
  y += laid.summary.length * CARD.line + CARD.stateTop;
  // its state
  const tone = c.toneColour ?? TONE[c.state.tone];
  if (c.state.icon && c.words > 0) icon("state", c.state.icon, left + CARD.icon / 2 - 1, y + CARD.line / 2, CARD.stateIcon, tone, c.words, c.state.turning);
  const stateTop = y;
  laid.state.forEach((l, i) => text(`state:${i}`, textLeft, y + i * CARD.line, CARD.line, l, 11, tone));
  y += laid.state.length * CARD.line;
  // what its log says last, and how far its jobs are
  if (c.said) {
    text("said", textLeft, y, CARD.line, c.said, 10, COLORS.quiet, { mono: true, maxWidthPx: col });
    y += CARD.line;
  }
  if (c.progress != null) {
    const top = c.y - P(y + CARD.barTop);
    const bar = { x0: c.x + P(textLeft), y0: top - P(CARD.bar), y1: top };
    shapes.push({ kind: "box", key: `${c.key}:bar`, ...bar, x1: bar.x0 + P(col), radiusPx: CARD.bar / 2, fill: COLORS.hairline, opacity: o * c.words, z: z + 1 });
    if (c.progress > 0) shapes.push({ kind: "box", key: `${c.key}:done`, ...bar, x1: bar.x0 + P(col * Math.min(1, c.progress)), radiusPx: CARD.bar / 2, fill: COLORS.base, opacity: o * c.words, z: z + 2 });
  }
  // zoomed out, where its words are too small to read: its box tinted by its state, its state's mark, and its name - and, where it is named, its kind's icon
  // beside it - each as large on the screen as it is at any zoom, fading in as its words fade out
  const far = 1 - c.words;
  if (far > 0) {
    const scale = c.scale ?? 1;
    const named = c.named ?? 1;
    const label = c.label ?? 1;
    const mark = markOf(c.state, c.failed);
    // (marked: its box tinted by its state)
    // (a state with none to tint by - waiting, ready - lightly, in the quiet ink, so that a box is not lost)
    if (named < 1) shapes.push({ kind: "box", key: `${c.key}:tint`, ...box, radiusPx: CARD.radius, fill: mark?.tint ? mark.colour : COLORS.quiet, fillAlpha: mark?.tint ? TINT_ALPHA : TINT_QUIET, opacity: o * far * (1 - named), z: z + 0.5 });
    if (named > 0) icon("big", c.icon, nameLeft(scale) - onPage(ICON_PX, scale) / 2 - onPage(NAME_GAP, scale), CARD.h / 2, onPage(ICON_PX, scale), COLORS.ink, far * named);
    // (its name: after its icon where it is named, in the middle of its box where it is only marked; cut at its box's width and half as much again)
    const size = onPage(NAME_PX, scale);
    const nameText = (key: string, x: number, anchor: PageText["anchor"], opacity: number) => {
      if (opacity > 0) texts.push({ key: `${c.key}:${key}`, x: c.x + P(x), y: c.y - P(CARD.h / 2), anchor, baseline: "middle", text: c.who, sizePx: size, color: COLORS.ink, weight: 500, maxWidthPx: NAME_WIDEST, opacity: o * opacity, z: z + 1 });
    };
    nameText("nameNamed", nameLeft(scale), "start", far * named * label);
    nameText("nameMarked", CARD.w / 2, "middle", far * (1 - named) * label);
    if (mark) {
      const d = markSize(scale);
      const inset = markInset(scale);
      const cx = c.x + P(CARD.w - inset - d / 2);
      const cy = c.y - P(inset + d / 2);
      const key = `${c.key}:mark`;
      if (mark.kind === "running") icons.push({ key, icon: "running", x: cx, y: cy, sizePx: d, color: mark.colour, opacity: o * far, z: z + 1, spin: 0.5 });
      else if (mark.kind === "waiting") shapes.push({ kind: "ring", key, x: cx, y: cy, diameterPx: d, line: { widthPx: onPage(1.5, scale), color: mark.colour }, opacity: o * far, z: z + 1 });
      else shapes.push({ kind: "ring", key, x: cx, y: cy, diameterPx: d, fill: mark.colour, opacity: o * far, z: z + 1 });
      // (failed, the count of its entries in it)
      if (mark.count != null) texts.push({ key: `${key}:count`, x: cx, y: cy, anchor: "middle", baseline: "middle", text: String(mark.count), sizePx: d * 0.7, color: COLORS.background, weight: 500, opacity: o * far, z: z + 2 });
    }
  }
  // its inputs' names, outside it: right of them 8 px off its left edge, half a port's step above each port
  if (c.inputs.length > 1)
    c.inputs.forEach((name, k) =>
      texts.push({ key: `${c.key}:input:${k}`, x: c.x - P(8), y: c.y - (portDown(k) - PORT_STEP / 2), anchor: "end", baseline: "middle", text: name, sizePx: 10, color: COLORS.quiet, opacity: o * c.words, z: z + 1 }),
    );
  const stateRect = { x0: c.x + P(textLeft), x1: c.x + P(textLeft + col), y0: c.y - P(stateTop + laid.state.length * CARD.line), y1: c.y - P(stateTop) };
  const regions: Region[] = [{ key: c.key, part: "card", rect: box, z }];
  if (c.stateTip && c.words >= 1) regions.push({ key: c.key, part: "state", rect: stateRect, z: z + 1 });
  const tip = statePointed && c.stateTip && c.words >= 1 ? { key: `${c.key}:state`, text: c.stateTip, x: (stateRect.x0 + stateRect.x1) / 2, y: (stateRect.y0 + stateRect.y1) / 2, w: stateRect.x1 - stateRect.x0, h: stateRect.y1 - stateRect.y0 } : null;
  return { shapes, texts, icons, regions, heightPx: h, tip };
}

/** How wide `text` is in a card's state line (`cardFace`): whether it is cut, and so wants its tip. */
export const stateCut = (text: string) => textWidth(text, 11) > 2 * (CARD.w - 2 * CARD.hair - 2 * CARD.side - CARD.icon - CARD.gap);
