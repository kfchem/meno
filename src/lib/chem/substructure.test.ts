import { describe, expect, it } from "vitest";
import type { IdentityInput } from "./identity";
import { readSmiles } from "./smiles";
import { holdsSubstructure } from "./substructure";

/** What valence leaves an atom of the organic subset in hydrogens, as Meno counts a drawing's. */
const VALENCE: Record<string, number> = { C: 4, N: 3, O: 2, S: 2, F: 1, Cl: 1, Br: 1 };

/** A structure from SMILES (Kekulé, no aromatic letters), each atom's hydrogens not written counted as a drawing's are. */
function of(smiles: string): IdentityInput {
  const s = readSmiles(smiles);
  const bonded = s.atoms.map(() => 0);
  for (const b of s.bonds) {
    bonded[b.a1] += b.order;
    bonded[b.a2] += b.order;
  }
  return {
    atoms: s.atoms.map((a, i) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}), hs: a.hs ?? Math.max(0, (VALENCE[a.el] ?? 0) - bonded[i] + (a.charge ?? 0) * (a.el === "N" ? 1 : 0)) })),
    bonds: s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
  };
}

const holds = (target: string, query: string) => holdsSubstructure(of(query), of(target)).found;

describe("whether one structure holds another", () => {
  it("finds each atom of the query among the target's, one to one, every bond between them a bond of its order", () => {
    expect(holds("CCO", "CO")).toBe(true);
    expect(holds("CC(=O)O", "C=O")).toBe(true);
    expect(holds("CCO", "C=O")).toBe(false);
    // (each atom once: two oxygens asked, one there)
    expect(holds("CCO", "OCO")).toBe(false);
    expect(holds("OCCO", "OCCO")).toBe(true);
    // (a target's further atoms and bonds are no matter: not an induced match)
    expect(holds("C1CC1", "CCC")).toBe(true);
  });

  it("says where: each query atom with its match", () => {
    const found = holdsSubstructure(of("CO"), of("CCO"));
    expect(found).toEqual({ found: true, map: [[0, 1], [1, 2]] });
  });

  it("matches aromatic rings in one form, however either was drawn of its Kekule structures", () => {
    // (toluene drawn one way, the phenyl asked the other)
    expect(holds("CC1=CC=CC=C1", "C1C=CC=CC=1")).toBe(true);
    expect(holds("C1=CC=C2C=CC=CC2=C1", "C1=CC=CC=C1")).toBe(true);
    // (an aromatic ring is not a cyclohexene's, nor the other way)
    expect(holds("C1=CCCCC1", "C1=CC=CC=C1")).toBe(false);
    expect(holds("CC1=CC=CC=C1", "C=CC")).toBe(false);
  });

  it("matches an atom of its element, charge and mass number alone", () => {
    expect(holds("C[N+](C)(C)C", "[N+]")).toBe(true);
    expect(holds("CN(C)C", "[N+]")).toBe(false);
    expect(holds("C[N+](C)(C)C", "N")).toBe(false);
    expect(holds("[13CH3]O", "[13C]O")).toBe(true);
    expect(holds("CO", "[13C]O")).toBe(false);
    // (an atom of no mass number asked: any of the element)
    expect(holds("[13CH3]O", "CO")).toBe(true);
  });

  it("matches an atom of its unpaired electrons: a radical asked of a radical alone", () => {
    const ethyl: IdentityInput = { atoms: [{ el: "C", hs: 3 }, { el: "C", hs: 2, radical: "doublet" }], bonds: [{ a: 0, b: 1, order: 1 }] };
    const radical: IdentityInput = { atoms: [{ el: "C" }, { el: "C", radical: "doublet" }], bonds: [{ a: 0, b: 1, order: 1 }] };
    expect(holdsSubstructure(radical, ethyl).found).toBe(true);
    expect(holdsSubstructure(of("CC"), ethyl).found).toBe(false);
    expect(holdsSubstructure(radical, of("CC")).found).toBe(false);
  });

  it("asks no hydrogens but those drawn as atoms: a hydrogen drawn asks for one on its atom's match", () => {
    // (a carbon drawn as "C": any carbon, a quaternary one too)
    expect(holds("CC(C)(C)C", "CC")).toBe(true);
    // (a C-H with three carbons on it asked: isobutane's middle carbon, never neopentane's, which has no hydrogen)
    expect(holds("CC(C)C", "[H]C(C)(C)C")).toBe(true);
    expect(holds("CC(C)(C)C", "[H]C(C)(C)C")).toBe(false);
    // (a hydrogen drawn in the target counts as one)
    expect(holds("[H]C([H])([H])O", "[H]CO")).toBe(true);
  });

  it("asks a deuterium drawn for a deuterium, never a hydrogen", () => {
    const cd: IdentityInput = { atoms: [{ el: "C", hs: 3 }, { el: "H", isotope: 2 }], bonds: [{ a: 0, b: 1, order: 1 }] };
    const ch: IdentityInput = { atoms: [{ el: "C", hs: 3 }, { el: "H" }], bonds: [{ a: 0, b: 1, order: 1 }] };
    expect(holdsSubstructure(cd, cd).found).toBe(true);
    expect(holdsSubstructure(cd, ch).found).toBe(false);
    expect(holdsSubstructure(cd, of("C")).found).toBe(false);
    // (a hydrogen drawn asked: a deuterium is none)
    expect(holdsSubstructure(ch, { atoms: [{ el: "C", hs: 0 }, { el: "H", isotope: 2 }], bonds: [{ a: 0, b: 1, order: 1 }] }).found).toBe(false);
  });

  it("says where by each atom's place among all its structure's atoms, hydrogens drawn before them too", () => {
    // (methanol with its methyl's hydrogens drawn first)
    const target: IdentityInput = {
      atoms: [{ el: "H" }, { el: "H" }, { el: "H" }, { el: "C", hs: 0 }, { el: "O", hs: 1 }],
      bonds: [{ a: 0, b: 3, order: 1 }, { a: 1, b: 3, order: 1 }, { a: 2, b: 3, order: 1 }, { a: 3, b: 4, order: 1 }],
    };
    const query: IdentityInput = { atoms: [{ el: "H" }, { el: "O", hs: 0 }, { el: "C", hs: 0 }], bonds: [{ a: 0, b: 2, order: 1 }, { a: 1, b: 2, order: 1 }] };
    expect(holdsSubstructure(query, target)).toEqual({ found: true, map: [[1, 4], [2, 3]] });
  });

  it("finds nothing for a query of nothing, or of more atoms than the target", () => {
    expect(holdsSubstructure(of("[H][H]"), of("CC"))).toEqual({ found: false, finished: true });
    expect(holds("CO", "CCO")).toBe(false);
  });

  it("stops where it has tried as many placements as it may, saying it did not finish - never a 'not found' it did not show", () => {
    // (a chain of carbons ending in a nitrogen, asked of fused rings of carbons alone: every path through them tried)
    const rings = of("C1CC2CC3CC4CC5CCCCC5CC4CC3CC2CC1");
    const chain = of(`${"C".repeat(12)}N`);
    expect(holdsSubstructure(chain, rings, 50)).toEqual({ found: false, finished: false });
    expect(holdsSubstructure(chain, rings)).toEqual({ found: false, finished: true });
  });

  it("tries an atom bonded to one placed among that one's neighbours alone", () => {
    // (the oxygen found among 51 atoms, then its carbon at once: within 60 placements, never trying every carbon again)
    expect(holdsSubstructure(of("OC"), of(`${"C".repeat(50)}O`), 60)).toEqual({ found: true, map: [[0, 50], [1, 49]] });
  });
});
