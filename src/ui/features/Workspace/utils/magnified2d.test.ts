import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { atTrueSize, centreOf, magnifiedOfAtom, structuresOf } from "../../../../lib/chem/magnified2d";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument, setMagnified2d, type WorkspaceDocument } from "../document";
import type { Atom, Bond, Model } from "../store/types";
import { carriedDrawing } from "./stacks";

const L = NOMINAL_BOND_LENGTH;
const K = 2;

/** Propane, bent, its middle carbon at (0, 0); with an abbreviation, an OMe on its end. */
const propane = (withLabel = false): Model => ({
  atoms: [
    { id: 1, el: "C", x: -L * 0.866, y: -L / 2, r: 0.9 },
    { id: 2, el: "C", x: 0, y: 0, r: 0.9 },
    { id: 3, el: "C", x: L * 0.866, y: -L / 2, r: 0.9 },
    ...(withLabel ? [{ id: 4, el: "OMe", x: L * 0.866 * 2, y: 0, r: 0.9 } as Atom] : []),
  ] as Atom[],
  bonds: [
    { id: 10, a: 1, b: 2, order: 1 },
    { id: 11, a: 2, b: 3, order: 1 },
    ...(withLabel ? [{ id: 12, a: 3, b: 4, order: 1 } as Bond] : []),
  ] as Bond[],
});

