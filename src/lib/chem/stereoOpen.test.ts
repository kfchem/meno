import { describe, expect, it } from "vitest";
import { readSmiles } from "./smiles";
import { v2000 } from "./testdata/v2000";
import { configuredFrom, cumulatedRuns, leftOver, movingCN, movingSaid, openCumulenes, stereoGraphOf, stereoLeft, type StereoAtom, type StereoBond } from "./stereoOpen";

/** A molecule as the rules read it, from SMILES written with its double bonds. */
function mol(smiles: string): { atoms: StereoAtom[]; bonds: StereoBond[] } {
  const s = readSmiles(smiles);
  return { atoms: s.atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0, ...(a.hs != null ? { hs: a.hs } : {}) })), bonds: s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) };
}
const moving = (smiles: string) => {
  const m = mol(smiles);
  return [...movingCN(m.atoms, m.bonds).values()];
};

describe("C=N double bonds whose E/Z is none of their own", () => {
  it("are an amidine's, a guanidine's, an imidic acid's - a hydrogen beside them moves to their N, and the double bond with it", () => {
    for (const smiles of ["CC(=NC)N", "CNC(=NC)NC", "CC(=NC)O", "CC(=O)N=C(C)N"]) expect(moving(smiles), smiles).toEqual(["shift"]);
  });

  it("are one whose N bears a hydrogen, and an amidinium's or guanidinium's, its double bond shared", () => {
    expect(moving("CC=N")).toEqual(["nh"]);
    expect(moving("CC(N(C)C)=[N+](C)C")).toEqual(["cation"]);
    // (an amidinium whose N beside it is a pyrrole's, its lone pair the ring's: no bond it shares)
    expect(moving("CC(n1cccc1)=[N+](C)CC")).toEqual([]);
  });

  it("are not an imine whose N bears a carbon, an oxime's, a hydrazone's - nor one in a ring held flat", () => {
    for (const smiles of ["CC=NC", "CC=NO", "CC=NN", "C1=CC=NC=C1", "NC1=NC=CC=C1"]) expect(moving(smiles), smiles).toEqual([]);
  });

  it("are said in a line, each reason once", () => {
    expect(movingSaid(["shift", "shift"])).toBe("E/Z of 2 C=N not enumerated: its double bond moves with a hydrogen on an N, O or S beside it (an amidine, a guanidine, an imidic acid) - no configuration of its own");
    expect(movingSaid([])).toBeNull();
  });
});

describe("cumulated double bonds left open", () => {
  it("are those on an atom of two double bonds, in runs of those that share an atom", () => {
    // (penta-2,3-diene: an allene; hexa-2,3,4-triene: a run of three)
    const allene = mol("CC=C=CC");
    const twos = allene.bonds.flatMap((b, i) => (b.order === 2 ? [i] : []));
    expect(openCumulenes(allene.bonds, twos)).toEqual(twos);
    expect(cumulatedRuns(allene.bonds, twos)).toEqual([twos]);
    const triene = mol("CC=C=C=CC");
    const three = triene.bonds.flatMap((b, i) => (b.order === 2 ? [i] : []));
    expect(cumulatedRuns(triene.bonds, three)).toEqual([three]);
    // (a plain double bond is no cumulene)
    const butene = mol("CC=CC");
    expect(openCumulenes(butene.bonds, [1])).toEqual([]);
  });
});

describe("configurations read from places made before", () => {
  // (but-2-ene's C1 C2 = C3 C4: cis, then trans; and a centre with three neighbours and its H)
  const bonds = [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 2 }, { a: 2, b: 3, order: 1 }];
  it("gives a double bond's cis or trans, by an atom bonded to each end", () => {
    const cis = { 0: [-0.7, 1, 0], 1: [0, 0, 0], 2: [1.3, 0, 0], 3: [2, 1, 0] } as const;
    const trans = { ...cis, 3: [2, -1, 0] } as const;
    expect(configuredFrom(bonds, cis, [], [1]).doubles).toEqual([{ bond: 1, ends: [0, 3], cis: true }]);
    expect(configuredFrom(bonds, trans, [], [1]).doubles).toEqual([{ bond: 1, ends: [0, 3], cis: false }]);
    // (an end not placed: none)
    const { 3: _gone, ...part } = cis;
    expect(configuredFrom(bonds, part, [], [1]).doubles).toEqual([]);
  });

  it("gives a centre its neighbours in its bonds' order and the sign of the volume they span, and its mirror image the other", () => {
    const centre = [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }, { a: 0, b: 3, order: 1 }];
    const one = { 0: [0, 0, 0], 1: [1, 0, -0.3], 2: [-0.5, 0.87, -0.3], 3: [-0.5, -0.87, -0.3] } as const;
    const mirror = { 0: [0, 0, 0], 1: [1, 0, 0.3], 2: [-0.5, 0.87, 0.3], 3: [-0.5, -0.87, 0.3] } as const;
    const [a] = configuredFrom(centre, one, [0], []).centres;
    const [b] = configuredFrom(centre, mirror, [0], []).centres;
    expect(a.neighbours).toEqual([1, 2, 3]);
    expect(a.sense).toBe(-b.sense);
    // (flat: no configuration to read)
    expect(configuredFrom(centre, { 0: [0, 0, 0], 1: [1, 0, 0], 2: [-0.5, 0.87, 0], 3: [-0.5, -0.87, 0] }, [0], []).centres).toEqual([]);
    // (a centre with two neighbours placed spans no volume: none read)
    const two = [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }];
    expect(configuredFrom(two, { 0: [0, 0, 0], 1: [1, 0, -0.3], 2: [-0.5, 0.87, -0.3] }, [0], []).centres).toEqual([]);
  });
});

