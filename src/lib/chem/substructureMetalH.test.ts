/**
 * Beside substructure.test.ts (its `of` and `holds` copied): what its metal-hydride tests leave unheld - an H on any metal of the d or f
 * block is an atom of its own, not on palladium alone; and an H on a main-group metal is its metal's, drawn as an atom or counted on it,
 * so that a lone H is found nowhere on it and the metal's H asked for is found on the counted form.
 */
import { describe, expect, it } from "vitest";
import type { IdentityInput } from "./identity";
import { readSmiles } from "./smiles";
import { holdsSubstructure } from "./substructure";

const VALENCE: Record<string, number> = { C: 4, N: 3, O: 2, S: 2, F: 1, Cl: 1, Br: 1 };
function of(smiles: string): IdentityInput {
  const s = readSmiles(smiles);
  const bonded = s.atoms.map(() => 0);
  for (const b of s.bonds) {
    bonded[b.a1] += b.order;
    bonded[b.a2] += b.order;
  }
  return {
    atoms: s.atoms.map((a, i) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}), hs: a.hs ?? Math.max(0, (VALENCE[a.el] ?? 0) - bonded[i] + (a.charge ?? 0)) })),
    bonds: s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
  };
}
const holds = (target: string, query: string) => holdsSubstructure(of(query), of(target)).found;

describe("an H on a metal, by the metal", () => {
  it("is an atom of its own on every metal of the d and f block that is drawn round: a lone H is found on it", () => {
    for (const target of ["[H][Fe](Cl)Cl", "[H][Pt](P)(P)Cl", "[H][Ir](Cl)(Cl)Cl", "[H][Ru](Cl)Cl", "[H][U](Cl)(Cl)Cl", "[H][Th](Cl)(Cl)Cl"]) expect(holds(target, "[H]")).toBe(true);
    expect(holds("[H][Ir](Cl)(Cl)Cl", "[H][Ir]")).toBe(true);
    expect(holds("Cl[Ir](Cl)Cl", "[H][Ir]")).toBe(false);
  });

  it("is its metal's on a main-group metal: found nowhere as an atom, and asked for, found where it is counted on the metal", () => {
    for (const target of ["[H][Sn](C)(C)C", "[SnH](C)(C)C", "[H][Li]", "[LiH]", "[H][Al]([H])[H]", "[AlH3]", "[H][Mg]Cl"]) expect(holds(target, "[H]")).toBe(false);
    expect(holds("[SnH](C)(C)C", "[H][Sn]")).toBe(true);
    expect(holds("[LiH]", "[H][Li]")).toBe(true);
    expect(holds("[AlH3]", "[H][Al]")).toBe(true);
    expect(holds("C[Sn](C)C", "[H][Sn]")).toBe(false);
  });

  it("is one graph however it was written on a metal of the d or f block: counted on it or drawn, each found by the other", () => {
    for (const m of ["Pd", "Fe", "Ir", "Pt", "U"]) {
      const counted = `[${m}H](Cl)Cl`;
      const drawn = `[H][${m}](Cl)Cl`;
      expect(holds(counted, `[H][${m}]`), `${m}: counted, asked drawn`).toBe(true);
      expect(holds(drawn, `[${m}H]`), `${m}: drawn, asked counted`).toBe(true);
      expect(holds(drawn, counted), `${m}: drawn, asked the whole counted`).toBe(true);
      expect(holds(counted, drawn), `${m}: counted, asked the whole drawn`).toBe(true);
      // (and a lone H found on it, counted: an atom of its own, as one drawn is)
      expect(holds(counted, "[H]"), `${m}: a lone H`).toBe(true);
      expect(holds(`[${m}](Cl)Cl`, `[H][${m}]`), `${m}: none`).toBe(false);
    }
    // (on tin and lithium, as before: the metal's own)
    expect(holds("[SnH](C)(C)C", "[H][Sn]")).toBe(true);
    expect(holds("[LiH]", "[H][Li]")).toBe(true);
    expect(holds("[SnH](C)(C)C", "[H]")).toBe(false);
  });

  it("is its atom's only by a single bond: one by a double or a dative bond is an atom of its own", () => {
    const h2c: IdentityInput = { atoms: [{ el: "C", hs: 2 }, { el: "H", hs: 0 }], bonds: [{ a: 0, b: 1, order: 2 }] };
    const lone: IdentityInput = { atoms: [{ el: "H", hs: 0 }], bonds: [] };
    expect(holdsSubstructure(lone, h2c).found).toBe(true);
    const single: IdentityInput = { atoms: [{ el: "C", hs: 3 }, { el: "H", hs: 0 }], bonds: [{ a: 0, b: 1, order: 1 }] };
    expect(holdsSubstructure(lone, single).found).toBe(false);
  });
});
