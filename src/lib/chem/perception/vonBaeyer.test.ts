import { describe, expect, it } from "vitest";
import { fromSmiles } from "../../layout/testdata/fromSmiles";
import { factsOf } from "./facts";
import { vonBaeyer } from "./vonBaeyer";

// The descriptor written from Meno's numbering is the name's (foundation part 16, section C: the 2013 recommendations' P-23 examples, and
// Meno's plain cases, M).
const descriptorOf = (smiles: string) => {
  const g = fromSmiles(smiles);
  const f = factsOf(g);
  const all = g.atoms.map((_, i) => i);
  const r = vonBaeyer(all, (a) => f.around[a]);
  return [...new Set(r!.map((x) => x.descriptor))];
};

describe("von Baeyer descriptors", () => {
  it.each([
    ["C1CC2CCC1C2", "bicyclo[2.2.1]"],
    ["C1CC2CC(C1)C2", "bicyclo[3.1.1]"],
    ["C1CC2CC(C1)CC2", "bicyclo[3.2.1]"],
    ["C1CCC2CCC2C1", "bicyclo[4.2.0]"],
    ["C1C2CC3C1C3C2", "tricyclo[2.2.1.0(2,6)]"],
    ["C1C2CC3CC1CC(C2)C3", "tricyclo[3.3.1.1(3,7)]"],
    ["C12C3C4C1C5C2C3C45", "pentacyclo[4.2.0.0(2,5).0(3,8).0(4,7)]"],
    // (the text's own: two secondary bridges, and the forms the rules turn down)
    ["C12C3CCC(CC3)C(CC2)CC1", "tricyclo[4.2.2.2(2,5)]"],
    ["C1CC2CC1C1CCCC2C1", "tricyclo[4.3.1.1(2,5)]"],
    ["C12C(C3)C4C3CC4C(CC2)CCC1", "tetracyclo[5.3.2.1(2,4).0(3,6)]"],
    ["C12CC3CCC1CC3CC2", "tricyclo[4.4.0.0(3,8)]"],
  ])("%s is %s", (smiles, name) => {
    expect(descriptorOf(smiles)).toEqual([name]);
  });
});
