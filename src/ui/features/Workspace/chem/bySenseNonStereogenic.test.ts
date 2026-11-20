// Held beside bySense.test.ts: the centres of three bonds that `bySense` reads are only those that are stereocentres of the structure. A
// CH two alike groups leave no stereocentre (an isopropyl's, a cyclohexanol's C1) and an S two alike groups leave none (dimethyl sulfoxide's)
// come out of the toolkit either way round, both the same molecule: no frame of them is "the mirror form". A sulfoxide's S of three
// different groups is one, and still keeps only the frames that have its sense.
import { describe, expect, it } from "vitest";
import { isomersOf } from "../../../../lib/chem/isomers";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { volumeSign } from "../../../../lib/chem/perception/stereo/geometry";
import { asGiven, blocksRead } from "./menoIsomers";
import { bySense } from "./pageMirror";
import { drawnFromSmiles } from "./testdata/identityCases";

/** A structure's first stereoisomer as the page asks it of the conformers (chem/menoIsomers `asGiven`), and its drawing. */
function asked(smiles: string) {
  const part = drawnFromSmiles(smiles);
  const block = writeMolfile(part);
  const read = blocksRead([block])!;
  const counted = isomersOf(read.input);
  if (!("isomers" in counted)) throw new Error("not counted");
  return { part, config: asGiven(read, [block], counted.isomers[0]).configuration, atoms: part.atoms.length };
}

/** Frames of `n` atoms, all away from the centres but the ones named: each centre at the origin of its own pyramid, its three neighbours at a third of a turn about it, below it - the first two swapped where `over`. */
function frames(n: number, centres: { atom: number; neighbours: number[] }[], over: boolean[]) {
  const frame = (swap: boolean) => {
    const f = Array.from({ length: n }, (_, i) => [20 * i, 0, 0]);
    centres.forEach((c, k) => {
      f[c.atom] = [20 * c.atom, 5, 0];
      const around = [0, 1, 2].map((j) => [20 * c.atom + Math.cos((2 * Math.PI * j) / 3), 5 + Math.sin((2 * Math.PI * j) / 3), -0.3]);
      const [a, b, d] = swap !== over[k] ? [around[1], around[0], around[2]] : around;
      f[c.neighbours[0]] = a;
      f[c.neighbours[1]] = b;
      f[c.neighbours[2]] = d;
    });
    return f.flat();
  };
  return [frame(false), frame(true)];
}

describe("a centre that two alike groups leave no stereocentre is not read from the frames", () => {
  for (const smiles of ["CC(C)O", "OC1CCCCC1", "CS(C)=O"]) {
    it(`${smiles}: both of its frames, the groups taken either way round, are kept - nothing set aside, none called the mirror form`, () => {
      const { part, config, atoms } = asked(smiles);
      const centres = config.centres.filter((x) => x.neighbours.length === 3);
      const c = { frames: frames(atoms, centres, centres.map(() => false)), how: [] as { label: string; text: string }[] };
      const kept = bySense(c, config, part);
      expect(kept?.frames.length).toBe(2);
      expect(kept?.how).toEqual([]);
    });
  }

  it("Troeger's base's two bridgehead N, one stereoisomer the toolkit leaves to chance, stay among the centres kept (a fix that leaves out the centres no one turn changes must not take these)", () => {
    const { part, config } = asked("Cc1ccc2c(c1)CN1CN2c2ccc(C)cc2C1");
    expect(config.centres.filter((x) => x.neighbours.length === 3).map((x) => part.atoms[x.atom].el)).toEqual(["N", "N"]);
  });

  it("a sulfoxide's S of three different groups is a stereocentre: only the frame that has its sense is kept, one set aside and said", () => {
    const { part, config, atoms } = asked("CC[S@](=O)C");
    const s = config.centres.find((x) => x.neighbours.length === 3)!;
    const fs = frames(atoms, [s], [false]);
    const sense = (f: number[]) => {
      const p = (i: number) => [f[3 * i], f[3 * i + 1], f[3 * i + 2]];
      return volumeSign(p(s.neighbours[0]), p(s.neighbours[1]), p(s.neighbours[2]), p(s.atom));
    };
    const c = { frames: fs, how: [] as { label: string; text: string }[] };
    const kept = bySense(c, config, part)!;
    expect(kept.frames).toEqual([fs.find((f) => sense(f) === s.sense)]);
    expect(kept.how).toEqual([{ label: "Stereo", text: `1 of 2 came out as the mirror form at S${s.atom + 1}: set aside` }]);
  });
});
