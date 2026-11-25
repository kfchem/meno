import { describe, expect, it } from "vitest";
import { chemMolblock } from "../roles/molblock";
import { overBonded, takesLabelPair, type WriterModel } from "./molWriter";
import { takesLentPair } from "./perception/elements";

/**
 * A ligand's label (PPh3, PtBu3 - a neutral donor of the dictionary) lends its pair only to an atom that takes one: a metal a donor's
 * bond to is a coordination, or boron, aluminium, gallium, indium. Its bond to any other atom is written as it is drawn - a single
 * bond to a chain's carbon, a double one to an ylide's carbon or an oxide's oxygen - so that the carbon is not counted with five bonds.
 */
type Spec = [id: number, el: string, charge?: number];
const model = (atoms: Spec[], bonds: [number, number, 1 | 2 | 3][]): WriterModel => ({
  atoms: atoms.map(([id, el, charge], i) => ({ id, el, x: i * 1.5, y: i % 2 ? 0.5 : 0, ...(charge ? { charge } : {}) })),
  bonds: bonds.map(([a, b, order], i) => ({ id: 100 + i, a, b, order, stereo: "none" as const })),
});
/** The block's bond lines, as written. */
const bondLines = (m: WriterModel) => {
  const block = chemMolblock(m);
  return block.slice(block.indexOf("BEGIN BOND"), block.indexOf("END BOND")).split("\n").slice(1, -1).map((l) => l.replace(/^M {2}V30 /, ""));
};

describe("a ligand label's bond", () => {
  it("to a chain's carbon is a single bond: Ph3P-CH2-CH3, nothing over-bonded", () => {
    const m = model([[1, "PPh3"], [2, "C"], [3, "C"]], [[1, 2, 1], [2, 3, 1]]);
    expect(bondLines(m)[0]).toBe("1 1 1 2");
    expect(bondLines(m).some((l) => l.includes("DISP=COORD"))).toBe(false);
    expect([...overBonded(m)]).toEqual([]);
  });

  it("to the carbon between two is a single bond each: tBu3P-CH2-PtBu3", () => {
    const m = model([[1, "PtBu3"], [2, "C"], [3, "PtBu3"]], [[1, 2, 1], [2, 3, 1]]);
    expect(bondLines(m).slice(0, 2)).toEqual(["1 1 1 2", "2 1 2 3"]);
    expect(bondLines(m).some((l) => l.includes("DISP=COORD"))).toBe(false);
    expect([...overBonded(m)]).toEqual([]);
  });

  it("is written as the same atoms drawn out are: P bonded to the carbon by a single bond", () => {
    const label = bondLines(model([[1, "PPh3"], [2, "C"], [3, "C"]], [[1, 2, 1], [2, 3, 1]]));
    expect(label.slice(0, 2)).toEqual(["1 1 1 2", "2 1 2 3"]);
    // (the phenyls written after, each bonded to the P by a single bond: four single bonds at the P, as drawn out)
    const atP = label.map((l) => l.split(" ")).filter(([, , a1, a2]) => a1 === "1" || a2 === "1");
    expect(atP.map(([, type]) => type)).toEqual(["1", "1", "1", "1"]);
  });

  it("to a label is as to the atom it is attached by: a single bond to Et's carbon, a coordination bond to a metal's place M", () => {
    expect(bondLines(model([[1, "PPh3"], [2, "Et"]], [[1, 2, 1]]))[0]).toBe("1 1 1 2");
    expect(bondLines(model([[1, "Et"], [2, "PPh3"]], [[1, 2, 1]]))[0]).toBe("1 1 1 2");
    expect(takesLabelPair({ el: "M" })).toBe(true);
    expect(takesLabelPair({ el: "Et" })).toBe(false);
  });

  it("to a metal is a coordination bond still: Pd-PPh3", () => {
    expect(bondLines(model([[1, "Pd"], [2, "PPh3"]], [[1, 2, 1]]))[0]).toBe("1 9 1 2 DISP=COORD");
  });

  it("to boron is a coordination bond still: Ph3P->BH3 drawn without charges", () => {
    const m = model([[1, "B"], [2, "PPh3"]], [[1, 2, 1]]);
    expect(bondLines(m)[0]).toBe("1 9 1 2 DISP=COORD");
    expect([...overBonded(m)]).toEqual([]);
  });

  it("drawn double stays a double bond, lending nothing: Ph3P=CH-CH3 and Ph3P=O", () => {
    expect(bondLines(model([[1, "PPh3"], [2, "C"], [3, "C"]], [[1, 2, 2], [2, 3, 1]]))[0]).toBe("1 2 1 2");
    expect(bondLines(model([[1, "PPh3"], [2, "O"]], [[1, 2, 2]]))[0]).toBe("1 2 1 2");
  });

  it("from a charged label to a chain's carbon is a single bond: the phosphonium Ph3P+-CH2-CH3", () => {
    const m = model([[1, "PPh3", 1], [2, "C"], [3, "C"]], [[1, 2, 1], [2, 3, 1]]);
    const block = chemMolblock(m);
    expect(block).toMatch(/V30 1 P [^\n]* CHG=1\n/);
    expect(bondLines(m)[0]).toBe("1 1 1 2");
    expect([...overBonded(m)]).toEqual([]);
  });
});

describe("the atoms that take a ligand label's pair", () => {
  it("are the metals a donor's bond to is a coordination, and B, Al, Ga, In, Tl; no other", () => {
    expect(["Pd", "Pt", "Ni", "Rh", "Fe", "Cu", "Zn", "Li", "Mg", "B", "Al", "Ga", "In", "Tl"].filter((el) => !takesLentPair(el))).toEqual([]);
    expect(["C", "N", "O", "S", "P", "Si", "F", "Cl", "Br", "I", "H", "Sn", "Pb", "Bi", ""].filter(takesLentPair)).toEqual([]);
  });
});
