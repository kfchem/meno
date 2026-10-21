import { describe, expect, it } from "vitest";
import { symmetryClasses } from "../layout/canonical";
import { fromSmiles } from "../layout/testdata/fromSmiles";
import { SHUFFLE_SEEDS, shuffled, tiedCages } from "../layout/testdata/shuffled";
import type { LayoutInput } from "../layout/perceive";
import { aromaticForm, automorphismGroup, hydrogensFolded, identity, identityKey, identityText, symmetryOrbits, type IdentityAtom, type IdentityInput } from "./identity";

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

describe("the aromatic form, Kekulé-free", () => {
  /** The bonds the form gives one order (4), as atom pairs. */
  const aromaticBonds = (smiles: string) =>
    aromaticForm(fromSmiles(smiles))
      .bonds.filter((b) => b.order === 4)
      .map((b) => `${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}`)
      .sort();

  it("comes to one form from every Kekulé structure: naphthalene's three, azulene's two", () => {
    // (naphthalene: its middle bond double, or either ring's bonds so)
    const naphthalene = ["C1=CC=C2C=CC=CC2=C1", "C1C=CC2=CC=CC=C2C=1", "C1=CC2=CC=CC=C2C=C1"].map((s) => identityKey(fromSmiles(s)));
    expect(new Set(naphthalene).size).toBe(1);
    // (azulene: C1=C2, C3=C3a ... or C1=C8a, C2=C3 ...; its middle bond single in both)
    const a = "C1=CC=C2C=CC=CC=C21";
    const b = "C1C=CC2=CC=CC=CC2=1";
    expect(identityKey(fromSmiles(a))).toBe(identityKey(fromSmiles(b)));
    expect(aromaticBonds(a)).not.toContain("3-9");
    expect(aromaticBonds(b)).not.toContain("3-9");
    expect(aromaticBonds(a)).toHaveLength(10);
  });

  it("comes to the same form from every Kekulé structure there is, each enumerated", () => {
    // (every way to pair off the atoms that carry a double bond by bonds between them, each drawn and formed)
    const kekules = (g: LayoutInput): LayoutInput[] => {
      const carriers = new Set(g.bonds.filter((b) => b.order === 2).flatMap((b) => [b.a, b.b]));
      const candidates = g.bonds.map((b, i) => ({ b, i })).filter(({ b }) => b.order <= 2 && carriers.has(b.a) && carriers.has(b.b));
      const out: LayoutInput[] = [];
      const chosen = new Set<number>();
      const used = new Set<number>();
      const atoms = [...carriers].sort((p, q) => p - q);
      const walk = (k: number) => {
        while (k < atoms.length && used.has(atoms[k])) k++;
        if (k === atoms.length) {
          out.push({ ...g, bonds: g.bonds.map((b, i) => (candidates.some((c) => c.i === i) ? { ...b, order: chosen.has(i) ? 2 : 1 } : b)) });
          return;
        }
        const a = atoms[k];
        for (const { b, i } of candidates) {
          const other = b.a === a ? b.b : b.b === a ? b.a : -1;
          if (other < 0 || used.has(other)) continue;
          used.add(a).add(other);
          chosen.add(i);
          walk(k + 1);
          chosen.delete(i);
          used.delete(a);
          used.delete(other);
        }
      };
      walk(0);
      return out;
    };
    const orders = (g: LayoutInput) => aromaticForm(g).bonds.map((b) => b.order).join("");
    for (const [name, smiles, count] of [
      ["benzene", "c1ccccc1", 2],
      ["naphthalene", "c1ccc2ccccc2c1", 3],
      ["anthracene", "c1ccc2cc3ccccc3cc2c1", 4],
      ["phenanthrene", "c1ccc2c(c1)ccc1ccccc12", 5],
      ["pyrene", "c1cc2ccc3cccc4ccc(c1)c2c34", 6],
      ["azulene", "c1cc2cccccc2c1", 2],
      ["acenaphthylene", "C1=Cc2cccc3cccc1c23", 3],
      ["biphenylene", "c1ccc2c(c1)-c1ccccc1-2", 5],
      ["heptalene", "C1=CC=C2C=CC=CC=CC2=CC=C1", 3],
      ["quinoline", "c1ccc2ncccc2c1", 3],
      ["cyclooctatetraene", "C1=CC=CC=CC=C1", 2],
    ] as const) {
      const all = kekules(fromSmiles(smiles));
      expect(all.length, name).toBe(count);
      expect(new Set(all.map(orders)).size, name).toBe(1);
      expect(new Set(all.map(identityKey)).size, name).toBe(1);
    }
  });

  it("takes bond-shift isomers as one structure, by design: 1,2-dimethylcyclooctatetraene, its methyls across a double bond or a single one", () => {
    // (two compounds with a measurable barrier between them, but two Kekulé structures of one graph: one
    // identity, as joins and duplicates want it - a known property of the rule, not a surprise)
    const across = { double: "CC1=C(C)C=CC=CC=C1", single: "CC1C(C)=CC=CC=CC=1" };
    expect(fromSmiles(across.double).bonds.find((b) => b.a === 1 && b.b === 2)?.order).toBe(2);
    expect(fromSmiles(across.single).bonds.find((b) => b.a === 1 && b.b === 2)?.order).toBe(1);
    expect(identityKey(fromSmiles(across.double))).toBe(identityKey(fromSmiles(across.single)));
  });

  it("leaves a structure with one Kekulé structure as drawn: pyrrole, furan, thiophene, imidazole, a quinone", () => {
    for (const smiles of ["C1=CNC=C1", "C1=COC=C1", "C1=CSC=C1", "C1=CN=CN1", "O=C1C=CC(=O)C=C1", "CC=CC=CC"]) {
      const g = fromSmiles(smiles);
      expect(aromaticForm(g), smiles).toBe(g);
    }
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

/** `smiles` read, the atoms at the places given changed as said: a mass number, unpaired electrons, a mapping. */
function marked(smiles: string, at: Record<number, Partial<IdentityAtom>> = {}): IdentityInput {
  const g = fromSmiles(smiles);
  return { ...g, atoms: g.atoms.map((a, i) => ({ ...a, ...at[i] })) };
}

describe("bond-shift isomers drawn", () => {
  it("are one structure though the drawing gives each ring double bond a side: the sides go with the orders", () => {
    // (1,2-dimethylcyclooctatetraene across a double bond and across a single one, each ring double bond drawn cis)
    const withSides = (smiles: string) => {
      const g = fromSmiles(smiles);
      const ring = (b: { a: number; b: number }) => g.bonds.filter((x) => x.a === b.a || x.b === b.a || x.a === b.b || x.b === b.b);
      return {
        ...g,
        bonds: g.bonds.map((b) => {
          if (b.order !== 2) return b;
          const [p, q] = [b.a, b.b].map((end) => ring(b).find((x) => x !== b && (x.a === end || x.b === end))!).map((x, k) => (x.a === [b.a, b.b][k] ? x.b : x.a));
          return { ...b, stereo: { refs: [p, q] as const, cis: true } };
        }),
      };
    };
    const across = withSides("CC1=C(C)C=CC=CC=C1");
    const along = withSides("CC1=CC=CC=CC=C1C");
    expect(across.bonds.some((b) => b.stereo)).toBe(true);
    expect(identityText(across)).toBe(identityText(along));
    expect(aromaticForm(across).bonds.filter((b) => b.order === 4).every((b) => !b.stereo)).toBe(true);
  });
});

describe("a plain hydrogen atom, in a structure's identity", () => {
  it("counts as one of its neighbour's hydrogens: drawn or not, the same structure", () => {
    expect(identityText(fromSmiles("[H]C([H])([H])O"))).toBe(identityText(fromSmiles("CO")));
    expect(identityText(fromSmiles("[H]c1ccccc1"))).toBe(identityText(fromSmiles("c1ccccc1")));
    expect(identityText(fromSmiles("[H]N(C)C"))).toBe(identityText(fromSmiles("CNC")));
    // (and it is still another structure from one with another group there)
    expect(identityText(fromSmiles("[H]c1ccccc1"))).not.toBe(identityText(fromSmiles("Cc1ccccc1")));
  });

  it("on a stereocentre: folded in with its configuration, carried to the centre - the mirror image still apart", () => {
    const drawn = fromSmiles("F[C@]([H])(Cl)Br");
    expect(identityText(drawn)).toBe(identityText(fromSmiles("F[C@H](Cl)Br")));
    expect(identityText(drawn)).not.toBe(identityText(fromSmiles("F[C@@H](Cl)Br")));
    // (an H moved a place among the neighbours turns the sense, and is still the same centre)
    expect(identityText(fromSmiles("F[C@@](Cl)([H])Br"))).toBe(identityText(fromSmiles("F[C@H](Cl)Br")));
    // (F, H, Cl, Br, the H moved two places to the end: the same sense)
    expect(hydrogensFolded(drawn).atoms[1].tetra).toEqual({ neighbours: [0, 2, 3, -1], volume: 1 });
  });

  it("setting a double bond's side: folded in, the configuration carried by the end's other neighbour - E and Z still apart", () => {
    const drawn = fromSmiles("[H]/C(F)=C(/F)[H]");
    // (the first H trans to the far F, so the near F cis to it: (Z)-1,2-difluoroethene)
    expect(identityText(drawn)).toBe(identityText(fromSmiles("F/C=C\\F")));
    expect(identityText(drawn)).not.toBe(identityText(fromSmiles("F/C=C/F")));
  });

  it("where no configuration was there to carry - a centre with two hydrogens, a double bond's end with two - keeps none", () => {
    // (CH2FCl drawn with a configuration over its two H: there is no stereocentre)
    const g = fromSmiles("F[C@]([H])([H])Cl");
    expect(hydrogensFolded(g).atoms.every((a) => !a.tetra)).toBe(true);
    expect(identityText(g)).toBe(identityText(fromSmiles("FCCl")));
    expect(identityText(fromSmiles("[H]/C([H])=C/F"))).toBe(identityText(fromSmiles("C=CF")));
  });

  it("does not depend on the order of the atoms", () => {
    for (const smiles of ["F[C@]([H])(Cl)Br", "[H]/C(F)=C(/F)[H]", "F[C@]([H])([H])Cl", "[H]C([H])([H])C([H])=O"]) {
      const g = fromSmiles(smiles);
      for (const seed of SHUFFLE_SEEDS) expect(identityText(shuffled(g, seed)), smiles).toBe(identityText(g));
    }
  });
});

describe("a hydrogen atom kept an atom in a structure's identity", () => {
  // (each beside the structure folding it would make, its identity apart from that one)
  it("one isotope in particular: CH3D is not methane, CH3T not CH3D", () => {
    const d = marked("[H]C", { 0: { isotope: 2 } });
    expect(hydrogensFolded(d).atoms).toHaveLength(2);
    expect(identityText(d)).not.toBe(identityText(fromSmiles("C")));
    expect(identityText(d)).not.toBe(identityText(marked("[H]C", { 0: { isotope: 3 } })));
    // (and a 13C is not a 12C, nor a CH3 radical a methane)
    expect(identityText(marked("C", { 0: { isotope: 13 } }))).not.toBe(identityText(fromSmiles("C")));
    expect(identityText(marked("[CH3]", { 0: { radical: "doublet" } }))).not.toBe(identityText(fromSmiles("[CH3]")));
  });

  it("charged, or with an unpaired electron", () => {
    const charged = marked("[H]O", { 0: { charge: 1 } });
    expect(hydrogensFolded(charged).atoms).toHaveLength(2);
    const radical = marked("[H]O", { 0: { radical: "doublet" } });
    expect(hydrogensFolded(radical).atoms).toHaveLength(2);
    expect(identityText(radical)).not.toBe(identityText(fromSmiles("O")));
  });

  it("mapped to an atom of a reaction", () => {
    expect(hydrogensFolded(marked("[H]C", { 0: { mapped: true } })).atoms).toHaveLength(2);
  });

  it("bonded to another hydrogen: H2 is not a lone H with one of its own", () => {
    const h2 = fromSmiles("[H][H]");
    expect(hydrogensFolded(h2).atoms).toHaveLength(2);
    expect(identityText(h2)).not.toBe(identityText({ atoms: [{ el: "H", hs: 1 }], bonds: [] }));
  });

  it("bridging two atoms: diborane's bridges stay", () => {
    const g = fromSmiles("B1[H]B[H]1");
    expect(hydrogensFolded(g).atoms).toHaveLength(4);
  });

  it("on a metal: a hydride is not a metal with an H of its own", () => {
    const g = fromSmiles("[Pd][H]");
    expect(hydrogensFolded(g).atoms).toHaveLength(2);
    expect(identityText(g)).not.toBe(identityText({ atoms: [{ el: "Pd", hs: 1 }], bonds: [] }));
  });
});

describe("a structure's identity, as found", () => {
  it("says the search that wrote it was complete, where it was", () => {
    for (const smiles of ["CCO", "c1ccccc1", "C12C3C4C1C5C2C3C45"]) expect(identity(fromSmiles(smiles)).complete, smiles).toBe(true);
    expect(identity(fromSmiles("CCO")).text).toBe(identityText(fromSmiles("CCO")));
  });

  it("says so where the search ran out of steps - forty methanes apart, alike in every way - and still writes every atom", () => {
    const found = identity(fromSmiles(Array(40).fill("C").join(".")));
    expect(found.complete).toBe(false);
    // (each a carbon with four hydrogens and no bonds)
    expect(found.text.match(/(^|;)C\|0\|4\|0\|/g)).toHaveLength(40);
  });
});
