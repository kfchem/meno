import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { bareAtomsOf, bareWords, blocksOf, notStatedIn, standsForMolecule } from "./make3d";
import { figureLabels } from "../utils/figures";
import { readMolfile } from "../../../../lib/chem/ctfile";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { identityOfDrawn } from "./identityOf";
import { isNotStatedText } from "../../../../lib/chem/ligandsNotStated";
import { notStatedAside, notStatedLeft, NOT_STATED_3D_WHY, NOT_STATED_COMPOSITION_WHY } from "../store/slices/stepRuns";

// Invented structures, worked by hand (docs/EDITOR-2D.md, *Ligands not stated*).
const atom = (id: number, el: string, x = 0) => ({ id, x, y: 0, r: 0.9, el });
const lone = (el: string): Model => ({ atoms: [atom(1, el)], bonds: [] });
/** A phenyl drawn on a metal written with its ligands not stated: Ph-PdLn. */
const onPhenyl = (label: string): Model => {
  const ring = [0, 1, 2, 3, 4, 5].map((k) => atom(k + 1, "C", Math.cos((k * Math.PI) / 3) * 1.5));
  return {
    atoms: [...ring, atom(7, label, 3)],
    bonds: [...[0, 1, 2, 3, 4, 5].map((k) => ({ id: k + 1, a: k + 1, b: ((k + 1) % 6) + 1, order: k % 2 ? 1 : 2 })), { id: 7, a: 1, b: 7, order: 1 }],
  } as Model;
};
/** Pd with two X drawn on it. */
const pdX2: Model = { atoms: [atom(1, "Pd"), atom(2, "X", 1.5), atom(3, "X", -1.5)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }, { id: 2, a: 1, b: 3, order: 1 }] } as Model;

describe("a drawn metal whose ligands are not stated", () => {
  it("is the metal in the state, typed, on a structure, or with an X drawn on it", () => {
    for (const l of ["LnPd", "L2Mg", "MgX", "PdL4", "[Pd]L2"]) expect(notStatedIn(lone(l)).map((a) => a.el), l).toEqual([l]);
    expect(notStatedIn(onPhenyl("PdLn")).map((a) => a.id)).toEqual([7]);
    expect(notStatedIn(pdX2).map((a) => a.el)).toEqual(["Pd"]);
    expect(notStatedIn(lone("Li"))).toEqual([]);
    expect(notStatedIn({ atoms: [atom(1, "C"), atom(2, "X", 1.5)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } as Model)).toEqual([]);
  });

  it("is made in 3D never, and the chemist told why, by the path a bare atom takes", () => {
    for (const m of [lone("LnPd"), onPhenyl("PdLn"), pdX2]) {
      expect(standsForMolecule(m)).toBe(false);
      expect(blocksOf(m, m.atoms.map((a) => a.id))).toEqual([]);
    }
    expect(bareWords(bareAtomsOf(lone("LnPd"), [1]), false)).toBe("LnPd has no 3D structure: its ligands are not stated.");
    expect(bareWords(bareAtomsOf(pdX2, [1, 2, 3]), false)).toBe("Pd has no 3D structure: its ligands are not stated.");
    // (beside a structure made, and beside a lone ion: each said by its own why)
    const salt: Model = { atoms: [atom(1, "MgX"), { ...atom(2, "Na", 4), charge: 1 }], bonds: [] } as Model;
    expect(bareWords(bareAtomsOf(salt, [1, 2]), true)).toBe("Na+ was left out: one atom alone has no 3D structure. To take it with its counter-ion, select both, right-click and choose Make one structure first. MgX was left out: its ligands are not stated.");
    // (a lone metal stays one atom alone)
    expect(bareWords(bareAtomsOf(lone("Pd"), [1]), false)).toBe("One atom alone has no 3D structure.");
  });

  it("says in a step's words why none is made and no value given", () => {
    expect(NOT_STATED_3D_WHY).toBe("no 3D structure: its ligands are not stated");
    expect(NOT_STATED_COMPOSITION_WHY).toBe("no formula: its ligands are not stated");
    expect(notStatedLeft([2], 3)).toMatch(/of 3 left out: its ligands are not stated$/);
  });

  it("is a Grignard drawn either way - an X atom on the Mg, or MgX typed as one label: set aside, and compared with none", async () => {
    const xOnMg = { atoms: [atom(1, "C"), atom(2, "Mg", 1.5), atom(3, "X", 3)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }, { id: 2, a: 2, b: 3, order: 1 }] } as Model;
    const typed = { atoms: [atom(1, "C"), atom(2, "MgX", 1.5)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } as Model;
    const methane = lone("C");
    expect(notStatedIn(xOnMg).map((a) => a.el)).toEqual(["Mg"]);
    expect(notStatedIn(typed).map((a) => a.el)).toEqual(["MgX"]);
    // (as Check structures asks: those two set aside, never sent; the plain one asked)
    const asked: Model[][] = [];
    const out = await notStatedAside([xOnMg, typed, methane], async (m) => (asked.push(m), m.map(() => "checked")), "aside");
    expect(out).toEqual(["aside", "aside", "checked"]);
    expect(asked).toEqual([[methane]]);
    // (as Duplicates reads them: identity is never complete, and never the same as another's)
    for (const m of [xOnMg, typed]) {
      const found = identityOfDrawn(m);
      expect(isNotStatedText(found.text)).toBe(true);
      expect(found.complete).toBe(false);
      expect(found.text).not.toBe(identityOfDrawn(m).text);
    }
  });

  it("is the same as no other drawn structure: not Pd, not itself drawn again", () => {
    const a = identityOfDrawn(onPhenyl("PdLn"));
    const b = identityOfDrawn(onPhenyl("PdLn"));
    expect(isNotStatedText(a.text)).toBe(true);
    expect(a.text).not.toBe(b.text);
    expect(a.text).not.toBe(identityOfDrawn(lone("Pd")).text);
    // (lithium stays lithium)
    expect(identityOfDrawn(lone("Li")).text).toBe(identityOfDrawn(lone("Li")).text);
  });

  it("is read by the lens from a figure as written", () => {
    for (const l of ["LnPd", "L2Mg", "MgX", "PdL4"]) expect(figureLabels(l), l).toEqual({ el: l });
  });

  it("goes through a MOL file, V2000 and V3000, as its label, and an X on a metal as the format's X", () => {
    const labels = (text: string) => moleculesToEditorModel(readMoleculesFromText(text, "mol")).model.atoms.map((a) => a.el);
    for (const version of ["V2000", "V3000"] as const) {
      expect(labels(writeMolfile(onPhenyl("PdLn"), { version }))[6], version).toBe("PdLn");
      expect(labels(writeMolfile(lone("L2Mg"), { version })), version).toEqual(["L2Mg"]);
      expect(labels(writeMolfile(pdX2, { version })), version).toEqual(["Pd", "X", "X"]);
    }
    expect(readMolfile(writeMolfile(lone("MgX")))!.atoms[0].alias).toBe("MgX");
  });
});
