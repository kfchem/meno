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

/** How many hydrogens the plugin leaves off, as these tests have it answer: 0, every one it is asked for - or, asked for none, its valence leaves room for - as RDKit adds them. */
let short = 0;
/** What happens to the workspace while the plugin is at work, as a test has it: nothing, else this. */
let meanwhile: (() => void) | null = null;
const fake = {
  request: async (op: string, args: { molblock: string; hydrogens?: number[] }) => {
    if (op !== "add_hydrogens") throw new Error(op);
    meanwhile?.();
    const ct = readMolfile(args.molblock)!;
    const atoms = ct.atoms.map((a) => ({ el: a.symbol, x: a.x, y: a.y, z: a.z, ...(a.charge ? { charge: a.charge } : {}) }));
    const bonds = ct.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.type }));
    const n = atoms.length;
    let left = short;
    for (let i = 0; i < n; i++) {
      const sum = bonds.reduce((s, b) => s + (b.a1 === i || b.a2 === i ? b.order : 0), 0);
      let h = args.hydrogens ? args.hydrogens[i] : hydrogensOf({ el: atoms[i].el, charge: atoms[i].charge }, sum);
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
    // (the carboxylate drawn one way of its two: its charge on the oxygen its single bond is to)
    expect(m.atoms.slice(0, 5).map((a) => a.charge ?? 0)).toEqual([1, 0, 0, -1, 0]);
    expect([m.bonds[2].order, m.bonds[3].order]).toEqual([1, 2]);
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

  it("is not changed where the molecule changed while the card was open - a charge, a bond's order - and says so", async () => {
    for (const change of [
      (m: Molecule3D) => ({ ...m, atoms: m.atoms.map((a, i) => (i === 0 ? { ...a, charge: 1 } : a)) }),
      (m: Molecule3D) => ({ ...m, bonds: m.bonds.map((b, k) => (k === 2 ? { ...b, order: 1 } : k === 3 ? { ...b, order: 2 } : b)) }),
    ]) {
      const { store, molecule } = editor(glycine);
      const p = protonationOf(molecule(), null)!;
      store.getState().changeMolecule3d("meanwhile", molecule().id, change);
      const before = molecule();
      const forms = [p.sites[0].forms.findIndex((f) => f.name === "Carboxylic acid"), p.sites[1].forms.findIndex((f) => f.name === "Amine")];
      await expect(addHydrogensAsChosen(store, p, { forms, charges: new Map() })).rejects.toThrow("The molecule changed while this was open: nothing was added. Ask for its hydrogens again.");
      expect(molecule()).toBe(before);
    }
  });

  it("is not changed where an atom was moved, or the molecule given other frames, while its hydrogens were being placed - and says so", async () => {
    // (the hydrogens come back placed for the atoms where they were: on an atom moved meanwhile they would be in the wrong place)
    for (const [change, why] of [
      [(m: Molecule3D) => ({ ...m, atoms: m.atoms.map((a, i) => (i === 1 ? { ...a, x: a.x + 0.5 } : a)) }), "The molecule changed while this was open: nothing was added. Ask for its hydrogens again."],
      [(m: Molecule3D) => ({ ...m, frames: [m.atoms.flatMap((a) => [a.x, a.y, a.z + 0.1])] }), "It has 2 frames, and hydrogens are put on one geometry: nothing was added."],
    ] as const) {
      const { store, molecule } = editor(glycine);
      const p = protonationOf(molecule(), null)!;
      const forms = [p.sites[0].forms.findIndex((f) => f.name === "Carboxylic acid"), p.sites[1].forms.findIndex((f) => f.name === "Amine")];
      let before: Molecule3D | null = null;
      meanwhile = () => {
        store.getState().changeMolecule3d("meanwhile", molecule().id, change);
        before = molecule();
      };
      try {
        await expect(addHydrogensAsChosen(store, p, { forms, charges: new Map() })).rejects.toThrow(why);
      } finally {
        meanwhile = null;
      }
      expect(molecule()).toBe(before);
    }
  });

  it("is given its hydrogens where an atom moved by less than any file writes while they were placed", async () => {
    const { store, molecule } = editor(glycine);
    const p = protonationOf(molecule(), null)!;
    const forms = [p.sites[0].forms.findIndex((f) => f.name === "Carboxylic acid"), p.sites[1].forms.findIndex((f) => f.name === "Amine")];
    meanwhile = () => store.getState().changeMolecule3d("meanwhile", molecule().id, (m) => ({ ...m, atoms: m.atoms.map((a, i) => (i === 1 ? { ...a, x: a.x + 1e-6 } : a)) }));
    try {
      await addHydrogensAsChosen(store, p, { forms, charges: new Map() });
    } finally {
      meanwhile = null;
    }
    expect(molecule().atoms.filter((a) => a.el === "H")).toHaveLength(5);
  });
});

