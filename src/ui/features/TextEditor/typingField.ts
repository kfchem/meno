/**
 * The field a text Meno draws is typed through (docs/PDF.md, *A text*).
 * It holds the caret's line and those around it, and what is selected
 * among them, so that the IME can convert again a word already written
 * (lib/text/field); what is typed into it, the IME's included, is read
 * back as an edit of the text, and while the IME composes, what it has so
 * far is drawn by Meno. An editor's keys are Meno's (lib/text/keys);
 * copying, cutting and pasting take the whole selection, however much of
 * it the field holds.
 *
 * Where the system's webview has an EditContext - Chromium's, WebView2 on
 * Windows - the text's own element takes one, and the IME says through it
 * just what it replaces and how its clauses are underlined. Elsewhere -
 * WebKit, on a Mac - a textarea kept out of sight takes the typing, under
 * the drawing, lying just where the drawn lines lie so that the IME's
 * candidates show at the caret.
 */
import { IS_MAC } from "../../../lib/doc/shortcuts";
import { caretAt, plainLines, selFrom, selTo, type Edit, type Lines, type Sel } from "../../../lib/text/editing";
import { clausesWithin, composed, composingIn, editOf, inText, windowOf, withTakenAway, type FieldWindow } from "../../../lib/text/field";
import { commandOf, type Command } from "../../../lib/text/keys";
import type { Composing } from "./editor";

/** Where a place in a text lies on its field's element: how far across, its line's top, and how tall the line is, in CSS pixels. */
export type FieldBox = { x: number; top: number; height: number };

/**
 * What a field types into: a text Meno draws - the column's (./editor), or
 * words on the page - its lines, what is selected and what the IME
 * composes, what its keys and typing do, and where its places lie, for the
 * field to lie there and the IME's candidates to show at the caret.
 */
export interface FieldHost {
  lines: Lines;
  sel: Sel;
  readonly text: string;
  composing: Composing | null;
  focused: boolean;
  stirred: number;
  onChange(): void;
  command(c: Command, mac: boolean): void;
  selectedText(): string;
  /** What is selected replaced by what is typed - or, `pasted`, by what is pasted. */
  replaceSelection(insert: string, pasted?: boolean): void;
  edit(e: Edit, sel?: Sel): void;
  setComposing(c: Composing | null): void;
  /** Where a place in the text lies. */
  boxAt(at: number): FieldBox;
  /** Where a place in what the IME has so far lies, `i` into it. */
  composedBoxAt(i: number): FieldBox;
  /** The textarea laid where the lines it holds - from `start` to `end` in the text - are drawn, its caret where the drawn caret is. */
  layField(ta: HTMLTextAreaElement, start: number, end: number): void;
}

export interface TypingField {
  focus(): void;
  /** Given the lines about the caret and what is selected - unless the IME is composing in it. */
  sync(): void;
  /** Laid, or said to be, where the lines it holds are drawn. */
  place(): void;
  dispose(): void;
}

/** Whether the webview has an EditContext to type through. */
export const hasEditContext = () => typeof window !== "undefined" && "EditContext" in window;

/** The field for a text: an EditContext on its element, where there is one; else the textarea. */
export function typingField(el: HTMLElement, ed: FieldHost): TypingField {
  return el instanceof HTMLTextAreaElement ? new TextareaField(el, ed) : new EditContextField(el, ed);
}

/** What both fields do alike: listen, an editor's keys, copying and pasting. */
abstract class Field implements TypingField {
  protected win: FieldWindow | null = null;
  private off: (() => void)[] = [];

  constructor(
    protected el: HTMLElement,
    protected ed: FieldHost,
  ) {
    this.on<KeyboardEvent>(el, "keydown", (e) => this.onKey(e));
    this.on<ClipboardEvent>(el, "copy", (e) => this.onCopy(e, false));
    this.on<ClipboardEvent>(el, "cut", (e) => this.onCopy(e, true));
    this.on<ClipboardEvent>(el, "paste", (e) => this.onPaste(e));
    this.on(el, "focus", () => this.focused(true));
    this.on(el, "blur", () => this.focused(false));
  }

  protected on<E extends Event>(target: EventTarget, type: string, f: (e: E) => void): void {
    target.addEventListener(type, f as EventListener);
    this.off.push(() => target.removeEventListener(type, f as EventListener));
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
  }

