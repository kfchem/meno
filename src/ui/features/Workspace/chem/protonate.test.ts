import { describe, expect, it, vi } from "vitest";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import { readMolfile } from "../../../../lib/chem/ctfile";
import { readComponent, type Component } from "../../../../lib/chem/ccd";
import { hydrogensOf } from "../../../../lib/chem/protonation";
import type { ChemClient } from "../../../../lib/roles/client";
import { connectStoreToDocument, createEditorStore } from "../store";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { isSkeleton } from "../utils/completeness";
import { readCarried3D } from "../utils/copyPaste";
import { addHydrogensAsChosen, addHydrogensFromDictionary, keptAsDictionary, protonatedSpecies, protonationOf } from "./protonate";

/** How many hydrogens the plugin leaves off, as these tests have it answer: 0, every one its valence leaves room for - as RDKit adds them. */
let short = 0;
const fake = {
  request: async (op: string, args: { molblock: string }) => {
    if (op !== "add_hydrogens") throw new Error(op);
    const ct = readMolfile(args.molblock)!;
    const atoms = ct.atoms.map((a) => ({ el: a.symbol, x: a.x, y: a.y, z: a.z, ...(a.charge ? { charge: a.charge } : {}) }));
    const bonds = ct.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.type }));
    const n = atoms.length;
    let left = short;
    for (let i = 0; i < n; i++) {
      const sum = bonds.reduce((s, b) => s + (b.a1 === i || b.a2 === i ? b.order : 0), 0);
      let h = hydrogensOf({ el: atoms[i].el, charge: atoms[i].charge }, sum);
      if (h && left) {
        h--;
        left--;
      }
      for (let k = 0; k < h; k++) {
        bonds.push({ a1: i, a2: atoms.length, order: 1 });
        atoms.push({ el: "H", x: atoms[i].x + 0.6, y: atoms[i].y + 0.3 * k, z: atoms[i].z + 0.8 });
      }
    }
    return { molblock: writeMolfile3d(atoms, bonds) };
  },
} as unknown as ChemClient;
vi.mock("../../../../lib/roles/worker", () => ({ chemWorker: async () => fake, chemAtHand: async () => true }));
/** The dictionary, as these tests have it answer. */
let looked: { components: Map<string, Component>; absent: string[] } | null = null;
vi.mock("../../../../lib/net/components", () => ({ componentsNamed: async () => looked }));

/** Glycine without its hydrogens, as an XYZ file of its heavy atoms gives it, its orders estimated from their distances: C=O and C-OH, an NH2. */
const glycine: Omit<Molecule3D, "id"> = {
  atoms: [
    { el: "N", x: 0, y: 0, z: 0 },
    { el: "C", x: 1.47, y: 0, z: 0 },
    { el: "C", x: 2.0, y: 1.4, z: 0 },
    { el: "O", x: 1.3, y: 2.4, z: 0 },
    { el: "O", x: 3.3, y: 1.5, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 2, a2: 3, order: 2 },
    { a1: 2, a2: 4, order: 1 },
  ],
  at: { x: 0, y: 0 },
  bondOrders: "estimated",
};

function editor(m: Omit<Molecule3D, "id">) {
  const doc = createWorkspaceDocument();
  doc.edit("add", (d) => addMolecule3d(d, m));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, molecule: () => store.getState().molecules3d[0] };
}

