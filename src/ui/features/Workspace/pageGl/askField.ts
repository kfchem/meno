/**
 * The field a conversation is asked in, at the foot of its card, as WebGL
 * draws it (docs/CONVERSATIONS.md, *The Conversation object*): several
 * lines - Enter asks, Shift+Enter starts another - growing to four, then
 * scrolled inside; its words, caret, selection and what an input method is
 * composing; and, while the model works, what it says and the Stop beside it.
 * What is typed is typed into a real field, unseen (pageGl/AskField), as a
 * set's name is (pageGl/PageField, pageGl/field): this is how it is laid
 * out - each line with the places of the words it holds - and how it looks.
 */
import { COLORS } from "../../../theme/colors";
import { CARD } from "./conversationCard";
import type { Region } from "./hits";
import type { Shape } from "./shapes";
import { lineOf, textWidth, type PageText } from "./texts";
import { pagePx } from "./units";

/** Its lengths, in page px: the room round its box in the card's foot, the room inside it, its words' size and line, the most lines it shows, how wide Stop is and the gap before it, its corners. */
export const ASK = { margin: 8, padX: 10, padY: 4, size: 13, line: 19, most: 4, gap: 8, radius: 8, stopSize: 11 } as const;

/** What it says, empty, and while the model works. */
export const ASK_SAID = { empty: "Ask about what lies inside the frame", working: "Working…", noModel: "Nothing is sent without a model plugin" } as const;

/** One line of what is typed: the place in the value it starts and ends at (UTF-16 units; its break's spaces included), and how wide its words are, in page px. */
export type AskLine = { from: number; to: number; width: number };

/** The places a line may end after: a word and the spaces after it, or after a hyphen inside a word - as the page's other words break (`wrapRuns`). */
const PIECES = /[^\s-]+-(?=[^\s\d-])|\S*\s+|\S+/g;

/**
 * `value` in lines no wider than `maxPx` page px: a new line at each newline of its own, and a line that is too long broken after the last
 * space it can, or - a word wider than a line - where it runs out. Each line says where in `value` it lies, so that a place in the
 * value is a place on a line: the lines run on from one another, none lost. An empty value is one empty line.
 */
export function askLines(value: string, maxPx: number, sizePx: number = ASK.size): AskLine[] {
  const lines: AskLine[] = [];
  let start = 0;
  for (const paragraph of value.split("\n")) {
    const end = start + paragraph.length;
    let from = start;
    let width = 0;
    let at = start;
    const flush = (to: number) => {
      lines.push({ from, to, width: textWidth(value.slice(from, to).replace(/\s+$/, ""), sizePx) });
      from = to;
      width = 0;
    };
    for (const m of paragraph.matchAll(PIECES)) {
      const piece = m[0];
      const bare = piece.replace(/\s+$/, "");
      const w = textWidth(bare, sizePx);
      if (width > 0 && width + w > maxPx + 1e-6) flush(at);
      if (w > maxPx + 1e-6) {
        // (a word wider than a line: broken letter by letter where it runs out)
        for (const ch of piece) {
          const cw = textWidth(ch, sizePx);
          if (width > 0 && ch.trim() && width + cw > maxPx + 1e-6) flush(at);
          width += cw;
          at += ch.length;
        }
      } else {
        width += textWidth(piece, sizePx);
        at += piece.length;
      }
    }
    lines.push({ from, to: end, width: textWidth(value.slice(from, end).replace(/\s+$/, ""), sizePx) });
    start = end + 1;
  }
  return lines;
}

/** The line of `lines` the place `i` of the value is on - at a break, the line that ends there is not it: the next starts there - and how far into it, in page px. */
export function caretOf(value: string, lines: readonly AskLine[], i: number, sizePx: number = ASK.size): { line: number; x: number } {
  const place = Math.min(Math.max(i, 0), value.length);
  let line = lines.findIndex((l, k) => place >= l.from && (place < l.to || (place === l.to && (k === lines.length - 1 || value[place] === "\n"))));
  if (line < 0) line = lines.length - 1;
  const l = lines[line];
  return { line, x: l ? textWidth(value.slice(l.from, Math.min(place, l.to)), sizePx) : 0 };
}

