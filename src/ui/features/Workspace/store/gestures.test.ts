import { afterEach, describe, expect, it, vi } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { addStroke, createWorkspaceDocument, emptyWorkspaceDocument } from "../document";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

const L = NOMINAL_BOND_LENGTH;

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

describe("a chain on empty space", () => {
  it("is drawn from a new atom where it started, as one undo step", () => {
    const { doc, st } = editor();
    st().startChainAt(0, 0);
    for (let x = 0.1; x <= 3 * L; x += 0.1) st().updateExtend(x, 0.1);
    st().commitExtend();
    expect(st().model.atoms.length).toBeGreaterThanOrEqual(4);
    expect(st().model.bonds.length).toBe(st().model.atoms.length - 1);
    expect(doc.history()).toMatchObject({ undoDepth: 1, undoLabel: "draw chain" });
    doc.undo();
    expect(st().model.atoms).toHaveLength(0);
  });

  it("adds nothing let go where it started", () => {
    const { doc, st } = editor();
    st().startChainAt(0, 0, true);
    st().updateExtend(0.2, 0.1);
    st().commitExtend();
    expect(st().model.atoms).toHaveLength(0);
    expect(doc.history().undoDepth).toBe(0);
  });
});

describe("three clicks on an atom", () => {
  it("take back the bond the double-click drew, while it is the last edit", () => {
    const { doc, st } = editor();
    const a = st().addAtom(0, 0, "C");
    st().addAtomBonded(a, L, 0, "C", 1);
    st().noteDoubleClickBond(a);
    st().takeBackDoubleClickBond(a);
    expect(st().model.atoms).toHaveLength(1);
    // (not when something else has been done since)
    st().addAtomBonded(a, L, 0, "C", 1);
    st().noteDoubleClickBond(a);
    st().addAtom(5, 5, "O");
    st().takeBackDoubleClickBond(a);
    expect(st().model.atoms).toHaveLength(3);
    expect(doc.history().undoLabel).not.toBe(undefined);
  });

  it("take back nothing but the double-click's bond once the history is full, its depth then the same after any edit", () => {
    const { st } = editor();
    for (let i = 0; i < 1001; i++) st().addAtom(i * 3, 50, "O");
    const a = st().addAtom(0, 0, "C");
    st().addAtomBonded(a, L, 0, "C", 1);
    st().noteDoubleClickBond(a);
    // something else drawn before the third click
    st().addAtom(100, 100, "N");
    st().takeBackDoubleClickBond(a);
    expect(st().model.atoms.some((x) => x.el === "N")).toBe(true);
    expect(st().model.bonds).toHaveLength(1);
  });
});

describe("a stroke's nodes", () => {
  it("go off from where `from` says, and close onto the stroke's start (path index -1)", () => {
    let d = emptyWorkspaceDocument();
    d = { ...d, model: { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "C" }], bonds: [] }, nextId: 2 };
    // a branch: 1-a, a-b, then from a: a-c
    const out = addStroke(d, 1, [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1, from: 0 },
      { x: 0, y: 0, pathIndex: -1 },
    ]);
    const bonds = out.model.bonds.map((b) => [b.a, b.b].sort((x, y) => x - y).join("-"));
    // (atoms and bonds share one counter: the new atoms are 2, 4 and 6)
    expect(bonds).toEqual(["1-2", "2-4", "2-6", "1-6"]);
  });
});

describe("a gesture whose atom an undo takes away", () => {
  it("is let go: a bond being drawn out of it, or the atom being dragged", () => {
    const { doc, st } = editor();
    const a = st().addAtom(0, 0, "C");
    st().startExtend(a, "bond");
    st().updateExtend(L, 0.3);
    doc.undo();
    // (drawn on, it was a bond from nowhere, its new atom a lone CH4)
    expect(st().extend.active).toBe(false);
    doc.redo();
    st().beginMoveDrag(a, { x: 0, y: 0 });
    doc.undo();
    expect(st().moveDrag.active).toBe(false);
    // what is still there goes on
    doc.redo();
    const b = st().addAtom(5, 5, "N");
    st().startExtend(a, "chain");
    doc.undo();
    expect(st().model.atoms.some((x) => x.id === b)).toBe(false);
    expect(st().extend.active).toBe(true);
  });
});

describe("a drag held still a while on the way", () => {
  afterEach(() => vi.useRealTimers());

  it("is still one undo step: the selection moved or turned, a mark nudged", () => {
    vi.useFakeTimers();
    const { doc, st } = editor();
    const a = st().addAtom(0, 0, "N");
    const b = st().addAtomBonded(a, L, 0, "C");
    st().stepCharge(a, 1);
    const depth = doc.history().undoDepth;
    // the selection dragged, held still for two seconds - lining it up - and dragged on
    st().moveAtoms([{ id: a, x: 1, y: 0 }, { id: b, x: 1 + L, y: 0 }], "drag-1");
    vi.advanceTimersByTime(2000);
    st().moveAtoms([{ id: a, x: 2, y: 0 }, { id: b, x: 2 + L, y: 0 }], "drag-1");
    expect(doc.history().undoDepth).toBe(depth + 1);
    // a charge's mark, likewise
    st().putMark({ atom: a, kind: "charge" }, { x: 0.3, y: 0.3 }, "mark-1");
    vi.advanceTimersByTime(2000);
    st().putMark({ atom: a, kind: "charge" }, { x: 0.4, y: 0.4 }, "mark-1");
    expect(doc.history().undoDepth).toBe(depth + 2);
    doc.undo();
    doc.undo();
    expect(st().model.atoms.find((x) => x.id === a)).toMatchObject({ x: 0, y: 0 });
  });
});

// (the maintainer, 2026-10-12: Escape during a drag - an atom, the
// selection, a turn of it - puts everything back where it was)
describe("a move let go of by Escape", () => {
  it("puts the atoms back where they were, leaving nothing to undo or redo of it", () => {
    const { doc, st } = editor();
    const a = st().addAtom(0, 0, "C");
    const b = st().addAtom(L, 0, "O");
    st().moveAtoms([{ id: a, x: 1, y: 1 }, { id: b, x: 1 + L, y: 1 }], "drag-1");
    st().moveAtoms([{ id: a, x: 2, y: 2 }, { id: b, x: 2 + L, y: 2 }], "drag-1");
    st().dropMoveAtoms("drag-1");
    expect(st().model.atoms.map((x) => [x.x, x.y])).toEqual([
      [0, 0],
      [L, 0],
    ]);
    expect(doc.history()).toMatchObject({ undoDepth: 2, redoDepth: 0 });
  });

  it("takes nothing back where the drag had not moved anything yet", () => {
    const { doc, st } = editor();
    st().addAtom(0, 0, "C");
    st().dropMoveAtoms("drag-2");
    expect(st().model.atoms).toHaveLength(1);
    expect(doc.history().undoDepth).toBe(1);
  });
});

describe("a bond being drawn, let go of by Escape", () => {
  it("draws nothing when the button comes up", () => {
    const { doc, st } = editor();
    const a = st().addAtom(0, 0, "C");
    st().startExtend(a, "bond");
    st().updateExtend(L, 0.2);
    st().cancelExtend();
    st().commitExtend();
    expect(st().model.atoms).toHaveLength(1);
    expect(doc.history().undoDepth).toBe(1);
  });
});
