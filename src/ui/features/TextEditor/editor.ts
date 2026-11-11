/**
 * A text Meno draws, as it is being read and edited (docs/PDF.md, *A
 * text*): its lines, what is selected, how far it is scrolled, what the
 * IME is composing - and what each of an editor's keys, a click and typing
 * do to them. The drawing (DrawnText) reads it each frame; it says when it
 * has changed.
 */
import {
  applyEdit,
  caretAt,
  isCaret,
  letterStep,
  lineAround,
  Lines,
  mapThrough,
  paragraphStep,
  selected,
  selFrom,
  selTo,
  wordAround,
  wordStep,
  type Edit,
  type Sel,
} from "../../../lib/text/editing";
import { lineComposing } from "../../../lib/text/field";
import type { Command, Unit } from "../../../lib/text/keys";
import { colAt, LINE_PX, lineWidth, xAt } from "./linePictures";
import type { FieldBox, FieldHost } from "./typingField";

/**
 * What the IME is composing: the part of the text it takes the place of,
 * what it has so far, and what it has selected in that - and, where the
 * system says, how each part of it is underlined (its clauses, the one
 * being converted thick), in its own offsets.
 */
export type Composing = { from: number; to: number; text: string; sel: [number, number]; clauses?: { from: number; to: number; thick: boolean }[] };

/** How wide the column of line numbers is at least, and how far in from it the lines begin, in CSS pixels. */
export const GUTTER_PX = 44;
export const PAD_PX = 20;
/** The room left of a line number and right of it, in the column of numbers, in CSS pixels. */
export const NUMBER_GAP = 12;
export const NUMBER_PAD = 8;

/** How wide the column of line numbers is for `count` lines, a digit `digit` px wide: its least, or what the longest number needs with its room either side. */
export function gutterFor(count: number, digit: number): number {
  return Math.max(GUTTER_PX, Math.ceil(String(Math.max(1, count)).length * digit) + NUMBER_GAP + NUMBER_PAD);
}

/** A scroll bar's thumb: how thick it is, how far in from the view's edge, and the least it is long, in CSS pixels. */
export const BAR_PX = 6;
export const BAR_EDGE = 3;
export const BAR_LEAST = 28;
/** How wide the strip along the edge is that takes a press for the bar. */
export const BAR_HIT_PX = 14;

/** How far a text is scrolled when its thumb, `len` long, stands `pos` along a track `track` long: the text scrolls `most` in all. */
export function scrollOfThumb(pos: number, len: number, track: number, most: number): number {
  return track <= len ? 0 : Math.min(1, Math.max(0, pos / (track - len))) * most;
}

/** A thumb along a track `track` long, from `at`: where it starts and how long it is, for text `total` long seen through `view`, scrolled `scroll` - null where it all shows. */
export function thumbOf(total: number, view: number, scroll: number, track: number, at = 0): { start: number; len: number } | null {
  if (total <= view + 0.5 || view <= 0 || track <= 0) return null;
  const len = Math.min(track, Math.max(BAR_LEAST, (track * view) / total));
  const most = total - view;
  return { start: at + (track - len) * Math.min(1, Math.max(0, scroll / most)), len };
}
/** How near its end, in px, a text scrolled is taken to be at it - one growing there, a job's log, staying there. */
const AT_END_PX = 8;

export class Editor implements FieldHost {
  lines: Lines;
  sel: Sel = caretAt(0);
  /** Where up and down keep the caret across, until it is moved across. */
  private goalX: number | null = null;
  scrollTop = 0;
  scrollLeft = 0;
  /** How large the view is, in CSS pixels. */
  viewW = 0;
  viewH = 0;
  composing: Composing | null = null;
  focused = false;
  /** When the caret was last moved or typed at: it shows, steadily, a moment from then. */
  stirred = 0;
  /** How wide the longest line is, as far as it is known - and the line the IME is composing in, while it does. */
  private widest = 0;
  private composedWide = 0;
  /** Told when anything drawn has changed; and when the text has, by typing. */
  onChange: () => void = () => {};
  onEdited: (text: string) => void = () => {};

