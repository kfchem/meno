import { describe, expect, it } from "vitest";
import { drawnFromSmiles } from "./smilesDrawn";

// A SMILES drawn as Meno's engine draws it keeps the H's it writes on an atom where they are not the atom's usual: as a file's valence, the
// H's its bonds leave of it (`drawnFromSmiles`).

/** Each atom's valence as drawn, by element and the order written: none where it is the atom's usual. */
const valences = (smiles: string) => drawnFromSmiles(smiles).atoms.map((a) => `${a.el}${(a as { valence?: number }).valence ?? "-"}`);

describe("a SMILES drawn by the engine", () => {
  it("writes an NH3 on a metal with valence 4, a BH3 on an N with 4, an OH2 on a copper with 3 - the H's written, and the bond", () => {
    expect(valences("[NH3][Pt](Cl)(Cl)[NH3]")).toEqual(["N4", "Pt-", "Cl-", "Cl-", "N4"]);
    expect(valences("C[NH2][BH3]")).toEqual(["C-", "N4", "B4"]);
    expect(valences("[OH2][Cu]Cl")).toEqual(["O3", "Cu-", "Cl-"]);
  });

  it("sets none where the H's written are the atom's usual for its charge: an ammonium, a hydronium, a methane", () => {
    expect(valences("[NH4+]")).toEqual(["N-"]);
    expect(valences("[OH3+]")).toEqual(["O-"]);
    expect(valences("[CH4]")).toEqual(["C-"]);
  });
});
