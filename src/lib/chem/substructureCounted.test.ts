/**
 * Beside substructureMetalH.test.ts (its `of` and `holds` copied): what that file leaves unheld of a hydride found however its H was
 * written - two H counted on a metal are two atoms, each form of a dihydride found by each; a metal of the seventh row's d block
 * (Rf) keeps its H as its own count; and where a search says it found, an H that was counted is no atom of the drawing to name.
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

describe("a hydride found however its H was written", () => {
  it("is one graph with two H: a dihydride counted, drawn, or one of each, is found by each, and one H written any way is not enough", () => {
    for (const metal of ["Pd", "Ir", "Fe"]) {
      const dihydride = [`[H][${metal}]([H])Cl`, `[${metal}H2]Cl`, `[H][${metal}H]Cl`];
      const asked = [`[H][${metal}][H]`, `[${metal}H2]`, `[H][${metal}H]`];
      for (const target of dihydride) for (const query of asked) expect(holds(target, query), `${query} in ${target}`).toBe(true);
      for (const target of [`[H][${metal}]Cl`, `[${metal}H]Cl`]) for (const query of asked) expect(holds(target, query), `${query} in ${target}`).toBe(false);
    }
  });

  it("leaves a metal of the seventh row's d block its own H: counted on Rf or drawn on it, no atom for a lone H to find", () => {
    expect(holds("[RfH]Cl", "[H]")).toBe(false);
    expect(holds("[H][Rf]Cl", "[H]")).toBe(false);
    expect(holds("[RfH]Cl", "[H][Rf]")).toBe(true);
  });

  it("says where it found it by the atoms of the drawings only: an H counted on a metal is no atom to name, on either side", () => {
    for (const [target, query] of [["[PdH](Cl)Cl", "[H][Pd]"], ["[H][Pd](Cl)Cl", "[PdH]"], ["[PdH](Cl)Cl", "[PdH]"]] as const) {
      const found = holdsSubstructure(of(query), of(target));
      expect(found.found, `${query} in ${target}`).toBe(true);
      if (!found.found) continue;
      // (the metal's pair is there, and no pair names an atom that no drawing has)
      expect(found.map.some(([q, t]) => q === of(query).atoms.findIndex((a) => a.el === "Pd") && t === of(target).atoms.findIndex((a) => a.el === "Pd"))).toBe(true);
      expect(found.map.every(([q, t]) => q >= 0 && t >= 0)).toBe(true);
    }
  });
});
