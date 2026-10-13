import { describe, expect, it } from "vitest";
import type { EditorState } from "../types";
import { createHoverSlice } from "./hoverSlice";

describe("what the pointer is over", () => {
  it("leaves the state as it was where the atom and bond pointed at are as they were - told at every pointer move", () => {
    let state = {
      hovered: { atomId: null, bondId: null },
      moveDrag: { active: false },
      model: { atoms: [{ id: 1 }, { id: 3 }], bonds: [{ id: 2, a: 1, b: 3 }] },
    } as unknown as EditorState;
    const set = (f: (prev: EditorState) => EditorState) => void (state = f(state));
    const hover = createHoverSlice(set as never);
    const before = state;
    hover.clearHovered();
    hover.clearAtomHover();
    hover.clearBondHover();
    expect(state).toBe(before);
    hover.setHoveredFromId(1);
    const onAtom = state;
    expect(onAtom.hovered).toEqual({ atomId: 1, bondId: null });
    hover.setHoveredFromId(1);
    hover.clearBondHover();
    expect(state).toBe(onAtom);
    hover.setHoveredFromId(2);
    expect(state.hovered).toEqual({ atomId: null, bondId: 2 });
    hover.clearHovered();
    expect(state.hovered).toEqual({ atomId: null, bondId: null });
  });
});