/** The place in the value on line `line`, `px` page px in, nearest it - never inside a pair that makes one letter, never past the line's end (nor, on a line broken at a space, after the space). */
export function indexOnLine(value: string, lines: readonly AskLine[], line: number, px: number, sizePx: number = ASK.size): number {
  const l = lines[Math.min(Math.max(line, 0), lines.length - 1)];
  if (!l) return 0;
  const stay = l.from + value.slice(l.from, l.to).replace(/\s+$/, "").length;
  let best = l.from;
  let bestOff = Math.abs(px);
  let i = l.from;
  for (const ch of value.slice(l.from, stay)) {
    i += ch.length;
    const off = Math.abs(textWidth(value.slice(l.from, i), sizePx) - px);
    if (off < bestOff) {
      best = i;
      bestOff = off;
    }
  }
  return best;
}

/** The line a point `py` page px below the top of the first line shown falls on (`first`, the first line shown): clamped to the lines there are. */
export function lineAtPx(lines: readonly AskLine[], first: number, py: number, lineHeight: number = ASK.line): number {
  return Math.min(Math.max(first + Math.floor(py / lineHeight), 0), lines.length - 1);
}

/** What is selected, from `start` to `end` of the value, as a box on each line it crosses: the line, and from where to where in it, page px - a newline in it a letter's width. */
export function selectionBoxes(value: string, lines: readonly AskLine[], start: number, end: number, sizePx: number = ASK.size): { line: number; x0: number; x1: number }[] {
  const [lo, hi] = start <= end ? [start, end] : [end, start];
  if (lo === hi) return [];
  const boxes: { line: number; x0: number; x1: number }[] = [];
  lines.forEach((l, line) => {
    const a = Math.max(lo, l.from);
    const b = Math.min(hi, l.to);
    // (a line the selection crosses to the next: its newline selected too - a letter's width past its words)
    const through = hi > l.to && lo <= l.to && value[l.to] === "\n";
    if (a >= b && !through) return;
    if (a > b) return;
    const x0 = textWidth(value.slice(l.from, a), sizePx);
    const x1 = textWidth(value.slice(l.from, b), sizePx) + (through ? sizePx * 0.4 : 0);
    if (x1 > x0) boxes.push({ line, x0, x1 });
  });
  return boxes;
}

/** The first line shown, of a field showing at most `ASK.most`: as far down as keeps the caret's line in view, from where it stood (`was`). */
export function firstLineShown(count: number, caretLine: number, was: number): number {
  const most = ASK.most;
  if (count <= most) return 0;
  const first = caretLine < was ? caretLine : caretLine >= was + most ? caretLine - most + 1 : was;
  return Math.min(Math.max(first, 0), count - most);
}

/** How tall the ask area is for `count` lines, page px: its box's room and lines (at most four shown), and what it keeps round it - never under the card's least. */
export function askHeight(count: number): number {
  const shown = Math.min(Math.max(count, 1), ASK.most);
  return Math.max(CARD.ask, 2 * ASK.margin + 2 * ASK.padY + shown * ASK.line);
}

/** How wide the words of the field may be, in page px, for a card `cardPx` wide: its room in the card and its box's, and Stop's room where it works. */
export function askWidth(cardPx: number, stopPx = 0): number {
  return Math.max(cardPx - 2 * ASK.margin - 2 * ASK.padX - (stopPx > 0 ? stopPx + ASK.gap : 0), 1);
}

/**
 * What a key does in the field: Enter asks, Shift+Enter starts a line, and an Enter an input method takes - choosing a candidate - is
 * the input method's, never an ask. A key with another modifier (Ctrl, Alt, Meta), and every other key, is the field's text's.
 */
