import { describe, expect, it } from "vitest";
import type { ChemClient } from "../../../../lib/roles/client";
import { drawnFromSmiles } from "./testdata/identityCases";
import { isomersToMake } from "./openStereo";
import { asksFirst, askWords, blockOf, openIn, type Open } from "./make3d";
import { stereoOpenOf, stereoOpenSaid } from "./fromSmiles";
import { blocksRead, leavesOpen } from "./menoIsomers";

/**
 * What is asked before a structure is made in 3D, against stereoisomer counts derived by hand (standard stereochemistry,
 * each drawing as drawn, plain bonds unless said): how many stereoisomers the drawing stands for, which places are circled -
 * those where the choice changes the compound, alone or together with others - and whether it asks at all. The plugin is a
 * stand-in that makes each stereoisomer it is given; places are the SMILES' atom and bond indices.
 */
const chem = {
  request: async (_op: string, args: { configured: unknown }) => ({ isomers: [{ configured: args.configured, smiles: "x" }], free: false }),
} as unknown as ChemClient;

type Row = [name: string, smiles: string, isomers: number, atoms: number[], bonds?: number[]];

const rows: Row[] = [
  // (one stereoisomer: the substituted carbon's two paths round the ring, or its two ethyls, are alike - no choice there)
  ["methylcyclohexane", "CC1CCCCC1", 1, []],
  ["methylcyclododecane", "CC1CCCCCCCCCCC1", 1, []],
  ["1,1-dimethylcyclohexane", "CC1(C)CCCCC1", 1, []],
  ["3-methylpentan-3-ol", "CCC(C)(O)CC", 1, []],
  // (one centre with four different groups: a pair of enantiomers)
  ["butan-2-ol", "CC(O)CC", 2, [1]],
  ["bromochlorofluoromethane", "FC(Cl)Br", 2, [1]],
  // (two like centres: R,R and S,S, and one meso form)
  ["butane-2,3-diol", "CC(O)C(O)C", 3, [1, 3]],
  ["tartaric acid", "OC(=O)C(O)C(O)C(=O)O", 3, [3, 5]],
  ["pentane-2,4-diol", "CC(O)CC(O)C", 3, [1, 4]],
  // (two unlike centres: 2 x 2 = 4, two pairs)
  ["2,3-dibromopentane", "CC(Br)C(Br)CC", 4, [1, 3]],
  // (C2 and C4 alike: the R,R / S,S pair, and two meso forms, C3 r or s - C3 counts only with the others)
  ["pentane-2,3,4-triol", "CC(O)C(O)C(O)C", 4, [1, 3, 5]],
  // (1,4 on a ring: cis or trans, both achiral - the two ring atoms circled, 2 compounds, never 2 x 2)
  ["1,4-dimethylcyclohexane", "CC1CCC(C)CC1", 2, [1, 4]],
  ["4-methylcyclohexan-1-ol", "CC1CCC(O)CC1", 2, [1, 4]],
  // (1,2 and 1,3 with like groups: cis (meso) and the trans pair)
  ["1,2-dimethylcyclohexane", "CC1CCCCC1C", 3, [1, 6]],
  ["1,3-dimethylcyclohexane", "CC1CCCC(C)C1", 3, [1, 5]],
  ["1,2-dimethylcyclopropane", "CC1CC1C", 3, [1, 3]],
  // (up/down round the ring: uuuu, uuud, uudd, udud, each with a mirror plane - 4, all achiral)
  ["1,2,3,4-tetramethylcyclobutane", "CC1C(C)C(C)C1C", 4, [1, 2, 4, 6]],
  // (the inositols: eight meso forms and one pair)
  ["cyclohexane-1,2,3,4,5,6-hexol", "OC1C(O)C(O)C(O)C(O)C1O", 9, [1, 2, 4, 6, 8, 10]],
  // (a centre drawn with its configuration is kept; only the open one counts)
  ["butane-2,3-diol, C2 drawn S", "C[C@H](O)C(O)C", 2, [3]],
  ["butan-2-ol, drawn with its wedge", "C[C@H](O)CC", 1, []],
  ["1,4-dimethylcyclohexane, one ring atom drawn", "C[C@H]1CCC(C)CC1", 2, [4]],
  // (one real centre beside a carbon whose two groups are alike - the ring CH, the isopropyl CH: only the real one circled)
  ["1-cyclohexylethanol", "CC(O)C1CCCCC1", 2, [1]],
  ["2-methylpentan-3-ol", "CC(C)C(O)CC", 2, [3]],
  // (an axial pair: the ring carbon and the exocyclic double bond decide it only together)
  ["(4-methylcyclohexylidene)acetic acid", "CC1CCC(=CC(=O)O)CC1", 2, [1], [4]],
  // (an allene with two unlike ends at each: its axis, a pair of enantiomers)
  ["penta-2,3-diene", "CC=C=CC", 2, [], [1, 2]],
];

