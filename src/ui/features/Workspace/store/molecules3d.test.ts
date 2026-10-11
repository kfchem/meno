import { describe, expect, it, vi } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import { molecules3dIn } from "../utils/selection";
import { readRecord, recordText } from "../utils/copyPaste";
import { linkOf, signatureOf } from "../utils/drawnLink";
import type { CalcInfo } from "../../../../lib/calc/output";

const water = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
    { el: "H", x: 0, y: -0.9, z: 0.3 },
    { el: "H", x: 0, y: -0.9, z: -0.3 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
};

/** A canvas's store over a document holding two molecules in 3D, side by side. */
function editor() {
  const doc = createWorkspaceDocument();
  doc.edit("add", (d) => addMolecule3d(addMolecule3d(d, { ...water, at: { x: 0, y: 0 } }), { ...water, at: { x: 6, y: 0 } }));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("molecules in 3D turned together, as one body", () => {
  const half: [number, number, number, number] = [0, 1, 0, 0]; // (a half turn about the upright)

  it("move as the turn takes them, as one undo step, and the undo puts their turns back too", () => {
    const { doc, state } = editor();
    state().setTurn3d(1, [0, 0, 0, 1]);
    state().turnMolecules3d(
      [
        { id: 1, at: { x: 6, y: 0, z: 2 }, turn: half },
        { id: 2, at: { x: 0, y: 0, z: 2 }, turn: half },
      ],
      "turn-1",
    );
    state().turnMolecules3d(
      [
        { id: 1, at: { x: 6, y: 0, z: 2.5 }, turn: half },
        { id: 2, at: { x: 0, y: 0, z: 2.5 }, turn: half },
      ],
      "turn-1",
    );
    expect(state().molecules3d.map((m) => m.at)).toEqual([
      { x: 6, y: 0, z: 2.5 },
      { x: 0, y: 0, z: 2.5 },
    ]);
    expect(state().turns3d).toEqual({ 1: half, 2: half });
    expect(doc.history().undoLabel).toBe("turn molecules");
    doc.undo();
    expect(state().molecules3d.map((m) => m.at)).toEqual([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
    ]);
    expect(state().turns3d).toEqual({ 1: [0, 0, 0, 1] });
    doc.redo();
    expect(state().turns3d).toEqual({ 1: half, 2: half });
  });

  it("stay one undo step, turns and all, however long the hand pauses in the turn", () => {
    vi.useFakeTimers();
    try {
      const { doc, state } = editor();
      const depth = doc.history().undoDepth;
      state().turnMolecules3d([{ id: 1, at: { x: 1, y: 0, z: 2 }, turn: [0, 0, 1, 0] }], "turn-1");
      vi.advanceTimersByTime(2000);
      state().turnMolecules3d([{ id: 1, at: { x: 2, y: 0, z: 2 }, turn: half }], "turn-1");
      expect(doc.history().undoDepth).toBe(depth + 1);
      doc.undo();
      expect(state().molecules3d[0].at).toEqual({ x: 0, y: 0 });
      expect(state().turns3d[1]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("turned where they stand by the handle: one undo step, which puts the turns back", () => {
    const { doc, state } = editor();
    state().setTurn3d(1, [0, 0, 0, 1]);
    const at = state().molecules3d.map((m) => m.at);
    const before = { 1: state().turns3d[1], 2: state().turns3d[2] };
    state().setTurn3d(1, half);
    state().setTurn3d(2, half);
    state().keepTurns3d(before, { 1: half, 2: half });
    expect(doc.history().undoLabel).toBe("turn molecules");
    doc.undo();
    expect(state().turns3d).toEqual({ 1: [0, 0, 0, 1] });
    expect(state().molecules3d.map((m) => m.at)).toEqual(at);
    doc.redo();
    expect(state().turns3d).toEqual({ 1: half, 2: half });
    // (one turned alone, likewise)
    state().setTurn3d(2, [0, 0, 1, 0]);
    state().keepTurns3d({ 2: half }, { 2: [0, 0, 1, 0] });
    expect(doc.history().undoLabel).toBe("turn molecule");
    doc.undo();
    expect(state().turns3d[2]).toEqual(half);
  });

  it("leave the turns alone on an undo of something else", () => {
    const { doc, state } = editor();
    state().turnMolecules3d([{ id: 1, at: { x: 1, y: 0, z: 2 }, turn: half }], "turn-1");
    state().moveMolecules3d([{ id: 2, at: { x: 9, y: 0 } }]);
    state().setTurn3d(1, [0, 0, 1, 0]);
    doc.undo();
    expect(state().turns3d[1]).toEqual([0, 0, 1, 0]);
    // and a move keeps how high one stands
    expect(state().molecules3d[0].at).toEqual({ x: 1, y: 0, z: 2 });
  });
});

describe("molecules in 3D, chosen and selected", () => {
  it("choose atoms one by one, in order, a fifth or another molecule's starting afresh", () => {
    const { state } = editor();
    for (const a of [0, 1, 2]) state().chooseAtom3d(1, a);
    expect(state().chosen3d).toEqual({ id: 1, atoms: [0, 1, 2], bonds: [] });
    // chosen again: let go
    state().chooseAtom3d(1, 1);
    expect(state().chosen3d).toEqual({ id: 1, atoms: [0, 2], bonds: [] });
    state().chooseAtom3d(1, 3);
    state().chooseAtom3d(1, 4);
    state().chooseAtom3d(1, 1);
    expect(state().chosen3d).toEqual({ id: 1, atoms: [1], bonds: [] });
    state().chooseAtom3d(2, 0);
    expect(state().chosen3d).toEqual({ id: 2, atoms: [0], bonds: [] });
  });

  it("choose bonds too, with atoms, and let them go likewise", () => {
    const { state } = editor();
    state().chooseBond3d(1, 0);
    state().chooseAtom3d(1, 2);
    expect(state().chosen3d).toEqual({ id: 1, atoms: [2], bonds: [0] });
    state().chooseBond3d(1, 0);
    state().chooseAtom3d(1, 2);
    expect(state().chosen3d).toBeNull();
  });

  it("measure what is chosen, as one step, and let it go", () => {
    const { doc, state } = editor();
    state().chooseAtom3d(1, 1);
    state().chooseAtom3d(1, 0);
    state().chooseAtom3d(1, 2);
    state().measureChosen3d();
    expect(state().molecules3d[0].measures).toEqual([{ id: 1, atoms: [1, 0, 2] }]);
    expect(state().chosen3d).toBeNull();
    expect(doc.history().undoLabel).toBe("measure angle");
  });

  it("measure a bond chosen as its length, and two bonds as the angle between them", () => {
    const { state } = editor();
    state().chooseBond3d(1, 1);
    state().measureChosen3d();
    expect(state().molecules3d[0].measures).toEqual([{ id: 1, atoms: [0, 2] }]);
    state().chooseBond3d(1, 0);
    state().chooseBond3d(1, 1);
    state().measureChosen3d();
    expect(state().molecules3d[0].measures?.[1].atoms).toEqual([2, 0, 1]);
  });

  it("are selected whole, alone or with others, and all with everything", () => {
    const { state } = editor();
    state().selectMolecules3d([1]);
    expect([...state().sel3d]).toEqual([1]);
    state().toggleMolecule3dSel(2);
    expect([...state().sel3d]).toEqual([1, 2]);
    state().toggleMolecule3dSel(1);
    expect([...state().sel3d]).toEqual([2]);
    state().clearSel();
    expect(state().sel3d.size).toBe(0);
    state().chooseAtom3d(1, 0);
    state().selectAll();
    expect([...state().sel3d]).toEqual([1, 2]);
    state().clearSel();
    expect(state().chosen3d).toBeNull();
  });

  it("are deleted with the selection, in the same step, and come back with an undo", () => {
    const { doc, state } = editor();
    state().selectMolecules3d([2]);
    state().deleteSelection();
    expect(state().molecules3d.map((m) => m.id)).toEqual([1]);
    expect(state().sel3d.size).toBe(0);
    doc.undo();
    expect(state().molecules3d.map((m) => m.id)).toEqual([1, 2]);
  });

  it("are forgotten by the view when the document no longer has them", () => {
    const { doc, state } = editor();
    state().selectMolecules3d([1, 2]);
    state().chooseAtom3d(2, 1);
    state().setTurn3d(2, [0, 0, 0, 1]);
    state().setFrame3d(2, 0);
    state().setHovered3d({ id: 2 });
    doc.edit("delete", (d) => ({ ...d, molecules3d: d.molecules3d!.filter((m) => m.id !== 2) }));
    expect([...state().sel3d]).toEqual([1]);
    expect(state().chosen3d).toBeNull();
    expect(state().turns3d).toEqual({});
    expect(state().frames3d).toEqual({});
    expect(state().hovered3d).toBeNull();
  });

  it("are taken by a box or a lasso round their centres", () => {
    const ms = [
      { id: 1, at: { x: 0, y: 0 } },
      { id: 2, at: { x: 6, y: 0 } },
    ];
    expect(molecules3dIn(ms, "box", [{ x: -1, y: -1 }, { x: 1, y: 1 }])).toEqual([1]);
    expect(molecules3dIn(ms, "box", [{ x: 7, y: 1 }, { x: -1, y: -1 }])).toEqual([1, 2]);
    const lasso = [
      { x: 5, y: -1 },
      { x: 7, y: -1 },
      { x: 7, y: 1 },
      { x: 5, y: 1 },
    ];
    expect(molecules3dIn(ms, "lasso", lasso)).toEqual([2]);
  });
});

describe("molecules in 3D and their drawings", () => {
  it("rise as one undo step, turned and rising from over the drawing, several one after another", () => {
    const { doc, state } = editor();
    const ids = state().riseMolecules3d([
      { m: { ...water, at: { x: 10, y: 0 } }, turn: [0, 0, 0, 1], from: { x: 1, y: 1 } },
      { m: { ...water, at: { x: 14, y: 0 } }, turn: [0, 1, 0, 0], from: { x: 1, y: 1 } },
    ]);
    expect(ids).toEqual([3, 4]);
    expect(doc.history().undoLabel).toBe("3D structures");
    expect(state().turns3d[4]).toEqual([0, 1, 0, 0]);
    expect(state().rising3d[4].start).toBeGreaterThan(state().rising3d[3].start);
    state().risen3d(3);
    expect(state().rising3d[3]).toBeUndefined();
    doc.undo();
    expect(state().molecules3d.map((m) => m.id)).toEqual([1, 2]);
  });

  it("are made again in place of the one before, as one step, which an undo puts back as it was turned", () => {
    const { doc, state } = editor();
    const turned: [number, number, number, number] = [0, 0, 1, 0];
    state().setTurn3d(1, turned);
    state().riseMolecules3d([{ m: { ...water, at: { x: 0, y: 0 } }, turn: [0, 1, 0, 0], from: { x: 0, y: 0 } }], [1]);
    expect(state().molecules3d.map((m) => m.id)).toEqual([2, 3]);
    expect(state().turns3d[1]).toBeUndefined();
    expect(doc.history().undoLabel).toBe("3D structure made again");
    doc.undo();
    expect(state().molecules3d.map((m) => m.id)).toEqual([1, 2]);
    expect(state().turns3d[1]).toEqual(turned);
    expect(state().turns3d[3]).toBeUndefined();
    // (and a redo, the new one as it was made)
    doc.redo();
    expect(state().turns3d[3]).toEqual([0, 1, 0, 0]);
    expect(state().turns3d[1]).toBeUndefined();
  });

  it("are drawn as a formula, added to the drawing and tied to it, as one step", () => {
    const { doc, state } = editor();
    const formula = {
      atoms: [{ id: 7, x: -5, y: 0, r: 0.9, el: "O" }],
      bonds: [],
    };
    state().drawFormula3d(1, formula, [7, null, null, null, null]);
    const atom = state().model.atoms[0];
    expect(atom.el).toBe("O");
    const m = state().molecules3d[0];
    expect(m.drawnFrom).toEqual([atom.id, null, null, null, null]);
    expect(linkOf(m, state().model)).toBe("live");
    expect(doc.history().undoLabel).toBe("draw as formula");
    doc.undo();
    expect(state().model.atoms).toEqual([]);
    expect(state().molecules3d[0].drawnFrom).toBeUndefined();
  });

  it("pasted with their drawing, are tied to the pasted drawing; pasted alone, to none", () => {
    const { state } = editor();
    const drawing = { atoms: [{ id: 50, x: 0, y: 0, r: 0.9, el: "O" }], bonds: [] };
    const made = { ...water, at: { x: 3, y: 0 }, drawnFrom: [50, null, null, null, null], drawnAs: signatureOf(drawing, [50]) };
    state().pasteModel({ ...drawing, molecules3d: [made] });
    const pasted = state().molecules3d[2];
    const atom = state().model.atoms[0];
    expect(atom.id).not.toBe(50);
    expect(pasted.drawnFrom).toEqual([atom.id, null, null, null, null]);
    expect(linkOf(pasted, state().model)).toBe("live");
    state().pasteModel({ atoms: [], bonds: [], molecules3d: [made] });
    expect(state().molecules3d[3].drawnFrom).toBeUndefined();
  });

  it("copied with their drawing and pasted from the clipboard's record, are tied to the pasted drawing", () => {
    const { state } = editor();
    const drawing = { atoms: [{ id: 50, x: 0, y: 0, r: 0.9, el: "O" }], bonds: [] };
    const made = { ...water, at: { x: 3, y: 0 }, drawnFrom: [50, null, null, null, null], drawnAs: signatureOf(drawing, [50]) };
    state().pasteModel(readRecord(recordText({ ...drawing, molecules3d: [made] }))!);
    const pasted = state().molecules3d[2];
    expect(pasted.drawnFrom).toEqual([state().model.atoms[0].id, null, null, null, null]);
    expect(linkOf(pasted, state().model)).toBe("live");
  });

  it("show their frames overlaid, or not, as the view has it", () => {
    const { state } = editor();
    state().setOverlay3d(2, true);
    expect(state().overlay3d).toEqual({ 2: true });
    state().setOverlay3d(2, false);
    expect(state().overlay3d).toEqual({});
  });
});

describe("molecules in 3D a file brings", () => {
  // an optimisation's three steps, read from a calculation: the file says to show its last
  const steps = { ...water, frames: [water.atoms.flatMap((a) => [a.x, a.y, a.z]), water.atoms.flatMap((a) => [a.x, a.y, a.z + 0.1])], frame: 2 };

  it("show the frame the file says, opened or added beside what is there - and the document keeps no frame of its own", () => {
    const { doc, state } = editor();
    state().openModel({ atoms: [], bonds: [] }, { molecules3d: [{ ...steps, at: { x: 0, y: 0 } }] });
    expect(state().frames3d).toEqual({ 1: 2 });
    expect("frame" in doc.getState().molecules3d![0]).toBe(false);
    state().appendModel({ atoms: [], bonds: [] }, { molecules3d: [{ ...water, at: { x: 9, y: 0 } }, { ...steps, at: { x: 18, y: 0 } }] });
    expect(state().frames3d).toEqual({ 1: 2, 3: 2 });
  });
});

describe("a molecule's calculation's lists", () => {
  // water read from a calculation: its vibrations - the last with no
  // displacements given - and its orbitals, a list with no motion
  const disp = (z: number) => [0, 0, z, 0, -0.43, -0.56, 0, 0.43, -0.56, 0, 0, 0, 0, 0, 0];
  const calc: CalcInfo = {
    readers: ["cclib 1.9rc1"],
    results: [
      {
        id: "vibrations",
        on: "list",
        group: "Vibrations",
        label: "Vibrations",
        columns: [{ label: "Frequency", quantity: "wavenumber" }],
        rows: [{ cells: [1650], move: disp(0.07) }, { cells: [3700], move: disp(0.05) }, { cells: [-120] }],
      },
      { id: "orbitals", on: "list", group: "Orbitals", label: "Molecular orbitals", columns: [{ label: "Orbital" }], rows: [{ cells: ["LUMO"] }, { cells: ["HOMO"], atoms: [0] }] },
    ],
  };
  function calcEditor() {
    const doc = createWorkspaceDocument();
    doc.edit("add", (d) => addMolecule3d(addMolecule3d(d, { ...water, at: { x: 0, y: 0 }, calc }), { ...water, at: { x: 6, y: 0 } }));
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    return { doc, state: () => store.getState() };
  }

  it("are opened one at a time with no row chosen, a row chosen, pointed at, and closed", () => {
    const { state } = calcEditor();
    state().openList3d(1, "vibrations");
    expect(state().lists3d).toEqual({ 1: { list: "vibrations", row: null, pointed: null } });
    state().chooseRow3d(1, 0);
    state().pointRow3d(1, 1);
    expect(state().lists3d[1]).toEqual({ list: "vibrations", row: 0, pointed: 1 });
    state().chooseRow3d(1, null);
    expect(state().lists3d[1].row).toBeNull();
    // (another opened in its place, nothing chosen in it)
    state().chooseRow3d(1, 1);
    state().openList3d(1, "orbitals");
    expect(state().lists3d).toEqual({ 1: { list: "orbitals", row: null, pointed: null } });
    state().closeList3d(1);
    expect(state().lists3d).toEqual({});
  });

  it("are forgotten when their molecule is gone, or has the list no more", () => {
    const { doc, state } = calcEditor();
    state().openList3d(1, "vibrations");
    state().chooseRow3d(1, 1);
    doc.edit("forget", (d) => ({ ...d, molecules3d: d.molecules3d!.map((m) => (m.id === 1 ? { ...m, calc: { readers: ["cclib"] } } : m)) }));
    expect(state().lists3d).toEqual({});
    const again = calcEditor();
    again.state().openList3d(1, "orbitals");
    again.doc.edit("delete", (d) => ({ ...d, molecules3d: d.molecules3d!.filter((m) => m.id !== 1) }));
    expect(again.state().lists3d).toEqual({});
  });
});

describe("a molecule in 3D switched to its other look", () => {
  it("goes to the secondary and back, one undo step each - alone, or with those selected with it", () => {
    const { doc, state } = editor();
    state().switchLook3d(1);
    expect(state().molecules3d.map((m) => m.look)).toEqual(["secondary", undefined]);
    expect(doc.history().undoLabel).toBe("secondary style");
    state().switchLook3d(1);
    expect(state().molecules3d.map((m) => m.look)).toEqual([undefined, undefined]);
    // selected together, both go over to the other look of the one switched
    state().switchLook3d(2);
    state().selectMolecules3d([1, 2], false);
    state().switchLook3d(1);
    expect(state().molecules3d.map((m) => m.look)).toEqual(["secondary", "secondary"]);
    state().switchLook3d(2);
    expect(state().molecules3d.map((m) => m.look)).toEqual([undefined, undefined]);
    doc.undo();
    expect(state().molecules3d.map((m) => m.look)).toEqual(["secondary", "secondary"]);
  });
});

describe("a measurement on a molecule in 3D set to a value", () => {
  /** Propane, C0-C1-C2, with a hydrogen on C2 (3): a molecule of its own, or a conformer set's. */
  const propane = (extra: object = {}) => ({
    atoms: [
      { el: "C", x: 0, y: 0, z: 0 },
      { el: "C", x: 1.5, y: 0, z: 0 },
      { el: "C", x: 2, y: 1.4, z: 0 },
      { el: "H", x: 3, y: 1.5, z: 0.3 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 1 },
      { a1: 2, a2: 3, order: 1 },
    ],
    at: { x: 0, y: 0 },
    measures: [{ id: 1, atoms: [0, 1, 2] }],
    ...extra,
  });
  const store = (m: object) => {
    const doc = createWorkspaceDocument();
    doc.edit("add", (d) => addMolecule3d(d, m as Parameters<typeof addMolecule3d>[1]));
    const s = createEditorStore(doc);
    connectStoreToDocument(s, doc);
    return { doc, state: () => s.getState() };
  };
  const angle = (xyz: { x: number; y: number; z: number }[]) => {
    const u = [xyz[0].x - xyz[1].x, xyz[0].y - xyz[1].y, xyz[0].z - xyz[1].z];
    const v = [xyz[2].x - xyz[1].x, xyz[2].y - xyz[1].y, xyz[2].z - xyz[1].z];
    const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    return (Math.acos(dot / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI;
  };

  it("moves a molecule of its own in place, the last atom's side, one undo step for a whole drag", () => {
    const { doc, state } = store(propane());
    expect(state().setMeasure3d(1, 1, 120, "drag")).toBe(1);
    expect(state().setMeasure3d(1, 1, 112, "drag")).toBe(1);
    const m = state().molecules3d[0];
    expect(angle(m.atoms)).toBeCloseTo(112, 6);
    expect(m.atoms[0]).toEqual({ el: "C", x: 0, y: 0, z: 0 });
    expect(doc.history().undoLabel).toBe("set angle");
    doc.undo();
    expect(state().molecules3d[0].atoms[2]).toEqual({ el: "C", x: 2, y: 1.4, z: 0 });
  });

  it("never edits a result: the edit is a copy beside it, saying what it was made from - one undo step with it", () => {
    const frames = [[0, 0, 0, 1.5, 0, 0, 2.1, 1.3, 0, 3.1, 1.4, 0.3]];
    const { doc, state } = store(propane({ conformerSet: true, frames, energies: [-1, -1.001], numbers: [4, 9] }));
    state().setFrame3d(1, 1);
    const id = state().setMeasure3d(1, 1, 125, "drag");
    expect(id).toBe(2);
    // (dragged on, the copy goes on being edited)
    expect(state().setMeasure3d(id!, 1, 118, "drag")).toBe(2);
    const [orig, copy] = state().molecules3d;
    expect(orig.frames).toEqual(frames);
    expect(copy.edited).toEqual({ from: "conformer 9" });
    expect(copy.frames).toBeUndefined();
    expect(copy.energies).toBeUndefined();
    expect(copy.conformerSet).toBeUndefined();
    expect(angle(copy.atoms)).toBeCloseTo(118, 6);
    expect(copy.at.x).toBeGreaterThan(orig.at.x);
    doc.undo();
    expect(state().molecules3d).toHaveLength(1);
  });

  it("measures what is chosen, in the order chosen, and opens its value to be typed", () => {
    const { state } = store(propane());
    // (measured already the other way along: put in the order chosen)
    for (const a of [2, 1, 0]) state().chooseAtom3d(1, a);
    state().setChosen3d();
    expect(state().molecules3d[0].measures).toEqual([{ id: 1, atoms: [2, 1, 0] }]);
    expect(state().measureEdit3d).toEqual({ id: 1, measure: 1 });
    expect(state().chosen3d).toBeNull();
    // and a new one, measured
    for (const a of [0, 1]) state().chooseAtom3d(1, a);
    state().setChosen3d();
    expect(state().molecules3d[0].measures?.[1]).toEqual({ id: 2, atoms: [0, 1] });
    expect(state().measureEdit3d).toEqual({ id: 1, measure: 2 });
  });
});