export function askKey(e: { key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; isComposing?: boolean; keyCode?: number }): "ask" | "newline" | "none" {
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229 || e.ctrlKey || e.altKey || e.metaKey) return "none";
  return e.shiftKey ? "newline" : "ask";
}

/** What an ask field is told to be drawn as. */
export type AskOf = {
  key: string;
  /** The card's rectangle (the page's units, y up) and its width and the ask area's height, in page px. */
  rect: { x0: number; y0: number; x1: number; y1: number };
  widthPx: number;
  value: string;
  /** What is selected, from and to; the caret where both are one - and whether the field is typed in. */
  start: number;
  end: number;
  focused: boolean;
  composing?: readonly [number, number];
  /** The first line shown, where there are more than `ASK.most`. */
  first: number;
  /** How present the caret is: blinking, eased. */
  caret: number;
  /** The model works: the field says so, with Stop beside it. */
  running: boolean;
  /** No model plugin: the field says what it needs. */
  noModel?: boolean;
  /** How present its words are (the page's words read, 1; too small, 0), and how present it is as a whole. */
  words: number;
  opacity?: number;
  z?: number;
};

/** The ask field as drawn: its box and what lies in it, the places that take the pointer, and the lines it holds. */
export type AskDrawn = { shapes: Shape[]; texts: PageText[]; regions: Region[]; lines: AskLine[]; heightPx: number; textWidthPx: number };

/** How wide Stop is, in page px: its word and its room. */
export const stopWidth = (): number => textWidth("Stop", ASK.stopSize) + 20;

/**
 * The field in the foot of its card: a box with a hairline, its lines as far as four of them, the caret, what is selected washed in
 * Meno's colour, what an input method composes underlined; or, empty, what it is for, quiet; or, while the model works, that, and Stop
 * beside it. It takes the pointer over its box, and Stop over that.
 */
