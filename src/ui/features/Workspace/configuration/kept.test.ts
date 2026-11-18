import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { readDrawn, recordText } from "../utils/copyPaste";
import { keptBondRead, keptCentreRead } from "./kept";
import { watchConfiguration } from "./watch";

// Foundation part 15, phase 2, its second half: the configuration kept on the drawing's own atoms and bonds, in the step that made it, saved
// and copied with it, and what an edit changed said against what is kept.

/** (R)-butan-2-ol drawn flat: C2 (id 1), its methyl (2), its ethyl's CH2 (3) and CH3 (5), its OH (4) on a wedge. */
function butanol(): Model {
  const p = (deg: number, r = L) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  const at = (id: number, q: { x: number; y: number }, el = "C") => ({ id, ...q, r: 0.9, el });
  const c3 = p(330);
  return {
    atoms: [at(1, p(0, 0)), at(2, p(210)), at(3, c3), at(4, p(90), "O"), at(5, { x: c3.x + L * Math.cos(Math.PI / 6), y: c3.y + L * Math.sin(Math.PI / 6) })],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 1, b: 3, order: 1 },
      { id: 12, a: 1, b: 4, order: 1, stereo: "up", narrow: 1 },
      { id: 13, a: 3, b: 5, order: 1 },
    ],
  };
}

function page() {
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model: butanol(), nextId: 100 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const stop = watchConfiguration(store, doc);
  const notes = () => store.getState().configurationNotes.map((n) => n.text);
  const centre = () => doc.getState().model.atoms.find((a) => a.id === 1)!.config;
  return { doc, store, stop, notes, centre };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the configuration kept on the drawing (part 15, phase 2)", () => {
  it("is kept in the step of the change that made it - none for a drawing just opened - and an undo takes it back with the drawing", async () => {
    const { store, doc, centre, stop } = page();
    await vi.runAllTimersAsync();
    // (just opened: nothing kept yet, no step made to keep it)
    expect([centre(), doc.history().undoDepth]).toEqual([undefined, 0]);
    // (a change: what it states kept, in the change's own step - one step, its name the change's)
    store.getState().addAtom(20 * L, 0, "N");
    await vi.runAllTimersAsync();
    expect(doc.history().undoDepth).toBe(1);
    // (the change touched the N alone: the butanol's centre is kept with the first change made to it)
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-1");
    await vi.runAllTimersAsync();
    expect(centre()).toEqual({ set: { neighbours: [2, 3, 4, -1], sense: 1 } });
    expect([doc.history().undoDepth, doc.history().undoLabel]).toEqual([2, "move atoms"]);
    doc.undo();
    expect(centre()).toBeUndefined();
    stop();
  });

  it("says what an edit changed against what is kept: a kept sense that no longer reads so is said turned", async () => {
    const { store, doc, notes, stop } = page();
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-2");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    // (what is kept made the other sense - as a fault of keeping would leave it - and the structure touched: the difference said)
    doc.edit("other", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => (a.id === 1 ? { ...a, config: { set: { neighbours: [2, 3, 4, -1], sense: -1 as const } } } : a)) } }));
    store.getState().moveAtoms([{ id: 5, x: 2.7 * L, y: 0 }], "drag-3");
    await vi.runAllTimersAsync();
    // (the drawing read R before and after the touch: no descriptor tells the two apart, so it is said turned - a fault of keeping, shown)
    expect(notes()).toEqual(["C1: turned"]);
    stop();
  });

  it("is saved and copied with the drawing, read back only where it is whole and of the drawing's own atoms", async () => {
    const { store, doc, stop } = page();
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-4");
    await vi.runAllTimersAsync();
    const model = doc.getState().model;
    const back = readDrawn(JSON.parse(recordText({ ...model })))!;
    expect(back.atoms.find((a) => a.id === 1)!.config).toEqual({ set: { neighbours: [2, 3, 4, -1], sense: 1 } });
    const ids = new Set([1, 2, 3, 4]);
    expect(keptCentreRead({ set: { neighbours: [2, 3, 99, -1], sense: 1 } }, ids)).toBeUndefined();
    expect(keptCentreRead({ set: { neighbours: [2, 3, 4, -1], sense: 2 } }, ids)).toBeUndefined();
    expect(keptCentreRead("open", ids)).toBe("open");
    expect(keptBondRead({ set: { refs: [1, 4], cis: true } }, ids)).toEqual({ set: { refs: [1, 4], cis: true } });
    expect(keptBondRead({ set: { refs: [1], cis: true } }, ids)).toBeUndefined();
    stop();
  });

  it("goes with a drawing pasted, on its new ids: the copy's centre keeps its own atoms", async () => {
    const { store, doc, stop } = page();
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-5");
    await vi.runAllTimersAsync();
    const copied = readDrawn(JSON.parse(recordText({ ...doc.getState().model })))!;
    store.getState().pasteModel(copied);
    await vi.runAllTimersAsync();
    const m = doc.getState().model;
    const pasted = m.atoms.filter((a) => a.id > 5);
    const centre = pasted.find((a) => a.config && a.config !== "open" && "set" in a.config)!;
    const ns = (centre.config as { set: { neighbours: number[] } }).set.neighbours;
    expect(ns.filter((n) => n !== -1).every((n) => pasted.some((a) => a.id === n))).toBe(true);
    expect(store.getState().configurationNotes).toEqual([]);
    stop();
  });
});
