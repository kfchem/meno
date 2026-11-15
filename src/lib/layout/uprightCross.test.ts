import { describe, expect, it } from "vitest";
import { forgetLaidOut, layout2D } from "./engine";
import { fromSmiles } from "./testdata/fromSmiles";
import { layoutMetrics } from "./metrics";
import { placedAbbreviation } from "../chem/abbreviationPlace";

// An atom of four like groups, no stereocentre, is an upright cross (Brecher 2008, GR-4.1.3): its bonds level and upright, as
// neopentane's always were - never the X, four bonds turned 45 degrees to the page; so is one of four ends, alike or not. A
// square-planar metal keeps its own form, and a group on a skeleton - three like ends and a bond on - its fan.

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
      // (four ends not alike - three alike and one other too: a molecule's, not a group's - and four that go on through rings)
      ["FC(F)(Cl)Cl", 1],
      ["FC(Cl)(Cl)Cl", 1],
      ["CC(C)(C)O", 1],
      ["C[Si](C)(C)Cl", 1],
      ["CC(C)(C)Cl", 1],
      ["CC(C)(C)N", 1],
      ["C[N+](C)(C)[O-]", 1],
      ["CC(F)(F)F", 1],
      ["[B-](c1ccccc1)(c1ccccc1)(c1ccccc1)c1ccccc1", 0],
      ["C(c1ccccc1)(c1ccccc1)(c1ccccc1)c1ccccc1", 0],
    ] as const) {
      expect(directions(smiles, centre), smiles).toEqual([-180, -90, 0, 90]);
    }
  });

  it("leave a square-planar metal its own form, and a group on a skeleton a trident fanned, as before", { timeout: 60000 }, () => {
    expect(directions("Cl[Pt-2](Cl)(Cl)Cl", 1)).toEqual([-135, -45, 45, 135]);
    // (a trident - three like ends and a fourth bond that goes on - fanned 60 degrees apart about that bond, as the maintainer has
    // it: a tert-butyl's, a CF3's, a CCl3's, a trimethylsilyl's, a trimethylammonium's)
    for (const [smiles, centre] of [
      ["CCC(C)(C)C", 2],
      ["CCC(F)(F)F", 2],
      ["CCC(Cl)(Cl)Cl", 2],
      ["CC[Si](C)(C)C", 2],
      ["OCC[N+](C)(C)C", 3],
    ] as const) {
      const d = directions(smiles, centre);
      const gaps = d.map((v, i) => (i + 1 < d.length ? d[i + 1] : d[0] + 360) - v).sort((p, q) => p - q);
      // (a fan, not a cross: its ends closer than a right angle - then turned about its bond to where the drawing reads best)
      expect(gaps[0], smiles).toBeLessThan(90);
    }
  });

  it("on a metal: the X only where the centre is surely square planar - Pt(II), Pd(II), Au(III), Rh(I), Ir(I), counted plainly from the drawing - and every other the upright cross, an ambiguous Ni(II) too", { timeout: 120000 }, () => {
    const P = "P(c1ccccc1)(c1ccccc1)c1ccccc1";
    const X = [-135, -45, 45, 135];
    const cross = [-180, -90, 0, 90];
    // (tetrahedral, or not surely square planar: upright)
    for (const smiles of ["Cl[Ti](Cl)(Cl)Cl", "Cl[Zn-2](Cl)(Cl)Cl", "Cl[Fe-](Cl)(Cl)Cl", "Cl[Ni-2](Cl)(Cl)Cl", "O#C[Ni](C#O)(C#O)C#O"]) {
      expect(directions(smiles, smiles.startsWith("O#C") ? 2 : 1), smiles).toEqual(cross);
    }
    expect(directions(`[Pd](${P})(${P})(${P})${P}`, 0)).toEqual(cross);
    expect(directions(`Cl[Ni](Cl)(${P})${P}`, 1)).toEqual(cross);
    // (surely square planar, four end donors that lie round it one way only: the X - PtCl4 2-, PdCl4 2-, AuCl4-)
    for (const smiles of ["Cl[Pt-2](Cl)(Cl)Cl", "Cl[Pd-2](Cl)(Cl)Cl", "Cl[Au-](Cl)(Cl)Cl"]) {
      expect(directions(smiles, 1), smiles).toEqual(X);
    }
    // (three alike and one other lie round it one way only: the X too, not turned off it - PtCl3(NH3)-, AuCl3Br-; a cyanide counted as drawn)
    for (const smiles of ["Cl[Pt-](Cl)(Cl)[NH3]", "Cl[Au-](Cl)(Cl)Br"]) expect(directions(smiles, 1), smiles).toEqual(X);
    expect(directions("N#C[Pt-2](C#N)(C#N)C#N", 2)).toEqual(X);
    // (and where they lie more ways and the input gives none - cisplatin with its NH3: the upright cross, marked by the editor)
    expect(directions("[NH3][Pt](Cl)(Cl)[NH3]", 1)).toEqual(cross);
    // (counted plainly: an N drawn with two H's on a platinum is an amido, Pt(IV) - not surely square planar, so upright)
    expect(directions("N[Pt](N)(Cl)Cl", 1)).toEqual(cross);
    // (a main-group centre with four single bonds and two lone pairs is square planar: the X - XeF4, ICl4-, BrF4-; SF4's one pair, upright)
    for (const smiles of ["F[Xe](F)(F)F", "Cl[I-](Cl)(Cl)Cl", "F[Br-](F)(F)F"]) expect(directions(smiles, 1), smiles).toEqual(X);
    expect(directions("FS(F)(F)F", 1)).toEqual(cross);
  });
});

