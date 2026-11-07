/**
 * A short field typed into on the page - a set's name, named anew - as
 * WebGL draws it (docs/WORKSPACE.md, *Drawn by WebGL*): its words where the
 * words it names stand, in their own size and weight, so that nothing is
 * swapped as it is named; a white box round them with a hairline, as its
 * HTML had; the caret, a pixel wide; what is selected washed in Meno's
 * colour behind them; what an input method is composing underlined, as
 * WebKit underlines it. What is typed is typed into a real field, unseen
 * (pageGl/PageField): this is only how it looks.
 */
import { COLORS } from "../../../theme/colors";
import type { Region } from "./hits";
import type { Shape } from "./shapes";
import { textWidth, type PageText, type Weight } from "./texts";
import { pagePx } from "./units";

/** Its lengths, in page px: the box's room round its words (px-0.5, h-4), its least width (6ch, about), its corners; the caret's height. */
export const FIELD = { side: 2, line: 16, least: 36, radius: 4, caret: 14 } as const;

/** A field as it stands: where its words start, its middle (`x`, `y`, the page's units), what it holds, what is selected - the caret where both ends are one - and what is being composed. */
export type FieldOf = {
  key: string;
  x: number;
  y: number;
  value: string;
  /** What is selected, from and to, in UTF-16 units as the field has them; the caret where both are one. */
  start: number;
  end: number;
  /** What an input method is composing, from and to, where it is. */
  composing?: readonly [number, number];
  sizePx: number;
  weight?: Weight;
  /** How present the caret is: blinking, eased (PageField). */
  caret: number;
  z?: number;
};

/** How far into `value` its `i`th unit is, in page px, in its size and weight. */
export function caretPx(value: string, i: number, sizePx: number, weight: Weight = 400): number {
  return i <= 0 ? 0 : textWidth(value.slice(0, Math.min(i, value.length)), sizePx, weight);
}

/** The place between two letters of `value` nearest `px` page px into it - never inside a pair that makes one letter. */
export function indexAt(value: string, px: number, sizePx: number, weight: Weight = 400): number {
  let best = 0;
  let bestOff = Math.abs(px);
  let i = 0;
  for (const ch of value) {
    i += ch.length;
    const off = Math.abs(caretPx(value, i, sizePx, weight) - px);
    if (off < bestOff) {
      best = i;
      bestOff = off;
    }
  }
  return best;
}

/** The word round the `i`th place of `value` - letters and digits, or a run of anything else but spaces - as a double press selects it. */
export function wordAt(value: string, i: number): [number, number] {
  const kind = (ch: string | undefined) => (ch == null ? -1 : /\s/.test(ch) ? 0 : /[\p{L}\p{N}_]/u.test(ch) ? 1 : 2);
  const k = kind(value[i]) > 0 ? kind(value[i]) : kind(value[i - 1]);
  if (k <= 0) return [i, i];
  let a = i;
  let b = i;
  while (a > 0 && kind(value[a - 1]) === k) a--;
  while (b < value.length && kind(value[b]) === k) b++;
  return [a, b];
}

/** How wide its box is, in page px: its words and a letter's room after them, at least six letters'. */
export function fieldWidthPx(value: string, sizePx: number, weight: Weight = 400): number {
  return Math.max(FIELD.least, textWidth(value, sizePx, weight) + sizePx * 0.6) + 2 * FIELD.side;
}

/** A field drawn: its box, its selection or caret, its composing line - and its words - and the place that takes the pointer. */
export function fieldParts(f: FieldOf): { shapes: Shape[]; texts: PageText[]; region: Region } {
  const P = pagePx;
  const z = f.z ?? 0;
  const weight = f.weight ?? 400;
  const at = (i: number) => f.x + P(caretPx(f.value, i, f.sizePx, weight));
  const half = P(FIELD.line / 2);
  const box = { x0: f.x - P(FIELD.side), x1: f.x - P(FIELD.side) + P(fieldWidthPx(f.value, f.sizePx, weight)), y0: f.y - half, y1: f.y + half };
  const shapes: Shape[] = [{ kind: "box", key: `${f.key}:box`, ...box, radiusPx: FIELD.radius, fill: COLORS.background, line: { widthPx: 1, color: COLORS.hairline }, z }];
  const [lo, hi] = f.start <= f.end ? [f.start, f.end] : [f.end, f.start];
  const c = P(FIELD.caret / 2);
  if (lo !== hi) shapes.push({ kind: "box", key: `${f.key}:selected`, x0: at(lo), x1: at(hi), y0: f.y - c, y1: f.y + c, radiusPx: 0, fill: COLORS.base, fillAlpha: 0.2, z: z + 1 });
  else if (f.caret > 0) shapes.push({ kind: "box", key: `${f.key}:caret`, x0: at(lo) - P(0.5), x1: at(lo) + P(0.5), y0: f.y - c, y1: f.y + c, radiusPx: 0, fill: COLORS.ink, opacity: f.caret, z: z + 2 });
  if (f.composing && f.composing[1] > f.composing[0])
    shapes.push({ kind: "box", key: `${f.key}:composing`, x0: at(f.composing[0]), x1: at(f.composing[1]), y0: f.y - c - P(1), y1: f.y - c, radiusPx: 0, fill: COLORS.ink, z: z + 2 });
  const texts: PageText[] = f.value ? [{ key: `${f.key}:words`, x: f.x, y: f.y, anchor: "start", baseline: "middle", text: f.value, sizePx: f.sizePx, color: COLORS.ink, weight, z: z + 1 }] : [];
  return { shapes, texts, region: { key: f.key, part: "field", rect: box, z: z + 3, cursor: "text" } };
}
