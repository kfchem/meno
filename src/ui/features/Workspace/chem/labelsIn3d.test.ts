import { describe, expect, it } from "vitest";
import { readMolfile } from "../../../../lib/chem/ctfile";
import type { Conformers } from "../../../../lib/roles/client";
import type { Model } from "../store/types";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { editorModelOf } from "../utils/io";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { etaBound } from "./etaBound";
import { blocksOf, linkOf, moleculeOf } from "./make3d";

const atom = (id: number, el: string, x: number, y: number, more: Partial<Model["atoms"][number]> = {}) => ({ id, el, x, y, ...more }) as Model["atoms"][number];
const bond = (id: number, a: number, b: number, order: 1 | 2 | 3 = 1) => ({ id, a, b, order }) as Model["bonds"][number];

/** A structure's block as the plugin is asked about it, read back: its atoms, and its bonds with what each multi-centre one binds. */
const asked = (m: Model) => {
  const [block] = blocksOf(m, m.atoms.map((a) => a.id));
  return { block, mol: readMolfile(block.molblock)! };
};

/**
 * What the plugin answers, as far as the tie to the drawing goes: the atoms as asked, at one place each, and its stars - the
 * atoms a multi-centre bond (ENDPTS) goes to - as its answer names them.
 */
function answered(m: Model) {
  const { block, mol } = asked(m);
  const stars = [...new Set(mol.bonds.filter((b) => b.endpoints?.length).flatMap((b) => [b.a1, b.a2].filter((i) => mol.atoms[i].symbol === "*")))];
  const c = {
    atoms: mol.atoms.map((a) => ({ el: a.symbol, charge: 0 })),
    bonds: mol.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.type >= 1 && b.type <= 3 ? b.type : 1 })),
    frames: [mol.atoms.flatMap((a) => [a.x, a.y, 0])],
    stars,
    field: "",
    cip: { atoms: {}, bonds: {} },
    chosen: { atoms: {}, bonds: {} },
    smiles: "",
  } as unknown as Conformers;
  return moleculeOf(c, block);
}

/** Ferrocene drawn as Fe with a Cp label either side. */
const cp2fe = (feMore: Partial<Model["atoms"][number]> = {}): Model => ({
  atoms: [atom(1, "Fe", 0, 0, feMore), atom(2, "Cp", 0, 1.5), atom(3, "Cp", 0, -1.5)],
  bonds: [bond(1, 1, 2), bond(2, 1, 3)],
});

/** PtCl2(cod) drawn by hand: Pt, two Cl, and a cod label. */
const ptcod = (): Model => ({
  atoms: [atom(1, "Pt", 0, 0), atom(2, "Cl", 1.5, 0), atom(3, "Cl", 0, 1.5), atom(4, "cod", -1.5, 0)],
  bonds: [bond(1, 1, 2), bond(2, 1, 3), bond(3, 1, 4)],
});

