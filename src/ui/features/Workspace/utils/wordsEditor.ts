/**
 * Words on the page as they are written in place (docs/EDITOR-2D.md,
 * *Text*; docs/PDF.md, step 5): their text, what is selected, what the IME
 * is composing, and what each of an editor's keys, a click and typing do -
 * through the field the column's texts are typed through (TextEditor/
 * typingField), here laid where the words are set on the page. Their own
 * undo while they are written: they are the document's once kept.
 *
 * Where each place lies comes from how the words are set as they will be
 * kept (lib/chem/captions `captionPlaces`), given by the drawing each time
 * it sets them (`layout`).
 *
 * What is typed may be written as it is meant (`smart`; lib/text/smartWords):
 * 60dc as 60 °C, -78 as −78, 1-2 h as 1–2 h - a step of its own to undo,
 * the words as typed coming back, and that part then left as typed until it
 * is written again. What is pasted is left as it is.
 */
import { captionPlaceAt, type CaptionPlaces } from "../../../../lib/chem/captions";
import { applyEdit, caretAt, isCaret, letterStep, lineAround, Lines, mapThrough, paragraphStep, selected, selFrom, selTo, wordAround, wordStep, type Edit, type Sel } from "../../../../lib/text/editing";
import type { Command, Unit } from "../../../../lib/text/keys";
import { typedChanges, wordEnded, type Change } from "../../../../lib/text/smartWords";
import type { Composing } from "../../TextEditor/editor";
import type { FieldBox, FieldHost } from "../../TextEditor/typingField";

type Pt = { x: number; y: number };

/**
 * How the words lie, as the drawing sets them: their places as the text is
 * now (`places`) and as it is drawn with what the IME has so far (`shown`);
 * where a point of the page lies on the canvas, in CSS pixels; how tall a
 * line is there; and the type, as CSS gives it, and how wide a text is set
 * in it - for the field to lie with its caret on the drawn one.
 */
export type WordsLayout = {
  places: CaptionPlaces;
  shown: CaptionPlaces;
  toScreen: (p: Pt) => Pt;
  linePx: number;
  font: string;
  measure: (text: string) => number;
};

/** How long a run of typing is one step to undo, in ms, while it goes on. */
const RUN_MS = 1000;

/** A part of the words, `[from, to)`. */
type Span = { from: number; to: number };
/**
 * The words as they were before a step: what was selected, and the parts
 * left as typed, as those words had them; and, the step having written
 * what was typed as it is meant, the parts it wrote.
 */
type Step = { text: string; sel: Sel; declined: Span[]; wrote?: Span[] };

/** Where a part is after an edit: moved with what is before it - or, the edit in it, none, as it is written again. */
function spanThrough(s: Span, e: Edit): Span | null {
  if (e.from < s.to && e.to > s.from) return null;
  if (s.from < e.from && e.from < s.to) return null;
  return { from: mapThrough(s.from, e), to: mapThrough(s.to, e, false) };
}

export class WordsEditor implements FieldHost {
  lines: Lines;
  sel: Sel;
  composing: Composing | null = null;
  focused = false;
  /** When the caret was last moved or typed at: it shows, steadily, a moment from then. */
  stirred = 0;
  layout: WordsLayout | null = null;
  /** Told when anything drawn has changed. */
  onChange: () => void = () => {};
  /** Whether what is typed is written as it is meant: not, unless said. */
  smart: () => boolean = () => false;
  /** Where up and down keep the caret across, until it is moved across. */
  private goalX: number | null = null;
  private undone: Step[] = [];
  private redone: Step[] = [];
  private lastTyped: { at: number; kind: "insert" | "delete" } | null = null;
  /** The parts written as they were meant and then undone: left as typed until they are written again. */
  private declined: Span[] = [];
  /** Where the last letters typed end - none once the caret is moved, or the words are pasted into or undone. */
  private typedTo: number | null = null;

  constructor(text: string) {
    this.lines = new Lines(text);
    // (written on from their end)
    this.sel = caretAt(text.length);
  }

  get text(): string {
    return this.lines.text;
  }

  private moved(sel: Sel, keepGoal = false): void {
    this.sel = sel;
    this.typedTo = null;
    if (!keepGoal) this.goalX = null;
    this.stirred = performance.now();
    this.onChange();
  }