describe("what a structure leaves open, as Meno decides it", () => {
  const open = (kind: "centre" | "double", at: number, state: "unspecified" | "unknown" = "unspecified") => ({ kind, at, state });

  it("is each centre and double bond given no configuration, or drawn as not known - never one given one, nor an axis RDKit names otherwise", () => {
    const m = mol("CC(O)C=CC");
    const left = stereoLeft([open("centre", 1), open("double", 3, "unknown"), { kind: "centre", at: 0, state: "specified" }, { kind: "axis", at: 2, state: "unspecified" }], m.atoms, m.bonds);
    expect(left).toEqual({ atoms: [1], bonds: [3], cumulenes: [], cumulated: [], notEnumerated: [], said: null });
  });

  it("takes out a C=N whose E/Z is none of its own, never enumerated, and says it in a line", () => {
    const m = mol("CN=C(N)NCC(O)C");
    const left = stereoLeft([open("double", 1, "unknown"), open("centre", 6)], m.atoms, m.bonds);
    expect(left.bonds).toEqual([]);
    expect(left.notEnumerated).toEqual([1]);
    expect(left.said).toBe("E/Z of 1 C=N not enumerated: its double bond moves with a hydrogen on an N, O or S beside it (an amidine, a guanidine, an imidic acid) - no configuration of its own");
  });

  it("says the open double bonds that are cumulated, and the runs they make: an allene's axis, a butatriene's cis or trans, two allenes apart", () => {
    const allene = mol("CC=C=CC");
    expect(stereoLeft([open("double", 1), open("double", 2)], allene.atoms, allene.bonds)).toMatchObject({ bonds: [1, 2], cumulenes: [1, 2], cumulated: [[1, 2]] });
    const triene = mol("CC=C=C=CC");
    expect(stereoLeft([1, 2, 3].map((i) => open("double", i)), triene.atoms, triene.bonds).cumulated).toEqual([[1, 2, 3]]);
    const tetraene = mol("CC=C=C=C=CC");
    expect(stereoLeft([1, 2, 3, 4].map((i) => open("double", i)), tetraene.atoms, tetraene.bonds).cumulated).toEqual([[1, 2, 3, 4]]);
    const diene = mol("CC=CC=CC");
    expect(stereoLeft([open("double", 1), open("double", 3)], diene.atoms, diene.bonds).cumulated).toEqual([]);
  });

  it("takes out a centre at an atom of three neighbours whose lone pair keeps no configuration - an amine's N, a plain N-methyl or an N-aryl aziridine's - and keeps an N-chloro aziridine's N and a phosphine's P", () => {
    const left = (smiles: string, centres: number[]) => {
      const m = mol(smiles);
      return stereoLeft(centres.map((i) => open("centre", i)), m.atoms, m.bonds).atoms;
    };
    expect(left("CN(CC)CCC", [1])).toEqual([]);
    expect(left("CC1CN1c1ccccc1", [1, 3])).toEqual([1]);
    expect(left("CC1CN1C", [1, 3])).toEqual([1]);
    expect(left("CC1CN1Cl", [1, 3])).toEqual([1, 3]);
    expect(left("CP(CC)c1ccccc1", [1])).toEqual([1]);
    // (a secondary phosphine's P, its H the fourth of four: a centre as any other, left open as perceived)
    expect(left("C[PH]CC", [1])).toEqual([1]);
  });

  it("is what is left once places made before give some of it a configuration", () => {
    const m = mol("CC=C=CC");
    const left = stereoLeft([open("double", 1), open("double", 2)], m.atoms, m.bonds);
    expect(leftOver(left, { centres: [], doubles: [{ bond: 1, ends: [0, 2], cis: true }] }, m.bonds)).toMatchObject({ bonds: [2], cumulenes: [2], cumulated: [[2]] });
  });

  it("reads a structure's parts as one, one after another, a radical's electrons in place of hydrogens", () => {
    const g = stereoGraphOf([v2000(["C", "O"], [[0, 1, 1]]), v2000(["C", { el: "N", radical: 2 }, "C"], [[0, 1, 1], [1, 2, 2]])])!;
    expect(g.atoms.map((a) => a.el)).toEqual(["C", "O", "C", "N", "C"]);
    expect(g.bonds).toEqual([{ a: 0, b: 1, order: 1 }, { a: 2, b: 3, order: 1 }, { a: 3, b: 4, order: 2 }]);
    // (the N's one unpaired electron takes the hydrogen its valence would leave it)
    expect(g.atoms[3].hs).toBe(0);
    expect(stereoGraphOf(["not a block"])).toBeNull();
    // (an allyl bound through all its atoms - a bond to a star, ENDPTS its atoms: of no order, its atoms' hydrogens as their own bonds leave them)
    const eta = ["", "  test", "", "  0  0  0  0  0  0  0  0  0  0999 V3000", "M  V30 BEGIN CTAB", "M  V30 COUNTS 5 3 0 0 0", "M  V30 BEGIN ATOM",
      "M  V30 1 Pd 0 0 0 0", "M  V30 2 C 1 0 0 0", "M  V30 3 C 2 0 0 0", "M  V30 4 C 3 0 0 0", "M  V30 5 * 2 1 0 0", "M  V30 END ATOM", "M  V30 BEGIN BOND",
      "M  V30 1 1 2 3", "M  V30 2 2 3 4", "M  V30 3 9 1 5 ENDPTS=(3 2 3 4) ATTACH=ALL", "M  V30 END BOND", "M  V30 END CTAB", "M  END"].join("\n");
    expect(stereoGraphOf([eta])!.bonds[2]).toEqual({ a: 0, b: 4, order: 0 });
  });
});
