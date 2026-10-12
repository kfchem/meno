import { describe, expect, it, vi } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { partToCopy, readRecord, recordText } from "../utils/copyPaste";
import { drawnOf, structureFileText } from "../fileActions";
import { editorModelOf, stackedRead } from "../utils/io";
import { recordsOf, seenDrawing, STACK_SWAP_MS } from "../utils/stacks";

const TITLES = ["methanol", "ethanol", "propanol"];

/** A file's three records drawn flat, side by side, as Meno reads an SD file: each a C-O, titled. */
function read() {
  const atoms = [0, 1, 2].flatMap((k) => [
    { id: 2 * k + 1, x: 10 * k, y: 0, r: 0.9, el: "C" },
    { id: 2 * k + 2, x: 10 * k + 1.5, y: 0, r: 0.9, el: "O" },
  ]);
  const bonds = [0, 1, 2].map((k) => ({ id: 100 + k, a: 2 * k + 1, b: 2 * k + 2, order: 1 as const }));
  return stackedRead({ model: { atoms, bonds }, centroid: { x: 10.75, y: 0 }, records: [0, 1, 2].map((k) => ({ atoms: [2 * k + 1, 2 * k + 2], title: TITLES[k] })) });
}

/** A canvas's store over a document opened on that file. */
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().openModel(editorModelOf(read().model));
  return { doc, state: () => store.getState() };
}

const ids = (atoms: readonly { id: number }[]) => atoms.map((a) => a.id);
const middleOf = (atoms: readonly { x: number; y: number }[]) => ({ x: atoms.reduce((t, a) => t + a.x, 0) / atoms.length, y: atoms.reduce((t, a) => t + a.y, 0) / atoms.length });

