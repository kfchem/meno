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
