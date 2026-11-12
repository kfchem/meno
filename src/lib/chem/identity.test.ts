import { describe, expect, it } from "vitest";
import { symmetryClasses } from "../layout/canonical";
import { fromSmiles } from "../layout/testdata/fromSmiles";
import { SHUFFLE_SEEDS, shuffled, tiedCages } from "../layout/testdata/shuffled";
import type { LayoutAtom, LayoutBond, LayoutInput } from "../layout/perceive";
import type { Axial } from "../layout/stereo";
import { aromaticForm, automorphismGroup, hydrogensFolded, identity, identityKey, identityText, stereoUnitsOnly, symmetryOrbits, type IdentityAtom, type IdentityInput } from "./identity";

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

/** Ethylene bound to platinum through a star, an H drawn on its first carbon. */
function cpLike(): IdentityInput {
  return {
    atoms: [{ el: "C", hs: 1 }, { el: "C", hs: 2 }, { el: "*", hs: 0, pi: [0, 1] }, { el: "Pt", hs: 0 }, { el: "H", hs: 0 }],
    bonds: [{ a: 0, b: 1, order: 2 }, { a: 2, b: 3, order: 1 }, { a: 0, b: 4, order: 1 }],
  };
}

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

describe("a plain hydrogen folded in beside a pi system bound to a metal", () => {
  /** A cyclopentadienyl ring, one H drawn on its first carbon, its star bound to Fe: the H at `hAt` among the atoms. */
  function cp(hAt: "first" | "last"): IdentityInput {
    // (ring c0..c4, the star, Fe - and the H on c0, first or last)
    const ring = [0, 1, 2, 3, 4];
    const off = hAt === "first" ? 1 : 0;
    const h = hAt === "first" ? 0 : 7;
    const atoms: IdentityAtom[] = [];
    if (hAt === "first") atoms.push({ el: "H", hs: 0 });
    for (const k of ring) atoms.push({ el: "C", hs: k === 0 ? 0 : 1 });
    atoms.push({ el: "*", hs: 0, pi: ring.map((k) => k + off) });
    atoms.push({ el: "Fe", hs: 0 });
    if (hAt === "last") atoms.push({ el: "H", hs: 0 });
    const bonds = [
      ...ring.map((k) => ({ a: k + off, b: ((k + 1) % 5) + off, order: k % 2 ? 1 : k === 4 ? 1 : 2 })),
      { a: 5 + off, b: 6 + off, order: 1 },
      { a: off, b: h, order: 1 },
    ];
    return { atoms, bonds };
  }

  it("keeps the pi system on its own atoms: the same structure whatever the order of its atoms", () => {
    const first = hydrogensFolded(cp("first"));
    expect(first.atoms.find((a) => a.el === "*")!.pi).toEqual([0, 1, 2, 3, 4]);
    expect(identityText(cp("first"))).toBe(identityText(cp("last")));
    for (const seed of SHUFFLE_SEEDS) expect(identityText(shuffled(cp("first"), seed) as IdentityInput)).toBe(identityText(cp("last")));
  });
});

