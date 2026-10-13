import type { ColourTarget } from "../ColourCard";
import type { MenuTarget } from "../PartMenu";
import type { EditorState } from "../store/types";
import { ringThere } from "./rings";

/** What a right-click menu's part is looked for in. */
type Parts = Pick<
  EditorState,
  "model" | "captions" | "pdfs" | "pictures" | "texts" | "arrows" | "pluses" | "pushes" | "slides" | "shapes" | "inks" | "molecules3d" | "sets" | "steps" | "wires"
>;

const has = (items: readonly { id: number }[], id: number | null) => id != null && items.some((x) => x.id === id);

/**
 * Whether the part a right-click menu was opened on is no longer there -
 * undone away, deleted by a key, taken by a job's end - so that the menu
 * is not left open over nothing, its commands for what is gone. A menu on
 * empty space is about nothing that can go.
 */
export function menuTargetGone(target: MenuTarget, s: Parts): boolean {
  const { kind, id } = target;
  switch (kind) {
    case null:
      return false;
    case "atom":
    case "ring":
      return !has(s.model.atoms, id);
    case "bond":
      return !has(s.model.bonds, id);
    case "caption":
      return !has(s.captions, id);
    case "pdf":
      return !has(s.pdfs, id);
    case "picture":
      return !has(s.pictures, id);
    case "text":
      return !has(s.texts, id);
    case "arrow":
      return !has(s.arrows, id);
    case "plus":
      return !has(s.pluses, id);
    case "push":
      return !has(s.pushes, id);
    case "slide":
      return !has(s.slides, id);
    case "shape":
      return !has(s.shapes, id);
    case "ink":
      return !has(s.inks, id);
    case "molecule3d":
      return !has(s.molecules3d, id);
    case "measure3d": {
      const m = s.molecules3d.find((x) => x.id === id);
      return !m || (target.measure != null && !(m.measures ?? []).some((x) => x.id === target.measure));
    }
    case "set":
      return !has(s.sets, id);
    case "step":
      return !has(s.steps, id);
    case "wire":
      return !has(s.wires, id);
  }
}

/**
 * Whether anything a colour card is for has gone - an atom, a bond, a ring
 * (its atoms, or its closing bond), an arrow, words, a shape, writing - so
 * that the card closes, as a menu over a part gone does: an undo with the
 * card open left its swatches acting on what was no longer drawn.
 */
export function colourTargetGone(target: ColourTarget, s: Parts): boolean {
  const all = (ids: readonly number[] | undefined, items: readonly { id: number }[]) => (ids ?? []).every((id) => has(items, id));
  return !(
    all(target.atoms, s.model.atoms) &&
    all(target.bonds, s.model.bonds) &&
    target.rings.every((k) => ringThere(s.model, k)) &&
    all(target.pushes, s.pushes) &&
    all(target.arrows, s.arrows) &&
    all(target.captions, s.captions) &&
    all(target.shapes, s.shapes) &&
    all(target.inks, s.inks)
  );
}
