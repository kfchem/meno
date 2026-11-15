/**
 * Whether a page holds nothing at all - nothing drawn, in 3D, written, read, placed, talked over, run or being made on it - where its one quiet line
 * shows (components/EmptyPageLine; docs/WORKSPACE.md, *First steps*). Pure.
 */
import { isBlankDocument, type PageHeld } from "../document";
import type { EditorState } from "../store/types";

export function pageHoldsNothing(st: PageHeld & Pick<EditorState, "renderFrames">): boolean {
  // (what a document holds, as everywhere - and a render being made on it)
  return isBlankDocument(st) && !st.renderFrames.length;
}

/**
 * Whether the empty page's line shows: on the workspace in front, where its page holds nothing - and not while the file the tab was
 * opened with is still being read (its page is only waiting for it), a card says what could not be read, Quick Add or a menu is open,
 * something is dragged over the page or a drop is being read, or a talk is given.
 */
export function emptyPageLineShown(s: { active: boolean; empty: boolean; opening: boolean; card: boolean; quickAdd: boolean; menu: boolean; draggedOver: boolean; dropping: boolean; talking: boolean }): boolean {
  return s.active && s.empty && !s.opening && !s.card && !s.quickAdd && !s.menu && !s.draggedOver && !s.dropping && !s.talking;
}
