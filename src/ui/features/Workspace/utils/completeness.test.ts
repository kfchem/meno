import { describe, expect, it } from "vitest";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import type { Molecule3D } from "../store/types";
import type { Component } from "../../../../lib/chem/ccd";
import { bondsByDistance } from "../../../../utils/structureParsers";
import { blockOf, ligandGroups, noHydrogensInFile, ordersUnknown, partOf, withComponents, withHydrogens, withOrders } from "./completeness";

/** Acetic acid's heavy atoms, all bonds single, as a file of coordinates gives them. */
const acetic = (extra: Partial<Molecule3D> = {}): Molecule3D => ({
  id: 1,
  atoms: [
    { el: "C", x: 0, y: 0, z: 0 },
    { el: "C", x: 1.5, y: 0, z: 0 },
    { el: "O", x: 2.2, y: 1.1, z: 0 },
    { el: "O", x: 2.2, y: -1.1, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 1, a2: 3, order: 1 },
  ],
  at: { x: 0, y: 0 },
  bondOrders: "unknown",
  ...extra,
});

/** A chain of three alanines (an alpha carbon each, 3.8 A apart), a two-atom ligand, a water. */
const withLigand = (): Molecule3D => ({
  id: 1,
  atoms: [
    { el: "C", x: 0, y: 0, z: 0 },
    { el: "C", x: 3.8, y: 0, z: 0 },
    { el: "C", x: 7.6, y: 0, z: 0 },
    { el: "C", x: 0, y: 9, z: 0 },
    { el: "O", x: 1.2, y: 9, z: 0 },
    { el: "O", x: 0, y: -9, z: 0 },
  ],
  bonds: [{ a1: 3, a2: 4, order: 1 }],
  at: { x: 0, y: 0 },
  bondOrders: "unknown",
  biopolymer: {
    names: ["CA", "CA", "CA", "C1", "O1", "O"],
    residueOf: [0, 1, 2, 3, 3, 4],
    residues: [
      ...[1, 2, 3].map((seq) => ({ name: "ALA", chain: "A", seq, iCode: "", standard: true })),
      { name: "LIG", chain: "A", seq: 101, iCode: "", standard: false },
      { name: "HOH", chain: "A", seq: 201, iCode: "", standard: false },
    ],
    structure: [null, null, null, null, null],
  },
});

