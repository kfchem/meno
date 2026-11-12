/**
 * A Newman pair's group dragged round the circle, from the press to the release (docs/EDITOR-2D.md, *Projections*): all three groups of its atom turn
 * together, resting every 60 degrees (eclipsed ones offset, so that both show), as one undo step - one move a frame, as every move lays the
 * drawing out again. A turn about the central bond changes no configuration: that is asserted when the button comes up, and a turn that did
 * change one is taken back and said (a fault of Meno's, nothing left moved). Escape lets it go, all of it back where it was.
 */
import type { EditorStore } from "../store";
import { useNotices } from "../../../notices";
import { sameStereo } from "../chem/engineLayout";
import { newmanTurn, newmansIn, turnOf } from "../projections/newman";

type Pt = { x: number; y: number };

/** Whether `atom` is a group of a Newman pair of the tool's that can be turned by it (its groups lie at the places of a set). */
export function newmanTurnable(model: Parameters<typeof newmansIn>[0], atom: number): boolean {
  return newmansIn(model).some((f) => [...f.groups.front, ...f.groups.back].some((g) => g.id === atom) && turnOf(f) != null);
}

/**
 * The turn begun on group `group`. `toWorld` takes a point of the screen to the page; `done` is told when the button comes up, or Escape lets go.
 */
export function newmanTurnGesture(store: EditorStore, toWorld: (cx: number, cy: number) => Pt, group: number, done: (ev: PointerEvent | null) => void): void {
  const start = store.getState().model;
  const gesture = `newman-turn-${performance.now()}`;
  let letGo = false;
  const onMove = (ev: PointerEvent) => {
    if (letGo) return;
    const moves = newmanTurn(start, group, toWorld(ev.clientX, ev.clientY));
    if (moves) store.getState().moveAtoms(moves, gesture);
  };
  const off = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("keydown", onKey, true);
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    letGo = true;
    off();
    store.getState().dropMoveAtoms(gesture);
    done(null);
  };
  const onUp = (ev: PointerEvent) => {
    off();
    if (!letGo && !sameStereo(start, store.getState().model)) {
      store.getState().dropMoveAtoms(gesture);
      useNotices.getState().show({ id: "newman-turn", title: "Newman projection", text: "Turning the groups would have changed the compound, so nothing was moved. That is a fault in Meno, not in the drawing." });
    }
    done(ev);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("keydown", onKey, true);
}