describe("a molecule whose file gives its rings as aromatic", () => {
  /** A ring of five atoms, its bonds aromatic (a molfile's bond type 4), as a file of imidazole - or, all carbons, of cyclopentadienyl - without its hydrogens gives it. */
  const ring = (els: string[]): Omit<Molecule3D, "id"> => ({
    atoms: els.map((el, k) => ({ el, x: 1.2 * Math.cos((2 * Math.PI * k) / 5), y: 1.2 * Math.sin((2 * Math.PI * k) / 5), z: 0 })),
    bonds: els.map((_, k) => ({ a1: k, a2: (k + 1) % 5, order: 4 })),
    at: { x: 0, y: 0 },
  });

  it("is drawn with single and double bonds, its hydrogens as many as its formula's - which nitrogen carries one waiting for the chemist", async () => {
    const { store, molecule } = editor(ring(["N", "C", "N", "C", "C"]));
    short = 0;
    const p = protonationOf(molecule(), null)!;
    expect(p.aromatic).toBe(true);
    expect(p.sites.map((s) => [s.kind, s.forms.map((f) => `${f.name}: ${f.where}`)])).toEqual([["azole", ["Imidazolium: H on N1, H on N3", "Imidazole: H on N1", "Imidazole: H on N3", "Imidazolate: no H"]]]);
    expect(p.start).toEqual([null]);
    await addHydrogensAsChosen(store, p, { forms: [1], charges: new Map() });
    const m = molecule();
    // (C3H4N2: an N-H and three C-H)
    expect(m.atoms.filter((a) => a.el === "H")).toHaveLength(4);
    expect(m.bonds.slice(0, 5).map((b) => b.order).sort()).toEqual([1, 1, 1, 2, 2]);
  });

  it("is not given hydrogens where its aromatic bonds cannot be drawn with single and double ones, and says where", async () => {
    const { store, molecule } = editor(ring(["C", "C", "C", "C", "C"]));
    const p = protonationOf(molecule(), null)!;
    expect(p.why).toMatch(/^C\d cannot be drawn with single and double bonds as its aromatic bonds are: nothing can be added\.$/);
    expect(protonatedSpecies(p, { forms: p.start, charges: new Map() })).toEqual({ why: p.why });
    const before = molecule();
    await expect(addHydrogensAsChosen(store, p, { forms: p.start, charges: new Map() })).rejects.toThrow(p.why!);
    expect(molecule()).toBe(before);
  });
});

