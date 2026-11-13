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

  it("says that a double bond's cis or trans, as it is drawn, is not kept - none where its drawing states none", () => {
    const c = (id: number, x: number, y: number) => atom(id, x * L, y * L);
    const chain = (places: [number, number][], double: number): Model => ({
      atoms: places.map(([x, y], i) => c(i, x, y)),
      bonds: places.slice(1).map((_, i) => ({ id: 100 + i, a: i, b: i + 1, order: (i === double ? 2 : 1) as 1 | 2 })),
    });
    const group = new Set([1, 2, 3, 4, 5]);
    // (CC/C=C/CC, its group atoms 1-5, the bond out to atom 0: trans, as drawn - said, its SMILES as ever)
    const trans = chain([[0, 0], [0.87, 0.5], [1.73, 0], [2.6, 0.5], [3.46, 0], [4.33, 0.5]], 2);
    expect(abbreviationFromSelection(trans, group)).toEqual({ smiles: "*CC=CCC", notKept: "The cis or trans of its double bonds is not kept: an abbreviation has no stereo." });
    // (CC/C=C\CC: cis, as drawn - said too)
    const cis = chain([[0, 0], [0.87, 0.5], [1.73, 0], [2.6, 0.5], [2.6, 1.5], [3.46, 2]], 2);
    expect(abbreviationFromSelection(cis, group)).toEqual({ smiles: "*CC=CCC", notKept: "The cis or trans of its double bonds is not kept: an abbreviation has no stereo." });
    // (and with a wedge besides: both said, in one line)
    const both = { ...trans, bonds: trans.bonds.map((b) => (b.id === 104 ? { ...b, stereo: "up" as const } : b)) };
    expect(abbreviationFromSelection(both, group)).toMatchObject({ notKept: "Its wedges and the cis or trans of its double bonds are not kept: an abbreviation has no stereo." });
    // (a terminal =CH2: no cis or trans to state - nothing said)
    const terminal = chain([[0, 0], [0.87, 0.5], [1.73, 0], [2.6, 0.5]], 2);
    expect(abbreviationFromSelection(terminal, new Set([1, 2, 3]))).toEqual({ smiles: "*CC=C" });
    // (a cyclohexenyl's C=C, in its ring of six: none either)
    const ring = Array.from({ length: 6 }, (_, k): [number, number] => [1 + Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]);
    const cyclohexenyl: Model = {
      atoms: [c(0, -1, 0), ...ring.map(([x, y], k) => c(k + 1, x, y))],
      bonds: [{ id: 100, a: 0, b: 4, order: 1 }, ...ring.map((_, k) => ({ id: 101 + k, a: k + 1, b: ((k + 1) % 6) + 1, order: (k === 1 ? 2 : 1) as 1 | 2 }))],
    };
    expect(abbreviationFromSelection(cyclohexenyl, new Set([1, 2, 3, 4, 5, 6]))).not.toHaveProperty("notKept");
    // (a trans double bond elsewhere in the drawing, the group saturated: nothing said of it)
    expect(abbreviationFromSelection(trans, new Set([4, 5]))).toEqual({ smiles: "*CC" });
    // (the group's bond out itself a double bond drawn trans: its cis or trans goes with it - said)
    expect(abbreviationFromSelection(trans, new Set([3, 4, 5]))).toEqual({ smiles: "*=CCC", notKept: "The cis or trans of its double bonds is not kept: an abbreviation has no stereo." });
    // (a butatriene drawn with its cis or trans, wholly in the group: said; one only half in it: not the group's to say)
    const butatriene: Model = {
      atoms: [c(6, -0.87, 0.5), c(0, 0, 0), c(1, 0.87, 0.5), c(2, 1.87, 0.5), c(3, 2.87, 0.5), c(4, 3.87, 0.5), c(5, 4.73, 0)],
      bonds: [
        { id: 200, a: 6, b: 0, order: 1 },
        { id: 201, a: 0, b: 1, order: 1 },
        { id: 202, a: 1, b: 2, order: 2 },
        { id: 203, a: 2, b: 3, order: 2 },
        { id: 204, a: 3, b: 4, order: 2 },
        { id: 205, a: 4, b: 5, order: 1 },
      ],
    };
    expect(abbreviationFromSelection(butatriene, new Set([0, 1, 2, 3, 4, 5]))).toMatchObject({ notKept: "The cis or trans of its double bonds is not kept: an abbreviation has no stereo." });
    expect(abbreviationFromSelection(butatriene, new Set([4, 5]))).toEqual({ smiles: "*=CC" });
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
