import { describe, expect, it } from "vitest";
import { fromSmiles } from "../layout/testdata/fromSmiles";
import { arrangementOpen, constitutionKey, identity, identityKey, identityText } from "./identity";
import { metalHydrogensDrawn } from "./perception/fold";

/** Whether two SMILES are one structure to identity: their constitution, their identity and its key. */
const same = (a: string, b: string) => {
  const [x, y] = [fromSmiles(a), fromSmiles(b)];
  return constitutionKey(x) === constitutionKey(y) && identityText(x) === identityText(y) && identityKey(x) === identityKey(y);
};

describe("a metal's hydride, its H written as an atom or counted on the metal", () => {
  it("is one structure: [PdH]Cl2 is Cl2Pd-H, a dihydride either way, and both ways at once", () => {
    expect(same("[PdH](Cl)Cl", "[H][Pd](Cl)Cl")).toBe(true);
    expect(same("[PdH2](Cl)Cl", "[H][Pd]([H])(Cl)Cl")).toBe(true);
    expect(same("[PdH2](Cl)Cl", "[H][PdH](Cl)Cl")).toBe(true);
    // (on any metal ligands are drawn round: the d block, the f block)
    for (const el of ["Ru", "Ir", "Rh", "Zr", "U", "Nd"]) expect(same(`[${el}H](Cl)Cl`, `[H][${el}](Cl)Cl`), el).toBe(true);
  });

  it("is told from the metal with fewer hydrogens, and from the same with a deuteride", () => {
    expect(same("[PdH](Cl)Cl", "[Pd](Cl)Cl")).toBe(false);
    expect(same("[PdH2](Cl)Cl", "[H][Pd](Cl)Cl")).toBe(false);
    // (a deuteride: its isotope given, which the test SMILES reader does not keep)
    const deuteride = { atoms: [{ el: "H", hs: 0, isotope: 2 }, { el: "Pd", hs: 0 }, { el: "Cl", hs: 0 }, { el: "Cl", hs: 0 }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 1, b: 3, order: 1 }] };
    expect(identityText(deuteride)).not.toBe(identityText(fromSmiles("[PdH](Cl)Cl")));
    expect(constitutionKey(deuteride)).not.toBe(constitutionKey(fromSmiles("[PdH](Cl)Cl")));
  });

  it("on a metal no ligands are drawn round, as before: tin's and lithium's H are counted either way, Rf's too", () => {
    expect(same("[SnH](C)(C)C", "[H][Sn](C)(C)C")).toBe(true);
    expect(same("[LiH]", "[Li][H]")).toBe(true);
    expect(fromSmiles("[H][Rf]").atoms).toHaveLength(2);
    expect(same("[RfH]", "[H][Rf]")).toBe(true);
  });

  it("counts its H among the metal's donors either way: [PdHCl(PMe3)2] typed or drawn, which donors are across from each other not given", () => {
    for (const s of ["[PdH](Cl)(P(C)(C)C)P(C)(C)C", "[H][Pd](Cl)(P(C)(C)C)P(C)(C)C"]) {
      const g = fromSmiles(s);
      expect(arrangementOpen(g, g.atoms.findIndex((a) => a.el === "Pd")), s).toBe(true);
    }
  });

  it("is written completely, as any small structure is", () => {
    expect(identity(fromSmiles("[PdH](Cl)(Cl)P(C)(C)C")).complete).toBe(true);
  });
});

describe("metalHydrogensDrawn", () => {
  it("draws each H counted on such a metal as an atom after all the others, bonded to it, every atom keeping its place", () => {
    const g = metalHydrogensDrawn({ atoms: [{ el: "Cl" }, { el: "Pd", hs: 2 }, { el: "C", hs: 3 }], bonds: [{ a: 0, b: 1, order: 1 }] });
    expect(g.atoms).toEqual([{ el: "Cl" }, { el: "Pd", hs: 0 }, { el: "C", hs: 3 }, { el: "H", hs: 0 }, { el: "H", hs: 0 }]);
    expect(g.bonds).toEqual([{ a: 0, b: 1, order: 1 }, { a: 1, b: 3, order: 1 }, { a: 1, b: 4, order: 1 }]);
  });

  it("gives a centre's implicit H on the metal the place of the first of them", () => {
    const g = metalHydrogensDrawn({ atoms: [{ el: "Ir", hs: 1, tetra: { neighbours: [1, -1, 2, 3], volume: 1 } }, { el: "Cl" }, { el: "Br" }, { el: "I" }], bonds: [] });
    expect(g.atoms[0].tetra).toEqual({ neighbours: [1, 4, 2, 3], volume: 1 });
  });

  it("leaves a structure with none as it is: the same object", () => {
    const g = { atoms: [{ el: "Pd", hs: 0 }, { el: "C", hs: 4 }, { el: "Sn", hs: 1 }], bonds: [] };
    expect(metalHydrogensDrawn(g)).toBe(g);
  });
});