describe("what is circled and counted before a structure is made in 3D", () => {
  it.each(rows)("%s, %s: %i stereoisomers, the choice only where it changes the compound", async (_name, smiles, isomers, atoms, bonds = []) => {
    const block = blockOf(drawnFromSmiles(smiles) as never);
    const made = await isomersToMake(chem, block.molblock, undefined, "all");
    expect(made.count).toBe(isomers);
    expect(made.open.left.atoms).toEqual(atoms);
    expect(made.open.left.bonds).toEqual(bonds);
    const open = openIn(block, made);
    expect(asksFirst(open)).toBe(isomers > 1);
    // (the page's own notice of open stereo counts the same places)
    const said = stereoOpenOf(made.open.left);
    expect(said?.centres ?? 0).toBe(atoms.length);
    // (and the yes or no a step asks, without the whole count, on a fresh reading)
    expect(leavesOpen([block.molblock], blocksRead([block.molblock])!)).toBe(isomers > 1);
  });

  it("the page's own notice says nothing where the drawing stands for one compound, and only the real centre beside alike groups", async () => {
    const notice = async (smiles: string) => {
      const block = blockOf(drawnFromSmiles(smiles) as never);
      return stereoOpenSaid(stereoOpenOf((await isomersToMake(chem, block.molblock, undefined, "all")).open.left));
    };
    expect(await notice("CC1CCCCC1")).toBe(null);
    expect(await notice("CC(O)C1CCCCC1")).toBe("1 stereocentre not specified");
    expect(await notice("CC(C)C(O)CC")).toBe("1 stereocentre not specified");
    expect(await notice("CC1CCC(C)CC1")).toBe("2 stereocentres not specified");
  });

  it("is told in the words of what the drawing leaves open, singular and plural right", async () => {
    const wordsOf = async (smiles: string) => {
      const block = blockOf(drawnFromSmiles(smiles) as never);
      return askWords([openIn(block, await isomersToMake(chem, block.molblock, undefined, "all"))]);
    };
    expect(await wordsOf("CC(O)CC")).toEqual({
      title: "Which stereoisomer?",
      said: "1 stereocentre is drawn without a configuration, so this structure can be either of 2 stereoisomers.",
      isomers: 2,
      all: true,
    });
    expect((await wordsOf("CC(O)C(O)C")).said).toBe("2 stereocentres are drawn without a configuration, so this structure can be any of 3 stereoisomers.");
    expect((await wordsOf("CC=C=CC")).said).toBe("1 chiral axis is drawn without a configuration, so this structure can be either of 2 stereoisomers.");
    expect((await wordsOf("CC(O)C=C=CC")).said).toBe("1 stereocentre and 1 chiral axis are drawn without a configuration, so this structure can be any of 4 stereoisomers.");
  });
});

describe("the words of the card that asks", () => {
  const and1 = { kind: "and" as const, name: "and1" };
  it("says how many, either of two or any of more, and one double bond as one", () => {
    expect(askWords([{ atoms: [], bonds: [7], groups: [], isomers: 2 }]).said).toBe("1 double bond is drawn without a configuration, so this structure can be either of 2 stereoisomers.");
    expect(askWords([{ atoms: [3], bonds: [7], groups: [], isomers: 4 }]).said).toBe("1 stereocentre and 1 double bond are drawn without a configuration, so this structure can be any of 4 stereoisomers.");
    // (a run of three cumulated double bonds is one place, cis or trans: one double bond; of two, an axis)
    expect(askWords([{ atoms: [], bonds: [7, 8, 9], runs: [[7, 8, 9]], groups: [], isomers: 2 }]).said).toBe("1 double bond is drawn without a configuration, so this structure can be either of 2 stereoisomers.");
    expect(askWords([{ atoms: [], bonds: [7, 8], runs: [[7, 8]], groups: [], isomers: 2 }]).said).toBe("1 chiral axis is drawn without a configuration, so this structure can be either of 2 stereoisomers.");
  });
  it("says how many structures, and their stereoisomers in all, where several are asked about at once", () => {
    const two = askWords([
      { atoms: [3], bonds: [], groups: [], isomers: 2 },
      { atoms: [13], bonds: [], groups: [], isomers: 2 },
    ]);
    expect(two.said).toBe("2 stereocentres are drawn without a configuration, so these 2 structures can be 4 stereoisomers in all.");
    expect(two.isomers).toBe(4);
    expect(two.all).toBe(true);
    // (the sum of true counts; all of them offered only where each structure has at most 32)
    const past = askWords([
      { atoms: [3], bonds: [], groups: [], isomers: 2 },
      { atoms: [13, 14, 15, 16, 17, 18], bonds: [], groups: [], isomers: 64 },
    ]);
    expect(past.said).toBe("7 stereocentres are drawn without a configuration, so these 2 structures can be 66 stereoisomers in all.");
    expect(past.all).toBe(false);
    expect(askWords([{ atoms: [3, 5], bonds: [], groups: [], isomers: 3 }]).said).toBe("2 stereocentres are drawn without a configuration, so this structure can be any of 3 stereoisomers.");
  });
  it("asks which stereoisomer where only a group is open too", () => {
    expect(askWords([{ atoms: [], bonds: [], groups: [and1], isomers: 2 }])).toEqual({ title: "Which stereoisomer?", said: "and1 stands for both of its forms, so this structure can be either of 2 stereoisomers.", isomers: 2, all: true });
  });
  it("never asks where the drawing stands for one stereoisomer, whatever is open", () => {
    const one: Open = { atoms: [3], bonds: [], groups: [], isomers: 1 };
    expect(asksFirst(one)).toBe(false);
    expect(asksFirst({ ...one, isomers: 2 })).toBe(true);
  });
});