  focus(): void {
    this.el.focus({ preventScroll: true });
  }

  abstract sync(): void;
  abstract place(): void;
  protected abstract get composingNow(): boolean;

  private focused(yes: boolean): void {
    this.ed.focused = yes;
    this.ed.stirred = performance.now();
    if (yes) this.sync();
    this.ed.onChange();
  }

  /** An editor's key: Meno's command - none while the IME has the keys. */
  protected onKey(e: KeyboardEvent): boolean {
    if (e.isComposing || e.keyCode === 229 || this.composingNow) return false;
    const c = commandOf(e, IS_MAC);
    if (!c) return false;
    e.preventDefault();
    e.stopPropagation();
    this.ed.command(c, IS_MAC);
    this.sync();
    return true;
  }

  private onCopy(e: ClipboardEvent, cut: boolean): void {
    e.preventDefault();
    const text = this.ed.selectedText();
    if (!text) return;
    e.clipboardData?.setData("text/plain", text);
    if (cut) {
      this.ed.replaceSelection("");
      this.sync();
    }
  }

  private onPaste(e: ClipboardEvent): void {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;
    this.ed.replaceSelection(plainLines(text), true);
    this.sync();
  }

  /** What the IME has so far, drawn in place of what it takes the place of: `before` the field as it began, `[a, b)` what it replaces, `now` the field. */
  protected composeFrom(before: string, a: number, b: number, start: number, now: string, sel: [number, number], clauses?: { from: number; to: number; thick: boolean }[]): void {
    const tail = before.length - b;
    const text = now.slice(a, Math.max(a, now.length - tail));
    const s: [number, number] = [Math.min(Math.max(sel[0] - a, 0), text.length), Math.min(Math.max(sel[1] - a, 0), text.length)];
    this.ed.setComposing({ from: start + a, to: start + b, text, sel: s, clauses });
  }
}

/** A textarea kept out of sight: WebKit's IME, and any webview without an EditContext. */
class TextareaField extends Field {
  /** The IME composing: what the field held as it began, and what was selected in it. */
  private composing: { before: string; a: number; b: number; start: number } | null = null;

  constructor(
    private ta: HTMLTextAreaElement,
    ed: FieldHost,
  ) {
    super(ta, ed);
    this.on<InputEvent>(ta, "beforeinput", (e) => this.onBeforeInput(e));
    this.on(ta, "input", () => this.onInput());
    this.on(ta, "compositionstart", () => this.onCompositionStart());
    this.on(ta, "compositionend", () => this.onCompositionEnd());
  }

  protected get composingNow(): boolean {
    return !!this.composing;
  }

  sync(): void {
    if (this.composing) return;
    const ed = this.ed;
    const w = windowOf(ed.lines, ed.sel);
    this.win = w;
    if (this.ta.value !== w.text) this.ta.value = w.text;
    const backward = ed.sel.head < ed.sel.anchor && w.whole;
    if (this.ta.selectionStart !== w.sel[0] || this.ta.selectionEnd !== w.sel[1]) this.ta.setSelectionRange(w.sel[0], w.sel[1], backward ? "backward" : "forward");
    this.place();
  }

  place(): void {
    const w = this.win;
    if (w) this.ed.layField(this.ta, w.start, w.end);
  }

  protected onKey(e: KeyboardEvent): boolean {
    // (a selection the field cannot hold, typed over by the IME: let go of first)
    if ((e.isComposing || e.keyCode === 229) && !this.composing && this.win && !this.win.whole && selFrom(this.ed.sel) !== selTo(this.ed.sel)) {
      this.ed.replaceSelection("");
      this.sync();
      return false;
    }
    return super.onKey(e);
  }

  private onBeforeInput(e: InputEvent): void {
    // (undone and done again by the workspace's own Undo, as all else is)
    if (e.inputType === "historyUndo" || e.inputType === "historyRedo") {
      e.preventDefault();
      return;
    }
    // (a selection the field cannot hold, typed over or deleted: the whole of it)
    if (this.composing || e.isComposing || !this.win || this.win.whole || selFrom(this.ed.sel) === selTo(this.ed.sel)) return;
    if (e.inputType.startsWith("insert") && e.inputType !== "insertCompositionText") {
      e.preventDefault();
      const insert = e.inputType === "insertLineBreak" || e.inputType === "insertParagraph" ? "\n" : (e.data ?? "");
      this.ed.replaceSelection(plainLines(insert));
      this.sync();
    } else if (e.inputType.startsWith("delete")) {
      e.preventDefault();
      this.ed.replaceSelection("");
      this.sync();
    }
  }

