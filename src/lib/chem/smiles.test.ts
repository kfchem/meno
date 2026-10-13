import { describe, expect, it } from "vitest";
import { readSmiles } from "./smiles";

describe("a double bond's cis or trans, read from SMILES", () => {
  // (OpenSMILES: a neighbour written before its end with "/" lies below it,
  // one written after it above, "\" the other way; the same side, cis)
  const of = (smiles: string) => {
    const b = readSmiles(smiles).bonds.find((x) => x.order === 2)!;
    return b.cisTrans && { refs: b.cisTrans.refs, cis: b.cisTrans.cis, ends: [b.a1, b.a2] };
  };

  it("reads trans and cis from the marks either side", () => {
    expect(of("F/C=C/F")).toEqual({ refs: [0, 3], cis: false, ends: [1, 2] });
    expect(of("F/C=C\\F")).toEqual({ refs: [0, 3], cis: true, ends: [1, 2] });
    expect(of("F\\C=C/F")?.cis).toBe(true);
  });

  it("reads a mark in a branch, and on a ring bond at either digit", () => {
    // C(\F)=C/F is F/C=C/F written another way
    expect(of("C(\\F)=C/F")?.cis).toBe(false);
    // the ring bond's mark at its opening digit, from the atom it is on
    expect(of("F/C=C/1.F1")?.cis).toBe(false);
    expect(of("C/1=C/F.F1")?.cis).toBe(true);
  });

  it("has none without a mark on each end", () => {
    expect(of("FC=CF")).toBeUndefined();
    expect(of("F/C=CF")).toBeUndefined();
  });
});
