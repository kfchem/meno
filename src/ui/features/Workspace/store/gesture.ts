import type { EditorState } from "./types";

/**
 * Whether a gesture is under way on the page - a bond or a chain drawn,
 * dragged or traced; a shape, an arrow or an electron-pushing arrow being
 * drawn; atoms or the selection moved; a box or a lasso drawn; a wire led;
 * any press held in a drag. Undo then lets the gesture go, as Escape does,
 * and undoes nothing more (the maintainer, 2026-10-14): before, it undid
 * the step before the gesture too - the bond a chain was being drawn from.
 */
export function gestureUnderWay(s: EditorState): boolean {
  return (
    s.extend.active ||
    s.shapeDraft != null ||
    s.arrowDraft != null ||
    (s.pushDraw != null && s.pushDraw.from != null) ||
    s.moveDrag.active ||
    s.boxSelect.active ||
    s.wireDrag != null ||
    s.panHold.active
  );
}