  constructor(text: string) {
    this.lines = new Lines(text);
    this.measureWidest();
  }

  get text(): string {
    return this.lines.text;
  }

  private measureWidest(): void {
    // (the longest line by its letters, measured: near enough for how far it scrolls across)
    let longest = 0;
    for (let i = 0; i < this.lines.count; i++) if (this.lines.end(i) - this.lines.start(i) > this.lines.end(longest) - this.lines.start(longest)) longest = i;
    this.widest = lineWidth(this.lines.line(longest));
  }

  /** How wide the column of line numbers is: wide enough for the last number, with room either side. */
  get gutter(): number {
    return gutterFor(this.lines.count, lineWidth("0"));
  }

  /** The scroll bars' thumbs on the view, null where the text fits: down the right edge, and along the bottom beside the numbers. */
  get thumbs(): { v: { start: number; len: number } | null; h: { start: number; len: number } | null } {
    const g = this.gutter;
    const v = thumbOf(this.lines.count * LINE_PX + LINE_PX, this.viewH, this.scrollTop, this.viewH);
    const h = thumbOf(Math.max(this.widest, this.composedWide) + PAD_PX * 2, this.viewW - g, this.scrollLeft, this.viewW - g, g);
    return { v, h };
  }

  /** How far down the text can be scrolled, and across. */
  get mostTop(): number {
    return Math.max(0, this.lines.count * LINE_PX - this.viewH + LINE_PX);
  }
  get mostLeft(): number {
    return Math.max(0, Math.max(this.widest, this.composedWide) + PAD_PX * 2 - (this.viewW - this.gutter));
  }
  get atEnd(): boolean {
    return this.scrollTop >= this.mostTop - AT_END_PX;
  }

  /** A line's place on the view: how far down its top is. */
  topOf(line: number): number {
    return line * LINE_PX - this.scrollTop;
  }
  /** How far across a place in the text lies on the view. */
  xOf(at: number): number {
    const i = this.lines.at(at);
    return this.gutter + PAD_PX - this.scrollLeft + xAt(this.lines.line(i), at - this.lines.start(i));
  }
  /** Where a place lies on the view, for the field: across, its line's top, and a line's height. */
  boxAt(at: number): FieldBox {
    return { x: this.xOf(at), top: this.topOf(this.lines.at(at)), height: LINE_PX };
  }

  /** Where a place in what the IME has so far lies on the view, `i` into it. */
  composedBoxAt(i: number): FieldBox {
    const c = this.composing;
    if (!c) return this.boxAt(this.sel.head);
    const line = this.lines.at(c.from);
    const start = this.lines.start(line);
    const shown = this.lines.line(line).slice(0, c.from - start) + c.text;
    return { x: this.xOf(start) + xAt(shown, c.from - start + i), top: this.topOf(line), height: LINE_PX };
  }

  /** The textarea laid just where the lines it holds are drawn, in the same type, so that its caret is the drawn one. */
  layField(ta: HTMLTextAreaElement, start: number, end: number): void {
    const first = this.lines.at(start);
    const last = this.lines.at(end);
    const s = ta.style;
    s.left = `${this.xOf(start)}px`;
    s.top = `${this.topOf(first)}px`;
    s.height = `${(last - first + 1) * LINE_PX}px`;
    s.width = `${Math.max(this.viewW, 400)}px`;
  }

  /** The place in the text nearest a point on the view. */
  at(x: number, y: number): number {
    const i = Math.min(Math.max(0, Math.floor((y + this.scrollTop) / LINE_PX)), this.lines.count - 1);
    return this.lines.start(i) + colAt(this.lines.line(i), x - (this.gutter + PAD_PX - this.scrollLeft));
  }