describe("a molecule whose orders were estimated from distances, protonated as chosen", () => {
  it("starts with no site chosen, and adds no hydrogen until each is", () => {
    const { molecule } = editor(glycine);
    const p = protonationOf(molecule(), null)!;
    expect(p.sites.map((s) => s.kind)).toEqual(["carboxyl", "amine"]);
    expect(p.start).toEqual([null, null]);
    expect(protonatedSpecies(p, { forms: p.start, charges: new Map() })).toEqual({ why: "Choose how each site is protonated." });
    const form = (k: number, name: string) => p.sites[k].forms.findIndex((f) => f.name === name);
    // (the zwitterion; the neutral molecule; the anion: each by its charge, a singlet)
    expect(protonatedSpecies(p, { forms: [form(0, "Carboxylate"), form(1, "Ammonium")], charges: new Map() })).toEqual({ charge: 0, multiplicity: 1 });
    expect(protonatedSpecies(p, { forms: [form(0, "Carboxylic acid"), form(1, "Amine")], charges: new Map() })).toEqual({ charge: 0, multiplicity: 1 });
    expect(protonatedSpecies(p, { forms: [form(0, "Carboxylate"), form(1, "Amine")], charges: new Map() })).toEqual({ charge: -1, multiplicity: 1 });
  });

  it("is drawn as the forms chosen and given their hydrogens, as one undo step, said to have been added", async () => {
    const { doc, store, molecule } = editor(glycine);
    short = 0;
    const p = protonationOf(molecule(), null)!;
    const forms = [p.sites[0].forms.findIndex((f) => f.name === "Carboxylate"), p.sites[1].forms.findIndex((f) => f.name === "Ammonium")];
    await addHydrogensAsChosen(store, p, { forms, charges: new Map() });
    const m = molecule();
    // (H3N+-CH2-COO-: five hydrogens, NH3 and CH2)
    expect(m.atoms.filter((a) => a.el === "H")).toHaveLength(5);
    expect(m.atoms.slice(0, 5).map((a) => a.charge ?? 0)).toEqual([1, 0, 0, expect.any(Number), expect.any(Number)]);
    expect((m.atoms[3].charge ?? 0) + (m.atoms[4].charge ?? 0)).toBe(-1);
    expect(m.bonds[2].order + m.bonds[3].order).toBe(3);
    expect(m.hydrogensAdded).toEqual([{ by: "chosen", atoms: [0, 1, 2, 3, 4] }]);
    expect(isSkeleton(m)).toBe(false);
    expect(doc.history().undoLabel).toBe("add hydrogens");
    doc.undo();
    expect(molecule().atoms).toHaveLength(5);
    expect(molecule().atoms.every((a) => !a.charge)).toBe(true);
    expect(molecule().hydrogensAdded).toBeUndefined();
  });

  it("is not changed at all where the hydrogens added are not those chosen, and says where", async () => {
    const { doc, store, molecule } = editor(glycine);
    short = 1;
    const p = protonationOf(molecule(), null)!;
    const forms = [p.sites[0].forms.findIndex((f) => f.name === "Carboxylic acid"), p.sites[1].forms.findIndex((f) => f.name === "Amine")];
    const before = molecule();
    await expect(addHydrogensAsChosen(store, p, { forms, charges: new Map() })).rejects.toThrow("N1 would not have the hydrogens chosen for it: nothing was added.");
    expect(molecule()).toBe(before);
    expect(doc.history().undoLabel).toBe("add");
    short = 0;
  });

  it("starts from the form a SMILES gave it", () => {
    const { molecule } = editor({
      ...glycine,
      atoms: glycine.atoms.map((a, i) => (i === 0 ? { ...a, charge: 1 } : i === 4 ? { ...a, charge: -1 } : a)),
      bondOrders: "assigned",
    });
    const p = protonationOf(molecule(), null)!;
    expect(p.start.map((f, k) => p.sites[k].forms[f!].name)).toEqual(["Carboxylate", "Ammonium"]);
  });
});

// A component made up for the test, written as the dictionary's files are:
// a glycine-like residue whose OXT, HXT and H2 leave as it bonds to
// another, with each atom's place in its ideal shape.
const ZZG = readComponent(`data_ZZG
_chem_comp.id ZZG
loop_
_chem_comp_atom.comp_id
_chem_comp_atom.atom_id
_chem_comp_atom.type_symbol
_chem_comp_atom.charge
_chem_comp_atom.pdbx_leaving_atom_flag
_chem_comp_atom.pdbx_model_Cartn_x_ideal
_chem_comp_atom.pdbx_model_Cartn_y_ideal
_chem_comp_atom.pdbx_model_Cartn_z_ideal
ZZG N   N 0 N  1.931  0.090 -0.034
ZZG CA  C 0 N  0.761 -0.799 -0.008
ZZG C   C 0 N -0.498  0.029 -0.005
ZZG O   O 0 N -0.429  1.235 -0.023
ZZG OXT O 0 Y -1.697 -0.574  0.018
ZZG H   H 0 N  1.910  0.738  0.738
ZZG H2  H 0 Y  1.877  0.659 -0.864
ZZG HA2 H 0 N  0.783 -1.420  0.888
ZZG HA3 H 0 N  0.788 -1.437 -0.891
ZZG HXT H 0 Y -2.507 -0.042  0.020
loop_
_chem_comp_bond.comp_id
_chem_comp_bond.atom_id_1
_chem_comp_bond.atom_id_2
_chem_comp_bond.value_order
ZZG N   CA  SING
ZZG N   H   SING
ZZG N   H2  SING
ZZG CA  C   SING
ZZG CA  HA2 SING
ZZG CA  HA3 SING
ZZG C   O   DOUB
ZZG C   OXT SING
ZZG OXT HXT SING
`)!;
const at = (name: string) => ZZG.atoms.find((a) => a.name === name)!.at!;

