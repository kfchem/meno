import { describe, expect, it } from "vitest";
import type { Molecule } from "../chem/molecule";
import { mapReaction } from "../chem/reactionMap";
import { dielsAlder } from "../chem/reactionMap.fixtures";
import type { Entry } from "../entry";
import { speciesOf } from "../io/writers";
import { comparedBonding, matchingReference, numberedCentres } from "./compareBonding";
import numbered from "./testdata/numbered-centres.json";

/** Compare bonding against answers known by construction: bonds a reaction forms, a centre and its mirror image, cis and trans. */

const entryOf = (m: Molecule, id: string): Entry => ({
  id,
  from: [],
  structure: { atoms: m.atoms.map((a) => ({ el: a.el })), bonds: m.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order as 1 | 2 | 3 })) },
  geometry: { kind: "3d", xyz: m.atoms.flatMap((a) => [a.x, a.y, a.z]) },
  species: speciesOf({ atoms: m.atoms, bonds: [] }),
  properties: {},
  status: "done",
});
const mol = (atoms: [string, number, number, number][], bonds: [number, number, number][]): Molecule => ({
  atoms: atoms.map(([el, x, y, z]) => ({ el, x, y, z })),
  bonds: bonds.map(([a1, a2, order]) => ({ a1, a2, order })),
});
const mirrored = (m: Molecule): Molecule => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, x: -a.x })) });

