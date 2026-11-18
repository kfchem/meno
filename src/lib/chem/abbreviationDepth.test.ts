/**
 * An abbreviation's structure drawn out as a cage keeps its depth (docs/EDITOR-2D.md, *Drawn in perspective*): turned in the page to meet its
 * bond, whichever way that bond comes, and scaled to the drawing's bond, its depth goes with it, so its bonds pass behind the same others.
 */
import { describe, expect, it } from "vitest";
import { placedAbbreviation } from "./abbreviationPlace";
import { acsWorldOptions } from "./acs";
import { buildAllPrimitives, type Atom, type Bond } from "./layout2d";

/** How many lines its bonds are drawn in: a bond broken where it passes behind another is two. */
function linesOf(s: NonNullable<ReturnType<typeof placedAbbreviation>>, depth: boolean): number {
  const atoms: Atom[] = s.atoms.map((a, i) => ({ id: i, x: a.x, y: a.y, el: a.el === "*" ? "C" : a.el, ...(depth && a.z != null ? { z: a.z } : {}) }));
  const bonds: Bond[] = s.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order }));
  return buildAllPrimitives(atoms, bonds, acsWorldOptions([], [], { units: "world" }), 40).lines.length;
}

describe("an abbreviation drawn out as a cage", () => {
  it("1-adamantyl keeps its depth, scaled with its bond, whichever way its bond comes: as many bonds broken", () => {
    const ways = [
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0.6, y: -0.8 },
    ];
    const depths: number[][] = [];
    const broken: number[] = [];
    for (const L of [1, 1.5])
      for (const w of ways) {
        const s = placedAbbreviation("Ad", { x: w.x * L, y: w.y * L }, L)!;
        expect(s).not.toBeNull();
        const z = s.atoms.filter((a) => a.z != null).map((a) => a.z! / L);
        // (the cage's ten atoms, each with a depth)
        expect(z.length).toBeGreaterThanOrEqual(10);
        depths.push(z.sort((p, q) => p - q));
        broken.push(linesOf(s, true) - linesOf(s, false));
      }
    for (const z of depths) z.forEach((v, i) => expect(v).toBeCloseTo(depths[0][i], 9));
    // (and as many bonds broken each way: as the engine draws it, none)
    expect(new Set(broken).size).toBe(1);
  });
});