describe("a complex drawn with ligand labels, made in 3D", () => {
  it("is as drawn the moment it is made: its labels, at their pi systems' stars, are of it all the same", () => {
    for (const m of [cp2fe(), ptcod()]) expect(linkOf(answered(m), m)).toBe("live");
  });

  it("is drawn otherwise once a label is changed, or a ligand taken off", () => {
    const m = cp2fe();
    const made = answered(m);
    const relabelled = { ...m, atoms: m.atoms.map((a) => (a.id === 3 ? { ...a, el: "Cp*" } : a)) };
    expect(linkOf(made, relabelled)).toBe("changed");
    const without = { atoms: m.atoms.filter((a) => a.id !== 3), bonds: m.bonds.filter((b) => b.id !== 2) };
    expect(linkOf(made, without)).toBe("changed");
  });

  it("binds every C=C of a cod label to its metal, each by its own multi-centre bond, and leaves no star unbound", () => {
    const { mol } = asked(ptcod());
    const pt = mol.atoms.findIndex((a) => a.symbol === "Pt");
    const haptic = mol.bonds.filter((b) => b.endpoints?.length);
    expect(haptic).toHaveLength(2);
    for (const b of haptic) {
      expect([b.a1, b.a2]).toContain(pt);
      expect(b.endpoints).toHaveLength(2);
    }
    // (the two C=C, one each)
    expect(new Set(haptic.flatMap((b) => b.endpoints!)).size).toBe(4);
    // (every star bonded: none left an atom of nothing)
    mol.atoms.forEach((a, i) => {
      if (a.symbol === "*") expect(mol.bonds.some((b) => b.a1 === i || b.a2 === i)).toBe(true);
    });
  });

  it("drops a metal's stated valence where its bonds bind ligands - [Fe] from C[Fe]C, relabelled Cp - and keeps it where they are plain", () => {
    // ([Fe] read from SMILES: its valence the two plain bonds it was written with)
    const relabelled = cp2fe({ valence: 2 });
    expect(etaBound(relabelled).atoms.find((a) => a.id === 1)!.valence).toBeUndefined();
    const { block } = asked(relabelled);
    expect(block.molblock).not.toMatch(/ Fe .*VAL=/);
    // (the drawing keeps it)
    expect(relabelled.atoms[0].valence).toBe(2);
    // (as drawn by hand: none to drop, and the same structure asked)
    expect(asked(cp2fe()).block.molblock.split("\n").slice(2).join("\n")).toBe(block.molblock.split("\n").slice(2).join("\n"));
    // (C[Fe]C as it is, its bonds plain: kept)
    const plain: Model = { atoms: [atom(1, "Fe", 0, 0, { valence: 2 }), atom(2, "C", 0, 1.5), atom(3, "C", 0, -1.5)], bonds: [bond(1, 1, 2), bond(2, 1, 3)] };
    expect(etaBound(plain).atoms[0].valence).toBe(2);
  });

  it("reads back from a file Meno wrote as it was drawn - each label still a label, on its metal by one bond, bound as before - and makes the same 3D", () => {
    for (const drawn of [cp2fe(), ptcod()]) {
      const text = writeMolfile(drawn as never, { version: "V3000" });
      const back = editorModelOf(moleculesToEditorModel(readMoleculesFromText(text, "mol")).model);
      // (the labels as drawn, each one bond to its metal)
      expect(back.atoms.map((a) => a.el).sort()).toEqual(drawn.atoms.map((a) => a.el).sort());
      expect(back.bonds).toHaveLength(drawn.bonds.length);
      for (const b of back.bonds) expect(b.endpoints).toBeUndefined();
      // (asked about as the drawing is: the same multi-centre bonds, each the same atoms)
      const bound = (m: Model) =>
        asked(m)
          .mol.bonds.filter((b) => b.endpoints?.length)
          .map((b) => b.endpoints!.length)
          .sort();
      expect(bound(back)).toEqual(bound(drawn));
      expect(bound(back).length).toBeGreaterThan(0);
      // (and as drawn once made: no "Make again")
      expect(linkOf(answered(back), back)).toBe("live");
    }
  });

  it("round trips every pi ligand label so: on a metal, written, read back and asked about, bound through the same atoms", () => {
    for (const label of ["Cp", "Cp*", "allyl", "cod", "nbd"]) {
      const drawn: Model = { atoms: [atom(1, "Rh", 0, 0), atom(2, "Cl", 1.5, 0), atom(3, label, -1.5, 0)], bonds: [bond(1, 1, 2), bond(2, 1, 3)] };
      const back = editorModelOf(moleculesToEditorModel(readMoleculesFromText(writeMolfile(drawn as never, { version: "V3000" }), "mol")).model);
      const bound = (m: Model) =>
        asked(m)
          .mol.bonds.filter((b) => b.endpoints?.length)
          .map((b) => b.endpoints!.length)
          .sort();
      expect({ label, bound: bound(back), bonds: back.bonds.length }).toEqual({ label, bound: bound(drawn), bonds: 2 });
      expect(bound(drawn).length).toBeGreaterThan(0);
    }
  });

  it("writes a Cp label on a metal as the ring bound through all its atoms, not as cyclopentadienyl bound by one carbon", () => {
    const text = writeMolfile(cp2fe() as never, { version: "V3000" });
    expect(text.match(/ENDPTS=\(5 /g)).toHaveLength(2);
  });
});
