import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { readStructures } from "../../../../lib/io/structures";
import { ordersFromGeometry } from "../../../../lib/chem/ordersFromGeometry";
import { speciesOf } from "../../../../lib/io/writers";
import { readMolfile } from "../../../../lib/chem/ctfile";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import { isSkeleton, withPartOrders } from "../utils/completeness";
import { knownOfMolecules, writtenOf } from "../utils/written";
import { entryOfSet, setEntries, skeletonsRefused } from "./entries";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import { addSet, addStep, connect } from "./model";
import { resultOf, inputOf } from "./flow";
import { runStep, type RunWith } from "./run";

// Skeletons: molecules in 3D whose hydrogens are not there (lib/chem/skeleton). The maintainer,
// 2026-10-21: "treating a structure without hydrogens as a molecule is itself wrong" - no charge
// or spin for one, no calculation on it, no formula of it, and written as one.

/** A molecule in 3D as a file of coordinates gives it: its atoms, its bonds single, their orders unknown. */
function fromFile(id: number, atoms: [string, number, number, number][], bonds: [number, number][]): Molecule3D {
  return {
    id,
    at: { x: 4 * id, y: 0 },
    atoms: atoms.map(([el, x, y, z]) => ({ el, x, y, z })),
    bonds: bonds.map(([a1, a2]) => ({ a1, a2, order: 1 })),
    bondOrders: "unknown",
  } as Molecule3D;
}