  scrollTo(top: number, left = this.scrollLeft): void {
    const t = Math.min(Math.max(0, top), this.mostTop);
    const l = Math.min(Math.max(0, left), this.mostLeft);
    if (t === this.scrollTop && l === this.scrollLeft) return;
    this.scrollTop = t;
    this.scrollLeft = l;
    this.onChange();
  }

  /** The caret in view: its line, a line's worth from the edges where it can be, and across. */
  reveal(): void {
    const i = this.lines.at(this.sel.head);
    this.revealAt(i, this.xOf(this.sel.head) + this.scrollLeft - this.gutter);
  }

  /** A place in view: line `i`, `x` across from the gutter's edge as the text lies unscrolled. */
  private revealAt(i: number, x: number): void {
    let top = this.scrollTop;
    if (i * LINE_PX < top) top = i * LINE_PX;
    else if ((i + 1) * LINE_PX > top + this.viewH) top = (i + 1) * LINE_PX - this.viewH;
    let left = this.scrollLeft;
    const room = this.viewW - this.gutter;
    if (x - PAD_PX < left) left = Math.max(0, x - PAD_PX * 2);
    else if (x + PAD_PX > left + room) left = x + PAD_PX * 2 - room;
    this.scrollTo(top, left);
  }

  private moved(sel: Sel, keepGoal = false): void {
    this.sel = sel;
    if (!keepGoal) this.goalX = null;
    this.stirred = performance.now();
    this.reveal();
    this.onChange();
  }

  /** The text changed from outside - a job's log grown, an undo: what is selected kept where it was, moved with what changed before it. */
  setText(text: string): void {
    if (text === this.text) return;
    const old = this.text;
    let p = 0;
    const most = Math.min(old.length, text.length);
    while (p < most && old.charCodeAt(p) === text.charCodeAt(p)) p++;
    let s = 0;
    while (s < most - p && old.charCodeAt(old.length - 1 - s) === text.charCodeAt(text.length - 1 - s)) s++;
    const e: Edit = { from: p, to: old.length - s, insert: text.slice(p, text.length - s) };
    const followed = this.atEnd;
    this.lines = new Lines(text);
    this.measureWidest();
    this.sel = { anchor: mapThrough(this.sel.anchor, e), head: mapThrough(this.sel.head, e) };
    if (followed && e.to === old.length) this.scrollTop = this.mostTop;
    this.onChange();
  }

  /** An edit typed: made, the selection then `sel` - or the caret after what was put in. */
  edit(e: Edit, sel?: Sel): void {
    const text = applyEdit(this.text, e);
    this.lines = new Lines(text);
    this.widest = Math.max(this.widest, lineWidth(this.lines.line(this.lines.at(e.from + e.insert.length))));
    this.moved(sel ?? caretAt(e.from + e.insert.length));
    this.onEdited(text);
  }

  /** What is selected put in place of by `insert` - typed, or pasted. */
  replaceSelection(insert: string): void {
    this.edit({ from: selFrom(this.sel), to: selTo(this.sel), insert });
  }

  selectedText(): string {
    return selected(this.text, this.sel);
  }

  setComposing(c: Composing | null): void {
    this.composing = c;
    this.stirred = performance.now();
    this.composedWide = 0;
    // (what the IME has so far in view, its caret where it says - as typing keeps the caret in view)
    if (c) {
      const i = this.lines.at(c.from);
      const start = this.lines.start(i);
      const shown = lineComposing(this.lines.line(i), start, c);
      this.composedWide = lineWidth(shown);
      this.revealAt(i, PAD_PX + xAt(shown, c.from - start + c.sel[1]));
    }
    this.onChange();
  }

  /** How many lines a page is: what is in view, less one, so that a line goes on from one page to the next. */
  private get pageLines(): number {
    return Math.max(1, Math.floor(this.viewH / LINE_PX) - 1);
  }

