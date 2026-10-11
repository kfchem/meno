import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

/** A reaction drawn left to right: two reactants and a "+" between them, an arrow with words over it, a product. */
function reaction() {
  const e = editor();
  const { st } = e;
  const a = st().addAtom(0, 0, "C");
  st().addAtomBonded(a, L, 0, "O");
  const b = st().addAtom(3 * L, 0, "N");
  const plus = st().addPlus(1.9 * L, 0);
  const arrow = st().addArrow(6 * L, 0, 0, 3 * L);
  const words = st().addCaption("NaH", 6 * L, 0.8, arrow);
  const c = st().addAtom(9 * L, 0, "C");
  st().addAtomBonded(c, 10 * L, 0, "N");
  st().addAtomBonded(b, 3 * L, 2 * L, "C");
  st().setSel({ atoms: new Set(st().model.atoms.map((x) => x.id)), bonds: new Set() });
  return { ...e, plus, arrow, words };
}

describe("a reaction turned over", () => {
  it("takes its arrows, \"+\" signs and words with it: left for right, the arrow pointing back, one step", () => {
    const { doc, st, plus, arrow, words } = reaction();
    const depth = doc.history().undoDepth;
    st().turnSelectionOver("vertical");
    // (the atoms span 0 to 10 bonds: mirrored about 5)
    const a = st().arrows.find((x) => x.id === arrow)!;
    expect(a.x).toBeCloseTo(4 * L);
    expect(Math.cos(a.angle)).toBeCloseTo(-1);
    expect(st().pluses.find((x) => x.id === plus)!.x).toBeCloseTo(8.1 * L);
    const w = st().captions.find((x) => x.id === words)!;
    expect(w.x).toBeCloseTo(4 * L);
    expect(w.y).toBeCloseTo(0.8);
    expect(w.arrow).toBe(arrow);
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect(st().arrows.find((x) => x.id === arrow)).toMatchObject({ x: 6 * L, angle: 0 });
    expect(st().captions.find((x) => x.id === words)).toMatchObject({ x: 6 * L, y: 0.8 });
  });

  it("up for down: the words over the arrow come under it, as a mirror shows them", () => {
    const { st, arrow, words } = reaction();
    st().turnSelectionOver("horizontal");
    // (the atoms span 0 to 2 bonds up: mirrored about 1)
    const a = st().arrows.find((x) => x.id === arrow)!;
    expect(a.y).toBeCloseTo(2 * L);
    expect(Math.cos(a.angle)).toBeCloseTo(1);
    expect(st().captions.find((x) => x.id === words)!.y).toBeCloseTo(2 * L - 0.8);
  });
});
