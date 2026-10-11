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
 *
 * Each letter keeps how it is set (`styles`, lib/chem/captions
 * `WordsStyle`): bold, italic, a colour, raised or lowered - what is typed
 * set as the letter before it, or as just asked for at the caret - and a
 * list's lines go on, and in or out a level (docs/EDITOR-2D.md,
 * *Text*).
 */
import { captionPlaceAt, listItem, marksOf, restyled, stylesOf, toggled, type CaptionPlaces, type Restyle, type WordsMark, type WordsStyle } from "../../../../lib/chem/captions";
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
type Step = { text: string; sel: Sel; declined: Span[]; wrote?: Span[]; styles: (WordsStyle | undefined)[] };

/** Letters' styles after an edit: those of what it leaves as they were, what it puts in set as `put` - or as the letter before it, or at the text's start the one after. */
export function stylesThrough(styles: readonly (WordsStyle | undefined)[], e: Edit, put?: WordsStyle | null): (WordsStyle | undefined)[] {
  const like = put !== undefined && put !== null ? put : e.from > 0 ? styles[e.from - 1] : styles[e.to];
  return [...styles.slice(0, e.from), ...new Array<WordsStyle | undefined>(e.insert.length).fill(like), ...styles.slice(e.to)];
}

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
  /** How each letter is set. */
  styles: (WordsStyle | undefined)[];
  /** How what is typed next at the caret is set, as just asked for there - none once the caret moves. */
  pending: WordsStyle | null = null;

  constructor(text: string, marks?: readonly WordsMark[]) {
    this.lines = new Lines(text);
    this.styles = stylesOf(text.length, marks);
    // (written on from their end)
    this.sel = caretAt(text.length);
  }

  /** The letters' marks, as a caption keeps them. */
  marks(): WordsMark[] {
    return marksOf(this.styles);
  }

  get text(): string {
    return this.lines.text;
  }

  private moved(sel: Sel, keepGoal = false, keepPending = false): void {
    this.sel = sel;
    this.typedTo = null;
    if (!keepPending) this.pending = null;
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
    this.styles = stylesThrough(this.styles, e, e.insert ? this.pending : null);
    const pending = this.pending;
    this.lines = new Lines(applyEdit(this.text, e));
    this.moved(sel ?? caretAt(e.from + e.insert.length));
    // (typing on in what was asked for at the caret)
    if (pending && e.insert && !sel) this.pending = pending;
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
    let styles = this.styles;
    for (const c of [...wrote].reverse()) {
      // (what is written set as what it replaces)
      styles = stylesThrough(styles, c, styles[c.from] ?? null);
      text = applyEdit(text, c);
      anchor = mapThrough(anchor, c);
      head = mapThrough(head, c);
      if (typedTo != null) typedTo = mapThrough(typedTo, c);
      this.declined = this.declined.flatMap((s) => spanThrough(s, c) ?? []);
    }
    // (typing on, a run of its own)
    this.lastTyped = null;
    this.styles = styles;
    this.lines = new Lines(text);
    this.moved({ anchor, head });
    this.typedTo = typedTo;
  }

  /** The words as they are now, to come back to. */
  private asNow(): Step {
    return { text: this.text, sel: this.sel, declined: this.declined, styles: this.styles };
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
    this.styles = was.styles;
    this.declined = was.declined;
    this.moved(was.sel);
  }

  // --- how letters are set, and lists ----------------------------------------

  /**
   * What is selected set otherwise - a step of its own to undo - or, with
   * no selection, what is typed next at the caret.
   */
  restyle(r: Restyle): void {
    const from = selFrom(this.sel);
    const to = selTo(this.sel);
    if (from === to) {
      this.pending = restyled(this.pending ?? (from > 0 ? this.styles[from - 1] : this.styles[from]), r) ?? {};
      this.stirred = performance.now();
      this.onChange();
      return;
    }
    this.undone.push(this.asNow());
    this.redone = [];
    this.lastTyped = null;
    this.styles = this.styles.map((s, i) => (i >= from && i < to ? restyled(s, r) : s));
    this.moved(this.sel, true);
  }

  /** A side of how letters are set turned on, or off where all of what is selected - or what is typed next - has it. */
  toggle(side: "bold" | "italic" | "sup" | "sub"): void {
    const from = selFrom(this.sel);
    const to = selTo(this.sel);
    const now = from === to ? [this.pending ?? (from > 0 ? this.styles[from - 1] : this.styles[from])] : this.styles.slice(from, to);
    this.restyle(toggled(now, side));
  }

  /** The typed lines the selection - or the caret - is on: where each begins. */
  private linesSelected(): number[] {
    const from = selFrom(this.sel);
    const to = selTo(this.sel);
    let at = this.text.lastIndexOf("\n", from - 1) + 1;
    const starts = [at];
    for (;;) {
      const next = this.text.indexOf("\n", at);
      // (on to the next line while the selection reaches into it - not where it ends at its very start)
      if (next < 0 || next + 1 > to || (next + 1 === to && to > from)) break;
      at = next + 1;
      starts.push(at);
    }
    return starts;
  }

  /** Several edits at once, from the last back, as one step - the selection carried through them. */
  private editAll(edits: Edit[]): void {
    if (!edits.length) return;
    this.undone.push(this.asNow());
    this.redone = [];
    this.lastTyped = null;
    let text = this.text;
    let { anchor, head } = this.sel;
    let styles = this.styles;
    for (const e of [...edits].sort((a, b) => b.from - a.from)) {
      styles = stylesThrough(styles, e, e.from < text.length ? (styles[e.from] ?? null) : null);
      text = applyEdit(text, e);
      anchor = mapThrough(anchor, e);
      head = mapThrough(head, e);
      this.declined = this.declined.flatMap((s) => spanThrough(s, e) ?? []);
    }
    this.styles = styles;
    this.lines = new Lines(text);
    this.moved({ anchor, head });
  }

  /** The lines selected made a list's items - or, all of them items already, plain lines again. */
  toggleList(): void {
    const starts = this.linesSelected();
    const items = starts.map((at) => listItem(this.text.slice(at, this.lineEndFrom(at))));
    if (items.every((it) => it)) this.editAll(starts.map((at, k) => ({ from: at + items[k]!.level, to: at + items[k]!.head, insert: "" })));
    else this.editAll(starts.flatMap((at, k) => (items[k] ? [] : [{ from: at, to: at, insert: "• " }])));
  }

  /** The list's items selected a level further in (`dir` 1) or out (-1); false where the caret is on no item. */
  indent(dir: 1 | -1): boolean {
    const starts = this.linesSelected();
    const items = starts.map((at) => listItem(this.text.slice(at, this.lineEndFrom(at))));
    if (!items.some((it) => it)) return false;
    this.editAll(
      starts.flatMap((at, k) => {
        const it = items[k];
        if (!it) return [];
        if (dir > 0) return it.level < 4 ? [{ from: at, to: at, insert: "\t" }] : [];
        return it.level > 0 ? [{ from: at, to: at + 1, insert: "" }] : [];
      }),
    );
    return true;
  }

  /**
   * A new line - in a list's item, the next item, as deep, its number one
   * on; on an item with nothing written after its bullet, the list ended
   * there, its bullet taken away.
   */
  newLine(): void {
    const at = selFrom(this.sel);
    const start = this.text.lastIndexOf("\n", at - 1) + 1;
    const end = this.lineEndFrom(start);
    const item = listItem(this.text.slice(start, end));
    if (!item || at < start + item.head) {
      this.replaceSelection("\n");
      return;
    }
    if (!this.text.slice(start + item.head, end).trim()) {
      this.editAll([{ from: start, to: end, insert: "" }]);
      return;
    }
    const number = /^(\d+)([.)])$/.exec(item.mark);
    const mark = number ? `${Number(number[1]) + 1}${number[2]}` : item.mark;
    this.replaceSelection(`\n${"\t".repeat(item.level)}${mark} `);
  }

  private lineEndFrom(start: number): number {
    const end = this.text.indexOf("\n", start);
    return end < 0 ? this.text.length : end;
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
