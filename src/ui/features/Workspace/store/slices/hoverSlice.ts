import { EditorState } from "../types";
import { StoreApi } from "zustand";

type SetState = StoreApi<EditorState>["setState"];

/**
 * The state with the atom and the bond under the pointer as given - the
 * same state where they are as they were: a pointer moving over a drawing
 * says so at every move, and a new state each time drew everything that
 * reads the editor's state again.
 */
function hovering(prev: EditorState, atomId: number | null, bondId: number | null): EditorState {
  return prev.hovered.atomId === atomId && prev.hovered.bondId === bondId ? prev : { ...prev, hovered: { atomId, bondId } };
}

export function createHoverSlice(set: SetState) {
  return {
    setHoveredFromId: (id: number) =>
      set((prev: EditorState) => {
        if (!id) return hovering(prev, null, null);
        // Suppress hover on the moving atom and bonds directly connected to it
        const movingId = prev.moveDrag.active ? prev.moveDrag.atomId : null;
        if (movingId != null) {
          const isMovingAtom = prev.model.atoms.some(
            (a) => a.id === id && a.id === movingId,
          );
          if (isMovingAtom) return prev;
          const isMovingBond = prev.model.bonds.some(
            (b) => b.id === id && (b.a === movingId || b.b === movingId),
          );
          if (isMovingBond) return prev;
        }
        const isAtom = prev.model.atoms.some((a) => a.id === id);
        const isBond = !isAtom && prev.model.bonds.some((b) => b.id === id);
        return hovering(prev, isAtom ? id : null, isBond ? id : null);
      }),

    clearHovered: () => set((prev: EditorState) => hovering(prev, null, null)),

    setHoveredArrow: (id: number | null) =>
      set((prev: EditorState) =>
        prev.hoveredArrow === id ? prev : { ...prev, hoveredArrow: id },
      ),

    setHoveredPlus: (id: number | null) =>
      set((prev: EditorState) =>
        prev.hoveredPlus === id ? prev : { ...prev, hoveredPlus: id },
      ),

    setHoveredMark: (mark: EditorState["hoveredMark"]) =>
      set((prev: EditorState) =>
        JSON.stringify(prev.hoveredMark) === JSON.stringify(mark) ? prev : { ...prev, hoveredMark: mark },
      ),

    clearAtomHover: () => set((prev: EditorState) => hovering(prev, null, prev.hovered.bondId)),

    clearBondHover: () => set((prev: EditorState) => hovering(prev, prev.hovered.atomId, null)),

    triggerHoverPulse: (bondId: number) =>
      set((prev: EditorState) => ({
        ...prev,
        hoverPulse: {
          id: bondId,
          nonce: prev.hoverPulse.nonce + 1,
          until:
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) + 140,
        },
      })),
  };
}
