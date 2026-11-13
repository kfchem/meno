import { describe, expect, it } from "vitest";
import { forgetLaidOut, layout2D } from "./engine";
import { fromSmiles } from "./testdata/fromSmiles";

// A double-bonded branch on a chain is drawn above it (Brecher 2008, GR-3.2.2; below is acceptable): a ketone's, an ester's, an amide's
// C=O up wherever the chain's zigzag lets it.

/** Each C=O of `smiles` as laid out: its direction from its carbon, in degrees (90 straight up), in the order of the bonds. */
function carbonyls(smiles: string): number[] {
  forgetLaidOut();
  const input = fromSmiles(smiles);
  const out = layout2D(input);
  return input.bonds
    .filter((b) => b.order === 2 && (input.atoms[b.a].el === "O" || input.atoms[b.b].el === "O"))
    .map((b) => {
      const [c, o] = input.atoms[b.a].el === "O" ? [b.b, b.a] : [b.a, b.b];
      return Math.round((Math.atan2(out.y[o] - out.y[c], out.x[o] - out.x[c]) * 180) / Math.PI);
    });
}

/** The angles at a chain's carbons, in degrees: a zigzag is 120 at every one. */
function chainAngles(smiles: string): number[] {
  forgetLaidOut();
  const input = fromSmiles(smiles);
  const out = layout2D(input);
  const carbons = input.atoms.map((a, i) => i).filter((i) => input.atoms[i].el === "C");
  const bonded = (i: number) => input.bonds.flatMap((b) => (b.a === i ? [b.b] : b.b === i ? [b.a] : [])).filter((j) => input.atoms[j].el === "C");
  return carbons.flatMap((i) => {
    const nb = bonded(i);
    if (nb.length !== 2) return [];
    const [p, q] = nb;
    const u = Math.atan2(out.y[p] - out.y[i], out.x[p] - out.x[i]);
    const v = Math.atan2(out.y[q] - out.y[i], out.x[q] - out.x[i]);
    return [Math.round((Math.abs(Math.atan2(Math.sin(u - v), Math.cos(u - v))) * 180) / Math.PI)];
  });
}

describe("a chain's C=O", () => {
  it("points straight up: a ketone's, an ester's, an amide's, however the SMILES is written", () => {
    for (const smiles of ["CCC(C)=O", "CC(=O)CC", "O=C(C)CC", "CCCC(C)=O", "CC(C)CC(C)=O", "CCC(=O)CC", "CCCCC(=O)CCC", "CCCC(=O)OC", "CCOC(C)=O", "CCCC(=O)NC", "CC(C)=O"]) {
      expect(carbonyls(smiles), smiles).toEqual([90]);
    }
  });

  it("an acid's stays up, as it was", () => {
    for (const smiles of ["CC(=O)O", "CCCC(=O)O"]) expect(carbonyls(smiles), smiles).toEqual([90]);
  });

  it("two that the zigzag lets both be up are both up; two that it does not, one up and one down, the chain a zigzag still - never bent to lay one level", () => {
    expect(carbonyls("CCC(=O)CC(C)=O")).toEqual([90, 90]);
    for (const smiles of ["CC(=O)CCC(C)=O", "CC(C)=O.CC(=O)CCC(C)=O".split(".")[1], "O=C(C)CCC(=O)C"]) {
      expect([...carbonyls(smiles)].sort((p, q) => p - q), smiles).toEqual([-90, 90]);
      for (const angle of chainAngles(smiles)) expect(angle, smiles).toBe(120);
    }
  });
});
