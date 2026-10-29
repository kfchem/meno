import { describe, expect, it } from "vitest";
import { resolve, type Reading, type Where } from "./resolve";

/** A reading as the table says it: how it reads, and as what - its label (or element) and formula. */
function said(r: Reading): string {
  return r.as === "element" ? `element ${r.formula}` : `${r.as} ${r.label} ${r.formula}`;
}

/** Each string where it is typed, and what it reads as there, the place's own reading first; [] where it reads as nothing. */
const TABLE: [string, Where, string[]][] = [
  // an R group or a substituent
  ["Me", "group", ["label Me CH3"]],
  ["otbs", "group", ["label OTBS C6H15OSi"]],
  ["Cl", "group", ["element Cl"]],
  ["13C", "group", ["element 13C"]],
  ["*C(=O)N(C)C", "group", ["smiles *C(=O)N(C)C C3H6NO"]],
  // (an element's symbol that is a group's name too is the group, as on the canvas)
  ["Ac", "group", ["label Ac C2H3O"]],
  ["Ts", "group", ["label Ts C7H7O2S"]],
  // (no "*": never a SMILES)
  ["CO", "group", []],
  ["DMF", "group", []],
  ["Qqx", "group", []],
  // a whole molecule, from Quick Add
  ["CC(=O)O", "molecule", ["smiles CC(=O)O C2H4O2"]],
  ["c1ccccc1", "molecule", ["smiles c1ccccc1 C6H6"]],
  ["c1ccncc1", "molecule", ["smiles c1ccncc1 C5H5N"]],
  ["CO", "molecule", ["smiles CO CH4O"]],
  ["DMF", "molecule", ["label DMF C3H7NO"]],
  ["dmf", "molecule", ["label DMF C3H7NO"]],
  ["Et3N", "molecule", ["label Et3N C6H15N"]],
  ["PdCl2", "molecule", ["label PdCl2 Cl2Pd"]],
  ["THF", "molecule", ["label THF C4H8O"]],
  // (both: the SMILES first, the dictionary's after it)
  ["NBS", "molecule", ["smiles NBS BH4NS", "label NBS C4H4BrNO2"]],
  ["BrCN", "molecule", ["smiles BrCN CH4BrN", "label BrCN CBrN"]],
  // (an aromatic atom in no ring is no SMILES: BnBr is benzyl bromide)
  ["BnBr", "molecule", ["label BnBr C7H7Br"]],
  // (a group is no molecule; nor is what reads as neither)
  ["Me", "molecule", []],
  ["Qqx", "molecule", []],
  ["c1cccc1", "molecule", []],
  ["*CC", "molecule", []],
];

describe("a typed string read where it is typed", () => {
  it.each(TABLE)("%s as a %s", (typed, where, readings) => {
    expect(resolve(typed, where).readings.map(said)).toEqual(readings);
  });

  it("where it reads as nothing an R group can be, why - said as what it is", () => {
    expect(resolve("Qqx", "group").problem).toBe('"Qqx" is not a group, an element or a SMILES with "*"');
    expect(resolve("DMF", "group").problem).toBe("DMF is a whole molecule, not a group: it is attached by none of its atoms");
    expect(resolve("*=C", "group").problem).toBe('The "*" is bonded by one single bond to the atom the group is attached by.');
  });

  it("a molecule the dictionary has is named, a formula read by rule only by its label", () => {
    const [dmf] = resolve("DMF", "molecule").readings;
    expect(dmf).toMatchObject({ as: "label", name: "N,N-dimethylformamide" });
    expect(resolve("Et3N", "molecule").readings[0]).not.toHaveProperty("name");
  });

  it("a molecule is attached by none of its atoms, a ligand's donors given up", () => {
    for (const typed of ["DMF", "THF", "c1ccccc1"]) {
      const [r] = resolve(typed, "molecule").readings;
      expect(r.as !== "element" && r.group.attach).toEqual([]);
    }
  });

  it("an empty string reads as nothing, and says no problem", () => {
    expect(resolve("  ", "molecule")).toEqual({ readings: [] });
  });
});
