/**
 * A quadruple bond typed in a SMILES - "$", one of OpenSMILES's bond symbols - is refused in words wherever Meno reads the SMILES
 * itself (lib/chem/smiles): Meno has no bond of that order, and never reads it as another, an aromatic bond least of all.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import { structureProblem } from "./abbreviations";
import { QUADRUPLE_REFUSED, readSmiles } from "./smiles";

describe("a quadruple bond typed in a SMILES", () => {
  it("is refused, saying where it is and why: between two atoms, at a ring's closure, between two metals", () => {
    expect(() => readSmiles("C$C")).toThrow('Cannot read "$" at 1 in C$C: a quadruple bond, which Meno does not draw');
    expect(() => readSmiles("C$1CCC1")).toThrow(QUADRUPLE_REFUSED);
    expect(() => readSmiles("[Mo]$[Mo]")).toThrow(QUADRUPLE_REFUSED);
  });

  it("is refused on the drawing's route and as a group's structure, in the same words", () => {
    expect(() => smilesInput("[Re]$[Re]")).toThrow(QUADRUPLE_REFUSED);
    expect(structureProblem("*C$C")).toBe('The SMILES cannot be read: Cannot read "$" at 2 in *C$C: a quadruple bond, which Meno does not draw');
  });

  it("leaves the other bond symbols as they were: single, double, triple and aromatic", () => {
    expect(readSmiles("C-C=C#C").bonds.map((b) => b.order)).toEqual([1, 2, 3]);
    expect(readSmiles("c1ccccc1").bonds.every((b) => b.order === 4)).toBe(true);
    expect(readSmiles("c1:c:c:c:c:c1").bonds.every((b) => b.order === 4)).toBe(true);
  });
});
