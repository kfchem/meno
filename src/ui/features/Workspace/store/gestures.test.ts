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
