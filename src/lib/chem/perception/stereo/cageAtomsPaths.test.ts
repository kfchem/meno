// Held beside cageAtoms.test.ts: which atoms `cageAtoms` flags in structures where a looser reading of "three paths sharing no atom" flags others - an aziridine's N, the junctions of a fused four- or three-membered ring, the C of a bridge that carries methyls, a tropane's N, a 2-methylquinuclidine's C2, a triptycene's rings.
import { describe, expect, it } from "vitest";
import { fromSmiles } from "../../../layout/testdata/fromSmiles";
import { cageAtoms } from "./units";

const flagged = (smiles: string) => [...cageAtoms(fromSmiles(smiles))].sort((p, q) => p - q);

describe("cageAtoms, where a looser reading would flag more", () => {
  it.each([
    ["an aziridine's N and its carbons: a three-membered ring revisits itself", "CC1CN1C", []],
    ["bicyclo[4.2.0]octane: its junctions are fused, the other paths of four atoms", "C1CCC2CCC2C1", []],
    ["norcarane: the three-membered ring's junctions", "C1CCC2CC2C1", []],
    ["hydrindane", "C1CCC2CCCC2C1", []],
    ["biphenylene", "c1ccc2c(c1)-c1ccccc1-2", []],
    ["a tropane: the two bridgeheads, not the N between them", "CN1C2CCC1CCC2", [2, 5]],
    ["2-methylquinuclidine: C4 and N, not the C2 that carries the methyl", "CC1CC2CCN1CC2", [3, 6]],
    ["camphor: its two bridgeheads, not the C7 with its two methyls", "CC1(C)C2CCC1(C)C(=O)C2", [3, 6]],
    ["pinane", "CC1(C)C2CCC1C2", [3, 6]],
    ["triptycene: the two bridgeheads, none of its rings'", "c1ccc2c(c1)C1c3ccccc3C2c2ccccc12", [6, 13]],
  ])("%s: %s", (_what, smiles, want) => {
    expect(flagged(smiles)).toEqual(want);
  });
});
