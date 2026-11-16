import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { isName } from "../../../../lib/layout/names";
import { isMetal } from "../../../../lib/layout/perceive";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { createWorkspaceDocument } from "../document";
import { drawnOf } from "../fileActions";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { readDrawn, recordText } from "../utils/copyPaste";
import { cleanUp } from "./cleanUp";
import { drawingOf, forFlatReaders, readAs } from "./drawing";
import { etaRingAt } from "./eta";
import { identityInputOf, identityOfDrawn, labelsDrawnOut } from "./identityOf";

// Foundation part 3, B2 (the maintainer's choice, 2026-11-16): a group typed under a label that is also an element's symbol - Pr, propyl;
// Ac, acetyl; Ts, Fm, At - is held as the group, and every reader of elements is given it as the group's name; Pr with nothing held - a
// file's element column, a SMILES, 3D - is praseodymium, a metal.

const L = NOMINAL_BOND_LENGTH;

function editor(model?: Model) {
  const doc = createWorkspaceDocument();
  if (model) doc.reset({ ...doc.getState(), model, nextId: 2000 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

/** Benzene with `label` typed on one of its H's places, as a chemist types it. */
function benzeneWith(label: string) {
  const e = editor();
  const ring: number[] = [];
  for (let k = 0; k < 6; k++) {
    const t = (Math.PI / 3) * k;
    ring.push(e.state().addAtom(L * Math.cos(t), L * Math.sin(t), "C"));
  }
  for (let k = 0; k < 6; k++) e.state().addBond(ring[k], ring[(k + 1) % 6], k % 2 ? 1 : 2);
  const x = e.state().addAtomBonded(ring[0], 2 * L, 0, "C", 1);
  e.state().beginLabelEdit(x, label.toLowerCase());
  e.state().setLabelEditValue(label);
  e.state().commitLabelEdit(label.toLowerCase());
  return { ...e, ring, x };
}

const mol = (body: string[]) => ["", "  Meno", "", ...body, "M  END"].join("\n");
// PrCl3 from a file's element column: praseodymium, three chlorides
const prCl3 = mol([
  "  4  3  0  0  0  0  0  0  0  0999 V2000",
  "    0.0000    0.0000    0.0000 Pr  0  0  0  0  0  0  0  0  0  0  0  0",
  "    1.5000    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0",
  "   -0.7500    1.3000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0",
  "   -0.7500   -1.3000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0",
  "  1  2  1  0",
  "  1  3  1  0",
  "  1  4  1  0",
]);

describe("a group typed as an element's symbol is the group; the element from a file is the element (B2)", () => {
  it("typed, each of Pr, Ac, Ts, Fm and At holds its group and is read as its name, no element, no metal", () => {
    for (const label of ["Pr", "Ac", "Ts", "Fm", "At"]) {
      const { state, x } = benzeneWith(label);
      const a = state().model.atoms.find((at) => at.id === x)!;
      expect(a.el, label).toBe(label);
      expect(a.abbrev, label).toBeDefined();
      expect(isName(readAs(a)), label).toBe(true);
      expect(isMetal(readAs(a)), label).toBe(false);
      // (and so to the drawing's readers and identity's)
      const i = state().model.atoms.indexOf(a);
      expect(drawingOf(state().model).atoms[i].el, label).toBe(readAs(a));
      expect(identityInputOf(state().model).input.atoms[i].el, label).toBe(readAs(a));
    }
  });

  it("from a file's element column, Pr is praseodymium: the element, a metal ligands are drawn round", () => {
    const model = moleculesToEditorModel(readMoleculesFromText(prCl3, "mol")).model;
    const pr = model.atoms.find((a) => a.el === "Pr")!;
    expect(pr.abbrev).toBeUndefined();
    expect(readAs(pr)).toBe("Pr");
    expect(isMetal(readAs(pr))).toBe(true);
    // (a metal chloride, not a propyl with three chlorines on it: its identity is the element's, apart from a typed propyl's)
    const typed = benzeneWith("Pr").state().model;
    expect(identityOfDrawn(model).text).toMatch(/Pr/);
    expect(identityOfDrawn(typed).text).not.toBe(identityOfDrawn(model).text);
  });

  it("typed Pr on benzene is propylbenzene, C9H12, as the same drawn out", () => {
    const typed = benzeneWith("Pr").state().model;
    const drawnOut = labelsDrawnOut(typed);
    expect(drawnOut.atoms.filter((a) => a.el === "C")).toHaveLength(9);
    expect(drawnOut.atoms.some((a) => a.el === "Pr")).toBe(false);
  });

  it("a bond from praseodymium into a ring binds the ring; from a typed propyl it does not (chem/eta)", () => {
    const at = (id: number, x: number, y: number, el = "C") => ({ id, x, y, r: 0.9, el });
    const ring = Array.from({ length: 6 }, (_, k) => at(k + 1, L * Math.cos((Math.PI / 3) * k), L * Math.sin((Math.PI / 3) * k)));
    const bonds = ring.map((_, k) => ({ id: 10 + k, a: k + 1, b: ((k + 1) % 6) + 1, order: (k % 2 ? 1 : 2) as 1 | 2 }));
    const element = { atoms: [...ring, at(20, 0, 3 * L, "Pr")], bonds };
    expect(etaRingAt(element, 20, { x: 0, y: 0 })).not.toBeNull();
    const typed = benzeneWith("Pr").state().model.atoms.find((a) => a.el === "Pr")!;
    const held = { atoms: [...ring, { ...at(20, 0, 3 * L, "Pr"), abbrev: typed.abbrev }], bonds };
    expect(etaRingAt(held, 20, { x: 0, y: 0 })).toBeNull();
  });

  it("Clean-up lays out a typed Pr as it lays out a typed Bu, a name of as many letters: never as a metal", async () => {
    const placed = async (label: string) => {
      const b = benzeneWith(label);
      await cleanUp(b.store);
      const m = b.state().model;
      return m.atoms.map((a) => [Math.round(a.x * 1000) / 1000, Math.round(a.y * 1000) / 1000]);
    };
    expect(await placed("Pr")).toEqual(await placed("Bu"));
  });

  it("written to a MOL file, a typed Pr is the propyl group, read back as it; never praseodymium", () => {
    const { state } = benzeneWith("Pr");
    const text = writeMolfile(forFlatReaders(drawnOf(state())));
    expect(text).not.toMatch(/\bPr\s+0\s+0/);
    const back = moleculesToEditorModel(readMoleculesFromText(text, "mol")).model;
    const pr = back.atoms.find((a) => a.el === "Pr");
    // (as the group it holds: a label with its atoms, or its atoms drawn out - either way no element)
    if (pr) expect(pr.abbrev).toBeDefined();
    else expect(back.atoms.filter((a) => a.el === "C")).toHaveLength(9);
  });

  it("copied and pasted, a typed Pr stays propyl", () => {
    const { state } = benzeneWith("Pr");
    const copied = readDrawn(JSON.parse(recordText(drawnOf(state()))));
    const pr = copied!.atoms.find((a) => a.el === "Pr")!;
    expect(pr.abbrev).toBeDefined();
    expect(isMetal(readAs(pr))).toBe(false);
  });

  it("a label holding one of them - OPr, Pr2N, NHAc, OAc, AcO - is a name: no element, no metal, no complex", () => {
    for (const label of ["OPr", "Pr2N", "NHAc", "OAc", "AcO"]) {
      const { state, x } = benzeneWith(label);
      const a = state().model.atoms.find((at) => at.id === x)!;
      expect(isMetal(readAs(a)), label).toBe(false);
      expect(isName(readAs(a)), label).toBe(true);
    }
  });

  it("a Pr saved with nothing held - before this version, or from a file - opens as praseodymium", () => {
    const { state } = editor({ atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "Pr" }], bonds: [] });
    const pr = state().model.atoms[0];
    expect(isMetal(readAs(pr))).toBe(true);
  });
});
