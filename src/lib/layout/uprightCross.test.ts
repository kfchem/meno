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
  it("are an upright cross: tetramethylammonium, tetramethylsilane, CCl4, CF2Cl2, BF4-, tetraethylammonium, tetraphenylborate and -methane - and neopentane and a sulfate, as they were", { timeout: 60000 }, () => {
    for (const [smiles, centre] of [
      ["C[N+](C)(C)C", 1],
      ["C[Si](C)(C)C", 1],
      ["ClC(Cl)(Cl)Cl", 1],
      ["F[B-](F)(F)F", 1],
      ["CC[N+](CC)(CC)CC", 2],
      ["CC(C)(C)C", 1],
      ["O=S(=O)([O-])[O-]", 1],
      ["[O-]Cl(=O)(=O)=O", 1],
      // (four ends not alike, and four that go on through rings)
      ["FC(F)(Cl)Cl", 1],
      ["[B-](c1ccccc1)(c1ccccc1)(c1ccccc1)c1ccccc1", 0],
      ["C(c1ccccc1)(c1ccccc1)(c1ccccc1)c1ccccc1", 0],
    ] as const) {
      expect(directions(smiles, centre), smiles).toEqual([-180, -90, 0, 90]);
    }
  });

  it("leave a square-planar metal its own form, and a trident fanned", { timeout: 60000 }, () => {
    expect(directions("Cl[Pt-2](Cl)(Cl)Cl", 1)).toEqual([-135, -45, 45, 135]);
    // (a trident - three like ends and a fourth bond - fanned about that bond, as the maintainer has it: a tert-butyl's, a CFCl3's,
    // tert-butanol's, chlorotrimethylsilane's)
    expect(directions("CCC(C)(C)C", 2)).toEqual([-60, 0, 60, 180].map((d) => (d === 180 ? -180 : d)).sort((p, q) => p - q));
    expect(directions("FC(Cl)(Cl)Cl", 1)).toEqual([-180, -60, 0, 60]);
    expect(directions("CC(C)(C)O", 1)).toEqual([-180, -120, 0, 120]);
    expect(directions("C[Si](C)(C)Cl", 1)).toEqual([-180, -120, 0, 120]);
  });
});