  private onInput(): void {
    const w = this.win;
    if (!w) return;
    if (this.composing) {
      const c = this.composing;
      this.composeFrom(c.before, c.a, c.b, c.start, this.ta.value, [this.ta.selectionStart, this.ta.selectionEnd]);
      return;
    }
    const e = editOf(w.text, w.sel[0], w.sel[1], this.ta.value);
    if (!e) return;
    const typed = inText({ ...e, insert: plainLines(e.insert) }, w.start);
    this.ed.edit(typed, caretAt(w.start + this.ta.selectionEnd + (typed.insert.length - e.insert.length)));
    this.sync();
  }

  private onCompositionStart(): void {
    const w = this.win;
    if (!w) return;
    this.composing = { before: this.ta.value, a: this.ta.selectionStart, b: this.ta.selectionEnd, start: w.start };
  }

  private onCompositionEnd(): void {
    const c = this.composing;
    this.composing = null;
    this.ed.setComposing(null);
    if (!c) return;
    const now = this.ta.value;
    const e = editOf(c.before, c.a, c.b, now);
    // (what the field holds now, as given: an input after this reads no change)
    this.win = this.win && { ...this.win, text: now, end: this.win.start + now.length, sel: [this.ta.selectionStart, this.ta.selectionEnd] };
    if (e) {
      const typed = inText({ ...e, insert: plainLines(e.insert) }, c.start);
      this.ed.edit(typed, caretAt(c.start + this.ta.selectionEnd + (typed.insert.length - e.insert.length)));
    }
    // (given the lines about the caret again once the IME has quite let go of it)
    window.setTimeout(() => this.sync(), 0);
  }
}

/** An EditContext (W3C EditContext API), as far as Meno uses it: no TypeScript of its own yet. */
type EditContextLike = EventTarget & {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  updateText(rangeStart: number, rangeEnd: number, text: string): void;
  updateSelection(start: number, end: number): void;
  updateControlBounds(bounds: DOMRect): void;
  updateSelectionBounds(bounds: DOMRect): void;
  updateCharacterBounds(rangeStart: number, bounds: DOMRect[]): void;
};
type TextUpdate = Event & { updateRangeStart: number; updateRangeEnd: number; text: string; selectionStart: number; selectionEnd: number };
type TextFormats = Event & { getTextFormats(): { rangeStart: number; rangeEnd: number; underlineStyle: string; underlineThickness: string }[] };
type BoundsAsked = Event & { rangeStart: number; rangeEnd: number };

/** How long a part the IME took away is held for a composition to follow, in ms. */
const HOLD_MS = 60;

/**
 * The text's own element, with an EditContext: Chromium's IME, through the
 * system's text services, reads the lines it holds and says each change -
 * what it replaces, what goes there, and while it composes how each clause
 * is underlined; where each letter it composes lies is said back to it,
 * for its candidates.
 */
class EditContextField extends Field {
  private ec: EditContextLike;
  /**
   * The IME composing: what the context held as it began, the words it
   * began on, where the field began - and, once it says, where what it
   * composes lies in the context's text and what it replaces (lib/text/field
   * `composingIn`).
   */
  private composing: {
    before: string;
    data: string;
    start: number;
    in: { at: number; tail: number; from: number; to: number } | null;
    clauses?: { from: number; to: number; thick: boolean }[];
    /** What the IME took away just before it began, held for it (`held`). */
    taken: { from: number; to: number } | null;
  } | null = null;
  /**
   * A part taken away by the IME, not by a key - Meno's own keys delete -
   * held a moment: converting again a word it has just taken, it puts the
   * word back as it begins, and the two are one change, undone at once, or
   * none if the word comes back as it was. Kept, if no composition follows.
   */
  private held: { from: number; to: number; start: number; timer: number } | null = null;
  /** Where the IME was last told the text lies, and its caret: told again only once they move, after the text is drawn. */
  private told = { control: "", caret: "" };
  private telling = false;
  private gone = false;

