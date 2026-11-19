import { describe, expect, it } from "vitest";
import { fromSmiles } from "../../layout/testdata/fromSmiles";
import { symmetryOrbits } from "../identity";
import { locants, type Locants, type LocantsInput } from "./locants";

// Foundation part 16, level 2: the principal characteristic group leads (P-41, P-44.1.1, P-14.4 (c)). Known answers - the 2013
// recommendations' own names, and Meno's plain cases (M), each name's numbering read off it. Atoms are named by their place in the SMILES.
// Substituent atoms show running numbers after the parent, so only the parent's atoms are checked against the name; an atom outside the
// parent has no locant (null).

function run(smiles: string, level: 1 | 2 = 2): { r: Locants; g: LocantsInput } {
  const g = fromSmiles(smiles);
  const r = locants({ atoms: g.atoms, bonds: g.bonds, orbits: symmetryOrbits(g).orbit }, level);
  return { r, g };
}

/** What each atom shows, by its place in the SMILES. */
const shownOf = (smiles: string, level: 1 | 2 = 2) => run(smiles, level).r.shown.map((s) => (s.sup ? `${s.base}^${s.sup}` : s.base));
const ownOf = (smiles: string) => run(smiles).r.own.map((o) => o.atom).sort((p, q) => p - q);
/** What the given atoms show. */
const at = (smiles: string, ...idx: number[]) => {
  const s = shownOf(smiles);
  return idx.map((i) => s[i]);
};
/** The given atoms' locants: null for an atom outside the parent. */
const locantOf = (smiles: string, ...idx: number[]) => {
  const l = run(smiles).r.locant;
  return idx.map((i) => (l[i] ? l[i]!.base : null));
};
/** Every atom of the molecule is said as Meno's own. */
const allOwn = (smiles: string) => {
  const { r, g } = run(smiles);
  expect(
    r.own.map((o) => o.atom).sort((p, q) => p - q),
    smiles,
  ).toEqual(g.atoms.map((_, i) => i));
};