describe("a double bond drawn as not stated, as it is asked today", () => {
  // (but-2-ene in a MOL block, its methyls drawn across the double bond: a plain double bond is drawn trans, so one compound; a
  //  crossed double bond (bond stereo 3), or a wavy bond on one of its ends (stereo 4), says the geometry is not stated: E or Z)
  const block = (onEnd: string, onDouble: string) =>
    [
      "",
      "  Meno",
      "",
      "  4  3  0  0  0  0  0  0  0  0999 V2000",
      "   -0.7500    1.3000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    2.2500   -1.3000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      `  1  2  1  ${onEnd}`,
      `  2  3  2  ${onDouble}`,
      "  3  4  1  0",
      "M  END",
    ].join("\n");
  it.each([
    ["drawn trans", "0", "0", 1, []],
    ["a crossed double bond", "0", "3", 2, [1]],
    ["a wavy bond on one end", "4", "0", 2, [1]],
  ] as const)("%s", async (_name, onEnd, onDouble, isomers, bonds) => {
    const made = await isomersToMake(chem, block(onEnd, onDouble), undefined, "all");
    expect(made.count).toBe(isomers);
    expect(made.open.left.bonds).toEqual(bonds);
  });
});

describe("the card states how many stereoisomers there are, and offers all of them only up to the 32 made at once", () => {
  // (each count by hand: n unlike centres on a chain whose ends differ, 2^n; n centres on a chain the same from both ends, n even,
  //  (2^n + 2^(n/2)) / 2 - the forms that read the same either way round counted once; the inositols, nine)
  const asked = async (smiles: string) => {
    const block = blockOf(drawnFromSmiles(smiles) as never);
    const made = await isomersToMake(chem, block.molblock, undefined, "all");
    return { made, words: askWords([openIn(block, made)]) };
  };
  it.each([
    // (nonane-3,4,5,6,7,8-hexol, an ethyl at one end and a methyl at the other: six unlike centres, 2^6 = 64 - past 32, one made)
    ["nonane-3,4,5,6,7,8-hexol", "CCC(O)C(O)C(O)C(O)C(O)C(O)C", 6, 64, false],
    // (dodecane-1,2,...,12-dodecol, HOCH2-(CHOH)10-CH2OH: (2^10 + 2^5) / 2 = 528)
    ["HOCH2-(CHOH)10-CH2OH", "OCC(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)CO", 10, 528, false],
    // (the inositols: eight meso forms and one pair, 9 - all made)
    ["cyclohexane-1,2,3,4,5,6-hexol", "OC1C(O)C(O)C(O)C(O)C1O", 6, 9, true],
    // (octane-3,4,5,6,7-pentol, ends unlike: 2^5 = 32, the most made at once - all made)
    ["octane-3,4,5,6,7-pentol", "CCC(O)C(O)C(O)C(O)C(O)C", 5, 32, true],
  ] as const)("%s, %s: %i centres, %i stereoisomers", async (_name, smiles, centres, isomers, all) => {
    const { made, words } = await asked(smiles);
    expect(made.count).toBe(isomers);
    expect(made.upTo).toBeUndefined();
    expect(words.said).toBe(`${centres} stereocentres are drawn without a configuration, so this structure can be any of ${isomers} stereoisomers.`);
    expect(words.all).toBe(all);
    // (made: every one up to 32; past it, the first alone - never a part of them chosen by no chemistry)
    expect(made.isomers.length).toBe(all ? isomers : 1);
    // (the ten-centre chain's 1024 ways each written: more than the default few seconds on a loaded machine)
  }, 60_000);
  it("past the ways the count tries, says at most how many, and makes one", async () => {
    // (tetradecane-3,...,13-undecol, ends unlike: eleven open centres, more than the 2^10 ways counted - the bound 2^11 = 2048, true
    //  whatever the symmetry; here every centre unlike, so also the count)
    const { made, words } = await asked("CCC(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C");
    expect(made.count).toBe(2048);
    expect(made.upTo).toBe(true);
    expect(words.said).toBe("11 stereocentres are drawn without a configuration, so this structure can be any of up to 2048 stereoisomers.");
    expect(words.all).toBe(false);
    expect(made.isomers.length).toBe(1);
    expect(made.isomers[0].centres.length).toBe(11);
    expect((await isomersToMake(chem, blockOf(drawnFromSmiles("CCC(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C(O)C") as never).molblock, undefined, "one")).isomers.length).toBe(1);
  });
});