describe("a hydrogen atom kept an atom in a structure's identity", () => {
  it("one of a pi system bound to a metal", () => {
    const g: IdentityInput = { atoms: [{ el: "H", hs: 0 }, { el: "H", hs: 0 }, { el: "*", hs: 0, pi: [0, 1] }, { el: "Pt", hs: 0 }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 2, b: 3, order: 1 }] };
    expect(hydrogensFolded(g).atoms).toHaveLength(4);
    // (and one plain H bonded to an atom of a pi system, not in it: folded)
    const ring = cpLike();
    expect(hydrogensFolded(ring).atoms.filter((a) => a.el === "H")).toHaveLength(0);
  });

  it("bonded by anything but one single bond, or to nothing", () => {
    // (an H drawn with a double bond to its carbon: not a plain H)
    expect(hydrogensFolded({ atoms: [{ el: "H", hs: 0 }, { el: "C", hs: 2 }], bonds: [{ a: 0, b: 1, order: 2 }] }).atoms).toHaveLength(2);
    // (a lone H atom, bonded to nothing)
    const lone = { atoms: [{ el: "H", hs: 0 }, { el: "C", hs: 4 }], bonds: [] };
    expect(hydrogensFolded(lone).atoms).toHaveLength(2);
    expect(identityText(lone)).not.toBe(identityText(fromSmiles("C")));
  });


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

describe("a configuration that makes no stereo unit, in a structure's identity", () => {
  /** Whether the SMILES are one structure, as identity has them. */
  const one = (...smiles: string[]) => new Set(smiles.map((s) => identityText(fromSmiles(s)))).size === 1;

  it("is ignored: a wedge on an isopropyl's CH, a prenyl's C=C(CH3)2 drawn either way, an exocyclic C=C on a ring alike both ways", () => {
    expect(one("C[C@H](C)O", "C[C@@H](C)O", "CC(C)O")).toBe(true);
    expect(one("C/C(C)=C/CO", "C/C(C)=C\\CO", "C\\C(C)=C/CO", "CC(C)=CCO")).toBe(true);
    expect(one("C/C=C1/CCCCC1", "C/C=C1\\CCCCC1", "CC=C1CCCCC1")).toBe(true);
    expect(one("C/C=C1/CCC(C)CC1", "CC=C1CCC(C)CC1", "C[C@H]1CCC(=CC)CC1")).toBe(true);
  });

  it("keeps every stereo unit: a centre's two alike arms set apart by another configuration, a pseudoasymmetric centre, E and Z", () => {
    // (cis and trans: each centre's ring arms alike until the other centre is counted)
    expect(one("C[C@H]1CC[C@@H](C)CC1", "C[C@H]1CC[C@H](C)CC1")).toBe(false);
    expect(one("C[C@H]1CC[C@@H](C)CC1", "CC1CCC(C)CC1")).toBe(false);
    expect(one("C[C@H]1C[C@@H](C)C1", "C[C@H]1C[C@H](C)C1")).toBe(false);
    // (meso and (R,R)-tartaric acid; (R)- and (S)-butan-2-ol; (E)- and (Z)-but-2-ene)
    expect(one("O=C(O)[C@H](O)[C@@H](O)C(=O)O", "O=C(O)[C@@H](O)[C@@H](O)C(=O)O")).toBe(false);
    expect(one("CC[C@@H](C)O", "CC[C@H](C)O")).toBe(false);
    expect(one("C/C=C/C", "C/C=C\\C")).toBe(false);
    // (an exocyclic C=C whose ring arms are alike by constitution only: (4-methylcyclohexylidene)ethane's two forms, mirror images)
    expect(one("C/C=C1/CC[C@@H](C)CC1", "C/C=C1\\CC[C@@H](C)CC1")).toBe(false);
    expect(one("C/C=C1/CC[C@@H](C)CC1", "CC=C1CC[C@@H](C)CC1")).toBe(false);
    // (2,3,4-trihydroxyglutaric acid: its two meso forms, C3 r and s, apart; in the chiral form C3 sets nothing)
    expect(one("O=C(O)[C@@H](O)[C@H](O)[C@@H](O)C(=O)O", "O=C(O)[C@@H](O)[C@@H](O)[C@@H](O)C(=O)O")).toBe(false);
    expect(one("O=C(O)[C@@H](O)[C@H](O)[C@@H](O)C(=O)O", "O=C(O)[C@@H](O)C(O)[C@@H](O)C(=O)O")).toBe(false);
    expect(one("O=C(O)[C@H](O)[C@H](O)[C@@H](O)C(=O)O", "O=C(O)[C@H](O)[C@@H](O)[C@@H](O)C(=O)O", "O=C(O)[C@H](O)C(O)[C@@H](O)C(=O)O")).toBe(true);
  });

  it("is weighed with the unit where it is: another atom alike that a symmetry takes it onto does not make its groups alike", () => {
    // (1,3-dichloro-2,4-dimethylcyclobutane, ring C0-C3: Cl on C0 and C2, methyls on C1 and C3; C0 and both methyls'
    // CH drawn, C2 open. A half turn takes C0 onto C2, but no symmetry keeping C0 swaps its ring arms where the
    // methyls are cis: its Cl cis or trans to them, two structures. Where they are trans, C0's arms are alike)
    const ring = (v0: 1 | -1, v1: 1 | -1, v3: 1 | -1): LayoutInput => ({
      atoms: [
        { el: "C", hs: 1, tetra: { neighbours: [1, 3, 4, -1], volume: v0 } },
        { el: "C", hs: 1, tetra: { neighbours: [0, 2, 6, -1], volume: v1 } },
        { el: "C", hs: 1 },
        { el: "C", hs: 1, tetra: { neighbours: [2, 0, 7, -1], volume: v3 } },
        { el: "Cl", hs: 0 },
        { el: "Cl", hs: 0 },
        { el: "C", hs: 3 },
        { el: "C", hs: 3 },
      ],
      bonds: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 1 },
        { a: 3, b: 0, order: 1 },
        { a: 0, b: 4, order: 1 },
        { a: 2, b: 5, order: 1 },
        { a: 1, b: 6, order: 1 },
        { a: 3, b: 7, order: 1 },
      ],
    });
    // (the methyls cis where C1's and C3's volumes are the same, as their neighbours are listed)
    expect(identityText(ring(1, 1, 1))).not.toBe(identityText(ring(-1, 1, 1)));
    expect(identityText(ring(1, 1, -1))).toBe(identityText(ring(-1, 1, -1)));
  });

  it("is looked for again after each one taken out: 2,4-dimethylpentan-3-ol's C3 has alike groups only once both isopropyls' CH are", () => {
    const plain = identityText(fromSmiles("CC(C)C(O)C(C)C"));
    for (const a of ["@", "@@"]) for (const b of ["@", "@@"]) for (const c of ["@", "@@"]) expect(identityText(fromSmiles(`C[C${a}H](C)[C${b}H](O)[C${c}H](C)C`)), a + b + c).toBe(plain);
  });

  it("is kept, and the identity says it may not be the only one, where the search for alike groups ran out of steps before it found them", () => {
    // (forty methanes beside the isopropanol: the search cannot finish, and the methyls' swap is not among what it found)
    const methanes = Array(40).fill("C").join(".");
    const found = identity(fromSmiles(`${methanes}.C[C@H](C)O`));
    expect(found.complete).toBe(false);
    expect(found.text).not.toBe(identity(fromSmiles(`${methanes}.CC(C)O`)).text);
  });

  it("is set aside where a search that ran out of steps still found its groups alike: what it finds alike is", () => {
    // (forty methanes beside a CHF2Cl: the search cannot finish, but takes the two F onto each other before it stops)
    const methanes = Array(40).fill("C").join(".");
    expect(identity(fromSmiles(`${methanes}.F[C@H](F)Cl`)).text).toBe(identity(fromSmiles(`${methanes}.FC(F)Cl`)).text);
  });

  it("is ignored on an axis whose one end has two alike groups: a 2,6-dimethylphenyl's, against a 2-chlorophenyl", () => {
    // (ring A 0-5, ring B 6-11, the axis 0-6; a methyl 12 on 1 and, where both, 14 on 5; a Cl 13 on 7)
    const biaryl = (both: boolean, sense?: 1 | -1): LayoutInput => {
      const atoms: LayoutAtom[] = [];
      const bonds: LayoutBond[] = [];
      for (const at of [0, 6]) {
        for (let k = 0; k < 6; k++) atoms.push({ el: "C", hs: k < 2 || (both && at === 0 && k === 5) ? 0 : 1 });
        for (let k = 0; k < 6; k++) bonds.push({ a: at + k, b: at + ((k + 1) % 6), order: k % 2 ? 1 : 2 });
      }
      atoms.push({ el: "C", hs: 3 }, { el: "Cl", hs: 0 });
      bonds.push({ a: 0, b: 6, order: 1 }, { a: 1, b: 12, order: 1 }, { a: 7, b: 13, order: 1 });
      if (both) {
        atoms.push({ el: "C", hs: 3 });
        bonds.push({ a: 5, b: 14, order: 1 });
      }
      return { atoms, bonds, ...(sense ? { axes: [{ atoms: [0, 6], refs: [1, 7], sense }] } : {}) };
    };
    expect(identityText(biaryl(true, 1))).toBe(identityText(biaryl(true)));
    expect(identityText(biaryl(true, -1))).toBe(identityText(biaryl(true)));
    // (one methyl: an axis of chirality, its two senses two structures)
    expect(identityText(biaryl(false, 1))).not.toBe(identityText(biaryl(false, -1)));
    expect(identityText(biaryl(false, 1))).not.toBe(identityText(biaryl(false)));
  });

  it("does not depend on the order of the atoms", () => {
    for (const smiles of ["C[C@H](C)O", "C/C(C)=C/CO", "C[C@H]1CC[C@@H](C)CC1", "O=C(O)[C@@H](O)[C@H](O)[C@@H](O)C(=O)O", "C/C=C1/CC[C@@H](C)CC1"]) {
      const g = fromSmiles(smiles);
      for (const seed of SHUFFLE_SEEDS) expect(identityText(shuffled(g, seed)), smiles).toBe(identityText(g));
    }
  });
});