/** A PDB entry of the residue alone, as a ligand, its heavy atoms where the component's ideal shape has them, its orders given from the CCD. */
function entryOf(names: string[], charges: Record<string, number> = {}): Omit<Molecule3D, "id"> {
  const atoms = names.map((name) => ({ el: name[0], ...at(name), ...(charges[name] ? { charge: charges[name] } : {}) }));
  const pairs: [string, string, number][] = [
    ["N", "CA", 1],
    ["CA", "C", 1],
    ["C", "O", 2],
    ["C", "OXT", 1],
  ];
  return {
    atoms,
    bonds: pairs.filter(([a, b]) => names.includes(a) && names.includes(b)).map(([a, b, order]) => ({ a1: names.indexOf(a), a2: names.indexOf(b), order })),
    at: { x: 0, y: 0 },
    bondOrders: "dictionary",
    ligandOrders: { 0: "dictionary" },
    biopolymer: { names, residueOf: names.map(() => 0), residues: [{ name: "ZZG", chain: "A", seq: 1, iCode: "", standard: false }], structure: [null] },
  };
}

describe("a PDB entry's ligand whose orders the CCD gave", () => {
  it("starts as the CCD defines it, and is given the CCD's own hydrogens - by their names, where its shape puts them - as one undo step", async () => {
    const { doc, store, molecule } = editor(entryOf(["N", "CA", "C", "O", "OXT"]));
    looked = { components: new Map([["ZZG", ZZG]]), absent: [] };
    const p = protonationOf(molecule(), 0)!;
    expect(p.dictionary).toBe(true);
    expect(p.start.map((f, k) => p.sites[k].forms[f!].name)).toEqual(["Carboxylic acid", "Amine"]);
    const chosen = { forms: p.start, charges: new Map<number, number>() };
    expect(keptAsDictionary(p, chosen)).toBe(true);
    await addHydrogensFromDictionary(store, p);
    const m = molecule();
    expect(m.biopolymer!.names.slice(5)).toEqual(["H", "H2", "HA2", "HA3", "HXT"]);
    const hxt = m.atoms[m.biopolymer!.names.indexOf("HXT")];
    expect(Math.hypot(hxt.x - at("HXT").x, hxt.y - at("HXT").y, hxt.z - at("HXT").z)).toBeLessThan(1e-9);
    expect(m.hydrogensAdded).toEqual([{ by: "dictionary", atoms: [0, 1, 2, 3, 4] }]);
    expect(doc.history().undoLabel).toBe("add hydrogens");
    // (a form changed on the card: not the CCD's any more)
    expect(keptAsDictionary(p, { forms: [p.start[0] === 0 ? 1 : 0, p.start[1]], charges: new Map() })).toBe(false);
  });

  it("is not changed where an atom of its component is missing, and says which", async () => {
    const { store, molecule } = editor(entryOf(["N", "C", "O", "OXT"]));
    looked = { components: new Map([["ZZG", ZZG]]), absent: [] };
    const before = molecule();
    // (the part pointed at: its C, O and OXT, the N apart from them)
    const p = protonationOf(molecule(), 1)!;
    await expect(addHydrogensFromDictionary(store, p)).rejects.toThrow("CA of ZZG is not in the entry, so its hydrogens cannot all be given. Nothing was added.");
    expect(molecule()).toBe(before);
  });

  it("is not changed where the CCD's hydrogens do not fit its bonds and charges as drawn", async () => {
    // (its nitrogen charged, as the CCD's is not: room for three hydrogens, the CCD gives two)
    const { store, molecule } = editor(entryOf(["N", "CA", "C", "O", "OXT"], { N: 1 }));
    looked = { components: new Map([["ZZG", ZZG]]), absent: [] };
    const before = molecule();
    const p = protonationOf(molecule(), 0)!;
    await expect(addHydrogensFromDictionary(store, p)).rejects.toThrow("The CCD's hydrogens do not fit N as its bonds are drawn: nothing was added.");
    expect(molecule()).toBe(before);
  });
});

describe("what a workspace file keeps of it", () => {
  it("the hydrogens added, and where a ligand's orders came from", () => {
    const m = { ...entryOf(["N", "CA", "C", "O", "OXT"]), hydrogensAdded: [{ by: "dictionary" as const, atoms: [0, 1, 2, 3, 4] }] };
    const read = readCarried3D(JSON.parse(JSON.stringify(m)))!;
    expect(read.hydrogensAdded).toEqual([{ by: "dictionary", atoms: [0, 1, 2, 3, 4] }]);
    expect(read.ligandOrders).toEqual({ 0: "dictionary" });
    // (what does not read as either: left out)
    expect(readCarried3D({ ...JSON.parse(JSON.stringify(m)), hydrogensAdded: [{ by: "guessed", atoms: [0] }], ligandOrders: { 9: "dictionary" } })!.hydrogensAdded).toBeUndefined();
  });
});
