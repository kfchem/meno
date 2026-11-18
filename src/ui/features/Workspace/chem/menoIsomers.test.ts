/**
 * A structure's stereoisomers decided by Meno (chem/menoIsomers): what its own MOL blocks leave open by Meno's candidates, each of
 * Meno's stereoisomers as the plugin is given it - by the blocks' places - and each made whole.
 */
import { describe, expect, it } from "vitest";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { NOT_COUNTED_CAGE } from "../../../../lib/chem/isomers";
import { v2000 } from "../../../../lib/chem/testdata/v2000";
import type { ChemClient } from "../../../../lib/roles/client";
import { asGiven, blocksRead, isomersByMeno, leftByMeno } from "./menoIsomers";
import { drawnFromSmiles } from "./testdata/identityCases";
import { isomersOf } from "../../../../lib/chem/isomers";

const block = (smiles: string) => writeMolfile(drawnFromSmiles(smiles));
const left = (molblock: string) => leftByMeno([molblock], blocksRead([molblock])!);

/** The plugin that makes stereoisomers: each configuration given it, made - each request kept. */
function plugin(makes: (configured: { centres: unknown[]; doubles: unknown[] }) => boolean = () => true) {
  const asked: { configured: { centres: unknown[]; doubles: unknown[] } }[] = [];
  const chem = {
    request: async (_op: string, args: { configured: { centres: unknown[]; doubles: unknown[] } }) => {
      asked.push(args);
      return makes(args.configured) ? { isomers: [{ configured: args.configured, smiles: JSON.stringify(args.configured) }], free: false } : { isomers: [], free: true };
    },
  } as unknown as ChemClient;
  return { chem, asked };
}