describe("a double bond's cis or trans and an axis's sense, in a structure's identity", () => {
  // (a biaryl, its axis 0-6: ring A 0-5, a methyl 12 on 1; ring B 6-11, a Cl 13 on 7 - its ortho atoms 1 and 5, 7 and 11)
  const biaryl = (axis: Axial): LayoutInput => {
    const atoms: LayoutAtom[] = [];
    const bonds: LayoutBond[] = [];
    for (const at of [0, 6]) {
      for (let k = 0; k < 6; k++) atoms.push({ el: "C", hs: k < 2 ? 0 : 1 });
      for (let k = 0; k < 6; k++) bonds.push({ a: at + k, b: at + ((k + 1) % 6), order: k % 2 ? 1 : 2 });
    }
    atoms.push({ el: "C", hs: 3 }, { el: "Cl", hs: 0 });
    bonds.push({ a: 0, b: 6, order: 1 }, { a: 1, b: 12, order: 1 }, { a: 7, b: 13, order: 1 });
    return { atoms, bonds, axes: [axis] };
  };
  // (two such biaryls on a CH2 at their ring A's para atom, each axis by `axisAt` from its first atom's number)
  const biaryls = (...axisAt: ((at: number) => Axial)[]): LayoutInput => {
    const one = biaryl({ atoms: [0, 6], refs: [1, 7], sense: 1 });
    const atoms = axisAt.flatMap(() => one.atoms.map((a, i) => (i === 3 ? { ...a, hs: 0 } : a)));
    const bonds = axisAt.flatMap((_, k) => one.bonds.map((b) => ({ ...b, a: b.a + 14 * k, b: b.b + 14 * k })));
    return { atoms: [...atoms, { el: "C", hs: 2 }], bonds: [...bonds, { a: 3, b: 28, order: 1 }, { a: 17, b: 28, order: 1 }], axes: axisAt.map((x, k) => x(14 * k)) };
  };
  const along = (at: number): Axial => ({ atoms: [at, at + 6], refs: [at + 1, at + 7], sense: 1 });
  // (the same axis from its other end, and by the other ortho atom of its first end: the same atropisomer)
  const back = (at: number): Axial => ({ atoms: [at + 6, at], refs: [at + 7, at + 1], sense: 1 });
  const otherOrtho = (at: number): Axial => ({ atoms: [at, at + 6], refs: [at + 5, at + 7], sense: -1 });
  // (and by the other ortho atom of its second end, or of both)
  const farOrtho = (at: number): Axial => ({ atoms: [at, at + 6], refs: [at + 1, at + 11], sense: -1 });
  const bothOrtho = (at: number): Axial => ({ atoms: [at, at + 6], refs: [at + 5, at + 11], sense: 1 });
  const mirror = (at: number): Axial => ({ ...along(at), sense: -1 });
  // (two alkenyl arms on an O, CH2-C(CH3)=C(X)Y each, X and Y as `far` has them: each arm's configuration given against its CH2 or CH3 and its X or Y)
  type Arm = { refs: readonly ["CH2" | "CH3", "X" | "Y"]; cis: boolean };
  const ether = (far: readonly [LayoutAtom, LayoutAtom], ...arms: Arm[]): LayoutInput => ({
    atoms: [...arms.flatMap((): LayoutAtom[] => [{ el: "C", hs: 2 }, { el: "C", hs: 0 }, { el: "C", hs: 3 }, { el: "C", hs: 0 }, ...far]), { el: "O", hs: 0 }],
    bonds: [
      ...arms.flatMap(({ refs: [near, away], cis }, k): LayoutBond[] => {
        const at = 6 * k;
        const stereo = { refs: [near === "CH2" ? at : at + 2, away === "X" ? at + 4 : at + 5] as const, cis };
        return [
          { a: at, b: at + 1, order: 1 },
          { a: at + 1, b: at + 2, order: 1 },
          { a: at + 1, b: at + 3, order: 2, stereo },
          { a: at + 3, b: at + 4, order: 1 },
          { a: at + 3, b: at + 5, order: 1 },
        ];
      }),
      { a: 0, b: 12, order: 1 },
      { a: 6, b: 12, order: 1 },
    ],
  });
  const FCl = [
    { el: "F", hs: 0 },
    { el: "Cl", hs: 0 },
  ] as const;
  // (the one configuration - the CH2 cis to the F - given against each pair of references)
  const byCH2: Arm = { refs: ["CH2", "X"], cis: true };
  const byCH3: Arm = { refs: ["CH3", "X"], cis: false };
  const byCl: Arm = { refs: ["CH2", "Y"], cis: false };
  const turned: Arm = { refs: ["CH2", "X"], cis: false };

  it("is the same whichever neighbour of each end it was given against", () => {
    // ((Z)-1-chloro-1,2-difluoroethene: its two F cis, or its Cl and the far F trans)
    expect(identityText(fromSmiles("F/C(Cl)=C/F"))).toBe(identityText(fromSmiles("Cl\\C(F)=C/F")));
    expect(identityText(fromSmiles("F/C(Cl)=C(/F)C"))).toBe(identityText(fromSmiles("Cl\\C(F)=C(\\C)F")));
    expect(identityText(ether(FCl, byCH2, byCH2))).toBe(identityText(ether(FCl, byCH2, byCH3)));
    expect(identityText(ether(FCl, byCH2, byCH2))).toBe(identityText(ether(FCl, byCH2, byCl)));
    expect(identityText(biaryl(along(0)))).toBe(identityText(biaryl(otherOrtho(0))));
    expect(identityText(biaryl(along(0)))).toBe(identityText(biaryl(back(0))));
    expect(identityText(biaryl(along(0)))).toBe(identityText(biaryl(farOrtho(0))));
    expect(identityText(biaryl(along(0)))).toBe(identityText(biaryl(bothOrtho(0))));
    expect(identityText(biaryls(along, along))).toBe(identityText(biaryls(along, farOrtho)));
    expect(identityText(biaryls(along, along))).toBe(identityText(biaryls(along, back)));
    expect(identityText(biaryls(along, along))).toBe(identityText(biaryls(along, otherOrtho)));
  });

  it("keeps alike the parts that are alike, whichever neighbours each was given against", () => {
    expect(symmetryOrbits(ether(FCl, byCH2, byCH3)).orbit).toEqual(symmetryOrbits(ether(FCl, byCH2, byCH2)).orbit);
    expect(symmetryOrbits(ether(FCl, byCH2, byCl)).orbit).toEqual(symmetryOrbits(ether(FCl, byCH2, byCH2)).orbit);
    expect(symmetryOrbits(biaryls(along, back)).orbit).toEqual(symmetryOrbits(biaryls(along, along)).orbit);
    expect(symmetryOrbits(biaryls(along, farOrtho)).orbit).toEqual(symmetryOrbits(biaryls(along, along)).orbit);
    expect(symmetryOrbits(biaryls(along, along)).orbit[0]).toBe(symmetryOrbits(biaryls(along, along)).orbit[14]);
  });

  it("has none where an end's two other groups are alike: given cis or trans to one of them, the same structure", () => {
    // (CH2-C(CH3)=C(CH3)2 arms, one given cis to a far methyl and the other trans to it: no configuration either way)
    const methyls = [
      { el: "C", hs: 3 },
      { el: "C", hs: 3 },
    ] as const;
    const one = ether(methyls, byCH2, byCH2);
    const two = ether(methyls, byCH2, turned);
    expect(identityText(two)).toBe(identityText(one));
    // (the same orbits, the second arm's two methyls taken the other way round)
    const orbit = symmetryOrbits(two).orbit;
    expect(orbit.map((_, i) => orbit[i === 10 ? 11 : i === 11 ? 10 : i])).toEqual(symmetryOrbits(one).orbit);
  });

  it("still tells E from Z, an atropisomer from its mirror image, and a meso structure from a chiral one", () => {
    expect(identityText(fromSmiles("F/C(Cl)=C/F"))).not.toBe(identityText(fromSmiles("F/C(Cl)=C\\F")));
    expect(identityText(fromSmiles("F/C(Cl)=C/F"))).not.toBe(identityText(fromSmiles("Cl/C(F)=C/F")));
    expect(identityText(ether(FCl, byCH2, byCH2))).not.toBe(identityText(ether(FCl, byCH2, turned)));
    expect(identityText(biaryl(along(0)))).not.toBe(identityText(biaryl(mirror(0))));
    expect(identityText(biaryl(otherOrtho(0)))).not.toBe(identityText(biaryl(mirror(0))));
    expect(identityText(biaryls(along, along))).not.toBe(identityText(biaryls(along, mirror)));
    expect(identityText(biaryls(along, back))).not.toBe(identityText(biaryls(back, mirror)));
    expect(identityText(biaryls(along, farOrtho))).not.toBe(identityText(biaryls(farOrtho, mirror)));
    expect(identityText(biaryl(farOrtho(0)))).not.toBe(identityText(biaryl(mirror(0))));
  });

  it("does not depend on the order of the atoms", () => {
    for (const g of [fromSmiles("F/C(Cl)=C/F"), fromSmiles("Cl\\C(F)=C/F"), ether(FCl, byCH2, byCH3), ether(FCl, byCH2, byCl), biaryl(otherOrtho(0)), biaryls(along, back)]) {
      const own = identityText(g);
      for (const seed of SHUFFLE_SEEDS) expect(identityText(shuffled(g, seed))).toBe(own);
    }
  });
});