describe("a group laid out alone - its bond out to a carbon that stands for what it goes on into", () => {
  /** The angles between the three F of a CF3 round its carbon (atom 0), in degrees, smallest first. */
  const fluorineGaps = (x: readonly number[], y: readonly number[], f: number[]) => {
    const d = f.map((i) => (Math.atan2(y[i] - y[0], x[i] - x[0]) * 180) / Math.PI).sort((p, q) => p - q);
    return [d[1] - d[0], d[2] - d[1]].map(Math.round).sort((p, q) => p - q);
  };

  it("is a trident, fanned, where the carbon for its bond out is marked as going on - not the upright cross of four ends", () => {
    forgetLaidOut();
    // (a CF3 with the carbon for its bond out, 4, marked `onward`: through perceive and the engine's growth)
    const out = layout2D({
      atoms: [{ el: "C" }, { el: "F" }, { el: "F" }, { el: "F" }, { el: "C", onward: true }],
      bonds: [1, 2, 3, 4].map((b) => ({ a: 0, b, order: 1 })),
    });
    expect(fluorineGaps(out.x, out.y, [1, 2, 3])).toEqual([60, 60]);
  });

  it("is so as an abbreviation's group is laid out: CF3 written as a label, its F fanned 60 degrees apart", () => {
    const placed = placedAbbreviation("CF3", { x: -1, y: 0 }, 1)!;
    const c = placed.atoms.findIndex((a) => a.el === "C");
    const f = placed.atoms.map((a, i) => (a.el === "F" ? i : -1)).filter((i) => i >= 0);
    const x = placed.atoms.map((a) => a.x);
    const y = placed.atoms.map((a) => a.y);
    // (the carbon first, as the gaps are measured round atom 0)
    const order = [c, ...f];
    expect(fluorineGaps(order.map((i) => x[i]), order.map((i) => y[i]), [1, 2, 3])).toEqual([60, 60]);
  });

  it("is measured afresh where only the going-on mark differs: the measure keeps no structure for the same bonds across it", () => {
    // (one edge list, measured with the stub marked going on and then not: a fan on the 30-degree lattice, then four ends' 90)
    const at = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
    const ps = [{ x: 0, y: 0 }, at(180), at(-60), at(0), at(60)];
    const edges: [number, number][] = [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ];
    const g = { x: ps.map((p) => p.x), y: ps.map((p) => p.y), edges, elements: ["C", "C", "F", "F", "F"] };
    expect(layoutMetrics({ ...g, onward: [false, true, false, false, false] }).gridError).toBeCloseTo(0, 6);
    expect(layoutMetrics(g).gridError).toBeGreaterThan(1);
  });
});
