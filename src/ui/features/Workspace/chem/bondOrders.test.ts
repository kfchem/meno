import { describe, expect, it, vi } from "vitest";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import type { ChemClient } from "../../../../lib/roles/client";
import { connectStoreToDocument, createEditorStore } from "../store";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { stillUnknown } from "../utils/completeness";
import type { Component } from "../../../../lib/chem/ccd";
import { addHydrogens, canAddHydrogens, canAskDictionary, canGiveOrders, ordersFromDictionary, ordersFromSmiles, perceiveOrders } from "./bondOrders";

/** The worker, as these tests have it answer: each request's answer by its name. */
const answers: Record<string, (args: Record<string, unknown>) => unknown> = {};
const asked: string[] = [];
const fake = {
  request: async (op: string, args: Record<string, unknown>) => {
    asked.push(op);
    return answers[op](args);
  },
} as unknown as ChemClient;
vi.mock("../../../../lib/roles/worker", () => ({ chemWorker: async () => fake, chemAtHand: async () => true }));
/** The dictionary, as these tests have it answer: the components found, or null - the chemist said no. */
let looked: { components: Map<string, Component>; absent: string[] } | null = null;
vi.mock("../../../../lib/net/components", () => ({ componentsNamed: async () => looked }));

/** Acetic acid with its hydrogens, every bond single, as an XYZ file gives it. */
const acetic: Omit<Molecule3D, "id"> = {
  atoms: [
    { el: "C", x: 0, y: 0, z: 0 },
    { el: "C", x: 1.5, y: 0, z: 0 },
    { el: "O", x: 2.2, y: 1.1, z: 0 },
    { el: "O", x: 2.2, y: -1.1, z: 0 },
    { el: "H", x: -0.4, y: 1, z: 0 },
    { el: "H", x: -0.4, y: -0.5, z: 0.9 },
    { el: "H", x: -0.4, y: -0.5, z: -0.9 },
    { el: "H", x: 3.1, y: -1, z: 0 },
  ],
  bonds: [
    [0, 1], [1, 2], [1, 3], [0, 4], [0, 5], [0, 6], [3, 7],
  ].map(([a1, a2]) => ({ a1, a2, order: 1 })),
  at: { x: 0, y: 0 },
  bondOrders: "unknown",
};

/** Two alanines' alpha carbons, and a ligand of two atoms bound to them, with no hydrogens, as an X-ray entry gives it. */
const entry: Omit<Molecule3D, "id"> = {
  atoms: [
    { el: "C", x: 0, y: 0, z: 0 },
    { el: "C", x: 3.8, y: 0, z: 0 },
    { el: "C", x: 0, y: 9, z: 0 },
    { el: "O", x: 1.2, y: 9, z: 0 },
  ],
  bonds: [{ a1: 2, a2: 3, order: 1 }],
  at: { x: 0, y: 0 },
  bondOrders: "unknown",
  biopolymer: {
    names: ["CA", "CA", "C1", "O1"],
    residueOf: [0, 1, 2, 2],
    residues: [
      { name: "ALA", chain: "A", seq: 1, iCode: "", standard: true },
      { name: "ALA", chain: "A", seq: 2, iCode: "", standard: true },
      { name: "LIG", chain: "A", seq: 101, iCode: "", standard: false },
    ],
    structure: [null, null, null],
  },
};

function editor(m: Omit<Molecule3D, "id">) {
  const doc = createWorkspaceDocument();
  doc.edit("add", (d) => addMolecule3d(d, m));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, molecule: () => store.getState().molecules3d[0] };
}

