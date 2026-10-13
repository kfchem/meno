import type { MenuTarget } from "../PartMenu";
import type { EditorState } from "../store/types";

/** What a right-click menu's part is looked for in. */
type Parts = Pick<
  EditorState,
  "model" | "captions" | "pdfs" | "pictures" | "texts" | "arrows" | "pluses" | "pushes" | "slides" | "shapes" | "inks" | "molecules3d" | "sets" | "steps" | "wires"
>;

const has = (items: readonly { id: number }[], id: number | null) => id != null && items.some((x) => x.id === id);

/**
 * Whether a right-click menu is about the drawing - an atom, a bond, a ring,
 * or a selection with the drawing in it - so that a change to the drawing
 * may have taken what it is about. A step's, a set's, a molecule in 3D's or
 * a page object's menu is not: it goes only when its own part does
 * (`menuTargetGone`), not with every change to the drawing.
 */
export function aboutDrawing(target: MenuTarget): boolean {
  return target.kind === "atom" || target.kind === "bond" || target.kind === "ring" || (target.selection !== "none" && target.drawing !== false);
}

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
