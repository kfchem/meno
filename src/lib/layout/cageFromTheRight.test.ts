import { describe, expect, it } from "vitest";
import { forgetLaidOut, layout2D } from "./engine";
import { fromSmiles } from "./testdata/fromSmiles";

// A bridged bicycle drawn in perspective is seen from above and from the right (Brecher 2006, ST-3.1: preferred; from the left
// acceptable): its far bridgehead above and to the right of its near one.

/** Where the far bridgehead stands from the near one, as `smiles` is laid out: + right, - left; and + above. */
function farFromNear(smiles: string): { dx: number; dy: number } {
  forgetLaidOut();
  const input = fromSmiles(smiles);
  const out = layout2D(input);
  // (the cage's own atoms: those laid in depth, pruned to its rings - the atoms on no cycle of them taken off, end by end)
  const core = new Set(out.depth.flatMap((d, i) => (d != null ? [i] : [])));
  const degree = (i: number) => input.bonds.filter((b) => (b.a === i && core.has(b.b)) || (b.b === i && core.has(b.a))).length;
  for (let pruned = true; pruned; ) {
    pruned = false;
    for (const i of [...core]) if (degree(i) <= 1) (core.delete(i), (pruned = true));
  }
  const heads = [...core].filter((i) => degree(i) === 3);
  expect(heads, smiles).toHaveLength(2);
  const [front, back] = heads[0] !== undefined && out.depth[heads[0]]! > out.depth[heads[1]]! ? heads : [heads[1], heads[0]];
  return { dx: out.x[back] - out.x[front], dy: out.y[back] - out.y[front] };
}

describe("a bridged bicycle in perspective", () => {
  it("is seen from above and from the right - those main drew from the left among them", { timeout: 240000 }, () => {
    for (const smiles of [
      "C1CC2CCC1O2", // 7-oxanorbornane
      "C1CN2CCC1CC2", // quinuclidine
      "C1CN2CCN1CC2", // DABCO
      "CN1[C@@H]2CC[C@H]1CC(=O)C2", // tropinone
      "C1CC2CCC(C1)C2", // bicyclo[3.2.1]octane
      "CC1(C)[C@@H]2CC[C@@]1(C)C(=O)C2", // (1R)-camphor
      "CC1(C)[C@H]2CC[C@]1(C)C(=O)C2", // (1S)-camphor, from the right before too
      "C1CC2CCC1C2", // norbornane
      "CN1[C@H]2CC[C@@H]1[C@@H](C(=O)OC)[C@@H](OC(=O)c1ccccc1)C2", // cocaine, from the right as the maintainer's reference has it
    ]) {
      const { dx, dy } = farFromNear(smiles);
      expect(dx, smiles).toBeGreaterThan(0.05);
      expect(dy, smiles).toBeGreaterThan(0);
    }
  });

  it("keeps quinine's cage as it was, matching the maintainer's reference picture", { timeout: 120000 }, () => {
    const { dx } = farFromNear("COc1ccc2nccc([C@@H](O)[C@@H]3C[C@@H]4CCN3C[C@@H]4C=C)c2c1");
    expect(dx).toBeLessThan(0);
  });
});
