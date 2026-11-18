import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { readDrawn, recordText } from "../utils/copyPaste";
import { keptBondRead, keptCentreRead } from "./kept";
import { notesOf, watchConfiguration } from "./watch";
import { configurationChanges } from "./changes";

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

describe("known answers of the chemistry check (part 15, phase 2)", () => {
  /** 2,3,4-trihydroxypentanedioic acid drawn as a zigzag, C1 (id 1) to C5 (id 5), an OH on each of C2, C3, C4 - on a wedge each, `ups` saying which way. */
  function acid(ups: [boolean, boolean, boolean]): Model {
    const at = (id: number, x: number, y: number, el = "C") => ({ id, x: x * L * 0.866, y: y * L, r: 0.9, el });
    const atoms = [
      at(1, 0, 0),
      at(2, 1, 0.5),
      at(3, 2, 0),
      at(4, 3, 0.5),
      at(5, 4, 0),
      at(6, 1, 1.5, "O"),
      at(7, 2, -1, "O"),
      at(8, 3, 1.5, "O"),
      at(9, -1, 0.5, "O"),
      at(10, 0, -1, "O"),
      at(11, 5, 0.5, "O"),
      at(12, 4, -1, "O"),
    ];
    const w = (up: boolean) => (up ? "up" : "down") as "up" | "down";
    const bonds = [
      { id: 20, a: 1, b: 2, order: 1 as const },
      { id: 21, a: 2, b: 3, order: 1 as const },
      { id: 22, a: 3, b: 4, order: 1 as const },
      { id: 23, a: 4, b: 5, order: 1 as const },
      { id: 24, a: 2, b: 6, order: 1 as const, stereo: w(ups[0]), narrow: 2 },
      { id: 25, a: 3, b: 7, order: 1 as const, stereo: w(ups[1]), narrow: 3 },
      { id: 26, a: 4, b: 8, order: 1 as const, stereo: w(ups[2]), narrow: 4 },
      { id: 27, a: 1, b: 9, order: 2 as const },
      { id: 28, a: 1, b: 10, order: 1 as const },
      { id: 29, a: 5, b: 11, order: 2 as const },
      { id: 30, a: 5, b: 12, order: 1 as const },
    ];
    return { atoms, bonds };
  }

  it("2,3,4-trihydroxypentanedioic acid, C2 turned: only C2 said turned - C3's label follows, said by its mark, not as a change", async () => {
    const before = acid([true, true, true]);
    const after = acid([false, true, true]);
    const changes = configurationChanges(before, after);
    expect(changes).toEqual([{ unit: { kind: "centre", at: 2 }, how: "inverted" }]);
    const notes = await notesOf(before, after, changes, undefined);
    expect(notes.map((n) => n.text)).toEqual([expect.stringMatching(/^C2: [RS], now [RS]$/)]);
  });

  it("says nothing for a drawing pasted or opened, and keeps its configuration bit for bit through a save and an open", async () => {
    const { store, doc, notes, stop } = page();
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-6");
    await vi.runAllTimersAsync();
    const kept = JSON.stringify(doc.getState().model.atoms.map((a) => a.config ?? null));
    // (pasted beside it, as copied: no note)
    store.getState().pasteModel(readDrawn(JSON.parse(recordText({ ...doc.getState().model })))!);
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    // (saved and opened: what is kept, as it was)
    const opened = readDrawn(JSON.parse(recordText({ ...doc.getState().model })))!;
    expect(JSON.stringify(opened.atoms.filter((a) => a.id <= 5).map((a) => a.config ?? null))).toBe(kept);
    // (opened as a new drawing: nothing said)
    store.getState().replaceModel(opened);
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    stop();
  });
});
