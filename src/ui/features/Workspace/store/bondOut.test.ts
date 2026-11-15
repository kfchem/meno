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
    // (a carbon, by a single bond)
    expect(atom.el).toBe("C");
    expect(st().model.bonds[0]).toMatchObject({ order: 1 });
    expect(doc.history().undoDepth).toBe(before + 1);
    doc.undo();
    expect(st().model.atoms).toHaveLength(1);
  });

  it("draws the bond of the order asked, new atom or closing onto one", () => {
    const { st } = drawing();
    const a = st().addAtom(0, 0, "C");
    const b = st().bondOut(a, { x: 0, y: 5 }, 2)!;
    expect(st().model.bonds[0]).toMatchObject({ order: 2 });
    // (and out of that atom, a chain: the next bond a triple one)
    st().bondOut(b, { x: 0, y: 50 }, 3);
    expect(st().model.bonds).toHaveLength(2);
    expect(st().model.bonds[1]).toMatchObject({ order: 3 });
  });

  it("closes onto an atom near its end with the order asked", () => {
    const { st } = drawing();
    const a = st().addAtom(0, 0, "C");
    const there = st().addAtom(0.1 * NOMINAL_BOND_LENGTH, NOMINAL_BOND_LENGTH, "N");
    expect(st().bondOut(a, { x: 0, y: 5 }, 3)).toBe(there);
    expect(st().model.bonds[0]).toMatchObject({ order: 3 });
  });

  it("closes onto an atom standing near where it would end - the bond alone, one undo step, that atom's id - and is nothing for an atom not there", () => {
    const { doc, st } = drawing();
    const a = st().addAtom(0, 0, "C");
    // (a tenth of a bond off its end: too far to be steered around, near enough to close onto)
    const there = st().addAtom(0.1 * NOMINAL_BOND_LENGTH, NOMINAL_BOND_LENGTH, "N");
    const before = doc.history().undoDepth;
    expect(st().bondOut(a, { x: 0, y: 5 })).toBe(there);
    expect(st().model.atoms).toHaveLength(2);
    expect(st().model.bonds).toHaveLength(1);
    expect(st().model.bonds[0]).toMatchObject({ order: 1 });
    expect([st().model.bonds[0].a, st().model.bonds[0].b].sort()).toEqual([a, there].sort());
    expect(doc.history().undoDepth).toBe(before + 1);
    expect(st().bondOut(9999, { x: 0, y: 5 })).toBeNull();
    expect(doc.history().undoDepth).toBe(before + 1);
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