describe("what a molecule's file leaves out", () => {
  it("finds a PDB entry's ligands, apart from its chains and its water - and what an action on it acts on", () => {
    const m = withLigand();
    expect(ligandGroups(m)).toEqual([[3, 4]]);
    expect(partOf(m, 4)).toEqual([3, 4]);
    // (a chain's atom: nothing of Meno's to complete; no atom, the one ligand there is)
    expect(partOf(m, 1)).toBeNull();
    expect(partOf(m, null)).toEqual([3, 4]);
    // (no biopolymer: all of it)
    expect(partOf(acetic(), null)).toEqual([0, 1, 2, 3]);
  });

  it("says its bond orders are unknown until found or given, and a biopolymer's where its chains are drawn as atoms", () => {
    expect(ordersUnknown(acetic(), false)).toBe(true);
    expect(ordersUnknown(acetic({ bondOrders: "perceived" }), false)).toBe(false);
    expect(ordersUnknown({ ...withLigand(), bondOrders: "assigned" }, false)).toBe(false);
    expect(ordersUnknown({ ...withLigand(), bondOrders: "assigned" }, true)).toBe(true);
    // (a PDB entry: as its ligands' are - none, its chains drawn as ribbons, none unknown)
    expect(ordersUnknown(withLigand(), false)).toBe(true);
    expect(ordersUnknown({ ...withLigand(), unknownOrders: [] }, false)).toBe(false);
    expect(ordersUnknown({ ...withLigand(), bonds: [] }, false)).toBe(false);
  });

  it("says nothing is left out of a file of carbon with no room for hydrogens - C60, carbon dioxide, CCl4, a metal's carbonyls - its orders unknown", () => {
    const of = (atoms: { el: string; x: number; y: number; z: number }[]) => noHydrogensInFile({ atoms, bonds: bondsByDistance(atoms), bondOrders: "unknown" });
    const t = 1.77 / Math.sqrt(3);
    const ring = (el: string, r: number, out: string | null, ro: number) =>
      Array.from({ length: 6 }, (_, k) => {
        const a = (k * Math.PI) / 3;
        return [{ el, x: r * Math.cos(a), y: r * Math.sin(a), z: 0 }, ...(out ? [{ el: out, x: ro * Math.cos(a), y: ro * Math.sin(a), z: 0 }] : [])];
      }).flat();
    // (none wanted: two in a line, four, three in a plane, the end of a triple bond)
    expect(of([{ el: "O", x: -1.16, y: 0, z: 0 }, { el: "C", x: 0, y: 0, z: 0 }, { el: "O", x: 1.16, y: 0, z: 0 }])).toBe(false);
    expect(of([{ el: "C", x: 0, y: 0, z: 0 }, ...[[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(([x, y, z]) => ({ el: "Cl", x: x * t, y: y * t, z: z * t }))])).toBe(false);
    expect(of(ring("C", 1.39, "Cl", 1.39 + 1.73))).toBe(false);
    expect(of([{ el: "Fe", x: 0, y: 0, z: 0 }, { el: "C", x: 1.8, y: 0, z: 0 }, { el: "O", x: 2.95, y: 0, z: 0 }, { el: "C", x: -1.8, y: 0, z: 0 }, { el: "O", x: -2.95, y: 0, z: 0 }])).toBe(false);
    expect(of([{ el: "C", x: 0, y: 0, z: 0 }, { el: "O", x: 1.13, y: 0, z: 0 }])).toBe(false);
    // (wanted: an end, two bent, three in a pyramid, a C=O's carbon with nothing else, a lone carbon)
    expect(of([{ el: "C", x: 0, y: 0, z: 0 }, { el: "C", x: 1.54, y: 0, z: 0 }])).toBe(true);
    expect(of(ring("C", 1.39, null, 0))).toBe(true);
    // (chloroform's carbon, its three chlorines in a pyramid about it, wants one; three in a plane, none)
    const tri = (z: number, r: number) => [{ el: "C", x: 0, y: 0, z }, ...[0, 1, 2].map((k) => ({ el: "Cl", x: r * Math.cos((2 * Math.PI * k) / 3), y: r * Math.sin((2 * Math.PI * k) / 3), z: 0 }))];
    expect(of(tri(0.59, 1.669))).toBe(true);
    expect(of(tri(0, 1.73))).toBe(false);
    expect(of([{ el: "C", x: 0, y: 0, z: 0 }, { el: "O", x: 1.21, y: 0, z: 0 }])).toBe(true);
    expect(of([{ el: "C", x: 0, y: 0, z: 0 }])).toBe(true);
  });

  it("says its file has no hydrogens where it has carbon and none - or, its orders known, an atom takes some", () => {
    expect(noHydrogensInFile(acetic())).toBe(true);
    // carbon dioxide's orders known: no room for any
    const co2 = { atoms: [{ el: "O", x: 0, y: 0, z: 0 }, { el: "C", x: 1.2, y: 0, z: 0 }, { el: "O", x: 2.4, y: 0, z: 0 }], bonds: [{ a1: 0, a2: 1, order: 2 }, { a1: 1, a2: 2, order: 2 }] };
    expect(noHydrogensInFile(co2)).toBe(false);
    // acetic acid's orders known, its hydrogens not there
    expect(noHydrogensInFile(acetic({ bondOrders: "assigned", bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 1, a2: 2, order: 2 }, { a1: 1, a2: 3, order: 1 }] }))).toBe(true);
    expect(noHydrogensInFile({ ...acetic(), atoms: [...acetic().atoms, { el: "H", x: 9, y: 9, z: 9 }] })).toBe(false);
    // (a PDB entry: its chains, drawn as atoms, and each ligand - the ligand's hydrogens added, its chains still have none)
    const entry = withLigand();
    expect(noHydrogensInFile(entry, false)).toBe(true);
    const ligandHs = {
      ...entry,
      atoms: [...entry.atoms, { el: "H", x: -1, y: 9, z: 0 }],
      bonds: [...entry.bonds, { a1: 3, a2: 6, order: 1 }],
      biopolymer: { ...entry.biopolymer!, names: [...entry.biopolymer!.names, "H"], residueOf: [...entry.biopolymer!.residueOf, 3] },
    };
    expect(noHydrogensInFile(ligandHs, true)).toBe(true);
    expect(noHydrogensInFile(ligandHs, false)).toBe(false);
  });

  it("is given the orders and charges the worker answers with, its own bonds otherwise as they were", () => {
    const m = withLigand();
    const block = blockOf(m, [3, 4]);
    expect(block.atoms).toEqual([3, 4]);
    // (the worker's answer: the ligand's two atoms, doubly bonded, the oxygen charged)
    const answer = writeMolfile3d([{ el: "C", x: 0, y: 9, z: 0 }, { el: "O", x: 1.2, y: 9, z: 0, charge: -1 }], [{ a1: 0, a2: 1, order: 2 }]);
    const next = withOrders(m, block.atoms, answer)!;
    expect(next.bonds).toEqual([{ a1: 3, a2: 4, order: 2 }]);
    expect(next.atoms[4].charge).toBe(-1);
    expect(next.atoms[0]).toBe(m.atoms[0]);
    // (an answer of other atoms: none taken)
    expect(withOrders(m, [3, 4, 5], answer)).toBeNull();
  });

  it("gives the worker a part's radicals with its charges", () => {
    const m = withLigand();
    m.atoms[4] = { ...m.atoms[4], radical: "doublet" };
    expect(blockOf(m, [3, 4]).molblock).toContain("M  RAD  1   2   2\n");
  });

  it("takes the hydrogens the worker added: after its atoms, bonded to theirs, in their residue", () => {
    const m = withLigand();
    const answer = writeMolfile3d(
      [{ el: "C", x: 0, y: 9, z: 0 }, { el: "O", x: 1.2, y: 9, z: 0 }, { el: "H", x: -1, y: 9, z: 0 }, { el: "H", x: 0, y: 10, z: 0 }],
      [{ a1: 0, a2: 1, order: 2 }, { a1: 0, a2: 2, order: 1 }, { a1: 0, a2: 3, order: 1 }],
    );
    const next = withHydrogens(m, [3, 4], answer)!;
    expect(next.atoms.slice(6).map((a) => a.el)).toEqual(["H", "H"]);
    expect(next.bonds.slice(1)).toEqual([{ a1: 3, a2: 6, order: 1 }, { a1: 3, a2: 7, order: 1 }]);
    expect(next.biopolymer!.residueOf.slice(6)).toEqual([3, 3]);
    expect(next.biopolymer!.names.slice(6)).toEqual(["H", "H"]);
    // (a molecule with other frames: they would have none - not added)
    expect(withHydrogens({ ...m, frames: [[]] }, [3, 4], answer)).toBeNull();
  });

  it("is given its residues' orders and charges from the dictionary, where each residue is the component as drawn", () => {
    const m = withLigand();
    const ala: Component = { id: "ALA", atoms: ["N", "CA", "C", "O", "CB"].map((name) => ({ name, element: name[0], charge: 0 })), bonds: [] };
    const lig: Component = { id: "LIG", atoms: [{ name: "C1", element: "C", charge: 0 }, { name: "O1", element: "O", charge: 0 }], bonds: [{ a: "O1", b: "C1", order: 2 }] };
    const all = withComponents(m, new Map([["ALA", ala], ["LIG", lig]]))!;
    expect(all.given).toEqual([0, 1, 2, 3]);
    expect(all.molecule.bonds).toEqual([{ a1: 3, a2: 4, order: 2 }]);
    expect(all.molecule).toMatchObject({ bondOrders: "dictionary", chainOrders: "dictionary" });
    expect(all.molecule.unknownOrders).toBeUndefined();
    // (its chains' orders now known: drawn as atoms, it says nothing of them)
    expect(ordersUnknown(all.molecule, true)).toBe(false);

    // the chains' residues not in the dictionary: its ligand's known, its chains' not
    const ligandOnly = withComponents(m, new Map([["LIG", lig]]))!.molecule;
    expect(ligandOnly.bondOrders).toBe("dictionary");
    expect(ligandOnly.chainOrders).toBeUndefined();
    expect(ordersUnknown(ligandOnly, true)).toBe(true);

    // a component whose atoms are not the residue's: nothing given
    const other = withComponents(m, new Map([["LIG", { ...lig, atoms: [lig.atoms[0], { name: "O1", element: "N", charge: 0 }] }]]))!;
    expect(other.given).toEqual([]);
    expect(other.molecule).toMatchObject({ bondOrders: "unknown", unknownOrders: [3, 4] });
    expect(other.molecule.bonds).toEqual(m.bonds);
    // nor where the residue has a bond the component has not as single, double or triple
    expect(withComponents(m, new Map([["LIG", { ...lig, bonds: [{ a: "C1", b: "O1", order: null }] }]]))!.given).toEqual([]);
    // (no PDB entry: none)
    expect(withComponents(acetic(), new Map())).toBeNull();
  });
});

describe("what a molecule says of its file", () => {
  it("says how many frames were left out as it was read, and that atoms stood in one place", async () => {
    const { notesOf, solidOf } = await import("./molecule3d");
    const { STYLE_3D } = await import("../../../../lib/chem/style3d");
    const m = { id: 1, at: { x: 0, y: 0 }, atoms: [{ el: "O", x: 0, y: 0, z: 0 }, { el: "H", x: 0.96, y: 0, z: 0 }], bonds: [{ a1: 0, a2: 1, order: 1 }], framesLeftOut: 1, together: 1 };
    expect(notesOf(m, solidOf(m, STYLE_3D), "primary")).toEqual(["1 frame left out", "Atoms in one place"]);
    expect(notesOf({ ...m, framesLeftOut: 3, together: undefined }, solidOf(m, STYLE_3D), "primary")).toEqual(["3 frames left out"]);
  });
});