  /** An edit - typed, unless said otherwise: then written as it is meant, if it is to be. */
  edit(e: Edit, sel?: Sel, typed = true): void {
    // (one step to undo for a run of typing, or of deleting: each run its own)
    const kind = e.insert ? "insert" : "delete";
    const now = performance.now();
    const run = this.lastTyped && this.lastTyped.kind === kind && now - this.lastTyped.at < RUN_MS && !e.insert.includes("\n");
    if (!run) this.undone.push(this.asNow());
    this.redone = [];
    this.lastTyped = { at: now, kind };
    this.declined = this.declined.flatMap((s) => spanThrough(s, e) ?? []);
    this.lines = new Lines(applyEdit(this.text, e));
    this.moved(sel ?? caretAt(e.from + e.insert.length));
    if (!typed || !e.insert) return;
    this.typedTo = e.from + e.insert.length;
    if (this.smart()) this.write(typedChanges(this.text, e.from, e.from + e.insert.length));
  }

  /** The words kept: the word last typed ended there - and written as it is meant, if it is to be. */
  kept(): void {
    if (this.typedTo == null || this.composing || !this.smart()) return;
    this.write(wordEnded(this.text, this.typedTo));
  }

  /** What was typed written as it is meant - but for the parts left as typed: a step of its own, the words as typed undone to. */
  private write(changes: Change[]): void {
    const wrote = changes.filter((c) => !this.declined.some((d) => d.from === c.from && d.to === c.to));
    if (!wrote.length) return;
    this.undone.push({ ...this.asNow(), wrote: wrote.map(({ from, to }) => ({ from, to })) });
    let text = this.text;
    let { anchor, head } = this.sel;
    let typedTo = this.typedTo;
    // (from the last: each part where the words as typed have it)
    for (const c of [...wrote].reverse()) {
      text = applyEdit(text, c);
      anchor = mapThrough(anchor, c);
      head = mapThrough(head, c);
      if (typedTo != null) typedTo = mapThrough(typedTo, c);
      this.declined = this.declined.flatMap((s) => spanThrough(s, c) ?? []);
    }
    // (typing on, a run of its own)
    this.lastTyped = null;
    this.lines = new Lines(text);
    this.moved({ anchor, head });
    this.typedTo = typedTo;
  }

  /** The words as they are now, to come back to. */
  private asNow(): Step {
    return { text: this.text, sel: this.sel, declined: this.declined };
  }

  /**
   * The words as they were before the last run of typing; and again as
   * they were after it. What was typed and then written as it was meant
   * comes back as typed, and those parts are left so.
   */
  undo(): void {
    const was = this.undone.pop();
    if (!was) return;
    this.redone.push({ ...this.asNow(), wrote: was.wrote });
    this.restore(was);
    if (was.wrote) this.declined = [...this.declined, ...was.wrote];
  }
  redo(): void {
    const was = this.redone.pop();
    if (!was) return;
    this.undone.push({ ...this.asNow(), declined: this.declined.filter((d) => !was.wrote?.includes(d)), wrote: was.wrote });
    this.restore(was);
  }
  private restore(was: Step): void {
    this.lastTyped = null;
    this.lines = new Lines(was.text);
    this.declined = was.declined;
    this.moved(was.sel);
  }

  /** What is selected replaced - by what is typed, or, `pasted`, what is pasted, left as it is. */
  replaceSelection(insert: string, pasted = false): void {
    this.edit({ from: selFrom(this.sel), to: selTo(this.sel), insert }, undefined, !pasted);
  }

  selectedText(): string {
    return selected(this.text, this.sel);
  }

  setComposing(c: Composing | null): void {
    this.composing = c;
    this.stirred = performance.now();
    this.onChange();
  }

  // --- where places lie ---------------------------------------------------

  /** A place as the words are set: across, and its line's middle - on the page. */
  private placeOn(p: CaptionPlaces, at: number): Pt {
    const a = p.at[Math.min(Math.max(at, 0), p.at.length - 1)];
    return { x: a.x, y: p.lines[a.line].y };
  }

  /** Where a place lies on the page, as the words are drawn now. */
  pointOf(at: number): Pt | null {
    return this.layout ? this.placeOn(this.layout.places, at) : null;
  }

  boxAt(at: number): FieldBox {
    const l = this.layout;
    if (!l) return { x: 0, top: 0, height: 0 };
    const s = l.toScreen(this.placeOn(l.places, at));
    return { x: s.x, top: s.y - l.linePx / 2, height: l.linePx };
  }

