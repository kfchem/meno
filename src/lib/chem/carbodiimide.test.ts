import { describe, expect, it } from "vitest";
import { readSmiles } from "./smiles";
import { readStereo } from "./perception/stereo/from2d";
import { cumulatedRuns } from "./perception/stereo/runs";
import { runsIn3dOf } from "./cip/in3d";

/**
 * A carbodiimide, CH3-N=C=N-CH3: an even run of cumulated double bonds with N ends - formally an axis. What Meno does with it today, pinned
 * (whether it should count one is part 13's question): the run is found, and no reader gives it an axis - each N end has one group and a
 * lone pair, not the two groups an axis's end needs.
 */
describe("a carbodiimide's run, as Meno reads it today", () => {
  it("is a run of two double bonds", () => {
    const g = { atoms: [{ el: "C" }, { el: "N" }, { el: "C" }, { el: "N" }, { el: "C" }], bonds: [1, 2, 2, 1].map((order, i) => ({ a: i, b: i + 1, order })) };
    expect(cumulatedRuns(g).map((r) => [...r.atoms])).toEqual([[1, 2, 3]]);
  });

  it("has no axis from a SMILES: an @ on its middle is refused, as for an allene's end of fewer than two groups; none without one", () => {
    expect(() => readSmiles("CN=[C@]=NC")).toThrow(/each end of an allene needs two neighbours besides it/);
    expect(readSmiles("CN=C=NC").axes ?? []).toEqual([]);
  });

  it("has none from a drawing, a wedge on a group of an N end", () => {
    const atoms = [
      { x: -1.3, y: 0.75, hs: 3 },
      { x: 0, y: 0, el: "N", hs: 0 },
      { x: 1.3, y: 0, hs: 0 },
      { x: 2.6, y: 0, el: "N", hs: 0 },
      { x: 3.9, y: -0.75, hs: 3 },
    ];
    const bonds = [
      { a: 1, b: 0, order: 1, wedge: { narrow: 1, stereo: "up" as const } },
      { a: 1, b: 2, order: 2 },
      { a: 2, b: 3, order: 2 },
      { a: 3, b: 4, order: 1 },
    ];
    const read = readStereo(atoms, bonds);
    expect(read.axes).toEqual([]);
    expect(read.cumulated).toEqual([]);
  });

  it("has none from 3D, its two groups turned a quarter turn about the run", () => {
    const m = {
      atoms: [{ el: "C" }, { el: "N" }, { el: "C" }, { el: "N" }, { el: "C" }],
      bonds: [1, 2, 2, 1].map((order, i) => ({ a1: i, a2: i + 1, order })),
      xyz: [-1, 1, 0, 0, 0, 0, 1.2, 0, 0, 2.4, 0, 0, 3.4, 0, 1],
    };
    expect(runsIn3dOf(m).axes).toEqual([]);
  });
});
