/**
 * A group written as its label, read as the atoms it holds (chem/identityOf `labelsDrawnOut`): a label of one element and its H
 * (OH, HO, SH, NH2, H2N) is that element, and a group's label read outward from a bond on its right (MeO, AcO, HO2C) is the group -
 * only there: right of its bond a label reads as written, its first symbol the bonded atom (IUPAC GR-2.1.6) -
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
      // (the label on the ring atom's group, its other atoms gone, left of the ring atom it is bonded to, level with it)
      const keep = new Set(m.atoms.slice(0, at + 1).map((a) => a.id));
      const ringAtom = m.atoms.find((a) => m.bonds.some((b) => keep.has(a.id) && a.id !== m.atoms[at].id && ((b.a === a.id && b.b === m.atoms[at].id) || (b.b === a.id && b.a === m.atoms[at].id))))!;
      const part: Model = {
        atoms: m.atoms.filter((a) => keep.has(a.id)).map((a, i) => (i === at ? { ...a, el: label, x: ringAtom.x - 1.5, y: ringAtom.y } : a)),
        bonds: m.bonds.filter((b) => keep.has(b.a) && keep.has(b.b)),
      };
      expect(read(part), label).toBe(read(m));
    }
  });

  it("reads a label the other way only where its bond comes in from the right: NCO and NC right of a ring stay as written, left of it a cyanate and a nitrile", () => {
    // (benzene's atom 0 bonded to a label at `dx` from it, level)
    const onBenzene = (label: string, dx: number): Model => {
      const m = drawnFromSmiles("c1ccccc1");
      const a0 = m.atoms[0];
      return {
        atoms: [...m.atoms, { ...a0, id: 900, el: label, x: a0.x + dx, y: a0.y }],
        bonds: [...m.bonds, { ...m.bonds[0], id: 900, a: a0.id, b: 900, order: 1, stereo: undefined }],
      };
    };
    for (const label of ["NCO", "NC"]) {
      const right = labelsDrawnOut(onBenzene(label, 1.5));
      expect(right.atoms.map((a) => a.el), `${label} right of its bond`).toContain(label);
    }
    expect(read(onBenzene("NCO", -1.5)), "NCO left: a cyanate").toBe(read(drawnFromSmiles("N#COc1ccccc1")));
    expect(read(onBenzene("NC", -1.5)), "NC left: a nitrile").toBe(read(drawnFromSmiles("N#Cc1ccccc1")));
  });

  it("never reads a D as H: OD and CD3 are read with deuterium, as they were, never as OH and CH3", () => {
    for (const [label, h] of [["OD", "CCO"], ["CD3", "CCC"]] as const) {
      const out = labelsDrawnOut(labelled("CCO", 2, label));
      expect(out.atoms.some((a) => a.el === "H" && a.isotope === 2) || out.atoms.some((a) => a.el === label), label).toBe(true);
      expect(read(labelled("CCO", 2, label)), label).not.toBe(read(drawnFromSmiles(h)));
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