describe("Compare bonding", () => {
  const da = dielsAlder();
  const reactant = da.reactants[0];
  const mapped = mapReaction({ reactants: [reactant], products: [da.product] });
  if ("error" in mapped) throw new Error(mapped.message);
  const product = mapped.productsInReactantNumbering[0];

  it("finds a product's geometry bonded as the product, and the reactant's not - missing exactly the two ring bonds the reaction forms", () => {
    expect(comparedBonding(entryOf(product, "p"), entryOf(product, "ref"))).toEqual({ same: true, differences: [] });
    const r = comparedBonding(entryOf(reactant, "r"), entryOf(product, "ref"));
    if ("failed" in r) throw new Error(r.failed);
    expect(r.same).toBe(false);
    expect(r.differences).toEqual([
      expect.stringMatching(/^C1-C11 is bonded in the reference, not here: \d+\.\d\d Å apart, past 1\.80 Å/),
      expect.stringMatching(/^C4-C12 is bonded in the reference, not here/),
    ]);
  });

  it("passes over the atoms, elements or bonds listed", () => {
    expect(comparedBonding(entryOf(reactant, "r"), entryOf(product, "ref"), { passOver: { atoms: [0, 3] } })).toEqual({ same: true, differences: [] });
    expect(comparedBonding(entryOf(reactant, "r"), entryOf(product, "ref"), { passOver: { bonds: [[0, 10], [3, 11]] } })).toMatchObject({ same: true });
    expect(comparedBonding(entryOf(reactant, "r"), entryOf(product, "ref"), { passOver: { elements: ["C"] } })).toMatchObject({ same: true });
  });

  // CHFClBr: a stereocentre, its four neighbours unlike
  const t = [
    [0, 0, 1],
    [0.9428, 0, -0.3333],
    [-0.4714, 0.8165, -0.3333],
    [-0.4714, -0.8165, -0.3333],
  ];
  const chiral = mol(
    [["C", 0, 0, 0], ...(["H", "F", "Cl", "Br"].map((el, i) => [el, ...t[i].map((v) => v * [1.09, 1.35, 1.77, 1.94][i])]) as [string, number, number, number][])],
    [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
  );

  it("tells a centre's mirror image apart where R or S is asked, and not where it is not", () => {
    const r = comparedBonding(entryOf(mirrored(chiral), "m"), entryOf(chiral, "ref"), { rs: true });
    expect(r).toEqual({ same: false, differences: ["C1 has the other configuration from the reference's."] });
    expect(comparedBonding(entryOf(mirrored(chiral), "m"), entryOf(chiral, "ref"))).toEqual({ same: true, differences: [] });
    expect(comparedBonding(entryOf(chiral, "c"), entryOf(chiral, "ref"), { rs: true })).toEqual({ same: true, differences: [] });
  });

  it("takes a methylene's two hydrogens swapped as no difference: CH2FCl is no stereocentre", () => {
    const ch2 = mol(
      [["C", 0, 0, 0], ...(["H", "H", "F", "Cl"].map((el, i) => [el, ...t[i].map((v) => v * [1.09, 1.09, 1.35, 1.77][i])]) as [string, number, number, number][])],
      [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
    );
    expect(comparedBonding(entryOf(mirrored(ch2), "m"), entryOf(ch2, "ref"), { rs: true })).toEqual({ same: true, differences: [] });
  });

  it("tells cis from trans 2-butene where E or Z is asked", () => {
    // C1 C2=C3 C4, H on C2 and C3, flat
    const butene = (cisAt: boolean) =>
      mol(
        [
          ["C", -0.75, 1.299, 0],
          ["C", 0, 0, 0],
          ["C", 1.34, 0, 0],
          ["C", 2.09, cisAt ? 1.299 : -1.299, 0],
          ["H", -0.54, -0.935, 0],
          ["H", 1.88, cisAt ? -0.935 : 0.935, 0],
        ],
        [[0, 1, 1], [1, 2, 2], [2, 3, 1], [1, 4, 1], [2, 5, 1]],
      );
    expect(comparedBonding(entryOf(butene(true), "z"), entryOf(butene(false), "ref"), { ez: true })).toEqual({
      same: false,
      differences: ["The double bond C2-C3 is cis at C1-C4 here and trans in the reference."],
    });
    expect(comparedBonding(entryOf(butene(true), "z"), entryOf(butene(false), "ref"))).toEqual({ same: true, differences: [] });
  });

  it("names the first reference an entry is bonded as, or none", () => {
    expect(matchingReference(entryOf(product, "p"), [entryOf(reactant, "a"), entryOf(product, "b")])).toBe(1);
    expect(matchingReference(entryOf(chiral, "c"), [entryOf(product, "b")])).toBeNull();
  });

  it("compares only entries in one numbering, and only geometries, saying why not", () => {
    expect(comparedBonding(entryOf(da.product, "p0"), entryOf(product, "ref"))).toEqual({ failed: expect.stringMatching(/^Atom 1 is H here and C in the reference/) });
    const path: Entry = { ...entryOf(product, "p"), geometry: { kind: "frames", frames: [] } };
    expect(comparedBonding(path, entryOf(product, "ref"))).toEqual({ failed: expect.stringMatching(/Take frames/) });
    const drawn: Entry = { ...entryOf(product, "ref"), geometry: { kind: "none" } };
    expect(comparedBonding(entryOf(product, "p"), drawn, { rs: true })).toEqual({ failed: expect.stringMatching(/cannot be compared/) });
  });
});

/**
 * Every centre by its atoms' numbers, against ConfoTS's own check: each pair
 * of geometries of one synthetic molecule in one numbering, with the atoms
 * ACCeL's calc_stereo(with_num_chirality=True) flags on it as ConfoTS's
 * check_chirality reads its labels - nR and nS, or nE and nZ, at one atom
 * of the two (testdata/numbered-centres.json, made by RDKit's embedding and
 * ACCeL's own code).
 */
describe("Compare bonding, every centre by its atoms' numbers", () => {
  type Case = { name: string; atoms: string[]; bonds: [number, number, number][]; reference: number[]; entry: number[]; flagged: number[] };
  const entry = (c: Case, xyz: number[], id: string): Entry => ({
    id,
    from: [],
    structure: { atoms: c.atoms.map((el) => ({ el })), bonds: c.bonds.map(([a1, a2, order]) => ({ a1, a2, order: order as 1 | 2 | 3 })) },
    geometry: { kind: "3d", xyz },
    species: speciesOf({ atoms: [], bonds: [] }),
    properties: {},
    status: "done",
  });
  // (the atoms each difference names: a centre of four by itself, "C2 has its neighbours ..."; a double bond by both its
  //  ends, "... across C1=C2 ...", each that is read - both, where it has two)
  const named = (c: Case, d: string): number[] => {
    const bond = d.match(/across [A-Z][a-z]?(\d+)=[A-Z][a-z]?(\d+)/);
    if (!bond) return [Number((d.match(/^[A-Z][a-z]?(\d+)/) ?? [])[1]) - 1];
    const ends = new Set(numberedCentres(entry(c, c.reference, "ref").structure).doubleEnds.map((e) => e.atom));
    return [Number(bond[1]) - 1, Number(bond[2]) - 1].filter((x) => ends.has(x));
  };

  for (const c of numbered as Case[])
    it(`flags the atoms ConfoTS's check flags: ${c.name}`, () => {
      const r = comparedBonding(entry(c, c.entry, "e"), entry(c, c.reference, "ref"), { numbered: true });
      if ("failed" in r) throw new Error(r.failed);
      expect(r.differences.flatMap((d) => named(c, d)).sort((p, q) => p - q)).toEqual(c.flagged);
      expect(r.same).toBe(c.flagged.length === 0);
      // (and none where it is not asked)
      expect(comparedBonding(entry(c, c.entry, "e"), entry(c, c.reference, "ref"))).toEqual({ same: true, differences: [] });
    });

  it("reads a =CH2 turned over, which E or Z cannot see: propene has no E or Z", () => {
    const c = (numbered as Case[]).find((x) => x.name.startsWith("propene"))!;
    const r = comparedBonding(entry(c, c.entry, "e"), entry(c, c.reference, "ref"), { ez: true, numbered: true });
    if ("failed" in r) throw new Error(r.failed);
    // (each end's highest-numbered neighbour by a single bond, as ConfoTS's check reads them - H5 on C1, H6 on C2: one
    //  reading, said once for the double bond, which ConfoTS's check flags at both its ends)
    expect(r.differences).toEqual(["H5 and H6 stand trans across C1=C2 here and cis in the reference."]);
    expect(comparedBonding(entry(c, c.entry, "e"), entry(c, c.reference, "ref"), { ez: true })).toEqual({ same: true, differences: [] });
  });

  it("says a centre R or S or E or Z compares once, not again by number", () => {
    const c = (numbered as Case[]).find((x) => x.name === "(S)-butan-2-ol, mirrored")!;
    const r = comparedBonding(entry(c, c.entry, "e"), entry(c, c.reference, "ref"), { rs: true, numbered: true });
    if ("failed" in r) throw new Error(r.failed);
    // (C2 by R or S; its methyls and CH2 by number)
    expect(r.differences.flatMap((d) => named(c, d)).sort((p, q) => p - q)).toEqual([0, 1, 3, 4]);
    expect(r.differences.filter((d) => d.startsWith("C2 "))).toEqual(["C2 has the other configuration from the reference's."]);
  });

  it("reads no allene end, no imine carbon and no aromatic ring's atom, as ConfoTS's check reads none", () => {
    const allene = numberedCentres({ atoms: ["C", "C", "C", "H", "H", "H", "H"].map((el) => ({ el })), bonds: [{ a1: 0, a2: 1, order: 2 }, { a1: 1, a2: 2, order: 2 }, { a1: 0, a2: 3, order: 1 }, { a1: 0, a2: 4, order: 1 }, { a1: 2, a2: 5, order: 1 }, { a1: 2, a2: 6, order: 1 }] });
    expect(allene.doubleEnds).toEqual([]);
    const imine = numberedCentres({ atoms: ["C", "N", "C", "H", "H"].map((el) => ({ el })), bonds: [{ a1: 0, a2: 1, order: 2 }, { a1: 1, a2: 2, order: 1 }, { a1: 0, a2: 3, order: 1 }, { a1: 0, a2: 4, order: 1 }] });
    expect(imine.doubleEnds).toEqual([]);
    const ring = Array.from({ length: 6 }, (_, i) => i);
    const benzene = numberedCentres({ atoms: [...ring.map(() => ({ el: "C" })), ...ring.map(() => ({ el: "H" }))], bonds: [...ring.map((i) => ({ a1: i, a2: (i + 1) % 6, order: (i % 2 ? 1 : 2) as 1 | 2 })), ...ring.map((i) => ({ a1: i, a2: i + 6, order: 1 as const }))] });
    expect(benzene).toEqual({ tetrahedral: [], doubleEnds: [] });
  });
});