describe("an allene's axis and an odd cumulene's cis or trans, in a structure's identity", () => {
  /** Whether the SMILES are one structure, as identity has them. */
  const one = (...smiles: string[]) => new Set(smiles.map((s) => identityText(fromSmiles(s)))).size === 1;

  it("is the same however it is written: from either end, against either group at an end, its H drawn or not", () => {
    // (penta-2,3-diene; the other end first, the collapsed centre's four an odd turn apart, the mark turned)
    expect(one("CC=[C@]=CC", "C(C)=[C@@]=CC", "[H]C(C)=[C@@]=CC")).toBe(true);
    // ((Z)-1,4-difluorobutatriene, by its F or by its H at an end)
    expect(one("F/C=C=C=C\\F", "C(/F)=C=C=C/F", "[H]/C(F)=C=C=C/F")).toBe(true);
    // (an allene with a ring at one end, alike in its mirror image: its axis and the ring's CH pseudoasymmetric)
    expect(one("CC=[C@]=C1CC[C@H](CC1)CC", "CC[C@H]1CCC(=[C@@]=CC)CC1", "CC[C@@H]1CCC(=[C@]=CC)CC1")).toBe(true);
  });

  it("sets nothing where an end's two groups are alike: an allene's or a cumulene's drawn so is the same structure as drawn without", () => {
    expect(one("CC(C)=[C@]=CF", "CC(C)=[C@@]=CF", "CC(C)=C=CF")).toBe(true);
    expect(one("C/C(C)=C=C=C/F", "C\\C(C)=C=C=C/F", "CC(C)=C=C=CF")).toBe(true);
  });

  it("tells an allene from its mirror image, E from Z, and either from none drawn", () => {
    expect(one("CC=[C@]=CC", "CC=[C@@]=CC")).toBe(false);
    expect(one("CC=[C@]=CC", "CC=C=CC")).toBe(false);
    expect(one("F/C=C=C=C/F", "F/C=C=C=C\\F")).toBe(false);
    expect(one("F/C=C=C=C/F", "FC=C=C=CF")).toBe(false);
    expect(one("CC=[C@]=C1CC[C@H](CC1)CC", "CC=[C@@]=C1CC[C@H](CC1)CC")).toBe(false);
  });

  it("does not depend on the order of the atoms", () => {
    for (const smiles of ["CC=[C@]=CC", "F/C=C=C=C\\F", "CC=[C@]=C1CC[C@H](CC1)CC"]) {
      const g = fromSmiles(smiles);
      for (const seed of SHUFFLE_SEEDS) expect(identityText(shuffled(g, seed)), smiles).toBe(identityText(g));
    }
  });
});