  /** The place a line up or down from `at`, as near across as the caret was kept. */
  private vertical(at: number, lines: number): number {
    const i = this.lines.at(at);
    const goal = this.goalX ?? xAt(this.lines.line(i), at - this.lines.start(i));
    this.goalX = goal;
    const j = i + lines;
    if (j < 0) return 0;
    if (j >= this.lines.count) return this.text.length;
    return this.lines.start(j) + colAt(this.lines.line(j), goal);
  }

  /** Where a unit's move takes a place. */
  private step(at: number, unit: Unit, dir: -1 | 1, mac: boolean): number {
    const l = this.lines;
    switch (unit) {
      case "letter":
        return letterStep(l, at, dir);
      case "word":
        return wordStep(l, at, dir, mac ? "end" : "start");
      case "line":
        return this.vertical(at, dir);
      case "page":
        return this.vertical(at, dir * this.pageLines);
      case "paragraph":
        return paragraphStep(l, at, dir);
      case "lineEdge": {
        const i = l.at(at);
        return dir < 0 ? l.start(i) : l.end(i);
      }
      case "all":
        return dir < 0 ? 0 : this.text.length;
    }
  }

  /** An editor's key's command (lib/text/keys). */
  command(c: Command, mac: boolean): void {
    if (c.kind === "selectAll") {
      this.moved({ anchor: 0, head: this.text.length });
      return;
    }
    if (c.kind === "scroll") {
      const by = c.unit === "line" ? LINE_PX : c.unit === "page" ? this.pageLines * LINE_PX : Infinity;
      this.scrollTo(c.dir < 0 ? this.scrollTop - by : this.scrollTop + by);
      return;
    }
    const vertical = c.unit === "line" || c.unit === "page";
    // (a page on: the view moved a page too, the caret where it was on it)
    if (c.kind === "move" && c.unit === "page") this.scrollTo(this.scrollTop + c.dir * this.pageLines * LINE_PX);
    if (c.kind === "move") {
      // (a selection let go by an arrow across: the caret at its edge that way)
      if (!c.extend && !isCaret(this.sel) && c.unit === "letter") {
        this.moved(caretAt(c.dir < 0 ? selFrom(this.sel) : selTo(this.sel)));
        return;
      }
      const head = this.step(this.sel.head, c.unit, c.dir, mac);
      this.moved(c.extend ? { anchor: this.sel.anchor, head } : caretAt(head), vertical);
      return;
    }
    // (deleted: what is selected, or as far as the unit goes from the caret)
    if (!isCaret(this.sel)) {
      this.replaceSelection("");
      return;
    }
    const to = this.step(this.sel.head, c.unit, c.dir, mac);
    if (to === this.sel.head) return;
    this.edit({ from: Math.min(to, this.sel.head), to: Math.max(to, this.sel.head), insert: "" });
  }

  /** A click: the caret there, or the selection drawn on to there; two clicks a word, three a line. */
  pressAt(x: number, y: number, clicks: number, extend: boolean): Sel {
    const at = this.at(x, y);
    let sel: Sel;
    if (clicks >= 3) {
      const [a, b] = lineAround(this.lines, at);
      sel = { anchor: a, head: b };
    } else if (clicks === 2) {
      const [a, b] = wordAround(this.lines, at);
      sel = { anchor: a, head: b };
    } else sel = extend ? { anchor: this.sel.anchor, head: at } : caretAt(at);
    this.moved(sel);
    return sel;
  }

  /** A drag on from a press: by letters, or by the words or lines the press selected. */
  dragTo(x: number, y: number, from: Sel, clicks: number): void {
    const at = this.at(x, y);
    if (clicks >= 2) {
      const [a, b] = clicks >= 3 ? lineAround(this.lines, at) : wordAround(this.lines, at);
      const lo = Math.min(selFrom(from), a);
      const hi = Math.max(selTo(from), b);
      this.moved(at < selFrom(from) ? { anchor: hi, head: lo } : { anchor: lo, head: hi });
      return;
    }
    this.moved({ anchor: from.anchor, head: at });
  }
}
