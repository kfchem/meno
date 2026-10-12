import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { addMolecule3d, createWorkspaceDocument, withImportedScheme } from "../document";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { clipItems, readRecord, recordText } from "../utils/copyPaste";
import { copiedMolecules } from "../clipboardActions";
import { hiddenInStacks } from "../utils/stacks";

const water = (x = 0) => ({
  atoms: [
    { el: "O", x: 0 + x / 100, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
});
const half: [number, number, number, number] = [0, 1, 0, 0];

/** A canvas's store over a document holding a stack of three molecules from one file, as opening it makes them, and one of its own. */
function editor() {
  const doc = createWorkspaceDocument();
  doc.edit("open", (d) =>
    addMolecule3d(
      withImportedScheme(d, { molecules3d: [1, 2, 3].map((k) => ({ ...water(k), at: { x: 0, y: 0 }, stack: { id: 1 } })) }),
      { ...water(), at: { x: 9, y: 0 } },
    ),
  );
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("a stack of molecules in 3D", () => {
  it("is made of a file's molecules, numbered as the document's own stacks - one alone in it is none", () => {
    const { doc, state } = editor();
    expect(state().molecules3d.map((m) => m.stack?.id ?? null)).toEqual([1, 1, 1, null]);
    doc.edit("open again", (d) => withImportedScheme(d, { molecules3d: [1, 2].map((k) => ({ ...water(k), at: { x: 0, y: 9 }, stack: { id: 1 } })) }));
    expect(state().molecules3d.slice(4).map((m) => m.stack?.id)).toEqual([2, 2]);
    doc.edit("paste one", (d) => withImportedScheme(d, { molecules3d: [{ ...water(), at: { x: 0, y: 9 }, stack: { id: 1 } }] }));
    expect(state().molecules3d[6].stack).toBeUndefined();
  });

  it("shows one at a time, the next turned as the one it showed - and selected in its place, where that was", () => {
    const { state } = editor();
    expect([...hiddenInStacks(state().molecules3d, state().stacksShown)]).toEqual([2, 3]);
    state().setTurn3d(1, half);
    state().selectMolecules3d([1]);
    state().showInStack(1, 3);
    expect(state().stacksShown).toEqual({ 1: 3 });
    expect(state().turns3d[3]).toEqual(half);
    expect([...state().sel3d]).toEqual([3]);
    expect([...hiddenInStacks(state().molecules3d, state().stacksShown)]).toEqual([1, 2]);
    // (not one of its own)
    state().showInStack(1, 4);
    expect(state().stacksShown).toEqual({ 1: 3 });
  });

  it("is selected all by the one it shows, and moved whole by it", () => {
    const { state } = editor();
    state().selectAll();
    expect([...state().sel3d]).toEqual([1, 4]);
    state().moveMolecules3d([{ id: 1, at: { x: 2, y: 1 } }]);
    expect(state().molecules3d.map((m) => m.at)).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 1 },
      { x: 9, y: 0 },
    ]);
  });

  it("is laid out as a grid in one undo step, every one shown, and stacked again in its middle in another", () => {
    const { doc, state } = editor();
    state().spreadStack(1);
    expect(doc.history().undoLabel).toBe("lay out as a grid");
    const places = state().molecules3d.slice(0, 3).map((m) => m.at);
    expect(new Set(places.map((p) => `${p.x},${p.y}`)).size).toBe(3);
    expect(hiddenInStacks(state().molecules3d, state().stacksShown).size).toBe(0);
    state().selectAll();
    expect([...state().sel3d]).toEqual([1, 2, 3, 4]);
    state().gatherStack(1, 2);
    expect(doc.history().undoLabel).toBe("stack again");
    expect(state().stacksShown).toEqual({ 1: 2 });
    // (where it stood as it was laid out)
    for (const m of state().molecules3d.slice(0, 3)) {
      expect(m.at.x).toBeCloseTo(0, 9);
      expect(m.at.y).toBeCloseTo(0, 9);
    }
    doc.undo();
    expect(state().molecules3d.slice(0, 3).map((m) => m.at)).toEqual(places);
    doc.undo();
    expect(state().molecules3d.slice(0, 3).every((m) => !m.stack?.spread && m.at.x === 0 && m.at.y === 0)).toBe(true);
  });

  it("left with one, is that one alone; and shows its first again where the one it showed is deleted", () => {
    const { state } = editor();
    state().showInStack(1, 2);
    state().selectMolecules3d([2]);
    state().deleteSelection();
    expect(state().stacksShown).toEqual({});
    expect([...hiddenInStacks(state().molecules3d, state().stacksShown)]).toEqual([3]);
    state().selectMolecules3d([1]);
    state().deleteSelection();
    expect(state().molecules3d.map((m) => [m.id, m.stack ?? null])).toEqual([
      [3, null],
      [4, null],
    ]);
  });

  it("is saved as it is - its molecules, whether laid out, and the one it shows - and opened so", () => {
    const { doc, state } = editor();
    // (each record's title too, which its chip says)
    doc.edit("titled", (d) => ({ ...d, molecules3d: d.molecules3d!.map((m, i) => (i === 1 ? { ...m, title: "aspirin" } : m)) }));
    state().showInStack(1, 2);
    const text = workspaceText(state());
    const other = editor();
    other.state().openWorkspace(readWorkspace(text)!, true);
    expect(other.state().molecules3d.map((m) => m.stack?.id ?? null)).toEqual([1, 1, 1, null]);
    expect(other.state().stacksShown).toEqual({ 1: 2 });
    expect(other.state().molecules3d[1].title).toBe("aspirin");
    state().spreadStack(1);
    other.state().openWorkspace(readWorkspace(workspaceText(state()))!, true);
    expect(other.state().molecules3d.slice(0, 3).every((m) => m.stack?.spread)).toBe(true);
  });

  it("is copied by the one it shows, pasted as a molecule of its own", () => {
    const { state } = editor();
    state().showInStack(1, 2);
    const carried = copiedMolecules(state(), [2]);
    expect(carried).toHaveLength(1);
    const part = readRecord(recordText({ atoms: [], bonds: [], molecules3d: carried }))!;
    expect(clipItems(part).length).toBeGreaterThan(0);
    state().pasteModel(part);
    const pasted = state().molecules3d[state().molecules3d.length - 1];
    expect(pasted.stack).toBeUndefined();
  });
});
