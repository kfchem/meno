import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { readSmiles } from "../../../../lib/chem/smiles";
import { contractToAbbreviation, emptyWorkspaceDocument, expandAbbreviation } from "../document";
import type { Model } from "../store/types";
import { abbreviationFromSelection, stereoNotKept } from "./abbreviationFromSelection";

const atom = (id: number, x: number, y: number, el = "C") => ({ id, x, y, r: 0.9, el });
// an ethyl ester's ethoxy, drawn out: C1-C2(=O3)-O4-C5-C6, and a methyl on C1's other side, C7
const ester: Model = {
  atoms: [atom(1, 0, 0), atom(2, L, 0), atom(3, L, L, "O"), atom(4, 2 * L, 0, "O"), atom(5, 3 * L, 0), atom(6, 4 * L, 0), atom(7, -L, 0)],
  bonds: [
    { id: 11, a: 1, b: 2, order: 1 },
    { id: 12, a: 2, b: 3, order: 2 },
    { id: 13, a: 2, b: 4, order: 1 },
    { id: 14, a: 4, b: 5, order: 1 },
    { id: 15, a: 5, b: 6, order: 1 },
    { id: 16, a: 7, b: 1, order: 1 },
  ],
};

describe("a selection saved as an abbreviation", () => {
  it("is SMILES from a * where its one bond out leaves", () => {
    // the ethoxycarbonyl, C2 O3 O4 C5 C6: attached to C1
    const made = abbreviationFromSelection(ester, new Set([2, 3, 4, 5, 6]));
    expect(made).toEqual({ smiles: "*C(=O)OCC" });
    const read = readSmiles((made as { smiles: string }).smiles);
    expect(read.atoms.map((a) => a.el)).toEqual(["*", "C", "O", "O", "C", "C"]);
  });

  it("says that the stereo its bonds show is not kept, where they show any - its bond out too - and nothing where none", () => {
    const marked = (marks: Record<number, "up" | "down" | "wavy" | "either">) => ({ ...ester, bonds: ester.bonds.map((b) => (marks[b.id] ? { ...b, stereo: marks[b.id] } : b)) });
    const ethoxycarbonyl = new Set([2, 3, 4, 5, 6]);
    // (a wedge, or a hash, inside the group: its SMILES as ever, the wedges said not kept)
    expect(abbreviationFromSelection(marked({ 15: "up" }), ethoxycarbonyl)).toEqual({ smiles: "*C(=O)OCC", notKept: "Its wedges are not kept: an abbreviation has no stereo." });
    expect(abbreviationFromSelection(marked({ 14: "down" }), ethoxycarbonyl)).toMatchObject({ notKept: "Its wedges are not kept: an abbreviation has no stereo." });
    // (on its one bond out: that bond is the abbreviation's, and its wedge goes with it)
    expect(abbreviationFromSelection(marked({ 11: "up" }), ethoxycarbonyl)).toMatchObject({ notKept: "Its wedges are not kept: an abbreviation has no stereo." });
    // (a wavy bond, and a double bond drawn crossed: each by its own name)
    expect(abbreviationFromSelection(marked({ 15: "wavy" }), ethoxycarbonyl)).toMatchObject({ notKept: "Its wavy bonds are not kept: an abbreviation has no stereo." });
    expect(abbreviationFromSelection(marked({ 12: "either", 15: "up", 14: "wavy" }), ethoxycarbonyl)).toMatchObject({ notKept: "Its wedges, wavy bonds and crossed double bonds are not kept: an abbreviation has no stereo." });
    // (one elsewhere in the drawing, none in the group or on its bond out: nothing said)
    expect(abbreviationFromSelection(marked({ 16: "up" }), ethoxycarbonyl)).toEqual({ smiles: "*C(=O)OCC" });
    expect(stereoNotKept([{}, { stereo: "none" }])).toBeNull();
  });

  it("says why where it cannot be one", () => {
    // three bonds out
    expect(abbreviationFromSelection(ester, new Set([1, 2]))).toMatchObject({ problem: expect.stringMatching(/3 bonds/) });
    // none out: the whole structure
    expect(abbreviationFromSelection(ester, new Set([1, 2, 3, 4, 5, 6, 7]))).toMatchObject({ problem: expect.stringMatching(/one bond/) });
    // not held together
    expect(abbreviationFromSelection(ester, new Set([3, 6]))).toMatchObject({ problem: expect.anything() });
    // a label among them
    const labelled = { ...ester, atoms: ester.atoms.map((a) => (a.id === 6 ? { ...a, el: "Ph" } : a)) };
    expect(abbreviationFromSelection(labelled, new Set([5, 6]))).toMatchObject({ problem: expect.stringMatching(/Ph is a label/) });
  });

  it("shows as one atom with its label, which expands to the atoms as they were", () => {
    const doc = { ...emptyWorkspaceDocument(), model: ester, nextId: 100 };
    const ids = new Set([2, 3, 4, 5, 6]);
    const shown = contractToAbbreviation(doc, ids, "CO2Et");
    // C2 carries the label where it was; the rest are gone, the bond to C1 stays
    expect(shown.model.atoms.map((a) => [a.id, a.el])).toEqual([[1, "C"], [2, "CO2Et"], [7, "C"]]);
    expect(shown.model.bonds.map((b) => b.id)).toEqual([11, 16]);
    const back = expandAbbreviation(shown, 2);
    const at = (d: typeof back, el: string) => d.model.atoms.filter((a) => a.el === el).map((a) => [a.x, a.y]).sort();
    expect(at(back, "O")).toEqual(at(doc, "O"));
    expect(back.model.bonds.filter((b) => b.order === 2)).toHaveLength(1);
    // two bonds out: left as it is
    expect(contractToAbbreviation(doc, new Set([1, 2]), "X")).toBe(doc);
  });
});
