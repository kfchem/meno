import type { EditorState } from "./types";

/**
 * Whether a gesture is under way on the page - a bond or a chain drawn,
 * dragged or traced; a shape, an arrow, an electron-pushing arrow or a
 * stroke of ink being drawn; atoms or the selection moved; a box or a
 * lasso drawn; a wire led; any press held in a drag - a handle's resize, a
 * molecule in 3D turned or moved, a measurement's value set. Undo then
 * lets the gesture go, as Escape does, and undoes nothing more (the
 * maintainer, 2026-10-14): before, it undid the step before the gesture
 * too - the bond a chain was being drawn from.
 */
export function gestureUnderWay(s: EditorState): boolean {
  return (
    s.extend.active ||
    s.shapeDraft != null ||
    s.arrowDraft != null ||
    s.inkDraft != null ||
    (s.pushDraw != null && s.pushDraw.from != null) ||
    s.moveDrag.active ||
    s.boxSelect.active ||
    s.wireDrag != null ||
    s.panHold.active
  );
}

/**
 * Whether words are being typed on the page - an atom's label, or words on
 * the page (LabelTyping2D, CaptionTyping2D). Their field undoes the words
 * typed, as a text field does (pageField); an undo come to the window from
 * anywhere else does nothing, never the document's under them.
 */
export function wordsUnderWay(s: EditorState): boolean {
  return s.labelEdit.active || s.captionEdit != null;
}

/**
 * A gesture lost - the window left (`blur`), the pointer taken from it
 * (`pointercancel`): let go by its own Escape, `escape`, as undo lets it
 * go, and any flag it leaves cleared - or every undo after would be taken
 * for it. What it gives takes the listening away.
 */
export function letLostGesturesGo(target: EventTarget, get: () => EditorState, escape: () => void): () => void {
  const lose = () => {
    if (!gestureUnderWay(get())) return;
    escape();
    get().endGestures();
  };
  target.addEventListener("blur", lose);
  target.addEventListener("pointercancel", lose, { capture: true });
  return () => {
    target.removeEventListener("blur", lose);
    target.removeEventListener("pointercancel", lose, { capture: true });
  };
}
