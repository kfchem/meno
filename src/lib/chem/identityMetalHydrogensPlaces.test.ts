// Held beside identityMetalHydrogens.test.ts: a hydride's H counted on its metal is the atom a drawn one is - with two metals each
// counting one, a centre on the metal whose implicit H stands in each of its places, an organic H drawn beside a counted metal H,
// and a metal of six donors.
import { describe, expect, it } from "vitest";
import { fromSmiles } from "../layout/testdata/fromSmiles";
import { arrangementOpen, constitutionKey, identity, identityKey, identityText } from "./identity";

const same = (a: string, b: string) => {
  const [x, y] = [fromSmiles(a), fromSmiles(b)];
  return constitutionKey(x) === constitutionKey(y) && identityText(x) === identityText(y) && identityKey(x) === identityKey(y);
};

describe("a hydride's H counted on its metal, in more than one place of a structure", () => {
  it("two metals each counting an H are the structure drawn with both H as atoms, whichever way each is written", () => {
    expect(same("[PdH](Cl)(Cl)[PdH](Cl)Cl", "[H][Pd](Cl)(Cl)[Pd]([H])(Cl)Cl")).toBe(true);
    expect(same("[PdH](Cl)(Cl)[PdH](Cl)Cl", "[H][Pd](Cl)(Cl)[PdH](Cl)Cl")).toBe(true);
    expect(same("[PdH](Cl)[PtH](Cl)", "[H][Pd](Cl)[Pt]([H])Cl")).toBe(true);
    // (told apart: one H fewer, and both H on one metal)
    expect(same("[PdH](Cl)(Cl)[PdH](Cl)Cl", "[PdH](Cl)(Cl)[Pd](Cl)Cl")).toBe(false);
    expect(same("[PdH](Cl)(Cl)[PdH](Cl)Cl", "[H][Pd]([H])(Cl)(Cl)[Pd](Cl)Cl")).toBe(false);
  });

  it("an organic H drawn as an atom beside a metal's counted H: one structure with the methyl written either way", () => {
    expect(same("[H]C([H])([H])[PdH](Cl)Cl", "C[Pd]([H])(Cl)Cl")).toBe(true);
    expect(same("C[PdH](Cl)Cl", "[H]C([H])([H])[Pd]([H])(Cl)Cl")).toBe(true);
  });
});

describe("a centre on a metal whose implicit H is counted", () => {
  it("is the centre drawn with that H as an atom in the same place among its neighbours, and its opposite where the sense is turned over", () => {
    // (the implicit H of [Pt@H] stands as OpenSMILES says: right after the atom the centre is written from, first where it is written first)
    expect(same("[Pt@H](Cl)(Br)I", "[H][Pt@](Cl)(Br)I")).toBe(true);
    expect(same("[Pt@@H](Cl)(Br)I", "[H][Pt@@](Cl)(Br)I")).toBe(true);
    expect(same("[Pt@H](Cl)(Br)I", "[H][Pt@@](Cl)(Br)I")).toBe(false);
    expect(same("Cl[Pt@H](Br)I", "Cl[Pt@@]([H])(Br)I")).toBe(false);
    expect(same("Cl[Pt@H](Br)I", "Cl[Pt@@H](Br)I")).toBe(false);
  });

  it("holds for every order of three different ligands round it, the first of them a neighbour of the centre", () => {
    const orders = [["Cl", "Br", "I"], ["Cl", "I", "Br"], ["Br", "Cl", "I"], ["Br", "I", "Cl"], ["I", "Cl", "Br"], ["I", "Br", "Cl"]];
    for (const [x, y, z] of orders) {
      for (const sense of ["@", "@@"]) {
        expect(same(`${x}[Pt${sense}H](${y})${z}`, `${x}[Pt${sense}]([H])(${y})${z}`), `${x} Pt${sense}H ${y} ${z}`).toBe(true);
      }
      expect(same(`${x}[Pt@H](${y})${z}`, `${x}[Pt@@H](${y})${z}`), `${x} ${y} ${z}`).toBe(false);
    }
  });
});

describe("a metal of six donors with hydrides counted on it", () => {
  const metal = (s: string) => fromSmiles(s).atoms.findIndex((a) => a.el === "Ru");
  it("leaves its arrangement open, counted or drawn, and says as much of it written: [RuH2(PMe3)4] is cis or trans", () => {
    const P = "P(C)(C)C";
    const written = [`[RuH2](${P})(${P})(${P})${P}`, `[H][Ru]([H])(${P})(${P})(${P})${P}`, `[H][RuH](${P})(${P})(${P})${P}`];
    for (const s of written) expect(arrangementOpen(fromSmiles(s), metal(s)), s).toBe(true);
    for (const s of written) expect(identity(fromSmiles(s)).complete, s).toBe(identity(fromSmiles(written[1])).complete);
    expect(same(written[0], written[1])).toBe(true);
    expect(same(written[2], written[1])).toBe(true);
  });
});
