import { describe, expect, it } from "vitest";
import { anionOf, partsOf, type Part } from "./formula";
import { structureFormula, type GroupStructure } from "./ligands";

const PH: GroupStructure = {
  atoms: [{ el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }],
  bonds: [0, 1, 2, 3, 4, 5].map((i) => ({ a1: i, a2: (i + 1) % 6, order: i % 2 ? 1 : 2 })),
  attach: [0],
};
const parts = (text: string): Part[] => partsOf(text, (t, i) => (t.startsWith("Ph", i) ? "Ph" : undefined), (g) => (g === "Ph" ? PH : null))!;
const anion = (text: string, charge = 1) => anionOf(parts(text), charge);
const charges = (s: GroupStructure) => s.atoms.flatMap((a) => (a.charge ? [`${a.el}${a.charge > 0 ? "+" : "-"}`] : []));
const orders = (s: GroupStructure) => s.bonds.filter((b) => b.a1 === 0).map((b) => b.order).sort();

describe("an anion read from its formula", () => {
  it("is an ate anion where a centre with no lone pair left takes one part more", () => {
    const cases = { BF4: "BF4", PF6: "F6P", SbF6: "F6Sb", AsF6: "AsF6", AlCl4: "AlCl4", BPh4: "C24H20B", BH4: "BH4" };
    for (const [text, f] of Object.entries(cases)) {
      const s = anion(text)!;
      expect(structureFormula(s), text).toBe(f);
      expect(charges(s), text).toEqual([`${s.atoms[0].el}-`]);
    }
    // a centre with a lone pair left at that valence takes no more so: PCl4 is no anion
    expect(anion("PCl4")).toBeNull();
  });

  it("is an oxoanion where a centre has oxygens: double bonds but one for each charge, and one for each hydrogen", () => {
    const clo4 = anion("ClO4")!;
    expect(orders(clo4)).toEqual([1, 2, 2, 2]);
    expect(charges(clo4)).toEqual(["O-"]);
    expect(orders(anion("IO4")!)).toEqual([1, 2, 2, 2]);
    expect(orders(anion("ClO2")!)).toEqual([1, 2]);
    expect(orders(anion("ClO")!)).toEqual([1]);
    expect(charges(anion("CO3", 2)!)).toEqual(["O-", "O-"]);
    expect(charges(anion("PO4", 3)!)).toEqual(["O-", "O-", "O-"]);
    const hco3 = anion("HCO3")!;
    expect(hco3.atoms.filter((a) => a.el === "O" && a.hs === 1)).toHaveLength(1);
    expect(hco3.atoms[0].hs).toBe(0);
  });

  it("is none where no valence of the centre's own is met, nor a second-row centre's more than four bonds", () => {
    for (const text of ["CF5", "SO3", "BF3", "OPh", "F4"]) expect(anion(text), text).toBeNull();
    // (but nitrate, whose N keeps to four bonds by a charge of its own: N+ with one N=O and two O-)
    const nitrate = anion("NO3")!;
    expect(nitrate.atoms.map((a) => `${a.el}${a.charge ?? 0}`)).toEqual(["N1", "O0", "O-1", "O-1"]);
    expect(nitrate.bonds.map((b) => b.order)).toEqual([2, 1, 1]);
    expect(anion("NO3", 2)).toBeNull();
    // an ate anion is of one charge
    expect(anion("BF4", 2)).toBeNull();
  });
});