describe("a molecule bonded to a metal", () => {
  /** Methylamine on zinc, or methoxide on iron: their bonds to the metal the metal's. */
  const onMetal = (metal: string, el: string, charge = 0): Omit<Molecule3D, "id"> => ({
    atoms: [
      { el: metal, x: 0, y: 0, z: 0 },
      { el, x: 2.1, y: 0, z: 0, ...(charge ? { charge } : {}) },
      { el: "C", x: 3.5, y: 0.3, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 1 },
    ],
    at: { x: 0, y: 0 },
    bondOrders: "estimated",
  });

  it("an amine on it given an amine's hydrogens where its bond is chosen dative - not an amido's", async () => {
    const { store, molecule } = editor(onMetal("Zn", "N"));
    short = 0;
    const p = protonationOf(molecule(), null)!;
    expect(p.sites.map((s) => s.forms.map((f) => `${f.name}: ${f.where}`))).toEqual([["Covalent bond to Zn: H on N2", "Dative bond to Zn: 2 H on N2"]]);
    expect(p.start).toEqual([null]);
    await addHydrogensAsChosen(store, p, { forms: [1], charges: new Map() });
    const m = molecule();
    const on = (i: number) => m.bonds.filter((b) => (b.a1 === i && m.atoms[b.a2].el === "H") || (b.a2 === i && m.atoms[b.a1].el === "H")).length;
    expect([on(0), on(1), on(2)]).toEqual([0, 2, 3]);
  });

  it("an atom charged as its bonds leave no room for: its own charge still among those offered, as the card shows it", () => {
    // (an ether's oxygen drawn with a charge of -1, as a file may give it)
    const { molecule } = editor({
      atoms: [
        { el: "C", x: 0, y: 0, z: 0 },
        { el: "O", x: 1.4, y: 0, z: 0, charge: -1 },
        { el: "C", x: 2.1, y: 1.2, z: 0 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 1 },
      ],
      at: { x: 0, y: 0 },
    });
    expect(protonationOf(molecule(), null)!.others).toEqual([{ atom: 1, label: "O2", charges: [-1, 0, 1], now: -1 }]);
  });

  it("an oxygen on it charged as it is drawn, offered the charges its other bonds leave room for", () => {
    const { molecule } = editor(onMetal("Fe", "O", -1));
    const p = protonationOf(molecule(), null)!;
    expect(p.others).toEqual([{ atom: 1, label: "O2", charges: [-1, 0, 1], now: -1 }]);
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

describe("a PDB entry's ligand bonded to a metal ion of its own residue", () => {
  it("keeps the hydrogen on the atom the metal is bonded to: that bond is the metal's, in place of no hydrogen", async () => {
    // (a zinc ion bonded to ZZG's OXT: its HXT, which leaves as the residue bonds to another, stays)
    const ligand = entryOf(["N", "CA", "C", "O", "OXT"]);
    const oxt = at("OXT");
    const bp = ligand.biopolymer!;
    const { store, molecule } = editor({
      ...ligand,
      atoms: [...ligand.atoms, { el: "Zn", x: oxt.x - 2, y: oxt.y, z: oxt.z }],
      bonds: [...ligand.bonds, { a1: 4, a2: 5, order: 1 }],
      ligandOrders: { 0: "dictionary", 1: "dictionary" },
      biopolymer: { ...bp, names: [...bp.names, "ZN"], residueOf: [...bp.residueOf, 1], residues: [...bp.residues, { name: "ZN", chain: "A", seq: 2, iCode: "", standard: false }], structure: [null, null] },
    });
    const zn = readComponent(`data_ZN
_chem_comp.id ZN
loop_
_chem_comp_atom.comp_id
_chem_comp_atom.atom_id
_chem_comp_atom.type_symbol
_chem_comp_atom.charge
_chem_comp_atom.pdbx_leaving_atom_flag
_chem_comp_atom.pdbx_model_Cartn_x_ideal
_chem_comp_atom.pdbx_model_Cartn_y_ideal
_chem_comp_atom.pdbx_model_Cartn_z_ideal
ZN ZN ZN 2 N 0.000 0.000 0.000
`)!;
    looked = { components: new Map([["ZZG", ZZG], ["ZN", zn]]), absent: [] };
    const p = protonationOf(molecule(), 0)!;
    await addHydrogensFromDictionary(store, p);
    expect(molecule().biopolymer!.names.slice(6)).toEqual(["H", "H2", "HA2", "HA3", "HXT"]);
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