export function askParts(f: AskOf): AskDrawn {
  const P = pagePx;
  const z = f.z ?? 0;
  const o = (f.opacity ?? 1) * f.words;
  const stop = f.running ? stopWidth() : 0;
  const maxPx = askWidth(f.widthPx, stop);
  const lines = askLines(f.value, maxPx);
  const heightPx = askHeight(lines.length);
  const shown = Math.min(lines.length, ASK.most);
  const boxH = 2 * ASK.padY + shown * ASK.line;
  // (the box vertically in the ask area: its room above the same as below)
  const top = (heightPx - boxH) / 2;
  const left = ASK.margin;
  const wide = f.widthPx - 2 * ASK.margin - (stop > 0 ? stop + ASK.gap : 0);
  // (from the card's foot: the area is its bottom `heightPx`; y up, so its top is `y0 + P(heightPx)`)
  const areaTop = f.rect.y0 + P(heightPx);
  const at = (x: number, y: number) => ({ x: f.rect.x0 + P(x), y: areaTop - P(y) });
  const shapes: Shape[] = [];
  const texts: PageText[] = [];
  const regions: Region[] = [];
  if (o <= 0) return { shapes, texts, regions, lines, heightPx, textWidthPx: maxPx };
  const a = at(left, top);
  const box = { x0: a.x, x1: a.x + P(wide), y1: a.y, y0: a.y - P(boxH) };
  shapes.push({ kind: "box", key: `${f.key}:ask:box`, ...box, radiusPx: ASK.radius, fill: COLORS.background, line: { widthPx: 1, color: f.focused ? COLORS.base : COLORS.hairline }, opacity: o, z: z + 1 });
  regions.push({ key: f.key, part: "ask", rect: box, z: z + 2, cursor: f.running ? "default" : "text" });
  const first = Math.min(f.first, Math.max(lines.length - ASK.most, 0));
  const lineTop = (line: number) => top + ASK.padY + (line - first) * ASK.line;
  const textAt = (line: number, x: number) => at(left + ASK.padX + x, lineTop(line));
  if (f.running || (!f.value && !f.focused)) {
    // (what it says, quiet: that it works, what it is for, or what it needs)
    const said = f.running ? ASK_SAID.working : f.noModel ? ASK_SAID.noModel : ASK_SAID.empty;
    const p = textAt(0, 0);
    texts.push(...lineOf(`${f.key}:ask:said`, p.x, p.y - P(ASK.line / 2), "start", [{ text: said, color: COLORS.quiet }], ASK.size, { baseline: "middle", opacity: o, z: z + 3 }));
  }
  if (!f.running) {
    for (const b of selectionBoxes(f.value, lines, f.start, f.end)) {
      if (b.line < first || b.line >= first + ASK.most) continue;
      const p = textAt(b.line, b.x0);
      shapes.push({ kind: "box", key: `${f.key}:ask:selected:${b.line}`, x0: p.x, x1: p.x + P(b.x1 - b.x0), y1: p.y, y0: p.y - P(ASK.line), radiusPx: 0, fill: COLORS.base, fillAlpha: 0.2, opacity: o, z: z + 2 });
    }
    lines.forEach((l, line) => {
      if (line < first || line >= first + ASK.most) return;
      const words = f.value.slice(l.from, l.to).replace(/\s+$/, "");
      if (!words) return;
      const p = textAt(line, 0);
      texts.push(...lineOf(`${f.key}:ask:line:${line}`, p.x, p.y - P(ASK.line / 2), "start", [{ text: words, color: COLORS.ink }], ASK.size, { baseline: "middle", opacity: o, z: z + 3 }));
    });
    if (f.composing && f.composing[1] > f.composing[0]) {
      for (const b of selectionBoxes(f.value, lines, f.composing[0], f.composing[1])) {
        if (b.line < first || b.line >= first + ASK.most) continue;
        const p = textAt(b.line, b.x0);
        shapes.push({ kind: "box", key: `${f.key}:ask:composing:${b.line}`, x0: p.x, x1: p.x + P(b.x1 - b.x0), y1: p.y - P(ASK.line - 2), y0: p.y - P(ASK.line - 1), radiusPx: 0, fill: COLORS.ink, opacity: o, z: z + 3 });
      }
    }
    if (f.focused && f.start === f.end && f.caret > 0) {
      const c = caretOf(f.value, lines, f.end);
      if (c.line >= first && c.line < first + ASK.most) {
        const p = textAt(c.line, c.x);
        shapes.push({ kind: "box", key: `${f.key}:ask:caret`, x0: p.x - P(0.5), x1: p.x + P(0.5), y1: p.y - P(2), y0: p.y - P(ASK.line - 2), radiusPx: 0, fill: COLORS.ink, opacity: o * f.caret, z: z + 3 });
      }
    }
  }
  if (f.running) {
    // (Stop beside it: a chip as the changes' are, in the card's own tone)
    const x0 = a.x + P(wide + ASK.gap);
    const stopBox = { x0, x1: x0 + P(stop), y1: a.y - P((boxH - 22) / 2), y0: a.y - P((boxH - 22) / 2 + 22) };
    shapes.push({ kind: "box", key: `${f.key}:ask:stop`, ...stopBox, radiusPx: 11, fill: COLORS.background, line: { widthPx: 1, color: COLORS.hairline }, opacity: o, z: z + 1 });
    texts.push(...lineOf(`${f.key}:ask:stopText`, (stopBox.x0 + stopBox.x1) / 2, (stopBox.y0 + stopBox.y1) / 2, "middle", [{ text: "Stop", color: COLORS.quiet }], ASK.stopSize, { baseline: "middle", opacity: o, z: z + 3 }));
    regions.push({ key: f.key, part: "stop", rect: stopBox, z: z + 3, cursor: "pointer" });
  }
  return { shapes, texts, regions, lines, heightPx, textWidthPx: maxPx };
}