describe("a molecule in 3D's bond orders, sought from its shape", () => {
  it("are learnt of it where it has hydrogens - no undo step of their own", () => {
    const { doc, store, molecule } = editor(acetic);
    // (drawing_of's answer: the heavy atoms, the carbonyl double)
    answers.drawing_of = () => ({
      perceived: true,
      molblock: writeMolfile3d(acetic.atoms.slice(0, 4), [{ a1: 0, a2: 1, order: 1 }, { a1: 1, a2: 2, order: 2 }, { a1: 1, a2: 3, order: 1 }]),
    });
    return perceiveOrders(store, molecule(), fake).then(() => {
      expect(molecule().bondOrders).toBe("perceived");
      expect(molecule().bonds.map((b) => b.order)).toEqual([1, 2, 1, 1, 1, 1, 1]);
      expect(doc.history().undoLabel).toBe("add");
    });
  });

  it("stay unknown where the plugin cannot find them", async () => {
    const { store, molecule } = editor(acetic);
    answers.drawing_of = (args) => ({ perceived: false, molblock: args.molblock });
    await perceiveOrders(store, molecule(), fake);
    expect(molecule().bondOrders).toBe("unknown");
  });

  it("are not asked for where it has no hydrogens - an X-ray entry's ligand: which is then given them from a SMILES, then its hydrogens", async () => {
    const { doc, store, molecule } = editor(entry);
    asked.length = 0;
    const before = molecule();
    await perceiveOrders(store, molecule(), fake);
    expect(asked).toEqual([]);
    expect(molecule()).toBe(before);
    expect(stillUnknown(molecule())).toEqual([2, 3]);
    expect(canGiveOrders(molecule(), [2, 3])).toBe(true);
    expect(canAddHydrogens(molecule(), [2, 3])).toBe(false);

    answers.orders_from_smiles = () => ({ molblock: writeMolfile3d(entry.atoms.slice(2), [{ a1: 0, a2: 1, order: 2 }]) });
    await ordersFromSmiles(store, molecule().id, 3, "C=O");
    expect(molecule().bonds[0].order).toBe(2);
    expect(molecule().bondOrders).toBe("assigned");
    expect(stillUnknown(molecule())).toEqual([]);
    expect(doc.history().undoLabel).toBe("bond orders");

    answers.add_hydrogens = () => ({
      molblock: writeMolfile3d(
        [...entry.atoms.slice(2), { el: "H", x: -0.5, y: 9.9, z: 0 }, { el: "H", x: -0.5, y: 8.1, z: 0 }],
        [{ a1: 0, a2: 1, order: 2 }, { a1: 0, a2: 2, order: 1 }, { a1: 0, a2: 3, order: 1 }],
      ),
    });
    expect(canAddHydrogens(molecule(), [2, 3])).toBe(true);
    await addHydrogens(store, molecule().id, 2);
    expect(molecule().atoms.length).toBe(6);
    expect(doc.history().undoLabel).toBe("add hydrogens");
    expect(canAddHydrogens(molecule(), [2, 3, 4, 5])).toBe(false);
    // (sought again, as an edit of it makes it another: the orders given stay)
    await perceiveOrders(store, molecule(), fake);
    expect(molecule().bondOrders).toBe("assigned");
    doc.undo();
    expect(molecule().atoms.length).toBe(4);
  });

  it("from a SMILES that is not the ligand's: an error, and the molecule as it was", async () => {
    const { store, molecule } = editor(entry);
    answers.orders_from_smiles = () => {
      throw new Error("the SMILES is not this molecule's: its atoms and bonds do not match");
    };
    await expect(ordersFromSmiles(store, molecule().id, 3, "CCO")).rejects.toThrow(/not this molecule's/);
    expect(molecule().bondOrders).toBe("unknown");
    // (a chain's atom: none of Meno's to give)
    await expect(ordersFromSmiles(store, molecule().id, 0, "C")).rejects.toThrow(/Point at the ligand/);
  });

  it("from the dictionary: every residue it has, as one undo step - and nothing where the chemist says no to the network", async () => {
    const { doc, store, molecule } = editor(entry);
    expect(canAskDictionary(molecule())).toBe(true);
    looked = null;
    expect(await ordersFromDictionary(store, molecule().id)).toBeNull();
    expect(doc.history().undoLabel).toBe("add");

    const ala: Component = { id: "ALA", atoms: [{ name: "CA", element: "C", charge: 0 }], bonds: [] };
    const lig: Component = { id: "LIG", atoms: [{ name: "C1", element: "C", charge: 0 }, { name: "O1", element: "O", charge: 0 }], bonds: [{ a: "C1", b: "O1", order: 2 }] };
    looked = { components: new Map([["ALA", ala], ["LIG", lig]]), absent: [] };
    expect(await ordersFromDictionary(store, molecule().id)).toEqual({ given: 3, of: 3, absent: [] });
    expect(molecule().bonds[0].order).toBe(2);
    expect(molecule()).toMatchObject({ bondOrders: "dictionary", chainOrders: "dictionary" });
    expect(doc.history().undoLabel).toBe("bond orders");
    // (all known: not offered again; its ligand's hydrogens are)
    expect(canAskDictionary(molecule())).toBe(false);
    expect(canAddHydrogens(molecule(), [2, 3])).toBe(true);
    doc.undo();
    expect(molecule().bondOrders).toBe("unknown");
  });
});