describe("a stack of drawings", () => {
  it("is a file's records drawn flat, standing in one place, its first shown - the file centred on it", () => {
    const r = read();
    expect(r.centroid.x).toBeCloseTo(10.75, 9);
    const { state } = editor();
    expect(ids(state().model.atoms)).toEqual([1, 2]);
    expect(state().model.bonds.map((b) => b.id)).toEqual([100]);
    expect(state().fullModel.atoms).toHaveLength(6);
    const records = recordsOf(state().fullModel, 1);
    expect(records.map((x) => x.title)).toEqual(TITLES);
    const at = (k: number) => middleOf(state().fullModel.atoms.filter((a) => records[k].atoms.includes(a.id)));
    expect(at(1)).toEqual(at(0));
    expect(at(2)).toEqual(at(0));
  });

  it("shows another record - selected in its place, where the one it showed was", () => {
    const { state } = editor();
    state().selectAll();
    state().showRecord(1, 2);
    expect(state().recordsShown).toEqual({ 1: 2 });
    expect(ids(state().model.atoms)).toEqual([5, 6]);
    expect([...state().sel.atoms]).toEqual([5, 6]);
    expect([...state().sel.bonds]).toEqual([102]);
    // (not one it does not have)
    state().showRecord(1, 7);
    expect(state().recordsShown).toEqual({ 1: 2 });
  });

  it("goes over from one record to the next, the next drawn as it comes until it is there - and, stacked again, the others going where they stood", () => {
    vi.useFakeTimers();
    try {
      const { state } = editor();
      state().showRecord(1, 1);
      expect(state().recordSwaps[1]).toMatchObject({ from: [1, 2], to: [3, 4] });
      vi.advanceTimersByTime(STACK_SWAP_MS);
      expect(state().recordSwaps).toEqual({});
      state().spreadRecords(1);
      state().gatherRecords(1, 2);
      expect(state().recordSwaps[1].to).toEqual([]);
      expect(ids(state().recordSwaps[1].gone!.atoms).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
      vi.advanceTimersByTime(STACK_SWAP_MS);
      expect(state().recordSwaps).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });

  it("is selected all by the record it shows, with the rest of the drawing", () => {
    const { state } = editor();
    state().addBondedPair({ x: 0, y: 9 }, { x: 1.5, y: 9 });
    state().selectAll();
    expect([...state().sel.atoms].sort((a, b) => a - b)).toEqual([1, 2, 103, 104]);
  });

  it("moved by the record it shows, whole, goes with it - that record's atom moved alone, not", () => {
    const { state } = editor();
    const was = state().fullModel.atoms.map((a) => ({ ...a }));
    state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: a.x + 5, y: a.y - 2 })), "drag");
    state().fullModel.atoms.forEach((a, i) => {
      expect(a.x).toBeCloseTo(was[i].x + 5, 9);
      expect(a.y).toBeCloseTo(was[i].y - 2, 9);
    });
    state().moveAtom(1, 0, 0);
    expect(state().fullModel.atoms.find((a) => a.id === 3)!.x).toBeCloseTo(was[2].x + 5, 9);
  });

  it("keeps what is drawn onto a record with that record, out of sight with it", () => {
    const { state } = editor();
    const added = state().addAtomBonded(1, 0, 3);
    expect(added).not.toBeNull();
    const atom = state().fullModel.atoms.find((a) => a.id === added);
    expect(atom?.stack).toMatchObject({ id: 1, record: 0, title: "methanol" });
    state().showRecord(1, 1);
    expect(ids(state().model.atoms)).toEqual([3, 4]);
  });

  it("deleted, shows its first left; left with one record, is that record alone", () => {
    const { state } = editor();
    state().selectAll();
    state().deleteSelection();
    expect(ids(state().model.atoms)).toEqual([3, 4]);
    state().selectAll();
    state().deleteSelection();
    expect(ids(state().model.atoms)).toEqual([5, 6]);
    expect(state().fullModel.atoms.every((a) => !a.stack)).toBe(true);
  });

  it("is saved whole - every record, the one it shows marked - and opened so, however it was edited", () => {
    const { state } = editor();
    state().showRecord(1, 1);
    state().stepCharge(3, 1);
    const text = workspaceText(state());
    const saved = JSON.parse(text) as { atoms: { id: number; stack?: { shown?: true } }[] };
    expect(saved.atoms).toHaveLength(6);
    expect(saved.atoms.filter((a) => a.stack?.shown).map((a) => a.id)).toEqual([3, 4]);
    const other = editor();
    other.state().openWorkspace(readWorkspace(text)!, true);
    expect(other.state().fullModel.atoms).toHaveLength(6);
    expect(other.state().recordsShown).toEqual({ 1: 1 });
    expect(ids(other.state().model.atoms)).toEqual([3, 4]);
    expect(other.state().fullModel.atoms.find((a) => a.id === 3)?.charge).toBe(1);
    // (which it shows is the view's, not the document's)
    expect(other.state().fullModel.atoms.some((a) => a.stack?.shown)).toBe(false);
  });

  it("is laid out as a grid in one undo step, every record shown, and stacked again in its middle in another", () => {
    const { doc, state } = editor();
    const stacked = state().fullModel.atoms.map((a) => ({ x: a.x, y: a.y }));
    state().spreadRecords(1);
    expect(doc.history().undoLabel).toBe("lay out as a grid");
    expect(state().model.atoms).toHaveLength(6);
    const middles = recordsOf(state().fullModel, 1).map((r) => middleOf(state().fullModel.atoms.filter((a) => r.atoms.includes(a.id))));
    expect(new Set(middles.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)).size).toBe(3);
    state().selectAll();
    expect(state().sel.atoms.size).toBe(6);
    state().gatherRecords(1, 2);
    expect(doc.history().undoLabel).toBe("stack again");
    expect(state().recordsShown).toEqual({ 1: 2 });
    expect(ids(state().model.atoms)).toEqual([5, 6]);
    state().fullModel.atoms.forEach((a, i) => {
      expect(a.x).toBeCloseTo(stacked[i].x, 9);
      expect(a.y).toBeCloseTo(stacked[i].y, 9);
    });
    doc.undo();
    doc.undo();
    expect(state().fullModel.atoms.every((a) => a.stack && !a.stack.spread)).toBe(true);
  });

  it("is copied by the record it shows, pasted as a drawing of its own; carried whole, pasted as a stack showing the same", () => {
    const { doc, state } = editor();
    state().showRecord(1, 1);
    state().selectAll();
    const part = partToCopy(drawnOf(state()), state().sel, null)!;
    expect(ids(part.atoms)).toEqual([3, 4]);
    state().pasteModel(readRecord(recordText(part))!);
    const pasted = state().fullModel.atoms.slice(-2);
    expect(pasted.every((a) => !a.stack)).toBe(true);
    // (the whole drawing carried - a document's record - pasted: a stack of its own, numbered on, showing the record it showed)
    const start = doc.getState().nextId;
    state().pasteModel(readRecord(recordText(drawnOf(state())))!);
    const again = state().fullModel.atoms.filter((a) => a.stack?.id === 2);
    expect(again).toHaveLength(6);
    expect(state().recordsShown[2]).toBe(1);
    expect(state().model.atoms.filter((a) => a.stack?.id === 2).map((a) => a.stack!.record)).toEqual([1, 1]);
    // (selected as it is shown: the record it shows, and what came with it)
    expect([...state().sel.atoms]).toEqual(ids(state().model.atoms.filter((a) => a.id >= start)));
    expect(state().sel.atoms.size).toBe(4);
  });

  it("is exported as it is seen - but to an SD file every record, each titled as its file titled it", () => {
    const { state } = editor();
    state().showRecord(1, 2);
    const drawn = drawnOf(state());
    expect(ids(seenDrawing(drawn).atoms)).toEqual([5, 6]);
    const sdf = structureFileText(drawn, "/tmp/out.sdf");
    expect(sdf.split("$$$$\n").filter(Boolean).map((r) => r.split("\n")[0])).toEqual(TITLES);
    const mol = structureFileText(drawn, "/tmp/out.mol");
    expect(mol.split("\n")[3].trim().startsWith("2  1")).toBe(true);
  });
});
