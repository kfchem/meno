import { describe, expect, it } from "vitest";
import { COORDINATION_BOND } from "../../../../lib/chem/molecule";
import { menoFileBytes, readMenoFile } from "../../../../lib/doc/menoFile";
import type { Conformers } from "../../../../lib/roles/client";
import { blocksOf, moleculeOf } from "../chem/make3d";
import { addMolecule3d, createWorkspaceDocument, emptyWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model, Molecule3D } from "../store/types";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { entryOfSet, setEntries, setEntryOfEntry } from "./entries";
import { pluginEntry } from "./programs";

/** A coordination bond, from the drawing to a molecule in 3D, a step's entry, the entry record, a plugin, and a saved workspace: one mark all the way. */

/** An ammine of Pt drawn: N, Pt and Cl, the N's bond to Pt an arrow from N, and the Pt-Cl bond plain. */
const drawn: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "N" },
    { id: 2, x: 1.5, y: 0, r: 0.9, el: "Pt" },
    { id: 3, x: 3, y: 0, r: 0.9, el: "Cl" },
  ],
  bonds: [
    { id: 11, a: 1, b: 2, order: 1, dative: true },
    { id: 12, a: 2, b: 3, order: 1 },
  ],
} as unknown as Model;

/** What the plugin answers for it: the drawn atoms, then the ammine's hydrogens; every bond single, as it says them. */
const answer: Conformers = {
  atoms: [{ el: "N", charge: 0 }, { el: "Pt", charge: 0 }, { el: "Cl", charge: 0 }, { el: "H", charge: 0 }, { el: "H", charge: 0 }, { el: "H", charge: 0 }],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 0, a2: 3, order: 1 },
    { a1: 0, a2: 4, order: 1 },
    { a1: 0, a2: 5, order: 1 },
  ],
  frames: [[0, 0, 0, 2.05, 0, 0, 4.35, 0, 0, -0.38, 0.95, 0, -0.38, -0.47, 0.82, -0.38, -0.47, -0.82]],
  energies: [0],
  field: "UFF",
  cip: { atoms: {}, bonds: {} },
  chosen: { atoms: {}, bonds: {} },
  smiles: "N->[Pt]Cl",
};

describe("a coordination bond", () => {
  it("is the CTfile's type in a molecule made in 3D from a drawing, from the atom that lends its pair - a plain bond as it was", () => {
    const [block] = blocksOf(drawn, [1]);
    expect(block.coordination).toEqual([0]);
    expect(block.molblock).toMatch(/M {2}V30 1 9 1 2\n/);
    const m = moleculeOf(answer, block);
    expect(m.bonds.slice(0, 2)).toEqual([
      { a1: 0, a2: 1, order: COORDINATION_BOND },
      { a1: 1, a2: 2, order: 1 },
    ]);
    // (a coordination bond drawn as such, not as an arrow: the same)
    const plain = { ...drawn, bonds: drawn.bonds.map((b) => (b.id === 11 ? { ...b, dative: undefined, coordination: true } : b)) } as Model;
    expect(moleculeOf(answer, blocksOf(plain, [1])[0]).bonds[0]).toEqual({ a1: 0, a2: 1, order: COORDINATION_BOND });
  });

  it("is marked in the entry record, single, and comes back the CTfile's type; a plugin is given it single and marked", () => {
    const m = { ...moleculeOf(answer, blocksOf(drawn, [1])[0]), id: 1, at: { x: 0, y: 0 } } as Molecule3D;
    const [e] = setEntries([m], "molecules");
    const record = entryOfSet(e, "0");
    expect(record.structure.bonds[0]).toEqual({ a1: 0, a2: 1, order: 1, coordination: true });
    expect(record.structure.bonds[1]).toEqual({ a1: 1, a2: 2, order: 1 });
    expect(setEntryOfEntry(record, { compound: 0, number: 1 })!.bonds[0]).toEqual({ a1: 0, a2: 1, order: COORDINATION_BOND });
    // (never a covalent single unmarked: docs/PLUGINS.md, *The entry a plugin is given*)
    expect(pluginEntry(e).bonds[0]).toEqual({ a1: 0, a2: 1, order: 1, coordination: true });
    expect(pluginEntry(e).bonds[1]).toEqual({ a1: 1, a2: 2, order: 1 });
    // (the metal and its ligands one fragment: a coordination bond joins as any bond)
    expect(pluginEntry(e).fragments).toEqual([e.atoms.map((_, i) => i)]);
  });

  it("is kept through a workspace saved and opened again", () => {
    const m = moleculeOf(answer, blocksOf(drawn, [1])[0]);
    const doc = addMolecule3d(emptyWorkspaceDocument(), { ...m, at: { x: 0, y: 0 } });
    const saving = createWorkspaceDocument();
    const store = createEditorStore(saving);
    connectStoreToDocument(store, saving);
    saving.edit("as it was", () => doc);
    const file = readMenoFile(menoFileBytes(workspaceText(store.getState()), []));
    const ws = readWorkspace(file.workspace)!;
    const opened = createWorkspaceDocument();
    const again = createEditorStore(opened);
    connectStoreToDocument(again, opened);
    again.getState().openWorkspace(ws, true);
    expect(again.getState().molecules3d[0].bonds[0]).toEqual({ a1: 0, a2: 1, order: COORDINATION_BOND });
  });
});
