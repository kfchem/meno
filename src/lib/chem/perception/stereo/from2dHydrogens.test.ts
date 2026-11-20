// Held beside from2dCandidates.test.ts: a hydrogen drawn as an atom is counted on its atom whichever end of its bond it is listed at - a centre read with the bond (centre, H) is read with the bond (H, centre).
import { describe, expect, it } from "vitest";
import { layout2D } from "../../../layout/engine";
import { drawnOf } from "../../../layout/readBack";
import { readStereo } from "../../../layout/drawn";
import { smilesInput } from "../../../layout/smilesInput";

const centres = (smiles: string, hFirst: boolean) => {
  const input = smilesInput(smiles);
  const d = drawnOf(input, layout2D(input));
  const bonds = hFirst ? d.bonds.map((b) => (d.atoms[b.b].el === "H" ? { ...b, a: b.b, b: b.a, ...(b.wedge ? { wedge: { ...b.wedge } } : {}) } : b)) : d.bonds;
  return [...readStereo(d.atoms, bonds).tetra.keys()].map((i) => d.atoms[i].el ?? "C").sort();
};

describe("a hydrogen drawn as an atom, counted on its atom at either end of its bond", () => {
  it.each([
    ["bromochlorofluoromethane with its H an atom", "F[C@]([H])(Cl)Br", ["C"]],
    ["butan-2-ol with its H an atom", "C[C@]([H])(O)CC", ["C"]],
    ["a phosphonium with an H an atom", "C[P@@+]([H])(CC)c1ccccc1", ["P"]],
  ])("%s", (_what, smiles, want) => {
    expect(centres(smiles, false)).toEqual(want);
    expect(centres(smiles, true)).toEqual(want);
  });
});
