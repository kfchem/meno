/**
 * What a molecule in 3D is told to do back - its frame chosen, its atoms
 * hovered, a measurement set - made once for each molecule and kept, so
 * that the molecules drawn are given the same functions every time the
 * set of them is drawn again (components/Molecules3D): a molecule whose
 * own props have not changed is then not drawn again (Molecule3DView,
 * memoised, `sameMoleculeProps`). On a large page, new functions every
 * time made all of its molecules render again whenever any of them
 * changed.
 */
import type { EditorState } from "../store/types";

/** The store the handlers act on: read when each is called, never kept. */
type Store = { getState: () => Pick<EditorState, "setFrame3d" | "sel3d" | "setMagnified3d" | "risen3d" | "setHoveredAtom3d" | "editMeasure3d" | "setMeasure3d"> };

export type MoleculeHandlers = {
  onFrame: (frame: number) => void;
  onMagnify: (k: number, gesture?: string) => void;
  onRisen: () => void;
  onHoverAtom: (atom: number | null) => void;
  onSetMeasure: (measure: number, value: number) => void;
  onEditDone: () => void;
  onRemake: () => void;
};

/**
 * The handlers of molecule `id`, made the first time they are asked for
 * and kept in `kept`. `remake` is read when one is asked for again, so a
 * remake given since is the one called (`Remake3D`).
 */
export function moleculeHandlers(kept: Map<number, MoleculeHandlers>, id: number, store: Store, remake: { current: ((id: number) => void) | null | undefined }): MoleculeHandlers {
  const known = kept.get(id);
  if (known) return known;
  const made: MoleculeHandlers = {
    onFrame: (f) => store.getState().setFrame3d(id, f),
    // (from its mark: it, and those selected with it - each about its own place)
    onMagnify: (k, gesture) => {
      const { sel3d } = store.getState();
      store.getState().setMagnified3d(sel3d.has(id) ? [...sel3d] : [id], k, gesture);
    },
    onRisen: () => store.getState().risen3d(id),
    onHoverAtom: (atom) => store.getState().setHoveredAtom3d(id, atom),
    onSetMeasure: (measure, value) => {
      const st = store.getState();
      st.editMeasure3d(null);
      st.setMeasure3d(id, measure, value);
    },
    onEditDone: () => store.getState().editMeasure3d(null),
    onRemake: () => remake.current?.(id),
  };
  kept.set(id, made);
  return made;
}

/** Whether a molecule's props are the same as before, each by identity: React.memo's own test, said where it is used. */
export function sameMoleculeProps<P extends object>(a: P, b: P): boolean {
  const ka = Object.keys(a) as (keyof P)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}
