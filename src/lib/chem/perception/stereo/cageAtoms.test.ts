import { describe, expect, it } from "vitest";
import { cipInput } from "../../cip/testdata/cipFrom";
import { cageAtoms } from "./units";

const caged = (smiles: string) => [...cageAtoms(cipInput(smiles))].sort((a, b) => a - b);

describe("cageAtoms: atoms joined to another by three short paths sharing no atom", () => {
  it("norbornane's and bicyclo[2.2.2]octane's bridgeheads, quinuclidine's N and C4", () => {
    expect(caged("C1CC2CCC1C2")).toEqual([2, 5]);
    expect(caged("C1CC2CCC1CC2")).toEqual([2, 5]);
    expect(caged("C1CN2CCC1CC2")).toEqual([2, 5]);
  });

  it("every atom of cubane, and adamantane's four bridgeheads", () => {
    expect(caged("C12C3C4C1C5C2C3C45")).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(caged("C1C2CC3CC1CC(C2)C3")).toEqual([1, 3, 5, 7]);
  });

  it("no fused junction (decalin, bicyclo[3.3.0]octane, the small fused bicycles), no bridgehead whose bridges are long enough to stand in or out (bicyclo[4.4.1]undecane), no plain ring", () => {
    expect(caged("C1CCC2CCCCC2C1")).toEqual([]);
    expect(caged("C1CCCC2CCCCC(C1)C2")).toEqual([]);
    expect(caged("C1CCCCC1")).toEqual([]);
    // (a fused system's junctions are bonded, and a bond is no bridge: bicyclo[3.3.0]octane's, [3.1.0]'s, [1.1.0]'s - found in review)
    expect(caged("C1CC2CCCC2C1")).toEqual([]);
    expect(caged("C1CC2CC12")).toEqual([]);
    expect(caged("C1C2CC12")).toEqual([]);
  });
});
