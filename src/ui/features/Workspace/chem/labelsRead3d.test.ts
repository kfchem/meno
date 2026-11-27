import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { identity } from "../../../../lib/chem/identity";
import type { ChemClient } from "../../../../lib/roles/client";
import { stereoGraphOf } from "../../../../lib/chem/stereoOpen";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { drawnFromSmiles } from "./testdata/identityCases";
import { identityOfDrawn } from "./identityOf";
import { blocksOf } from "./make3d";
import { blocksRead, countOf } from "./menoIsomers";
import { isomersToMake, openStereo } from "./openStereo";

// A structure drawn with a label - a group typed by its name, NHBoc, OMe, Ph - is written into its block as the atoms the label stands for;
// Meno reads that block back for its stereoisomers atom by atom, every atom the block writes out in its own place, so that it is read,
// and is the structure drawn out atom by atom.

const L = NOMINAL_BOND_LENGTH;

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return () => store.getState();
}

/** `label` typed, as a chemist types it, on an atom drawn from `from`, at `x`, `y`. */
function typed(s: ReturnType<typeof editor>, from: number, x: number, y: number, label: string): number {
  const at = s().addAtomBonded(from, x, y, "C", 1);
  s().beginLabelEdit(at, label.toLowerCase());
  s().setLabelEditValue(label);
  s().commitLabelEdit(label.toLowerCase());
  return at;
}

/** Cyclohexane with `label` typed at one of its ends, to the right of the ring (`left`: to its left). */
function cyclohexaneWith(label: string, left = false) {
  const s = editor();
  const ring: number[] = [];
  for (let k = 0; k < 6; k++) {
    const t = (Math.PI / 3) * k + (left ? Math.PI : 0);
    ring.push(s().addAtom(L * Math.cos(t), L * Math.sin(t), "C"));
  }
  for (let k = 0; k < 6; k++) s().addBond(ring[k], ring[(k + 1) % 6], 1);
  const x = typed(s, ring[0], left ? -2 * L : 2 * L, 0, label);
  return { model: s().model, x };
}

/** The block the page asks 3D of, of the whole drawing. */
const blockOfAll = (model: ReturnType<typeof cyclohexaneWith>["model"]) => blocksOf(model, model.atoms.map((a) => a.id))[0];

// (each label with the same structure written atom by atom - derived by hand from what the label stands for)
const labels: [label: string, drawnOut: string][] = [
  ["NHBoc", "C1CCCCC1NC(=O)OC(C)(C)C"],
  ["OMe", "C1CCCCC1OC"],
  ["Ph", "C1CCCCC1c1ccccc1"],
  ["Boc", "C1CCCCC1C(=O)OC(C)(C)C"],
  ["CO2Me", "C1CCCCC1C(=O)OC"],
  ["tBu", "C1CCCCC1C(C)(C)C"],
  ["Et", "C1CCCCC1CC"],
  // (no charge typed: the phosphorus as written, four bonds and no charge - its count of H the same either way it is drawn)
  ["PPh3", "C1CCCCC1P(c1ccccc1)(c1ccccc1)c1ccccc1"],
];

// (a stand-in for the plugin that makes structures in 3D: it makes each stereoisomer it is given)
const noPlugin = {
  request: async (_op: string, args: { configured: unknown }) => ({ isomers: [{ configured: args.configured, smiles: "x" }], free: false }),
} as unknown as ChemClient;

describe("a structure drawn with a label is read for its 3D", () => {
  it.each(labels)("cyclohexane with %s: read, every atom its block writes out in its own place, the structure drawn out (%s)", async (label, drawnOut) => {
    const block = blockOfAll(cyclohexaneWith(label).model);
    const graph = stereoGraphOf([block.molblock])!;
    // (the label written out: more atoms in the block than drawn)
    expect(graph.atoms.length).toBeGreaterThan(7);
    const read = blocksRead([block.molblock]);
    expect(read).not.toBeNull();
    expect(read!.input.atoms).toHaveLength(graph.atoms.length);
    expect(read!.bondAt).toHaveLength(graph.bonds.length);
    expect(identity(read!.input).text).toBe(identityOfDrawn(drawnFromSmiles(drawnOut) as never).text);
    const open = await openStereo(noPlugin, [block.molblock]);
    expect(open.left.atoms).toEqual([]);
    expect(countOf(open.read)).toEqual({ count: 1 });
  });

  it("a file's contracted label still opens as the one label", () => {
    const block = blockOfAll(cyclohexaneWith("NHBoc").model);
    const opened = moleculesToEditorModel(readMoleculesFromText(block.molblock, "mol")).model;
    expect(opened.atoms).toHaveLength(7);
    expect(opened.atoms.some((a) => a.abbrev)).toBe(true);
  });

  /** A carbon bearing OMe and Et, typed as labels, and a methyl - 2-methoxybutane - its bond to the methyl wedged where `wedge`. */
  function centreWithLabels(wedge?: "up" | "down") {
    const s = editor();
    const centre = s().addAtom(0, 0, "C");
    const methyl = s().addAtomBonded(centre, 0, L, "C", 1);
    typed(s, centre, -L * Math.cos(Math.PI / 6), -L / 2, "OMe");
    typed(s, centre, L * Math.cos(Math.PI / 6), -L / 2, "Et");
    if (wedge) {
      const bond = s().model.bonds.find((b) => (b.a === centre && b.b === methyl) || (b.b === centre && b.a === methyl))!;
      s().setBondStereo(bond.id, wedge);
    }
    return { model: s().model, centre };
  }

  it("a stereocentre bearing labels drawn plain: one centre open, at the block's own place of it - two stereoisomers", async () => {
    const { model, centre } = centreWithLabels();
    const block = blockOfAll(model);
    const made = await isomersToMake(noPlugin, block.molblock, undefined, "all");
    const open = await openStereo(noPlugin, [block.molblock]);
    expect(open.left.atoms).toEqual([block.atoms.indexOf(centre)]);
    expect(open.left.bonds).toEqual([]);
    expect(countOf(open.read)).toEqual({ count: 2 });
    expect(identity(open.read.input).text).toBe(identityOfDrawn(drawnFromSmiles("COC(C)CC") as never).text);
    expect(made.count).toBe(2);
  });

  it("the same centre wedged: none open, one stereoisomer", async () => {
    const { model } = centreWithLabels("up");
    const block = blockOfAll(model);
    const made = await isomersToMake(noPlugin, block.molblock, undefined, "all");
    expect(made.open.left.atoms).toEqual([]);
    expect(made.count).toBe(1);
  });

  it("the page's path: a labelled structure's block is made, never refused as unread", async () => {
    const made = await isomersToMake(noPlugin, blockOfAll(cyclohexaneWith("NHBoc").model).molblock, undefined, "one");
    expect(made.count).toBe(1);
    expect(made.isomers).toHaveLength(1);
  });

  it.each(labels)("%s at a ring's left end, shown read from its bond, is read the same", async (label, drawnOut) => {
    const block = blockOfAll(cyclohexaneWith(label, true).model);
    const read = blocksRead([block.molblock]);
    expect(read).not.toBeNull();
    expect(read!.input.atoms).toHaveLength(stereoGraphOf([block.molblock])!.atoms.length);
    expect(identity(read!.input).text).toBe(identityOfDrawn(drawnFromSmiles(drawnOut) as never).text);
    await expect(openStereo(noPlugin, [block.molblock])).resolves.toBeDefined();
  });
});