  constructor(el: HTMLElement, ed: FieldHost) {
    super(el, ed);
    const Ctx = (window as unknown as { EditContext: new () => EditContextLike }).EditContext;
    this.ec = new Ctx();
    (el as HTMLElement & { editContext: EditContextLike | null }).editContext = this.ec;
    this.on<TextUpdate>(this.ec, "textupdate", (e) => this.onTextUpdate(e));
    this.on<TextFormats>(this.ec, "textformatupdate", (e) => this.onFormats(e));
    this.on<BoundsAsked>(this.ec, "characterboundsupdate", (e) => this.onBoundsAsked(e));
    this.on<CompositionEvent>(this.ec, "compositionstart", (e) => {
      const held = this.held;
      if (held) window.clearTimeout(held.timer);
      this.held = null;
      this.composing = { before: this.ec.text, data: e.data ?? "", start: held?.start ?? this.win?.start ?? 0, in: null, taken: held && { from: held.from, to: held.to } };
    });
    this.on(this.ec, "compositionend", () => this.onCompositionEnd());
    // (a line's end, Enter's - the context leaves it to the page)
    this.on<InputEvent>(el, "beforeinput", (e) => {
      if (e.inputType === "historyUndo" || e.inputType === "historyRedo") e.preventDefault();
      else if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") {
        e.preventDefault();
        if (!this.composing) {
          this.ed.replaceSelection("\n");
          this.sync();
        }
      }
    });
  }

  dispose(): void {
    this.keepHeld();
    super.dispose();
    this.gone = true;
    (this.el as HTMLElement & { editContext: EditContextLike | null }).editContext = null;
  }

  protected get composingNow(): boolean {
    return !!this.composing;
  }

  /** What the IME took away, kept as an edit after all: no composition came. The context is given the lines about the caret again, unless a change it says next is still to be read against what it holds. */
  private keepHeld(sync = true): void {
    const h = this.held;
    if (!h) return;
    window.clearTimeout(h.timer);
    this.held = null;
    this.ed.edit(inText({ from: h.from, to: h.to, insert: "" }, h.start), caretAt(h.start + h.from));
    if (sync) this.sync();
  }

  protected onKey(e: KeyboardEvent): boolean {
    if (!e.isComposing && e.keyCode !== 229) this.keepHeld();
    if (super.onKey(e)) return true;
    // (Enter, where the page is not told of it as an input)
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229 && !this.composing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      this.ed.replaceSelection("\n");
      this.sync();
      return true;
    }
    return false;
  }

  sync(): void {
    // (left as the IME has it while it composes - or has just taken a part away for a composition)
    if (this.composing || this.held) return;
    const ed = this.ed;
    const w = windowOf(ed.lines, ed.sel);
    this.win = w;
    if (this.ec.text !== w.text) this.ec.updateText(0, this.ec.text.length, w.text);
    const [a, b] = ed.sel.head < ed.sel.anchor && w.whole ? [w.sel[1], w.sel[0]] : w.sel;
    if (this.ec.selectionStart !== a || this.ec.selectionEnd !== b) this.ec.updateSelection(a, b);
    this.place();
  }

  /** The IME told where the text and its caret lie - once the frame they are drawn in has gone to the screen, and only where they have moved. */
  place(): void {
    if (this.telling) return;
    this.telling = true;
    requestAnimationFrame(() =>
      window.setTimeout(() => {
        this.telling = false;
        if (!this.gone) this.tell();
      }, 0),
    );
  }

  private tell(): void {
    const ed = this.ed;
    const box = this.el.getBoundingClientRect();
    const control = `${box.left},${box.top},${box.width},${box.height}`;
    if (control !== this.told.control) {
      this.told.control = control;
      this.ec.updateControlBounds(new DOMRect(box.left, box.top, box.width, box.height));
    }
    const b = ed.composing ? ed.composedBoxAt(ed.composing.sel[1]) : ed.boxAt(ed.sel.head);
    const caret = `${box.left + b.x},${box.top + b.top},${b.height}`;
    if (caret !== this.told.caret) {
      this.told.caret = caret;
      this.ec.updateSelectionBounds(new DOMRect(box.left + b.x, box.top + b.top, 1, b.height));
    }
  }

  /** What the IME has so far drawn: in place of what it replaces, its caret and clauses as it says. */
  private show(): void {
    const c = this.composing!;
    const k = this.replaced()!;
    const text = composed(this.ec.text, k.at, k.tail);
    const s: [number, number] = [Math.min(Math.max(this.ec.selectionStart - k.at, 0), text.length), Math.min(Math.max(this.ec.selectionEnd - k.at, 0), text.length)];
    this.ed.setComposing({ from: c.start + k.from, to: c.start + k.to, text, sel: s, clauses: clausesWithin(c.clauses, text.length) });
  }

  /** Where what the IME composes lies in the context's text, and what it replaces in the text as Meno holds it - what it took away first too. */
  private replaced(): { at: number; tail: number; from: number; to: number } | null {
    const c = this.composing;
    if (!c?.in) return null;
    if (!c.taken) return c.in;
    const [from, to] = withTakenAway(c.in.from, c.in.to, c.taken.from, c.taken.to);
    return { ...c.in, from, to };
  }

  private onTextUpdate(e: TextUpdate): void {
    const w = this.win;
    if (!w) return;
    const c = this.composing;
    if (c) {
      // (what it replaces, as it first says - or, converting again the word the caret is in, that word)
      c.in ??= composingIn(c.before, c.data, e.updateRangeStart, e.updateRangeEnd, e.text);
      this.show();
      return;
    }
    // (a part taken away, not by a key: held, for a composition that may follow at once)
    if (!e.text && e.updateRangeEnd > e.updateRangeStart && !this.held) {
      this.held = { from: e.updateRangeStart, to: e.updateRangeEnd, start: w.start, timer: window.setTimeout(() => this.keepHeld(), HOLD_MS) };
      return;
    }
    // (what was taken away kept first, the context still holding the text this change is read against)
    this.keepHeld(false);
    const insert = plainLines(e.text);
    const typed = inText({ from: e.updateRangeStart, to: e.updateRangeEnd, insert }, w.start);
    this.ed.edit(typed, caretAt(w.start + e.selectionEnd + (insert.length - e.text.length)));
    this.sync();
  }

  private onFormats(e: TextFormats): void {
    const c = this.composing;
    if (!c?.in) return;
    const at = c.in.at;
    c.clauses = e
      .getTextFormats()
      .filter((f) => f.underlineStyle !== "none")
      .map((f) => ({ from: f.rangeStart - at, to: f.rangeEnd - at, thick: f.underlineThickness === "thick" }));
    this.show();
  }

  /** Where each letter the IME composes lies on the screen, for its candidates: one box each, of the text's offsets. */
  private onBoundsAsked(e: BoundsAsked): void {
    const ed = this.ed;
    const k = this.replaced();
    if (!k || !ed.composing) return;
    const at = k.at;
    const box = this.el.getBoundingClientRect();
    const rects: DOMRect[] = [];
    for (let i = e.rangeStart; i < e.rangeEnd; i++) {
      const a = ed.composedBoxAt(i - at);
      const b = ed.composedBoxAt(i + 1 - at);
      rects.push(new DOMRect(box.left + a.x, box.top + a.top, Math.max(1, b.top === a.top ? b.x - a.x : 1), a.height));
    }
    this.ec.updateCharacterBounds(e.rangeStart, rects);
  }

  private onCompositionEnd(): void {
    const c = this.composing;
    const k = this.replaced();
    this.composing = null;
    this.ed.setComposing(null);
    if (!c || !k) {
      // (nothing composed: what it took away, kept)
      if (c?.taken) this.ed.edit(inText({ from: c.taken.from, to: c.taken.to, insert: "" }, c.start), caretAt(c.start + c.taken.from));
      this.sync();
      return;
    }
    // (one change - or none, where what it replaced comes back as it was)
    const insert = plainLines(composed(this.ec.text, k.at, k.tail));
    if (insert !== this.ed.text.slice(c.start + k.from, c.start + k.to)) this.ed.edit(inText({ from: k.from, to: k.to, insert }, c.start), caretAt(c.start + k.from + insert.length));
    // (the context given the lines about the caret again - what the IME put in twice, once)
    this.sync();
  }
}