  composedBoxAt(i: number): FieldBox {
    const l = this.layout;
    const c = this.composing;
    if (!l || !c) return this.boxAt(this.sel.head);
    const s = l.toScreen(this.placeOn(l.shown, c.from + i));
    return { x: s.x, top: s.y - l.linePx / 2, height: l.linePx };
  }

  /**
   * The textarea laid so that its caret is the drawn one: in the type the
   * words are set in, at the size they are seen, its line's start as far
   * before the caret as the typed line's start is - for the IME's
   * candidates to show where the words are written.
   */
  layField(ta: HTMLTextAreaElement, start: number, end: number): void {
    const l = this.layout;
    if (!l) return;
    const head = this.sel.head;
    const b = this.boxAt(head);
    const lineStart = Math.max(start, this.text.lastIndexOf("\n", head - 1) + 1);
    const row = this.text.slice(start, lineStart).split("\n").length - 1;
    const rows = this.text.slice(start, end).split("\n").length;
    const s = ta.style;
    s.font = l.font;
    s.lineHeight = `${l.linePx}px`;
    s.left = `${b.x - l.measure(this.text.slice(lineStart, head))}px`;
    s.top = `${b.top - row * l.linePx}px`;
    s.height = `${rows * l.linePx}px`;
    s.width = `${Math.max(400, l.measure(this.text.slice(start, end)) + 200)}px`;
  }

  // --- keys and the pointer -----------------------------------------------

  /** The place a line up or down from `at`, as the words are set, as near across as the caret was kept. */
  private vertical(at: number, lines: number): number {
    const p = this.layout?.places;
    if (!p) return lines < 0 ? 0 : this.text.length;
    const here = p.at[at];
    const goal = this.goalX ?? here.x;
    this.goalX = goal;
    const line = here.line + lines;
    if (line < 0) return 0;
    if (line >= p.lines.length) return this.text.length;
    return captionPlaceAt(p, { x: goal, y: p.lines[line].y });
  }

  /** Where a set line begins, or ends, from `at`. */
  private lineEdge(at: number, dir: -1 | 1): number {
    const p = this.layout?.places;
    if (!p) return dir < 0 ? this.lines.start(this.lines.at(at)) : this.lines.end(this.lines.at(at));
    const line = p.at[at].line;
    const on = p.at.map((a, k) => (a.line === line ? k : -1)).filter((k) => k >= 0);
    return dir < 0 ? on[0] : on[on.length - 1];
  }

  private step(at: number, unit: Unit, dir: -1 | 1, mac: boolean): number {
    switch (unit) {
      case "letter":
        return letterStep(this.lines, at, dir);
      case "word":
        return wordStep(this.lines, at, dir, mac ? "end" : "start");
      case "line":
        return this.vertical(at, dir);
      case "page":
      case "all":
        return dir < 0 ? 0 : this.text.length;
      case "paragraph":
        return paragraphStep(this.lines, at, dir);
      case "lineEdge":
        return this.lineEdge(at, dir);
    }
  }

  command(c: Command, mac: boolean): void {
    if (c.kind === "selectAll") {
      this.moved({ anchor: 0, head: this.text.length });
      return;
    }
    // (words on the page are not scrolled)
    if (c.kind === "scroll") return;
    const vertical = c.unit === "line" || c.unit === "page";
    if (c.kind === "move") {
      if (!c.extend && !isCaret(this.sel) && c.unit === "letter") {
        this.moved(caretAt(c.dir < 0 ? selFrom(this.sel) : selTo(this.sel)));
        return;
      }
      const head = this.step(this.sel.head, c.unit, c.dir, mac);
      this.moved(c.extend ? { anchor: this.sel.anchor, head } : caretAt(head), vertical);
      return;
    }
    if (!isCaret(this.sel)) {
      this.replaceSelection("");
      return;
    }
    const to = this.step(this.sel.head, c.unit, c.dir, mac);
    if (to === this.sel.head) return;
    this.edit({ from: Math.min(to, this.sel.head), to: Math.max(to, this.sel.head), insert: "" });
  }

  /** The place nearest a point of the page. */
  at(q: Pt): number {
    return this.layout ? captionPlaceAt(this.layout.places, q) : this.text.length;
  }

  /** A click at a point of the page: the caret there, or the selection drawn on to there; two clicks a word, three a line. */
  pressAt(q: Pt, clicks: number, extend: boolean): Sel {
    const at = this.at(q);
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
  dragTo(q: Pt, from: Sel, clicks: number): void {
    const at = this.at(q);
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
