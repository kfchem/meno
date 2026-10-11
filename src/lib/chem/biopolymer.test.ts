import { describe, expect, it } from "vitest";
import type { PdbAtom } from "./pdb";
import { biopolymerOf, chainRuns, readBiopolymer, ribbonAtoms, traceKind } from "./biopolymer";

/** A PDB atom of a residue, its other fields as a plain entry has them. */
const atom = (name: string, element: string, resName: string, chainID: string, resSeq: number, x: number, y = 0, z = 0, record: PdbAtom["record"] = "ATOM"): PdbAtom => ({
  record,
  serial: 0,
  name,
  altLoc: "",
  resName,
  chainID,
  resSeq,
  iCode: "",
  x,
  y,
  z,
  element,
});

/**
 * Chain A: five residues, alpha carbons 3.8 Å apart along x, each with its
 * carbonyl oxygen; then one 9 Å further on (a break). A ligand, a calcium
 * ion (named CA, but no carbon) and a water.
 */
const atoms: PdbAtom[] = [
  ...[1, 2, 3, 4, 5].flatMap((k) => [atom("N", "N", "ALA", "A", k, 3.8 * k - 1), atom("CA", "C", "ALA", "A", k, 3.8 * k), atom("O", "O", "ALA", "A", k, 3.8 * k + 0.5, 1.2)]),
  atom("CA", "C", "GLY", "A", 6, 3.8 * 5 + 9),
  atom("C1", "C", "LIG", "A", 101, 0, 5, 0, "HETATM"),
  atom("CA", "Ca", "CA", "A", 102, 0, 8, 0, "HETATM"),
  atom("O", "O", "HOH", "A", 201, 0, -8, 0, "HETATM"),
];
const res = (seqNum: number) => ({ resName: "ALA", chainID: "A", seqNum, iCode: "" });

describe("a PDB entry's chains", () => {
  const bp = biopolymerOf(atoms, [{ serNum: 1, helixID: "1", init: res(2), end: res(4), helixClass: 1 }], [])!;

  it("keeps each atom's name and residue, and each residue's secondary structure from the records", () => {
    expect(bp.names.slice(0, 3)).toEqual(["N", "CA", "O"]);
    expect(bp.residues).toHaveLength(9);
    expect(bp.residues[0]).toEqual({ name: "ALA", chain: "A", seq: 1, iCode: "", standard: true });
    expect(bp.residues[6].standard).toBe(false);
    expect(bp.structure.slice(0, 6)).toEqual([null, "helix", "helix", "helix", null, null]);
  });

  it("is no biopolymer without an alpha carbon or a nucleic acid's phosphorus", () => {
    expect(biopolymerOf([atom("C1", "C", "LIG", "A", 1, 0, 0, 0, "HETATM")], [], [])).toBeUndefined();
    expect(traceKind("CA", "Ca")).toBeNull();
    expect(traceKind("P", "P")).toBe("nucleic");
  });

  it("draws runs of residues whose backbone atoms are near, breaking where they are not; a lone residue is drawn as atoms", () => {
    const xyz = atoms.map((a) => ({ el: a.element, x: a.x, y: a.y, z: a.z }));
    const runs = chainRuns(bp, xyz);
    expect(runs).toHaveLength(1);
    expect(runs[0].residues).toEqual([0, 1, 2, 3, 4]);
    expect(runs[0].trace).toEqual([1, 4, 7, 10, 13]);
    expect(runs[0].guide).toEqual([2, 5, 8, 11, 14]);
    // what the ribbon stands for, and water, is not drawn as atoms; the ligand, the ion and the lone residue are
    const hidden = ribbonAtoms(bp, xyz);
    expect([...hidden.slice(0, 15)].every((h) => h === 1)).toBe(true);
    expect([...hidden.slice(15)]).toEqual([0, 0, 0, 1]);
  });

  it("draws a residue's side chain - from its alpha carbon, not its backbone - where it comes near a ligand", () => {
    // a ligand atom 3 A from residue 3's alpha carbon
    const near = [...atoms.slice(0, 15), atom("CB", "C", "ALA", "A", 3, 3.8 * 3, -1.5, 0), atom("C1", "C", "LIG", "A", 101, 3.8 * 3, 3, 0, "HETATM")];
    const nbp = biopolymerOf(near, [], [])!;
    const xyz = near.map((a) => ({ el: a.element, x: a.x, y: a.y, z: a.z }));
    const hidden = ribbonAtoms(nbp, xyz);
    // residue 3: N, CA, O; then its CB; then the ligand
    expect([hidden[6], hidden[7], hidden[8]]).toEqual([1, 0, 1]);
    expect([hidden[15], hidden[16]]).toEqual([0, 0]);
    // residue 1, far from it: all its ribbon's
    expect([hidden[0], hidden[1], hidden[2]]).toEqual([1, 1, 1]);
  });

  it("reads back from a copy as it was, and not where it does not fit its molecule", () => {
    const back = readBiopolymer(JSON.parse(JSON.stringify(bp)), atoms.length);
    expect(back).toEqual(bp);
    expect(readBiopolymer(bp, atoms.length - 1)).toBeUndefined();
    expect(readBiopolymer({ ...bp, structure: bp.structure.map(() => "sheet") }, atoms.length)).toBeUndefined();
  });
});