describe("an allene's or a cumulene's end with two alike groups sets nothing", () => {
  it("drops an allene's axis where one end has two alike groups, and keeps it where neither has", () => {
    // (3-methylpenta-2,3-diene's cousin: (CH3)2C=C=CHCH3 - an end with two methyls - against CH3CH=C=CHCH3, each end a methyl and an H)
    expect(fromSmiles("CC(C)=[C@]=CC").axes).toHaveLength(1);
    expect(stereoUnitsOnly(fromSmiles("CC(C)=[C@]=CC")).input.axes ?? []).toHaveLength(0);
    expect(fromSmiles("CC=[C@]=CC").axes).toHaveLength(1);
    expect(stereoUnitsOnly(fromSmiles("CC=[C@]=CC")).input.axes ?? []).toHaveLength(1);
  });

  it("drops an odd cumulene's cis or trans likewise, and keeps it where its ends' groups differ", () => {
    expect(fromSmiles("F/C(F)=C=C=C/F").cumulated ?? []).toHaveLength(1);
    expect(stereoUnitsOnly(fromSmiles("F/C(F)=C=C=C/F")).input.cumulated ?? []).toHaveLength(0);
    expect(fromSmiles("F/C=C=C=C/F").cumulated).toHaveLength(1);
    expect(stereoUnitsOnly(fromSmiles("F/C=C=C=C/F")).input.cumulated ?? []).toHaveLength(1);
  });
});
