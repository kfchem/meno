// Held beside bySense.test.ts: an axis's and a run's configuration as `asGiven` writes it from Meno's own stereoisomers (its atoms, the
// atoms it is read by, its sense) is kept by `bySense` as the CIP names it. Penta-2,3-diene seen from its first end: the near methyl up, the
// far methyl to the right is clockwise, P, Sa; to the left, M, Ra. Hexa-2,3,4-triene's two methyls on one side are cis, Z.
import { describe, expect, it } from "vitest";
import { cipLabels, type CipResult } from "../../../../lib/chem/cip";
import { isomersOf } from "../../../../lib/chem/isomers";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { asGiven, blocksRead } from "./menoIsomers";
import { bySense } from "./pageMirror";
import { drawnFromSmiles } from "./testdata/identityCases";

/** Each of a structure's stereoisomers as the page asks it (chem/menoIsomers `asGiven`), with the CIP label of its axis and of its run. */
function isomers(smiles: string) {
  const part = drawnFromSmiles(smiles);
  const block = writeMolfile(part);
  const read = blocksRead([block])!;
  const counted = isomersOf(read.input);
  if (!("isomers" in counted)) throw new Error("not counted");
  return {
    part,
    all: counted.isomers.map((i) => {
      const labels = cipLabels(i.input);
      const named = (m: Map<number, CipResult>) => [...m.values()].map((v) => ("label" in v ? v.label : `no ${v.why}`));
      return { config: asGiven(read, [block], i).configuration, axis: named(labels.axes), run: named(labels.cumulated) };
    }),
  };
}

describe("a stereoisomer's axis and run, as Meno names it, are kept by the frames that have it", () => {
  // (C0 C1=C2=C3 C4, its ends' methyls turned a quarter either way: `turn` 1 puts the far methyl to the right of the near one's up, seen from C1)
  const allene = (turn: 1 | -1) => [-1, 1, 0, 0, 0, 0, 1.3, 0, 0, 2.6, 0, 0, 3.6, 0, turn];

  it("penta-2,3-diene: of its two stereoisomers, the P one keeps the frame turned clockwise, the M one the frame turned the other way", () => {
    const { part, all } = isomers("CC=C=CC");
    expect(all.map((i) => i.axis).sort()).toEqual([["M"], ["P"]]);
    for (const iso of all) {
      const kept = bySense({ frames: [allene(1), allene(-1)], how: [] }, iso.config, part);
      expect(kept?.frames, String(iso.axis)).toEqual([allene(iso.axis[0] === "P" ? 1 : -1)]);
    }
  });

  it("hexa-2,3,4-triene: the Z one keeps the frame with its methyls on one side, the E one the frame with them across", () => {
    // (C0 C1=C2=C3=C4 C5, in a line, the methyls on one side of it - `side` 1 - or across, -1)
    const run = (side: 1 | -1) => [-1, 1, 0, 0, 0, 0, 1.3, 0, 0, 2.6, 0, 0, 3.9, 0, 0, 4.9, side, 0];
    const { part, all } = isomers("CC=C=C=CC");
    expect(all.map((i) => i.run).sort()).toEqual([["E"], ["Z"]]);
    for (const iso of all) {
      const kept = bySense({ frames: [run(1), run(-1)], how: [] }, iso.config, part);
      expect(kept?.frames, String(iso.run)).toEqual([run(iso.run[0] === "Z" ? 1 : -1)]);
    }
  });
});
