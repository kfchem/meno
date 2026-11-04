import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from ".";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { newBondFrom } from "../utils/geometry";

function drawing() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

describe("one bond out of an atom, where there is room (a click with Option or Alt held, a double-click)", () => {
  it("goes toward the pointer from a lone atom, a bond long, as one undo step", () => {
    const { doc, st } = drawing();
    const a = st().addAtom(0, 0, "C");
    const before = doc.history().undoDepth;
    const b = st().bondOut(a, { x: 0, y: 5 })!;
    const atom = st().model.atoms.find((x) => x.id === b)!;
    expect(atom.x).toBeCloseTo(0, 6);
    expect(atom.y).toBeCloseTo(NOMINAL_BOND_LENGTH, 6);
    expect(st().model.bonds).toHaveLength(1);
    expect(doc.history().undoDepth).toBe(before + 1);
    doc.undo();
    expect(st().model.atoms).toHaveLength(1);
  });

  it("goes on a chain at 120 degrees from the bond before it, wherever the pointer is", () => {
    const atoms = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: NOMINAL_BOND_LENGTH, y: 0 },
    ];
    const end = newBondFrom(atoms, [{ a: 1, b: 2 }], 2, { x: -10, y: -10 }, NOMINAL_BOND_LENGTH)!;
    const angle = (Math.atan2(end.y - 0, end.x - NOMINAL_BOND_LENGTH) * 180) / Math.PI;
    expect(Math.abs(Math.abs(angle) - 60)).toBeLessThan(1e-6);
    expect(Math.hypot(end.x - NOMINAL_BOND_LENGTH, end.y)).toBeCloseTo(NOMINAL_BOND_LENGTH, 6);
  });

  it("steers clear of an atom standing where it would end, as a double-click's bond does", () => {
    const { st } = drawing();
    const a = st().addAtom(0, 0, "C");
    const there = st().addAtom(0, NOMINAL_BOND_LENGTH, "O");
    const b = st().bondOut(a, { x: 0, y: 5 })!;
    expect(b).not.toBe(there);
    const atom = st().model.atoms.find((x) => x.id === b)!;
    expect(Math.hypot(atom.x, atom.y - NOMINAL_BOND_LENGTH)).toBeGreaterThan(NOMINAL_BOND_LENGTH * 0.3);
  });
});