/** A canvas over `model` - at its true size, or shown K times as large. */
function editor(model: Model, k: number) {
  const doc = createWorkspaceDocument();
  doc.edit("open", (d) => ({ ...d, model, nextId: 100 }));
  if (k !== 1) doc.edit("magnify", (d) => setMagnified2d(d, model.atoms.map((a) => a.id), k));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

/** Where the structure of `model` is shown about, at true size: what it is magnified about. */
const c0 = (model: Model) => centreOf(model.atoms);
/** A point shown K times as far from `c`. */
const out = (p: { x: number; y: number }, c: { x: number; y: number }) => ({ x: c.x + (p.x - c.x) * K, y: c.y + (p.y - c.y) * K });

/** Whether the drawing at K is the drawing at 1, K times as large about `c`: the same atoms and bonds, each atom so placed and saying K. */
function expectScaled(atK: Model, at1: Model, c: { x: number; y: number }) {
  expect(atK.atoms.map((a) => a.id)).toEqual(at1.atoms.map((a) => a.id));
  expect(atK.bonds.map((b) => [b.a, b.b, b.order])).toEqual(at1.bonds.map((b) => [b.a, b.b, b.order]));
  atK.atoms.forEach((a, i) => {
    const want = out(at1.atoms[i], c);
    expect(a.x).toBeCloseTo(want.x, 6);
    expect(a.y).toBeCloseTo(want.y, 6);
    expect(magnifiedOfAtom(a)).toBe(K);
  });
}

describe("a structure in 2D shown magnified", () => {
  it("is held where it is shown, every atom saying so, and read at its true size by chemistry - byte for byte the same MOL file", () => {
    const one = editor(propane(), 1);
    const two = editor(propane(), K);
    const atK = two.st().model;
    expectScaled(atK, one.st().model, c0(propane()));
    expect(writeMolfile(atK)).toBe(writeMolfile(one.st().model));
    expect(atTrueSize(atK).atoms.every((a) => a.magnified == null)).toBe(true);
    // (as a file keeps it, with what each atom says)
    expect(carriedDrawing(atK, {}).atoms.every((a) => a.magnified === K)).toBe(true);
  });

  it("is edited as at its true size, K times as large about its centre", () => {
    const c = c0(propane(true));
    // (each edit done on a structure at 1 and on it at K, the pointer's points so many times as far from the centre)
    const edits: { name: string; run: (st: ReturnType<typeof editor>["st"], at: (p: { x: number; y: number }) => { x: number; y: number }) => void }[] = [
      {
        name: "a bond drawn out of an atom",
        run: (st, at) => {
          st().startExtend(3, "bond");
          const p = at({ x: L * 0.866 * 2, y: 0.05 });
          st().updateExtend(p.x, p.y);
          st().commitExtend();
        },
      },
      {
        name: "a chain drawn out of an atom",
        run: (st, at) => {
          st().startExtend(1, "chain");
          for (let s = 0.1; s <= 3; s += 0.1) {
            const p = at({ x: -L * 0.866 - s * L, y: -L / 2 + 0.05 });
            st().updateExtend(p.x, p.y);
          }
          st().commitExtend();
        },
      },
      { name: "a label drawn out", run: (st) => st().expandAbbreviation(4) },
      {
        name: "a Clean-up's places, given at true size",
        run: (st) =>
          st().relayout({ atoms: [{ id: 1, x: -L, y: 0 }, { id: 2, x: 0, y: 0 }, { id: 3, x: L, y: 0 }, { id: 4, x: 2 * L, y: 0 }], bonds: [] } as never),
      },
      { name: "a bond deleted - two structures, each as large", run: (st) => st().deleteBond(11) },
      { name: "an atom dropped onto another", run: (st) => st().replaceDraggedAtomWith(4, 3) },
    ];
    for (const e of edits) {
      const one = editor(propane(true), 1);
      const two = editor(propane(true), K);
      e.run(one.st, (p) => p);
      e.run(two.st, (p) => out(p, c));
      const at1 = one.st().model;
      const atK = two.st().model;
      // (each structure it leaves at K, about where it was shown about: the centre of the structure before)
      expect(atK.atoms.length, e.name).toBe(at1.atoms.length);
      expectScaled(atK, at1, c);
    }
  });

  it("is one magnification a structure: joined to one at its true size, the side drawn from keeps its own - and an undo takes the join back whole", () => {
    const { doc, st } = editor(propane(), K);
    // (a lone atom at true size beside it, far off)
    doc.edit("add", (d) => ({ ...d, model: { ...d.model, atoms: [...d.model.atoms, { id: 50, el: "O", x: 10 * L, y: 0, r: 0.9 }] } }));
    const before = doc.getState();
    st().connectAtoms(3, 50);
    const joined = st().model;
    for (const g of structuresOf(joined.atoms, joined.bonds)) {
      const ks = new Set(g.map((i) => magnifiedOfAtom(joined.atoms[i])));
      expect(ks.size).toBe(1);
    }
    expect(magnifiedOfAtom(joined.atoms.find((a) => a.id === 50)!)).toBe(K);
    doc.undo();
    expect(doc.getState()).toBe(before);
    expect(magnifiedOfAtom(st().model.atoms.find((a) => a.id === 50)!)).toBe(1);
    expect(magnifiedOfAtom(st().model.atoms.find((a) => a.id === 1)!)).toBe(K);
  });

  it("goes back to its true size, about its centre, as one step an undo takes back", () => {
    const { doc, st } = editor(propane(), K);
    const before = doc.getState();
    st().setMagnified([2], [], 1);
    const back = st().model;
    back.atoms.forEach((a, i) => {
      expect(a.x).toBeCloseTo(propane().atoms[i].x, 9);
      expect(a.y).toBeCloseTo(propane().atoms[i].y, 9);
      expect(a.magnified).toBeUndefined();
    });
    expect(doc.history().undoLabel).toBe("magnification");
    doc.undo();
    expect(doc.getState()).toBe(before);
  });

  it("is kept by a paste: what was copied comes as large as it was shown", () => {
    const { st } = editor(propane(), K);
    const copied: WorkspaceDocument["model"] = st().model;
    const into = editor({ atoms: [], bonds: [] }, 1);
    into.st().pasteModel({ atoms: copied.atoms, bonds: copied.bonds });
    expect(into.st().model.atoms.every((a) => magnifiedOfAtom(a) === K)).toBe(true);
  });
});