describe("level 2, the first list", () => {
  it("cyclohex-2-en-1-amine: C-N 1, the double bond 2, 3", () => {
    expect(at("NC1C=CCCC1", 1, 2, 3)).toEqual(["1", "2", "3"]);
  });

  it("3,4-dichloronaphthalene-1,6-dicarboxylic acid: the acids' ring atoms 1 and 6, Cl on 3 and 4; 4a, 8a", () => {
    // (c3 carries one COOH, c11 the other; Cl on c5, c7; c9 and c17 the fusion atoms)
    expect(at("OC(=O)c1cc(Cl)c(Cl)c2cc(C(=O)O)ccc12", 3, 5, 7, 11, 9, 17)).toEqual(["1", "3", "4", "6", "4a", "8a"]);
    expect(locantOf("OC(=O)c1cc(Cl)c(Cl)c2cc(C(=O)O)ccc12", 1, 12)).toEqual([null, null]);
  });

  it("2-methylpent-1-en-4-yn-3-ol, not 4-methylpent-4-en-1-yn-3-ol: the chain 1 to 5 from the C=C end", () => {
    expect(at("C=C(C)C(O)C#C", 0, 1, 3, 5, 6)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("5-bromo-8-hydroxy-4-methylazulene-2-carboxylic acid: COOH on 2; Me 4, Br 5, OH 8 (not 4, 7, 8)", () => {
    const smiles = "OC(=O)c1cc2c(C)c(Br)ccc(O)c2c1";
    expect(at(smiles, 3, 6, 8, 12, 5, 14)).toEqual(["2", "4", "5", "8", "3a", "8a"]);
  });

  it("3-cyclohexylpropanoic acid: the chain the parent, 1 to 3; the ring outside it", () => {
    const smiles = "OC(=O)CCC1CCCCC1";
    expect(at(smiles, 1, 3, 4)).toEqual(["1", "2", "3"]);
    expect(locantOf(smiles, 5)).toEqual([null]);
  });

  it("3-propylbenzoic acid: the ring carbon with COOH 1, the propyl's 3", () => {
    const smiles = "OC(=O)c1cccc(CCC)c1";
    expect(at(smiles, 3, 11, 7)).toEqual(["1", "2", "3"]);
    expect(locantOf(smiles, 1)).toEqual([null]);
  });

  it("3-(4-chlorobutyl)pentane-1,4-diol: the chain with both OH, 1 to 5", () => {
    expect(at("OCCC(CCCCCl)C(O)C", 1, 2, 3, 9, 11)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("3-hydroxypropanamide: the C=O carbon 1", () => {
    expect(at("OCCC(N)=O", 3, 2, 1)).toEqual(["1", "2", "3"]);
  });

  it("4-oxobutanenitrile: the nitrile carbon 1, the CHO carbon 4", () => {
    expect(at("O=CCCC#N", 4, 3, 2, 1)).toEqual(["1", "2", "3", "4"]);
  });

  it("1H-phenalen-4-ol: CH2 1, OH on 4 (indicated hydrogen before the suffix); the interior atom 3a^1 (P-25.3.3.3.1)", () => {
    expect(at("C1C=CC2=C(O)C=CC3=CC=CC1=C23", 0, 4, 3, 13)).toEqual(["1", "4", "3a", "3a^1"]);
  });

  it("2H-pyran-6-carboxylic acid: O 1, CH2 2, COOH on 6", () => {
    expect(at("OC(=O)C1=CC=CCO1", 8, 7, 3)).toEqual(["1", "2", "6"]);
  });

  it("5H-inden-5-one: the C=O carbon 5, its neighbour 4 by 3a", () => {
    expect(at("O=C1C=C2C=CC=C2C=C1", 1, 2, 3, 7)).toEqual(["5", "4", "3a", "7a"]);
  });

  it("hex-5-en-2-ol (M): level 1 gives the double bond 1, level 2 the OH carbon 2", () => {
    expect(shownOf("CC(O)CCC=C", 1)[6]).toBe("1");
    expect(at("CC(O)CCC=C", 0, 1, 3, 4, 5, 6)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("3-chlorocyclohexan-1-ol: level 2 decides, OH carbon 1, Cl on 3; nothing said", () => {
    expect(at("OC1CC(Cl)CCC1", 1, 3)).toEqual(["1", "3"]);
    expect(ownOf("OC1CC(Cl)CCC1")).toEqual([]);
  });
});

describe("ketones (class 16)", () => {
  it("1-(piperidin-1-yl)propan-1-one: the chain 1 to 3 from C=O, the ring outside it", () => {
    const smiles = "CCC(=O)N1CCCCC1";
    expect(at(smiles, 2, 1, 0)).toEqual(["1", "2", "3"]);
    expect(locantOf(smiles, 4)).toEqual([null]);
  });

  it("pyrrolidin-2-one: N 1, C=O 2", () => {
    expect(at("O=C1CCCN1", 5, 1, 2)).toEqual(["1", "2", "3"]);
  });

  it("oxolane-2,5-dione: O 1, the C=O carbons 2 and 5", () => {
    const s = at("O=C1CCC(=O)O1", 6, 1, 4);
    expect(s[0]).toBe("1");
    expect([s[1], s[2]].sort()).toEqual(["2", "5"]);
  });

  it("5-oxooxolane-2-carboxylic acid: O 1, COOH on 2, the ring C=O 5", () => {
    const smiles = "OC(=O)C1CCC(=O)O1";
    expect(at(smiles, 8, 3, 6)).toEqual(["1", "2", "5"]);
    expect(locantOf(smiles, 1)).toEqual([null]);
  });

  it("4-(4-oxocyclohexyl)oxolan-2-one: the heterocycle the parent - O 1, C=O 2, the ring on 4", () => {
    const smiles = "O=C1CC(CO1)C1CCC(=O)CC1";
    expect(at(smiles, 5, 1, 2, 3, 4)).toEqual(["1", "2", "3", "4", "5"]);
    expect(locantOf(smiles, 6, 9)).toEqual([null, null]);
  });

  it("quinolin-2(1H)-one: N 1, C=O 2, 4a, 8a", () => {
    expect(at("O=C1C=CC2=CC=CC=C2N1", 10, 1, 4, 9)).toEqual(["1", "2", "4a", "8a"]);
  });

  it("2-butylhex-1-en-1-one: the ketene's C=O carbon 1, its C=C partner 2", () => {
    const s = shownOf("O=C=C(CCCC)CCCC");
    expect([s[1], s[2]]).toEqual(["1", "2"]);
    expect([s[3], s[7]]).toContain("3");
  });

  it("1-phenylethan-1-one: C=O 1, CH3 2, the ring outside", () => {
    expect(at("CC(=O)c1ccccc1", 1, 0)).toEqual(["1", "2"]);
    expect(locantOf("CC(=O)c1ccccc1", 3)).toEqual([null]);
  });

  it("diphenylmethanone: the C=O carbon alone the parent, shown 1; not multiplied", () => {
    const s = shownOf("O=C(c1ccccc1)c1ccccc1");
    expect(s[1]).toBe("1");
    expect(s.filter((x) => x.includes("'"))).toEqual([]);
  });

  it("2-(2-oxopropyl)cyclohexan-1-one: the ring before the chain - C=O 1, the group on 2", () => {
    const smiles = "O=C1CCCCC1CC(C)=O";
    expect(at(smiles, 1, 6, 5)).toEqual(["1", "2", "3"]);
    expect(locantOf(smiles, 8)).toEqual([null]);
  });

  it("5-acetylnonane-4,6-dione: the nonane with two C=O, acetyl on 5", () => {
    const smiles = "CCCC(=O)C(C(C)=O)C(=O)CCC";
    const s = at(smiles, 5, 3, 9, 0, 13);
    expect(s[0]).toBe("5");
    expect([s[1], s[2]].sort()).toEqual(["4", "6"]);
    expect([s[3], s[4]].sort()).toEqual(["1", "9"]);
    expect(locantOf(smiles, 6)).toEqual([null]);
  });

  it("pent-1-en-4-yn-3-one and but-3-en-2-one", () => {
    expect(at("C=CC(=O)C#C", 0, 1, 2, 4, 5)).toEqual(["1", "2", "3", "4", "5"]);
    expect(at("CC(=O)C=C", 0, 1, 3, 4)).toEqual(["1", "2", "3", "4"]);
  });

  it("1-[3-(2-sulfanylidenebutyl)cyclohexyl]butan-2-one: C=O before C=S, the butanone chain 1 to 4", () => {
    const smiles = "CCC(=O)CC1CCCC(C1)CC(=S)CC";
    expect(at(smiles, 4, 2, 1, 0)).toEqual(["1", "2", "3", "4"]);
    expect(locantOf(smiles, 5, 12)).toEqual([null, null]);
  });
});

describe("which carbons are the parent's (B2)", () => {
  it("pentane-1,3,5-tricarboxylic acid: three COOH on one chain, none of their carbons in it", () => {
    const smiles = "OC(=O)CCC(C(=O)O)CCC(=O)O";
    const s = at(smiles, 5, 3, 10, 4, 9);
    expect(s[0]).toBe("3");
    expect([s[1], s[2]].sort()).toEqual(["1", "5"]);
    expect([s[3], s[4]].sort()).toEqual(["2", "4"]);
    expect(locantOf(smiles, 1, 6, 11)).toEqual([null, null, null]);
  });

  it("3-(carboxymethyl)heptanedioic acid: the chain of seven holds two COOH carbons; the branch on 3", () => {
    const smiles = "OC(=O)CC(CC(=O)O)CCCC(=O)O";
    expect(at(smiles, 4, 9, 10, 11, 12)).toEqual(["3", "4", "5", "6", "7"]);
    const s = shownOf(smiles);
    expect([s[1], s[6]]).toContain("1");
    expect([s[3], s[5]]).toContain("2");
  });

  it("propane-1,2,3-tricarboxamide: the amide carbons outside the propane", () => {
    const smiles = "NC(=O)CC(C(N)=O)CC(N)=O";
    const s = at(smiles, 4, 3, 8);
    expect(s[0]).toBe("2");
    expect([s[1], s[2]].sort()).toEqual(["1", "3"]);
    expect(locantOf(smiles, 1, 5, 9)).toEqual([null, null, null]);
  });

  it("butane-1,1,1-tricarbonitrile: the nitrile carbons outside, the butane 1 to 4", () => {
    const smiles = "N#CC(C#N)(C#N)CCC";
    expect(at(smiles, 2, 7, 8, 9)).toEqual(["1", "2", "3", "4"]);
    expect(locantOf(smiles, 1, 3, 5)).toEqual([null, null, null]);
  });

  it("butane-1,2,4-tricarbaldehyde, not 1,3,4: the CHO carbons outside", () => {
    const smiles = "O=CCC(C=O)CCC=O";
    expect(at(smiles, 2, 3, 6, 7)).toEqual(["1", "2", "3", "4"]);
    expect(locantOf(smiles, 1, 4, 8)).toEqual([null, null, null]);
  });

  it("3-cyanopropanoic acid: a chain of three, the cyano carbon outside", () => {
    expect(at("OC(=O)CCC#N", 1, 3, 4)).toEqual(["1", "2", "3"]);
    expect(locantOf("OC(=O)CCC#N", 5)).toEqual([null]);
  });

  it("4-(cyanomethyl)heptanedinitrile: two nitrile carbons end the chain, the third outside", () => {
    const smiles = "N#CCCC(CC#N)CCC#N";
    const s = at(smiles, 4, 1, 10);
    expect(s[0]).toBe("4");
    expect([s[1], s[2]].sort()).toEqual(["1", "7"]);
    expect(locantOf(smiles, 5, 6)).toEqual([null, null]);
  });

  it("4-oxobutanoic acid, 3-chloro-3-oxopropanoic acid, 3-amino-3-oxopropanoic acid: the lower group's carbon ends the chain", () => {
    expect(at("OC(=O)CCC=O", 1, 3, 4, 5)).toEqual(["1", "2", "3", "4"]);
    expect(at("OC(=O)CC(Cl)=O", 1, 3, 4)).toEqual(["1", "2", "3"]);
    expect(at("OC(=O)CC(N)=O", 1, 3, 4)).toEqual(["1", "2", "3"]);
  });

  it("5-(2-amino-2-oxoethyl)furan-2-carboxylic acid: O 1, COOH on 2, the group on 5", () => {
    const smiles = "OC(=O)c1ccc(CC(N)=O)o1";
    expect(at(smiles, 11, 3, 6)).toEqual(["1", "2", "5"]);
    expect(locantOf(smiles, 1, 8)).toEqual([null, null]);
  });

  it("4-formylcyclohexane-1-carboxylic acid: COOH on 1, CHO on 4, both carbons outside", () => {
    const smiles = "OC(=O)C1CCC(C=O)CC1";
    expect(at(smiles, 3, 6)).toEqual(["1", "4"]);
    expect(locantOf(smiles, 1, 7)).toEqual([null, null]);
  });

  it("2-hydroxypropane-1,2,3-tricarboxylic acid (citric acid, M): a propane, the three COOH carbons outside", () => {
    const smiles = "OC(=O)CC(O)(CC(=O)O)C(=O)O";
    const s = at(smiles, 4, 3, 6);
    expect(s[0]).toBe("2");
    expect([s[1], s[2]].sort()).toEqual(["1", "3"]);
    expect(locantOf(smiles, 1, 7, 10)).toEqual([null, null, null]);
  });

  it("3-(cyanomethyl)pentanoic acid (M): the chain runs through the ethyl, not the cyano carbon", () => {
    const smiles = "OC(=O)CC(CC#N)CC";
    expect(at(smiles, 1, 3, 4, 8, 9)).toEqual(["1", "2", "3", "4", "5"]);
    expect(locantOf(smiles, 5, 6)).toEqual([null, null]);
  });
});

describe("acids, esters, acid halides", () => {
  it("2-ethylideneoctanoic acid: the chain of eight, =CH on 2", () => {
    const smiles = "OC(=O)C(=CC)CCCCCC";
    expect(at(smiles, 1, 3, 6, 11)).toEqual(["1", "2", "3", "8"]);
    expect(locantOf(smiles, 4)).toEqual([null]);
  });

  it("4-hydroxy-6-oxoocta-2,4-dienedioic acid: 1 to 8 from the end that puts the double bonds at 2 and 4", () => {
    expect(at("OC(=O)C=CC(O)=CC(=O)CC(=O)O", 1, 3, 4, 5, 7, 8, 10, 11)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("4-aminonaphthalene-1-sulfonic acid: SO3H on 1, NH2 on 4", () => {
    const smiles = "Nc1ccc(S(=O)(=O)O)c2ccccc12";
    expect(at(smiles, 4, 1, 14, 9)).toEqual(["1", "4", "4a", "8a"]);
    expect(locantOf(smiles, 5)).toEqual([null]);
  });

  it("methyl cyclohexanecarboxylate: the ring carbon 1; the ester carbon and the methyl outside", () => {
    const smiles = "COC(=O)C1CCCCC1";
    expect(at(smiles, 4)).toEqual(["1"]);
    expect(locantOf(smiles, 0, 2)).toEqual([null, null]);
  });

  it("ethyl methyl butanedioate: the acid's chain 1 to 4, both alkyls outside", () => {
    const smiles = "CCOC(=O)CCC(=O)OC";
    const s = at(smiles, 3, 7, 5, 6);
    expect([s[0], s[1]].sort()).toEqual(["1", "4"]);
    expect([s[2], s[3]].sort()).toEqual(["2", "3"]);
    expect(locantOf(smiles, 0, 1, 10)).toEqual([null, null, null]);
  });

  it("methyl 4-ethylbenzene-1-sulfonate: the S on 1, the ethyl on 4", () => {
    const smiles = "COS(=O)(=O)c1ccc(CC)cc1";
    expect(at(smiles, 5, 8)).toEqual(["1", "4"]);
    expect(locantOf(smiles, 0, 2)).toEqual([null, null]);
  });

  it("3-(benzoyloxy)propanoic acid: the acid's chain, the benzoate outside", () => {
    const smiles = "OC(=O)CCOC(=O)c1ccccc1";
    expect(at(smiles, 1, 3, 4)).toEqual(["1", "2", "3"]);
    expect(locantOf(smiles, 6, 8)).toEqual([null, null]);
  });

  it("phenyl 3-(benzoyloxy)benzoate: the substituted benzoic acid the parent, its benzoyloxy on 3", () => {
    const smiles = "O=C(Oc1ccccc1)c1cccc(OC(=O)c2ccccc2)c1";
    expect(at(smiles, 9, 23, 13)).toEqual(["1", "2", "3"]);
    expect(locantOf(smiles, 3, 17)).toEqual([null, null]);
  });

  it("ethane-1,2-diyl diacetate: both acetates parents, multiplied - C=O 1 and 1', CH3 2 and 2'", () => {
    const s = shownOf("CC(=O)OCCOC(C)=O");
    expect([`${s[1]} ${s[0]}`, `${s[7]} ${s[8]}`].sort()).toEqual(["1 2", "1' 2'"]);
  });

  it("4-oxocyclohexyl acetate (M): the acetate the parent, C=O 1, CH3 2; the ring outside", () => {
    const smiles = "CC(=O)OC1CCC(=O)CC1";
    expect(at(smiles, 1, 0)).toEqual(["1", "2"]);
    expect(locantOf(smiles, 4, 7)).toEqual([null, null]);
  });

  it("propanedioyl dichloride: the C=O carbons 1 and 3", () => {
    const s = at("ClC(=O)CC(Cl)=O", 1, 3, 4);
    expect(s[1]).toBe("2");
    expect([s[0], s[2]].sort()).toEqual(["1", "3"]);
  });

  it("benzene-1,4-dicarbonyl dichloride: the ring carbons 1 and 4, the acyl carbons outside", () => {
    const smiles = "ClC(=O)c1ccc(C(Cl)=O)cc1";
    expect(at(smiles, 3, 6).sort()).toEqual(["1", "4"]);
    expect(locantOf(smiles, 1, 7)).toEqual([null, null]);
  });

  it("2-chloro-6-(ethoxycarbonyl)benzoic acid: COOH on 1, Cl and the ester on 2 and 6", () => {
    // (2 and 6 both ways; which gets 2 is P-14.4 (f), the alphabet)
    const smiles = "OC(=O)c1c(Cl)cccc1C(=O)OCC";
    expect(at(smiles, 3)).toEqual(["1"]);
    expect(at(smiles, 4, 9).sort()).toEqual(["2", "6"]);
    expect(locantOf(smiles, 1, 10)).toEqual([null, null]);
    // (the alphabet not built: the ring's atoms whose numbers differ either way said as Meno's own - never a silent choice)
    expect(ownOf(smiles)).toEqual([4, 6, 8, 9]);
  });

  it("2,2'-sulfanediyldiacetic acid: the link not of the principal class, so multiplied - C=O 1 and 1'", () => {
    const s = shownOf("OC(=O)CSCC(=O)O");
    expect([`${s[1]} ${s[3]}`, `${s[6]} ${s[5]}`].sort()).toEqual(["1 2", "1' 2'"]);
  });
});

describe("amides, nitriles, aldehydes", () => {
  it("N-phenylacetamide: the acyl side the parent, C=O 1; the ring outside", () => {
    const smiles = "CC(=O)Nc1ccccc1";
    expect(at(smiles, 1, 0)).toEqual(["1", "2"]);
    expect(locantOf(smiles, 4)).toEqual([null]);
  });

  it("N-acetylbenzamide: benzamide the parent, the ring carbon 1; the acetyl outside", () => {
    const smiles = "CC(=O)NC(=O)c1ccccc1";
    expect(at(smiles, 6)).toEqual(["1"]);
    expect(locantOf(smiles, 1, 4)).toEqual([null, null]);
  });

  it("N,N-diethylfuran-2-carboxamide: O 1, the amide on 2", () => {
    const smiles = "CCN(CC)C(=O)c1ccco1";
    expect(at(smiles, 11, 7)).toEqual(["1", "2"]);
    expect(locantOf(smiles, 5)).toEqual([null]);
  });

  it("N-hydroxypropanamide: an amide, C=O 1", () => {
    expect(at("CCC(=O)NO", 2, 1, 0)).toEqual(["1", "2", "3"]);
  });

  it("2-amino-N-(2,3-dihydroxypropyl)-N-methylacetamide: the acetamide the parent, C=O 1, NH2 on 2", () => {
    const smiles = "NCC(=O)N(C)CC(O)CO";
    expect(at(smiles, 2, 1)).toEqual(["1", "2"]);
    expect(locantOf(smiles, 6, 7, 9)).toEqual([null, null, null]);
  });

  it("4,4'-azanediyldibenzonitrile: multiplied, each ring's CN on 1 and the N on 4", () => {
    const s = shownOf("N#Cc1ccc(Nc2ccc(C#N)cc2)cc1");
    expect([`${s[2]} ${s[5]}`, `${s[10]} ${s[7]}`].sort()).toEqual(["1 4", "1' 4'"]);
  });

  it("2-(7-oxoheptyl)cyclopentane-1-carbaldehyde: the ring before the chain, CHO on 1, the chain on 2", () => {
    const smiles = "O=CC1CCCC1CCCCCCC=O";
    expect(at(smiles, 2, 6, 5)).toEqual(["1", "2", "3"]);
    expect(locantOf(smiles, 1, 7, 13)).toEqual([null, null, null]);
  });

  it("2-methylidenehexanal: CHO 1, the chain of six", () => {
    const smiles = "O=CC(=C)CCCC";
    expect(at(smiles, 1, 2, 4, 7)).toEqual(["1", "2", "3", "6"]);
    expect(locantOf(smiles, 3)).toEqual([null]);
  });

  it("3-oxobutanal: CHO 1, C=O 3", () => {
    expect(at("O=CCC(C)=O", 1, 2, 3, 4)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("hydroxy, sulfanyl, peroxol (classes 17, 18)", () => {
  it("butane-1,3-diol; pent-2-ene-1,5-diol", () => {
    expect(at("OCCC(C)O", 1, 2, 3, 4)).toEqual(["1", "2", "3", "4"]);
    expect(at("OCC=CCCO", 1, 2, 3, 4, 5)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("3-(hydroxymethyl)hexane-1,6-diol: the chain of six, the CH2OH on 3", () => {
    const smiles = "OCCC(CO)CCCO";
    expect(at(smiles, 1, 2, 3, 6, 7, 8)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(locantOf(smiles, 4)).toEqual([null]);
  });

  it("2-(2-hydroxyethyl)phenol: the ring before the chain, OH carbon 1, the group on 2", () => {
    const smiles = "Oc1ccccc1CCO";
    expect(at(smiles, 1, 6, 2)).toEqual(["1", "2", "6"]);
    expect(locantOf(smiles, 7)).toEqual([null]);
  });

  it("1-(2-hydroxyphenyl)ethane-1,2-diol: two OH beat the ring's one; the ring on 1", () => {
    const smiles = "OCC(O)c1ccccc1O";
    expect(at(smiles, 2, 1)).toEqual(["1", "2"]);
    expect(locantOf(smiles, 4)).toEqual([null]);
  });

  it("4,4'-methylenediphenol: multiplied, each OH carbon 1, the CH2 on 4", () => {
    const s = shownOf("Oc1ccc(Cc2ccc(O)cc2)cc1");
    expect([`${s[1]} ${s[4]}`, `${s[9]} ${s[6]}`].sort()).toEqual(["1 4", "1' 4'"]);
  });

  it("2-sulfanylphenol: OH before SH, OH carbon 1", () => {
    expect(at("Oc1ccccc1S", 1, 6)).toEqual(["1", "2"]);
  });

  it("5-(1-hydroxy-2-sulfanylethyl)-2-sulfanylcyclohexan-1-ol: the ring, OH 1, SH 2, the chain on 5", () => {
    const smiles = "OC1CC(C(O)CS)CCC1S";
    expect(at(smiles, 1, 10, 9, 8, 3, 2)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(locantOf(smiles, 4)).toEqual([null]);
  });

  it("6-hydroxyheptan-2-one and 3-hydroxybutan-2-one: the C=O lowest", () => {
    expect(at("CC(=O)CCCC(C)O", 0, 1, 3, 4, 5, 6, 7)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(at("CC(=O)C(C)O", 0, 1, 3, 4)).toEqual(["1", "2", "3", "4"]);
  });

  it("4-methylidenehexan-3-ol: the chain of six, OH on 3", () => {
    const smiles = "CCC(O)C(=C)CC";
    expect(at(smiles, 0, 1, 2, 4, 6, 7)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(locantOf(smiles, 5)).toEqual([null]);
  });

  it("3-(trimethoxysilyl)propane-1-thiol: the SH takes the parent from the Si", () => {
    const smiles = "CO[Si](OC)(OC)CCCS";
    expect(at(smiles, 9, 8, 7)).toEqual(["1", "2", "3"]);
    expect(locantOf(smiles, 2)).toEqual([null]);
  });

  it("3-silylpropanoic acid: the chain; ethylsilanecarboxylic acid: the Si", () => {
    expect(at("OC(=O)CC[SiH3]", 1, 3, 4)).toEqual(["1", "2", "3"]);
    expect(locantOf("OC(=O)CC[SiH3]", 5)).toEqual([null]);
    expect(at("CC[SiH2]C(=O)O", 2)).toEqual(["1"]);
    expect(locantOf("CC[SiH2]C(=O)O", 0, 1, 3)).toEqual([null, null, null]);
  });

  it("2-(2-carboxyethyl)disilane-1-carboxylic acid: one COOH each, so the Si chain (A3 step 0), 1 and 2", () => {
    const smiles = "OC(=O)[SiH2][SiH2]CCC(=O)O";
    expect(at(smiles, 3, 4)).toEqual(["1", "2"]);
    expect(locantOf(smiles, 1, 5, 7)).toEqual([null, null, null]);
  });

  it("1-amino-2-methylpropane-2-peroxol: OOH before NH2, the OOH carbon 2", () => {
    const s = shownOf("NCC(C)(C)OO");
    expect([s[1], s[2]]).toEqual(["1", "2"]);
    expect([s[3], s[4]]).toContain("3");
  });

  it("2-hydroperoxy-1-phenylethan-1-one: C=O 1, OOH on 2", () => {
    const smiles = "OOCC(=O)c1ccccc1";
    expect(at(smiles, 3, 2)).toEqual(["1", "2"]);
    expect(locantOf(smiles, 5)).toEqual([null]);
  });

  it("2-aminoethan-1-ol: OH carbon 1", () => {
    expect(at("NCCO", 2, 1)).toEqual(["1", "2"]);
  });
});

describe("amines and imines (classes 19, 20)", () => {
  it("N-butylcyclopropanamine: the ring before the chain", () => {
    expect(at("CCCCNC1CC1", 5)).toEqual(["1"]);
    expect(locantOf("CCCCNC1CC1", 0, 3)).toEqual([null, null]);
  });

  it("N-ethyl-N-propylbutan-1-amine: the longest chain, its C-N 1", () => {
    const smiles = "CCCCN(CC)CCC";
    expect(at(smiles, 3, 2, 1, 0)).toEqual(["1", "2", "3", "4"]);
    expect(locantOf(smiles, 5, 7)).toEqual([null, null]);
  });

  it("N,N-dimethylpent-1-yn-3-amine: 1 to 5 from the triple bond", () => {
    expect(at("C#CC(CC)N(C)C", 0, 1, 2, 3, 4)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("N-phenylpyridin-3-amine: the senior ring, N 1, the C-N 3", () => {
    const smiles = "c1ccccc1Nc1cccnc1";
    expect(at(smiles, 11, 12, 7)).toEqual(["1", "2", "3"]);
    expect(locantOf(smiles, 5)).toEqual([null]);
  });

  it("N-(furan-2-yl)-1H-pyrrol-2-amine: the pyrrole, NH 1, the C-N 2", () => {
    const smiles = "c1ccoc1Nc1ccc[nH]1";
    expect(at(smiles, 10, 6)).toEqual(["1", "2"]);
    expect(locantOf(smiles, 4)).toEqual([null]);
  });

  it("N-cyclohexylaniline: the benzene, the C-N 1", () => {
    const smiles = "C1CCCCC1Nc1ccccc1";
    expect(at(smiles, 7)).toEqual(["1"]);
    expect(locantOf(smiles, 5)).toEqual([null]);
  });

  it("N-phenylaniline and N-cyclohexylcyclohexanamine: not multiplied; the N on 1 of one ring", () => {
    expect(at("c1ccccc1Nc1ccccc1", 5, 7)).toContain("1");
    expect(at("C1CCCCC1NC1CCCCC1", 5, 7)).toContain("1");
  });

  it("N-(5,6,7,8-tetrahydronaphthalen-2-yl)naphthalen-2-amine: the naphthalene, the C-N 2", () => {
    const smiles = "c1ccc2cc(Nc3ccc4CCCCc4c3)ccc2c1";
    expect(at(smiles, 4, 5, 19, 3)).toEqual(["1", "2", "4a", "8a"]);
    expect(locantOf(smiles, 7)).toEqual([null]);
  });

  it("2-(aminomethyl)propane-1,3-diamine: the CH on 2, two of the CH2 1 and 3, the third outside", () => {
    const s = at("NCC(CN)CN", 2, 1, 3, 5);
    expect(s[0]).toBe("2");
    expect(locantOf("NCC(CN)CN", 1, 3, 5).filter((x) => x === null).length).toBe(1);
    expect(s.slice(1).filter((x) => x === "1" || x === "3").sort()).toEqual(["1", "3"]);
  });

  it("N1-(2-aminoethyl)ethane-1,2-diamine: one ethane the parent, its 1 next to the middle N", () => {
    const s = shownOf("NCCNCCN");
    expect([`${s[2]} ${s[1]}`, `${s[4]} ${s[5]}`]).toContain("1 2");
  });

  it("5,6,7,8-tetrahydronaphthalen-2-amine: the C-N 2 in the aromatic ring, the CH2s 5 to 8", () => {
    expect(at("Nc1ccc2CCCCc2c1", 10, 1, 3, 4, 5, 8, 9)).toEqual(["1", "2", "4", "4a", "5", "8", "8a"]);
  });

  it("prop-2-en-1-amine; N-hydroxyethanamine (an amine)", () => {
    expect(at("NCC=C", 1, 2, 3)).toEqual(["1", "2", "3"]);
    expect(at("CCNO", 1, 0)).toEqual(["1", "2"]);
  });

  it("N-methylethanimine: the group on the carbon, C=N 1; hexan-1-imine", () => {
    expect(at("CC=NC", 1, 0)).toEqual(["1", "2"]);
    expect(locantOf("CC=NC", 2, 3)).toEqual([null, null]);
    expect(at("CCCCCC=N", 5, 0)).toEqual(["1", "6"]);
  });

  it("N-hydroxypentan-2-imine: an oxime, the imine carbon 2", () => {
    expect(at("CC(=NO)CCC", 0, 1, 4, 5, 6)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("3-(hydroxyimino)butan-2-one: C=O 2 before C=N", () => {
    expect(at("CC(=O)C(C)=NO", 0, 1, 3, 4)).toEqual(["1", "2", "3", "4"]);
  });

  it("3,5-diiminocyclohexan-1-one: C=O 1, the C=N carbons 3 and 5", () => {
    const s = at("O=C1CC(=N)CC(=N)C1", 1, 3, 6);
    expect(s[0]).toBe("1");
    expect([s[1], s[2]].sort()).toEqual(["3", "5"]);
  });

  it("propylidenehydrazine: the N-N the parent, not an imine - N1 bears the propylidene", () => {
    expect(at("CCC=NN", 3, 4)).toEqual(["1", "2"]);
    expect(locantOf("CCC=NN", 2)).toEqual([null]);
  });
});

describe("charges (B7)", () => {
  it("an acetate anion and methylammonium (M): numbered as the acid and the amine", () => {
    expect(at("CC(=O)[O-]", 1, 0)).toEqual(["1", "2"]);
    expect(at("C[NH3+]", 0)).toEqual(["1"]);
  });

  it("3-ethoxy-N,N,N-trimethyl-3-oxopropan-1-aminium: the cation beats the ester, own", () => {
    expect(ownOf("CCOC(=O)CC[N+](C)(C)C")).toEqual(expect.arrayContaining([3, 5, 6]));
  });
});

describe("a not-built class below a built one (M)", () => {
  it("a Boc amino acid and its methyl ester: numbered as the acid and the ester, the carbamate outside", () => {
    for (const smiles of ["CC(C)(C)OC(=O)NCC(=O)O", "CC(C)(C)OC(=O)NCC(=O)OC"]) {
      expect(at(smiles, 9, 8), smiles).toEqual(["1", "2"]);
      expect(locantOf(smiles, 5), smiles).toEqual([null]);
      expect(ownOf(smiles), smiles).toEqual([]);
    }
  });

  it("a Boc amine beside only a ketone, an alcohol or an amide: the carbamate stands first, own", () => {
    expect(ownOf("CC(C)(C)OC(=O)NCCC(C)=O")).toEqual(expect.arrayContaining([5, 8, 9, 10, 11]));
    expect(ownOf("CC(C)(C)OC(=O)NCCO")).toEqual(expect.arrayContaining([5, 8, 9]));
    expect(ownOf("CC(C)(C)OC(=O)NCCC(N)=O")).toEqual(expect.arrayContaining([5, 8, 9, 10]));
  });

  it("a urea beside a carboxamide: numbered, the amide C=O 1", () => {
    const smiles = "NC(=O)NCCC(N)=O";
    expect(at(smiles, 6, 5, 4)).toEqual(["1", "2", "3"]);
    expect(ownOf(smiles)).toEqual([]);
  });

  it("a urea beside a nitrile: the urea stands first, own", () => {
    expect(ownOf("NC(=O)NCCC#N")).toEqual(expect.arrayContaining([1, 4, 5, 6]));
  });

  it("a thioester whose carbon ends a chain, beside a carboxylic acid: own", () => {
    expect(ownOf("CCSC(=O)CCC(=O)O")).toEqual(expect.arrayContaining([3, 5, 6, 7]));
  });

  it("an aryl pinacol boronate beside a carboxylic acid: numbered as the acid, the dioxaborolane a ring outside", () => {
    const smiles = "OC(=O)c1ccc(cc1)B1OC(C)(C)C(C)(C)O1";
    expect(at(smiles, 3, 6)).toEqual(["1", "4"]);
    expect(locantOf(smiles, 9)).toEqual([null]);
    expect(ownOf(smiles)).toEqual([]);
  });

  it("a silyl ether of a ketone: numbered by the ketone, the Si outside", () => {
    const smiles = "CC(=O)CCO[Si](C)(C)C";
    expect(at(smiles, 0, 1, 3, 4)).toEqual(["1", "2", "3", "4"]);
    expect(locantOf(smiles, 6)).toEqual([null]);
    expect(ownOf(smiles)).toEqual([]);
  });
});

describe("own at level 2: each said, none numbered as something else", () => {
  it("the first class present not built: every atom own", () => {
    for (const smiles of [
      "CNC(=O)NC", // N,N'-dimethylurea
      "CNC(=O)OC(C)(C)C", // tert-butyl methylcarbamate (M)
      "CC(=O)OC(C)=O", // acetic anhydride
      "CCCCCC(=O)SCC", // S-ethyl hexanethioate
      "NC(=N)c1ccccc1", // benzamidine (M)
      "CCC(=O)NN", // propanehydrazide (M)
      "CCNCl", // N-chloroethanamine
      "OB(O)c1ccccc1", // phenylboronic acid (M)
      "CCOP(C)(=O)OCC", // diethyl methylphosphonate, a dialkyl phosphonate (M)
      "CC(=O)O[Si](C)(C)C", // trimethylsilyl acetate, a pseudoester
      "S=C1CCCN1", // pyrrolidine-2-thione, a thiolactam (M)
      "CC=C=S", // prop-1-ene-1-thione, a thioketene (M)
    ])
      allOwn(smiles);
  });

  it("propane-1,2,3-triyl triacetate: two orbits of acetates, own", () => {
    expect(ownOf("CC(=O)OCC(OC(C)=O)COC(C)=O")).toEqual(expect.arrayContaining([1, 7, 12]));
  });

  it("propane-1,2,3-triyl 1,2-diacetate 3-propanoate: esters of different acids, own", () => {
    expect(ownOf("CC(=O)OCC(OC(C)=O)COC(=O)CC")).toEqual(expect.arrayContaining([1, 7, 12]));
  });

  it("4-methyl-5-nitrooctanedioic acid and 1-methyl-4-nitronaphthalene: the alphabet would decide, own at level 2 too", () => {
    expect(ownOf("OC(=O)CCC(C)C([N+](=O)[O-])CCC(=O)O")).toEqual(expect.arrayContaining([5, 7]));
    expect(ownOf("Cc1ccc([N+](=O)[O-])c2ccccc12").length).toBeGreaterThan(0);
  });
});
