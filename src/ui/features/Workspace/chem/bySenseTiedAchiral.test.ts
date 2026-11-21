// Held beside bySense.test.ts: the bridgeheads of a cage with a mirror plane (quinuclidine's C4 and N, DABCO's two N, bicyclo[2.2.2]octane's
// two C) have no sense of their own to keep: the toolkit embeds the cage in either hand - one molecule, its atoms taken either way round -
// and the frames are the same stereoisomer whichever hand they have. Both are kept, nothing set aside, none called the mirror form.
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

/** Frames of `n` atoms, each three-bonded centre's neighbours about it as its own sense says, or - `mirror` - as the other. Centres whose neighbours are shared are not for this. */
function frame(n: number, centres: { atom: number; neighbours: number[]; sense: 1 | -1 }[], mirror: boolean) {
  const f = Array.from({ length: n }, (_, i) => [20 * i, 0, 0]);
  for (const c of centres) {
    const at = [20 * c.atom, 5, 0];
    f[c.atom] = at;
    const around = [0, 1, 2].map((j) => [at[0] + Math.cos((2 * Math.PI * j) / 3), at[1] + Math.sin((2 * Math.PI * j) / 3), -0.3]);
    const [a, b, d] = around;
    const want = mirror ? -c.sense : c.sense;
    const [p, q] = volumeSign(a, b, d, at) === want ? [a, b] : [b, a];
    f[c.neighbours[0]] = p;
    f[c.neighbours[1]] = q;
    f[c.neighbours[2]] = d;
  }
  return f.flat();
}

describe("the bridgeheads of a cage with a mirror plane are not kept by sense", () => {
  for (const smiles of ["C1CN2CCC1CC2", "C1CN2CCN1CC2", "C1CC2CCC1CC2"]) {
    it(`${smiles}: the frame and its mirror image, one molecule, are both kept - nothing set aside`, () => {
      const { part, config, atoms } = asked(smiles);
      const centres = config.centres.filter((x) => x.neighbours.length === 3);
      const c = { frames: [frame(atoms, centres, false), frame(atoms, centres, true)], how: [] as { label: string; text: string }[] };
      const kept = bySense(c, config, part);
      expect(kept?.frames.length).toBe(2);
      expect(kept?.how).toEqual([]);
    });
  }
});
