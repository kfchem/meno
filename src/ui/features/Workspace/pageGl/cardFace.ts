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
const TONE: Record<CardTone, string> = { quiet: COLORS.quiet, base: COLORS.base, attention: COLORS.attention };

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
  /** Its full words, said in the tip as its state is pointed at: the state's, and the run's name. */
  stateTip?: string;
  selected: boolean;
  /** How far its words are shown (1 read, 0 too small: its icons alone and large), faded as the page's words are. */
  words: number;
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
  const tone = TONE[c.state.tone];
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
  // its icons alone and large, where its words are too small to read: in the middle of its least height
  if (c.words < 1) {
    const both = CARD.big + (c.state.icon ? CARD.bigGap + CARD.bigState : 0);
    const from = CARD.w / 2 - both / 2;
    icon("big", c.icon, from + CARD.big / 2, CARD.h / 2, CARD.big, COLORS.ink, 1 - c.words);
    if (c.state.icon) icon("bigState", c.state.icon, from + CARD.big + CARD.bigGap + CARD.bigState / 2, CARD.h / 2, CARD.bigState, tone, 1 - c.words, c.state.turning);
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
