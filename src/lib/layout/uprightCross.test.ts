import { describe, expect, it } from "vitest";
import { forgetLaidOut, layout2D } from "./engine";
import { fromSmiles } from "./testdata/fromSmiles";

// An atom of four like groups, no stereocentre, is an upright cross (Brecher 2008, GR-4.1.3): its bonds level and upright, as
// neopentane's always were - never the X, four bonds turned 45 degrees to the page. A square-planar metal keeps its own form.

/** The directions of atom `centre`'s bonds as `smiles` is laid out, in degrees, from -180 up. */
function directions(smiles: string, centre: number): number[] {
  forgetLaidOut();
  const input = fromSmiles(smiles);
  const out = layout2D(input);
  return input.bonds
    .flatMap((b) => (b.a === centre ? [b.b] : b.b === centre ? [b.a] : []))
    .map((n) => Math.round((Math.atan2(out.y[n] - out.y[centre], out.x[n] - out.x[centre]) * 180) / Math.PI))
    .map((d) => (d === 180 ? -180 : d === 0 ? 0 : d))
    .sort((p, q) => p - q);
}

describe("four like groups", () => {
  it("are an upright cross: tetramethylammonium, tetramethylsilane, CCl4, BF4-, tetraethylammonium - and neopentane and a sulfate, as they were", () => {
    for (const [smiles, centre] of [
      ["C[N+](C)(C)C", 1],
      ["C[Si](C)(C)C", 1],
      ["ClC(Cl)(Cl)Cl", 1],
      ["F[B-](F)(F)F", 1],
      ["CC[N+](CC)(CC)CC", 2],
      ["CC(C)(C)C", 1],
      ["O=S(=O)([O-])[O-]", 1],
      ["[O-]Cl(=O)(=O)=O", 1],
    ] as const) {
      expect(directions(smiles, centre), smiles).toEqual([-180, -90, 0, 90]);
    }
  });

  it("leave a square-planar metal its own form, and a trident fanned", () => {
    expect(directions("Cl[Pt-2](Cl)(Cl)Cl", 1)).toEqual([-135, -45, 45, 135]);
    // (a tert-butyl's three methyls fanned about the fourth bond, as ever)
    expect(directions("CCC(C)(C)C", 2)).toEqual([-60, 0, 60, 180].map((d) => (d === 180 ? -180 : d)).sort((p, q) => p - q));
  });
});
