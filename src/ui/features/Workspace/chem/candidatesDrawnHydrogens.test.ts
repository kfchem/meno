// A stereocentre with its hydrogen drawn as an atom - before the centre, or between its groups - is offered at the centre, not at the hydrogen or at another atom; and drawn the same either way round.
import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { candidatesDrawn } from "./candidatesDrawn";
import { drawnFromSmiles } from "./testdata/identityCases";

/** The atoms (by element and place) and the bonds (by their atoms' places) offered of `smiles` drawn. */
function offered(smiles: string): { atoms: string[]; bonds: string[] } {
  const m: Model = drawnFromSmiles(smiles);
  const ask = candidatesDrawn(m);
  const place = new Map(m.atoms.map((a, i) => [a.id, i]));
  return {
    atoms: m.atoms.flatMap((a, i) => (ask.atom(a.id) ? [`${a.el}${i}`] : [])),
    bonds: m.bonds.flatMap((b) => (ask.bond(b.id) ? [`${place.get(b.a)}-${place.get(b.b)}`] : [])),
  };
}

describe("a centre with its hydrogen drawn as an atom (found in review)", () => {
  it("is offered at the centre whatever place its hydrogen has among the atoms", () => {
    // (the H the first atom, then the centre; the H between the centre's groups; the H last)
    expect(offered("[H]C(F)(Cl)Br").atoms).toEqual(["C1"]);
    expect(offered("F[C@]([H])(Cl)Br").atoms).toEqual(["C1"]);
    expect(offered("FC(Cl)(Br)[H]").atoms).toEqual(["C1"]);
  });

  it("a methylene with both hydrogens drawn is none, and a drawn hydrogen does not make a double bond's end a group", () => {
    expect(offered("F[C@]([H])([H])Cl").atoms).toEqual([]);
    // (but-2-ene with the H of each end drawn first: still one double bond offered, by its place among the atoms)
    expect(offered("[H]C(C)=C([H])C").bonds).toHaveLength(1);
    expect(offered("[H]C=C[H]").bonds).toEqual([]);
  });
});

describe("the P of a phosphinic acid, a phosphinate ester and a thio acid (found in review; the chemistry check's ruling)", () => {
  it("a phosphinic acid's P is not offered - its two oxygens are one - a phosphinate ester's and a thio acid R1R2P(=S)OH's are", () => {
    expect(offered("C[P@](=O)(O)c1ccccc1").atoms).toEqual([]);
    expect(offered("C[P@](=O)(OC)c1ccccc1").atoms).toEqual(["P1"]);
    expect(offered("C[P@](=S)(O)c1ccccc1").atoms).toEqual(["P1"]);
  });
});
