import { describe, expect, it } from "vitest";
import { symmetryClasses } from "../layout/canonical";
import { fromSmiles } from "../layout/testdata/fromSmiles";
import { SHUFFLE_SEEDS, shuffled, tiedCages } from "../layout/testdata/shuffled";
import type { LayoutInput } from "../layout/perceive";
import { aromaticForm, automorphismGroup, identityKey, identityText, symmetryOrbits } from "./identity";

/** How many distinct values a list has. */
const distinct = (xs: readonly number[]) => new Set(xs).size;

/** Whether a permutation takes every bond onto a bond of the same order. */
function keepsBonds(g: LayoutInput, p: readonly number[]): boolean {
  const bonds = new Set(g.bonds.map((b) => `${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}:${b.order}`));
  return g.bonds.every((b) => bonds.has(`${Math.min(p[b.a], p[b.b])}-${Math.max(p[b.a], p[b.b])}:${b.order}`));
}

describe("a structure's identity", () => {
  it("is the same however its atoms are numbered", () => {
    for (const smiles of ["CC(C)(C)c1ccccc1", "C[C@H](N)C(=O)O", "C/C=C/C(=O)O", ...tiedCages.map((c) => c.smiles)]) {
      const g = fromSmiles(smiles);
      for (const seed of SHUFFLE_SEEDS) {
        expect(identityText(shuffled(g, seed)), smiles).toBe(identityText(g));
        expect(identityKey(shuffled(g, seed)), smiles).toBe(identityKey(g));
      }
    }
  });

  it("tells isomers apart, and a chiral structure from its mirror image", () => {
    expect(identityKey(fromSmiles("CCO"))).not.toBe(identityKey(fromSmiles("COC")));
    expect(identityKey(fromSmiles("C[C@H](N)C(=O)O"))).not.toBe(identityKey(fromSmiles("C[C@@H](N)C(=O)O")));
    expect(identityKey(fromSmiles("C/C=C/C"))).not.toBe(identityKey(fromSmiles("C/C=C\\C")));
    expect(identityKey(fromSmiles("CCO"))).toMatch(/^[0-9a-f]{16}$/);
    // (one structure however its rings' Kekulé structure was drawn; a quinone is no aromatic ring)
    expect(identityKey(fromSmiles("Cc1ccccc1"))).toBe(identityKey(fromSmiles("CC1=CC=CC=C1")));
    expect(identityKey(fromSmiles("CC1=CC=CC=C1"))).toBe(identityKey(fromSmiles("CC1C=CC=CC=1")));
    expect(identityKey(fromSmiles("c1ccc2c(c1)ccc1ccccc12"))).toBe(identityKey(fromSmiles("C1=CC=C2C(=C1)C=CC1=CC=CC=C21")));
    expect(identityKey(fromSmiles("O=C1C=CC(=O)C=C1"))).not.toBe(identityKey(fromSmiles("Oc1ccc(O)cc1")));
  });
});

describe("a structure's orbits and automorphisms", () => {
  it("gives toluene's ring its symmetry, whichever Kekulé structure was drawn: ipso, two ortho, two meta, para, the methyl", () => {
    const g = fromSmiles("Cc1ccccc1");
    const { orbit, complete } = symmetryOrbits(g);
    expect(complete).toBe(true);
    expect(distinct(orbit)).toBe(5);
    expect(orbit[2]).toBe(orbit[6]);
    expect(orbit[3]).toBe(orbit[5]);
  });

  it("numbers orbits the same whatever order the atoms came in", () => {
    const g = fromSmiles("CC(C)(C)c1ccccc1");
    const seen = symmetryOrbits(g).orbit.slice().sort((p, q) => p - q);
    for (const seed of SHUFFLE_SEEDS) expect(symmetryOrbits(shuffled(g, seed)).orbit.slice().sort((p, q) => p - q)).toEqual(seen);
  });

  it("finds only automorphisms that keep every bond, and generates the whole group: benzene's 12, cubane's 48, tert-butylbenzene's 12", () => {
    for (const [smiles, order] of [
      ["c1ccccc1", 12],
      ["C12C3C4C1C5C2C3C45", 48],
      ["CC(C)(C)c1ccccc1", 12],
    ] as const) {
      // (its automorphisms are its aromatic form's: a ring's bonds alike, whichever Kekulé structure was drawn)
      const g = aromaticForm(fromSmiles(smiles));
      const { automorphisms, complete } = symmetryOrbits(g);
      expect(complete, smiles).toBe(true);
      for (const p of automorphisms) expect(keepsBonds(g, p), smiles).toBe(true);
      const group = automorphismGroup(automorphisms, g.atoms.length);
      expect(group.complete, smiles).toBe(true);
      expect(group.members.length, smiles).toBe(order);
      for (const p of group.members) expect(keepsBonds(g, p), smiles).toBe(true);
    }
  });

  it("never joins atoms the refinement wrongly holds alike: cuneane's eight in one class, three orbits", () => {
    // (each cage C2v, four symmetries: cuneane's refinement holds all eight carbons alike, its orbits are
    // 2 + 2 + 4; basketane's and snoutene's refinement already parts them as their orbits do)
    for (const [name, orbits] of [
      ["cuneane", 3],
      ["basketane", 4],
      ["snoutene", 4],
    ] as const) {
      const g = aromaticForm(fromSmiles(tiedCages.find((c) => c.name === name)!.smiles));
      const classes = symmetryClasses(g);
      const { orbit, automorphisms, complete } = symmetryOrbits(g);
      expect(complete, name).toBe(true);
      expect(distinct(orbit), name).toBe(orbits);
      expect(automorphismGroup(automorphisms, g.atoms.length).members.length, name).toBe(4);
      // (never coarser than the refinement: each orbit inside one class)
      for (let a = 0; a < orbit.length; a++)
        for (let b = 0; b < orbit.length; b++) if (orbit[a] === orbit[b]) expect(classes[a], name).toBe(classes[b]);
      for (const p of automorphisms) expect(keepsBonds(g, p), name).toBe(true);
    }
    expect(distinct(symmetryClasses(fromSmiles(tiedCages[0].smiles)))).toBe(1);
  });

  it("says where it listed the group only up to its cap", () => {
    const g = fromSmiles("C12C3C4C1C5C2C3C45");
    const group = automorphismGroup(symmetryOrbits(g).automorphisms, g.atoms.length, 10);
    expect(group.complete).toBe(false);
    expect(group.members.length).toBe(10);
  });
});
