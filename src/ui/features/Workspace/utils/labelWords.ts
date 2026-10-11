/**
 * An atom's label as it is typed in place (components/LabelTyping2D): words
 * on the page (./wordsEditor) on one line - a new line typed or pasted is
 * none - an input method's full-width letters as the ordinary ones. What
 * was typed is kept as it was typed (`typed`); what is shown is what
 * `reading` makes of it - its letters' case as they are meant (lib/chem/
 * smartLabel `liveLabel`), the same letters in the same places, so that the
 * caret stays where it is - once the input method has given it.
 */
import { caretAt, Lines, applyEdit, type Edit, type Sel } from "../../../../lib/text/editing";
import type { Composing } from "../../TextEditor/editor";
import { WordsEditor } from "./wordsEditor";

export class LabelWords extends WordsEditor {
  /** What the letters typed are shown as: themselves, unless said otherwise. */
  reading: (typed: string) => string = (t) => t;
  /** The letters as they were typed. */
  typed: string;

  constructor(text: string) {
    super(text);
    this.typed = text;
  }

  edit(e: Edit, sel?: Sel, typed = true): void {
    const insert = e.insert.replace(/[\r\n]+/g, "").normalize("NFKC");
    this.typed = applyEdit(this.typed.length === this.text.length ? this.typed : this.text, { ...e, insert });
    // (a new line taken out, or letters made ordinary: the caret after what is put in)
    super.edit({ ...e, insert }, insert === e.insert ? sel : undefined, typed);
    this.read();
  }

  undo(): void {
    super.undo();
    this.typed = this.text;
  }

  redo(): void {
    super.redo();
    this.typed = this.text;
  }

  setComposing(c: Composing | null): void {
    super.setComposing(c);
    if (!c) this.read();
  }

  /** What is shown, as `reading` makes it of what was typed - none of it while the input method composes. */
  read(): void {
    if (this.composing) return;
    const shown = this.reading(this.typed);
    if (shown === this.text || shown.length !== this.typed.length) return;
    this.lines = new Lines(shown);
    const clamp = (n: number) => Math.min(n, shown.length);
    this.sel = this.sel.anchor === this.sel.head ? caretAt(clamp(this.sel.head)) : { anchor: clamp(this.sel.anchor), head: clamp(this.sel.head) };
    this.onChange();
  }
}