const methylamine = fromFile(1, [["C", 0, 0, 0], ["N", 1.47, 0, 0]], [[0, 1]]);
const ethane = fromFile(2, [["C", 0, 0, 0], ["C", 1.54, 0, 0]], [[0, 1]]);
const benzene = fromFile(
  3,
  Array.from({ length: 6 }, (_, k): [string, number, number, number] => ["C", 1.39 * Math.cos((k * Math.PI) / 3), 1.39 * Math.sin((k * Math.PI) / 3), 0]),
  [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
);
const carbonDioxide = fromFile(4, [["C", 0, 0, 0], ["O", 0, 0, 1.16], ["O", 0, 0, -1.16]], [[0, 1], [0, 2]]);

describe("a molecule in 3D whose hydrogens are not there", () => {
  it("is a skeleton - methylamine's, ethane's and benzene's heavy atoms - and carbon dioxide is not", () => {
    expect([methylamine, ethane, benzene].map(isSkeleton)).toEqual([true, true, true]);
    expect(isSkeleton(carbonDioxide)).toBe(false);
    // (one the chemist says is whole without any is no skeleton)
    expect(isSkeleton({ ...ethane, wholeWithoutH: true })).toBe(false);
  });

  it("has no charge or spin: none to give a program, none for an export's options to start from", () => {
    // (before: H-less methylamine, C and N's 13 electrons, a neutral doublet; ethane's heavy atoms, C2)
    const entries = setEntries([methylamine], "molecules");
    expect(entries[0].skeleton).toBe(true);
    expect(entryOfSet(entries[0], "e1").species).toBeNull();
    expect(speciesOf(writtenOf([methylamine]))).toBeNull();
    expect(knownOfMolecules([methylamine])).not.toHaveProperty("charge");
    expect(knownOfMolecules([methylamine])).not.toHaveProperty("multiplicity");
    // (a whole molecule's, as before)
    expect(speciesOf(writtenOf([carbonDioxide]))).toMatchObject({ charge: 0, multiplicity: 1 });
  });

  it("is refused, with what to do, by every step whose program needs the whole molecule - before anything is sent", () => {
    const entries = setEntries([methylamine, ethane, benzene, carbonDioxide], "molecules");
    for (const kind of ["conformers", "optimise", "energy", "frequencies", "nci", "duplicates"] as const) {
      expect(skeletonsRefused(kind, entries)).toBe(
        "3 of these molecules have no hydrogens, so their charge and spin are not known. Add their hydrogens, choosing how each is protonated - or, where one has none, mark it complete without hydrogens.",
      );
    }
    expect(skeletonsRefused("optimise", setEntries([ethane], "molecules"))).toMatch(/^This molecule has no hydrogens/);
    // (a picture of one, or Meno's own steps on its shape alone, take it; the whole molecule, any step)
    expect(skeletonsRefused("render", entries)).toBeNull();
    expect(skeletonsRefused("energy-window", entries)).toBeNull();
    expect(skeletonsRefused("optimise", setEntries([carbonDioxide], "molecules"))).toBeNull();
  });

  it("is a carboxylate's, from a PDB entry, never settled as the neutral acid - its orders estimated or not", () => {
    // (acetate, as an X-ray entry gives a ligand: its heavy atoms alone, C-O 1.25 A both)
    const pdb = [
      "HETATM    1  C   ACT A 101       0.000   0.000   0.000  1.00 10.00           C  ",
      "HETATM    2  CH3 ACT A 101       1.520   0.000   0.000  1.00 10.00           C  ",
      "HETATM    3  O   ACT A 101      -0.625   1.083   0.000  1.00 10.00           O  ",
      "HETATM    4  OXT ACT A 101      -0.625  -1.083   0.000  1.00 10.00           O  ",
      "END",
    ].join("\n");
    const read = readStructures("pdb", "act.pdb", pdb).molecules3d![0];
    const acetate = { ...read, id: 7, at: { x: 0, y: 0 } } as Molecule3D;
    expect(acetate.atoms.map((a) => a.el)).toEqual(["C", "C", "O", "O"]);
    expect(isSkeleton(acetate)).toBe(true);
    // (its orders estimated from its distances, as "Estimate bond orders from distances" does: a C=O and a C-O, no charge - and still a skeleton)
    const all = acetate.atoms.map((_, i) => i);
    const r = ordersFromGeometry(acetate.atoms, acetate.bonds);
    const estimated = { ...withPartOrders(acetate, all, r.orders, r.charges), bondOrders: "estimated" as const };
    expect(r.charges).toEqual([0, 0, 0, 0]);
    expect(isSkeleton(estimated)).toBe(true);
    expect(entryOfSet(setEntries([estimated], "molecules")[0], "e1").species).toBeNull();
    expect(skeletonsRefused("energy", setEntries([estimated], "molecules"))).toMatch(/^This molecule has no hydrogens/);
  });

  it("is written as a skeleton: each atom's valence its bonds, so that no reader adds hydrogens", () => {
    const atoms = benzene.atoms.map((a) => ({ ...a, noImplicitH: true }));
    const bonds = benzene.bonds.map((b, k) => ({ ...b, order: k % 2 ? 1 : 2 }));
    const v2000 = readMolfile(writeMolfile3d(atoms, bonds))!;
    expect(v2000.atoms.map((a) => a.valence)).toEqual([3, 3, 3, 3, 3, 3]);
    const v3000 = readMolfile(writeMolfile3d(atoms, bonds, { version: "V3000" }))!;
    expect(v3000.atoms.map((a) => a.valence)).toEqual([3, 3, 3, 3, 3, 3]);
    // (a lone atom: valence none - 15 in V2000, -1 in V3000)
    expect(readMolfile(writeMolfile3d([{ el: "C", x: 0, y: 0, z: 0, noImplicitH: true }], []))!.atoms[0].valence).toBe(0);
    expect(readMolfile(writeMolfile3d([{ el: "C", x: 0, y: 0, z: 0, noImplicitH: true }], [], { version: "V3000" }))!.atoms[0].valence).toBe(0);
    // (a whole molecule's atoms unmarked, as before)
    expect(readMolfile(writeMolfile3d(carbonDioxide.atoms, carbonDioxide.bonds))!.atoms[0].valence).toBeUndefined();
  });
});

describe("a molecule a step gives back", () => {
  it("keeps what its file left unknown: its bond orders still unknown, said over it", () => {
    const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
    // (water from an XYZ file - its hydrogens there, its orders unknown - with two frames and their energies)
    const water: Omit<Molecule3D, "id"> = {
      at: { x: 0, y: 0 },
      atoms: [{ el: "O", x: 0, y: 0, z: 0 }, { el: "H", x: 0.96, y: 0, z: 0 }, { el: "H", x: -0.24, y: 0.93, z: 0 }],
      bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }],
      frames: [[0, 0, 0, 0.97, 0, 0, -0.24, 0.94, 0]],
      energies: [-76.4, -76.39],
      conformerSet: true,
      bondOrders: "unknown",
    };
    let doc = addMolecule3d(emptyWorkspaceDocument(), water);
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    doc = addStep(doc, "energy-window", 5, 0, { window: 100 });
    doc = connect(doc, { set: 1 }, 2);
    doc = runStep(doc, 2, W);
    const made = resultOf(doc, 2)!;
    const back = inputOf({ ...doc, wires: [{ id: 99, from: { set: made.id }, to: { step: 2, port: "in" } }] }, 2)!.molecules;
    expect(back.map((m) => m.bondOrders)).toEqual(["unknown"]);
  });
});
