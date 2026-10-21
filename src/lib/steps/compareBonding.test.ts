import { describe, expect, it } from "vitest";
import type { Molecule } from "../chem/molecule";
import { mapReaction } from "../chem/reactionMap";
import { dielsAlder } from "../chem/reactionMap.fixtures";
import type { Entry } from "../entry";
import { speciesOf } from "../io/writers";
import { comparedBonding, matchingReference } from "./compareBonding";

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
      expect.stringMatching(/^C1-C11 is bonded in the reference, not here: \d+\.\d\d Å apart, past 1\.65 Å/),
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
