// Held beside substructure.test.ts: a hydrogen is its atom's only by one single bond to an atom not an H - a bridging H is found only where it bridges, a lone H and an H by a double bond, a charged H and one with an unpaired electron are atoms of their own.
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import type { IdentityInput } from "./identity";
import { holdsSubstructure } from "./substructure";

const of = (smiles: string) => smilesInput(smiles) as unknown as IdentityInput;
const holds = (target: string, query: string) => holdsSubstructure(of(query), of(target)).found;

describe("a hydrogen that is an atom of its own is asked for as an atom", () => {
  it("a bridging H, B-H-B, is found only where it bridges two borons: not in two bonded borons with H on each, nor in two BH3 apart", () => {
    expect(holds("B1[H]B[H]1", "B[H]B")).toBe(true);
    expect(holds("[H]B([H])B([H])[H]", "B[H]B")).toBe(false);
    expect(holds("[H]B([H])[H].[H]B([H])[H]", "B[H]B")).toBe(false);
  });

  it("a lone H is found in a lone H, and in no carbon", () => {
    expect(holds("[H]", "[H]")).toBe(true);
    expect(holds("C", "[H]")).toBe(false);
  });

  it("an H by a double bond is an atom: C=[H] is no carbon's own H", () => {
    expect(holds("C", "C=[H]")).toBe(false);
  });

  it("a charged H is an atom: O[H+] is found in no water", () => {
    expect(holds("O", "O[H+]")).toBe(false);
    expect(holds("[H+]O", "O[H+]")).toBe(true);
  });

  it("an H with an unpaired electron is an atom: it is found where there is one, and in no methane drawn with its H", () => {
    const radicalH = (hs: number): IdentityInput => ({ atoms: [{ el: "C", hs }, { el: "H", hs: 0, radical: 1 }], bonds: [{ a: 0, b: 1, order: 1 }] } as unknown as IdentityInput);
    expect(holdsSubstructure(radicalH(3), of("[H]C([H])([H])[H]")).found).toBe(false);
    expect(holdsSubstructure(radicalH(3), radicalH(3)).found).toBe(true);
  });
});
