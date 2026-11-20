/**
 * Beside menoIsomers.test.ts (its `block` and `plugin` copied): what it leaves unheld - a double bond given in the block is no open place
 * and its stereoisomer says the cis or trans it was drawn with; a request for at most so many is asked that many; and stereoisomers
 * that differ only at an axis are counted once against that bound, not by the ways Meno counts them.
 */
import { describe, expect, it } from "vitest";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { isomersOf } from "../../../../lib/chem/isomers";
import { v2000 } from "../../../../lib/chem/testdata/v2000";
import type { ChemClient } from "../../../../lib/roles/client";
import { asGiven, blocksRead, isomersByMeno, leftByMeno } from "./menoIsomers";
import { drawnFromSmiles } from "./testdata/identityCases";

const block = (smiles: string) => writeMolfile(drawnFromSmiles(smiles));

/** The plugin that makes stereoisomers: each configuration given it, made - each request kept. */
function plugin() {
  const asked: unknown[] = [];
  const chem = {
    request: async (_op: string, args: { configured: unknown }) => {
      asked.push(args);
      return { isomers: [{ configured: args.configured, smiles: JSON.stringify(args.configured) }], free: false };
    },
  } as unknown as ChemClient;
  return { chem, asked };
}

describe("a double bond given in the block, and the bounds of a request", () => {
  it("is a candidate but no open place, and its one stereoisomer has the cis or trans it was drawn with", () => {
    for (const [smiles, cis] of [["C/C=C/C", false], ["C/C=C\\C", true]] as const) {
      const b = block(smiles);
      const read = blocksRead([b])!;
      const found = leftByMeno([b], read);
      expect([found.left.bonds, found.doubles], smiles).toEqual([[], [1]]);
      const counted = isomersOf(read.input);
      if (!("isomers" in counted)) throw new Error("not counted");
      expect(counted.isomers.map((i) => asGiven(read, [b], i).configuration.doubles.map((d) => d.cis)), smiles).toEqual([[cis]]);
    }
  });

  it("asks at most `most` of tartaric acid's three: two asked, two made", async () => {
    const b = v2000(["O", "C", "O", "C", "O", "C", "O", "C", "O", "O"], [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [3, 5, 1], [5, 6, 1], [5, 7, 1], [7, 8, 2], [7, 9, 1]]);
    const { chem, asked } = plugin();
    const made = await isomersByMeno(chem, [b], blocksRead([b])!, { atoms: [3, 5], bonds: [] }, [], { most: 2 });
    if ("notCounted" in made || !("isomers" in made.made)) throw new Error("not made");
    expect([made.made.isomers.length, asked.length]).toEqual([2, 2]);
  });

  it("counts penta-2,3-diene's two stereoisomers, one for each sense of its axis - kept apart, as an axis is kept in 3D: two against a whole bound of one are too many, both made against two", async () => {
    const b = v2000(["C", "C", "C", "C", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 2], [3, 4, 1]]);
    const one = await isomersByMeno(plugin().chem, [b], blocksRead([b])!, { atoms: [], bonds: [1, 2] }, [], { most: 1, whole: true });
    expect("made" in one && "tooMany" in one.made ? one.made.tooMany.counted : null).toBe(2);
    const made = await isomersByMeno(plugin().chem, [b], blocksRead([b])!, { atoms: [], bonds: [1, 2] }, [], { most: 2, whole: true });
    if ("notCounted" in made || !("isomers" in made.made)) throw new Error(`not made: ${JSON.stringify(made).slice(0, 100)}`);
    expect(made.made.isomers.length).toBe(2);
  });
});
