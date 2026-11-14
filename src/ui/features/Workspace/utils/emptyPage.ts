/**
 * Whether a page holds nothing at all - nothing drawn, in 3D, written, read, placed, run or being made on it - where its one quiet line
 * shows (components/EmptyPageLine; docs/WORKSPACE.md, *First steps*). Pure.
 */
import type { EditorState } from "../store/types";

type Held = Pick<
  EditorState,
  "model" | "molecules3d" | "captions" | "arrows" | "pluses" | "pictures" | "pdfs" | "texts" | "slides" | "shapes" | "inks" | "cycles" | "steps" | "sets" | "renderFrames"
>;

export function pageHoldsNothing(st: Held): boolean {
  return [st.model.atoms, st.molecules3d, st.captions, st.arrows, st.pluses, st.pictures, st.pdfs, st.texts, st.slides, st.shapes, st.inks, st.cycles, st.steps, st.sets, st.renderFrames].every((list) => !list?.length);
}

/**
 * Whether the empty page's line shows: on the workspace in front, where its page holds nothing - and not while Quick Add or a menu is
 * open, something is dragged over the page or a drop is being read, or a talk is given.
 */
export function emptyPageLineShown(s: { active: boolean; empty: boolean; quickAdd: boolean; menu: boolean; draggedOver: boolean; dropping: boolean; talking: boolean }): boolean {
  return s.active && s.empty && !s.quickAdd && !s.menu && !s.draggedOver && !s.dropping && !s.talking;
}
