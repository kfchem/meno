import { describe, expect, it } from "vitest";
import { selectionIsAtom } from "./slices/selectionSlice";

const empty = () => ({
  sel: { atoms: new Set<number>(), bonds: new Set<number>() },
  sel3d: new Set<number>(),
  selFlow: { sets: new Set<number>(), steps: new Set<number>() },
  selPictures: new Set<number>(),
  selTexts: new Set<number>(),
  selCaptions: new Set<number>(),
  selPdfs: new Set<number>(),
});

describe("a selection that is one atom alone", () => {
  it("is that atom, with no other atom, no bond and nothing else selected", () => {
    const st = empty();
    st.sel.atoms.add(3);
    expect(selectionIsAtom(st, 3)).toBe(true);
    expect(selectionIsAtom(st, 4)).toBe(false);
    st.sel.bonds.add(1);
    expect(selectionIsAtom(st, 3)).toBe(false);
    const two = empty();
    two.sel.atoms.add(3).add(4);
    expect(selectionIsAtom(two, 3)).toBe(false);
    const withWords = empty();
    withWords.sel.atoms.add(3);
    withWords.selCaptions.add(9);
    expect(selectionIsAtom(withWords, 3)).toBe(false);
  });
});