describe("what a structure's blocks leave open, by Meno's candidates", () => {
  it("a centre drawn with no wedge is open; drawn with one, given - every centre among its centres either way", () => {
    expect(left(v2000(["C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1]]))).toMatchObject({ left: { atoms: [1], bonds: [] }, centres: [1] });
    expect(left(block("C[C@H](O)CC"))).toMatchObject({ left: { atoms: [], bonds: [] }, centres: [1] });
  });

  it("an amine's N and a metal are none; a sulfoxide's S is a centre", () => {
    expect(left(block("CCN(C)CC")).centres).toEqual([]);
    expect(left(block("CS(=O)CC")).centres).toEqual([1]);
  });

  it("a double bond open by its block's place; a ring's of six none; a C=N whose E/Z is none of its own passed by and said", () => {
    expect(left(v2000(["C", "C", "C", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 1]])).left.bonds).toEqual([1]);
    expect(left(block("C1=CCCCC1")).doubles).toEqual([]);
    const guanidine = left(v2000(["C", "N", "C", "N", "N"], [[0, 1, 1], [1, 2, 2], [2, 3, 1], [2, 4, 1]]));
    expect([guanidine.left.bonds, guanidine.left.notEnumerated]).toEqual([[], [1]]);
    expect(guanidine.left.said).toMatch(/^E\/Z of 1 C=N not enumerated/);
  });

  it("an allene's axis left open: its double bonds a run, the structure handed", () => {
    const allene = left(v2000(["C", "C", "C", "C", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 2], [3, 4, 1]]));
    expect([allene.left.cumulenes, allene.left.cumulated, allene.handed]).toEqual([[1, 2], [[1, 2]], true]);
  });

  it("refuses a block it cannot read", () => {
    expect(blocksRead(["no block"])).toBeNull();
  });
});

describe("each of Meno's stereoisomers as the plugin is given it", () => {
  it("a centre's neighbours as its bonds' atoms, its H not drawn left out, an H drawn named in its place", () => {
    const b = v2000(["C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1]]);
    const read = blocksRead([b])!;
    const counted = isomersOf(read.input);
    if (!("isomers" in counted)) throw new Error("not counted");
    expect(counted.isomers.map((i) => asGiven(read, [b], i).configuration.centres.map((c) => [c.atom, c.neighbours]))).toEqual([
      [[1, [0, 2, 4]]],
      [[1, [0, 2, 4]]],
    ]);
    // (its H drawn as an atom - the block's atom 2 - named last)
    const withH = block("C[C@@]([H])(O)CC");
    const readH = blocksRead([withH])!;
    const one = isomersOf(readH.input);
    if (!("isomers" in one)) throw new Error("not counted");
    expect(asGiven(readH, [withH], one.isomers[0]).configuration.centres).toEqual([{ atom: 1, neighbours: [0, 3, 4, 2], sense: expect.any(Number) }]);
  });

  it("a double bond by its block's place and an atom on each end", () => {
    const b = v2000(["C", "C", "C", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 1]]);
    const read = blocksRead([b])!;
    const counted = isomersOf(read.input);
    if (!("isomers" in counted)) throw new Error("not counted");
    const doubles = counted.isomers.map((i) => asGiven(read, [b], i).configuration.doubles);
    expect(doubles).toHaveLength(2);
    expect(doubles).toEqual(expect.arrayContaining([[{ bond: 1, ends: [0, 3], cis: true }], [{ bond: 1, ends: [0, 3], cis: false }]]));
  });
});

describe("Meno's stereoisomers, each made whole", () => {
  it("tartaric acid: its three each given whole, one request each, all made", async () => {
    const b = v2000(["O", "C", "O", "C", "O", "C", "O", "C", "O", "O"], [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [3, 5, 1], [5, 6, 1], [5, 7, 1], [7, 8, 2], [7, 9, 1]]);
    const { chem, asked } = plugin();
    const made = await isomersByMeno(chem, [b], blocksRead([b])!, { atoms: [3, 5], bonds: [] }, [], { most: 32 });
    if ("notCounted" in made || !("isomers" in made.made)) throw new Error("not made");
    expect([made.made.isomers.length, asked.length, made.said]).toEqual([3, 3, []]);
    expect(asked.every((a) => a.configured.centres.length === 2)).toBe(true);
  });

  it("leaves out one the plugin cannot make; none made, free", async () => {
    const b = v2000(["C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1]]);
    let first = true;
    const once = await isomersByMeno(plugin(() => (first ? !(first = false) : false)).chem, [b], blocksRead([b])!, { atoms: [1], bonds: [] }, [], { most: 32 });
    expect("made" in once && "isomers" in once.made && once.made.isomers.length).toBe(1);
    const none = await isomersByMeno(plugin(() => false).chem, [b], blocksRead([b])!, { atoms: [1], bonds: [] }, [], { most: 32 });
    expect("made" in none && none.made).toEqual({ isomers: [], free: true });
  });

  it("refuses too many whole, asking nothing; says a cage it does not count", async () => {
    const b = v2000(["O", "C", "O", "C", "O", "C", "O", "C", "O", "O"], [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [3, 5, 1], [5, 6, 1], [5, 7, 1], [7, 8, 2], [7, 9, 1]]);
    const { chem, asked } = plugin();
    expect(await isomersByMeno(chem, [b], blocksRead([b])!, { atoms: [], bonds: [] }, [], { most: 2, whole: true })).toEqual({ made: { tooMany: { counted: 3, bound: 3 } }, said: [] });
    expect(asked).toEqual([]);
    const camphor = block("CC1(C)C2CCC1(C)C(=O)C2");
    expect(await isomersByMeno(chem, [camphor], blocksRead([camphor])!, { atoms: [], bonds: [] }, [], { most: 32 })).toEqual({ notCounted: NOT_COUNTED_CAGE });
  });

  it("gives each of those that differ only at an allene's axis whole, its axis with it - Meno's own, the plugin given none", async () => {
    // (CH3-CH(OH)-CH=C=CH-CH3: its centre and its axis open, four by Meno's count)
    const b = v2000(["C", "C", "C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 2], [3, 4, 2], [4, 5, 1], [1, 6, 1]]);
    const { chem, asked } = plugin();
    const made = await isomersByMeno(chem, [b], blocksRead([b])!, { atoms: [1], bonds: [] }, [], { most: 32 });
    if ("notCounted" in made || !("isomers" in made.made)) throw new Error("not made");
    expect(made.made.isomers).toHaveLength(4);
    expect(made.made.isomers.map((i) => i.configured.axes?.map((x) => [x.atoms, x.sense]))).toEqual(expect.arrayContaining([[[[2, 4], 1]], [[[2, 4], -1]]]));
    // (the plugin given the centre alone, each time)
    expect(asked.every((a) => !("axes" in a.configured))).toBe(true);
  });
});
