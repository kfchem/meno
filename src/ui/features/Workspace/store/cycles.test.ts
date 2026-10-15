import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { clipItems, readDrawn } from "../utils/copyPaste";
import { selectedBox } from "../utils/extent";

const B = NOMINAL_BOND_LENGTH;

/** Store wired to a document, the way a workspace tab is put together. */
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("a catalytic cycle among the rest of the page", () => {
  it("is selected with all of it", () => {
    const { state } = editor();
    const id = state().addCycle({ x: 0, y: 0, r: 4 * B })!;
    state().addAtom(10 * B, 0, "O");
    state().selectAll();
    expect([...state().selCycles]).toEqual([id]);
  });

  it("is copied alone, and pasted", () => {
    const { state } = editor();
    state().addCycle({ x: 0, y: 0, r: 4 * B, branches: [{ at: 1, way: "in" }] });
    const items = clipItems({ atoms: [], bonds: [], cycles: state().cycles } as never);
    expect(items.map((i) => i.flavor)).toEqual(["meno"]);
    const back = readDrawn(JSON.parse(items[0].text ?? "null"));
    expect(back?.cycles).toHaveLength(1);
    state().pasteModel(back!);
    expect(state().cycles).toHaveLength(2);
    expect(state().selCycles.size).toBe(1);
  });

  it("is in the box round what is selected: its circle", () => {
    const { state } = editor();
    const id = state().addCycle({ x: 2 * B, y: -B, r: 4 * B })!;
    state().selectCycles([id]);
    const b = selectedBox(state(), styleOf(DEFAULT_STYLE_CHOICE));
    expect(b).toEqual({ x0: -2 * B, y0: -5 * B, x1: 6 * B, y1: 3 * B });
  });

  it("is turned over with what is selected: mirrored, going the other way, its arrows in and out mirrored", () => {
    const { state } = editor();
    const id = state().addCycle({ x: 4 * B, y: 0, r: 2 * B, branches: [{ at: 0, way: "out" }] })!;
    state().addAtom(0, 0, "O");
    state().selectAll();
    // (the middle of all of it: the atom at 0 and the circle from 2 to 6 bonds - 3)
    state().turnSelectionOver("vertical");
    const c = state().cycles.find((x) => x.id === id)!;
    expect(c.x).toBeCloseTo(2 * B);
    expect(c.ccw).toBe(true);
    expect(c.branches![0].at).toBeCloseTo(Math.PI);
    // (and back: as it was)
    state().turnSelectionOver("vertical");
    const d = state().cycles.find((x) => x.id === id)!;
    expect(d.x).toBeCloseTo(4 * B);
    expect(d.ccw).toBeUndefined();
    expect(d.branches![0].at).toBeCloseTo(0);
  });
});
