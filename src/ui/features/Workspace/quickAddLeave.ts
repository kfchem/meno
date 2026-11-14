/** What closes Quick Add (./QuickAdd), plain, to be tested without a page. */
import { questionAsked } from "../../layouts/asking";
import { swallowPress } from "./utils/press";

/**
 * What Quick Add hears from outside it: a press elsewhere only closes it
 * (utils/press `swallowPress`); a turn of the wheel closes it and zooms;
 * Escape closes it. Not while a question is asked over the window
 * (layouts/asking): the press, the wheel and the keys are the question's,
 * and Quick Add stays open, with what was typed in it, for the answer - a
 * "List the plugins online?" or a "Download RDKit?" asked from its own
 * SMILES field was answered with the second click, the first only closing
 * it and the SMILES typed lost.
 */
export function quickAddLeaves(inside: (target: EventTarget | null) => boolean, close: () => void, asked: () => boolean = questionAsked) {
  return {
    outside: (e: Event) => {
      if (inside(e.target) || asked()) return;
      if (e.type === "pointerdown") swallowPress(e);
      close();
    },
    key: (e: KeyboardEvent) => {
      if (e.key !== "Escape" || asked()) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    },
  };
}

/**
 * A key typed while Quick Add is open with none of its icons chosen (no row or field open), and nothing typed into elsewhere:
 * what it does - its letter put in the SMILES field, the field opening (`seed`); or, from an input method, only the field opened
 * and given the focus, so that what it composes is composed there (`focus`); or nothing (null): a key with Ctrl, ⌘ or Alt, a key
 * that writes no letter (Escape, Enter, an arrow), one held down and coming again, or one typed into a field.
 */
export function typedIntoQuickAdd(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat" | "isComposing" | "keyCode" | "target">,
  panelOpen: boolean,
): { seed: string } | { focus: true } | null {
  if (panelOpen || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return null;
  if (e.isComposing || e.key === "Process" || e.keyCode === 229) return { focus: true };
  return e.key.length === 1 && e.key.trim() ? { seed: e.key } : null;
}
