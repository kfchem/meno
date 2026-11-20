/**
 * A group written as its label, read as the atoms it holds (chem/identityOf `labelsDrawnOut`): a label of one element and its H
 * (OH, HO, SH, NH2, H2N) is that element, and a group's label read outward from a bond on its right (MeO, AcO, HO2C) is the group -
 * so that identity, and what reads a group's size, read the same structure whether it is written by its label or drawn out.
 */
import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { identityOfDrawn, labelsDrawnOut } from "./identityOf";
import { drawnFromSmiles } from "./testdata/identityCases";

/** `smiles` drawn, its atom at `at` (by place, a terminal one) written as the label `label` instead. */
function labelled(smiles: string, at: number, label: string): Model {
  const m = drawnFromSmiles(smiles);
  return { ...m, atoms: m.atoms.map((a, i) => (i === at ? { ...a, el: label } : a)) };
}
const read = (m: Model) => identityOfDrawn(labelsDrawnOut(m)).text;

describe("a group written as its label, read as its atoms", () => {
  it("reads a label of one element and its H, either way round, as that element: ethanol, ethanethiol, ethylamine", () => {
    for (const [smiles, labels] of [
      ["CCO", ["OH", "HO"]],
      ["CCS", ["SH", "HS"]],
      ["CCN", ["NH2", "H2N"]],
    ] as const) {
      const drawn = read(drawnFromSmiles(smiles));
      for (const label of labels) expect(read(labelled(smiles, 2, label)), `${smiles} ${label}`).toBe(drawn);
    }
  });

  it("keeps the configuration of a centre beside it: (R)- and (S)-butan-2-ol with OH written as a label are themselves, not each other", () => {
    const R = "C[C@@H](O)CC";
    const S = "C[C@H](O)CC";
    expect(read(labelled(R, 2, "OH"))).toBe(read(drawnFromSmiles(R)));
    expect(read(labelled(S, 2, "HO"))).toBe(read(drawnFromSmiles(S)));
    expect(read(labelled(R, 2, "OH"))).not.toBe(read(labelled(S, 2, "OH")));
  });

  it("reads a group's label read outward from a bond on its right as the group: MeO, AcO, MeS, Me2N, HO2C", () => {
    for (const [smiles, at, label] of [
      ["c1ccccc1OC", 6, "MeO"],
      ["c1ccccc1OC(C)=O", 6, "AcO"],
      ["c1ccccc1SC", 6, "MeS"],
      ["c1ccccc1N(C)C", 6, "Me2N"],
      ["c1ccccc1C(=O)O", 6, "HO2C"],
    ] as const) {
      const m = drawnFromSmiles(smiles);
      // (the label on the ring atom's group, its other atoms gone)
      const keep = new Set(m.atoms.slice(0, at + 1).map((a) => a.id));
      const part: Model = {
        atoms: m.atoms.filter((a) => keep.has(a.id)).map((a, i) => (i === at ? { ...a, el: label } : a)),
        bonds: m.bonds.filter((b) => keep.has(b.a) && keep.has(b.b)),
      };
      expect(read(part), label).toBe(read(m));
    }
  });

  it("leaves a label whose H its bonds do not leave, and a word it does not know, as they are", () => {
    for (const label of ["SH3", "NH4"]) {
      const m = labelled("CCO", 2, label);
      expect(labelsDrawnOut(m).atoms.map((a) => a.el), label).toContain(label);
    }
    const word = labelled("CCO", 2, "xyz");
    expect(labelsDrawnOut(word).atoms.map((a) => a.el)).toContain("xyz");
  });
});
