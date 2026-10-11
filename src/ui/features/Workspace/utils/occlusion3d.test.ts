import { describe, expect, it } from "vitest";
import { atomOcclusion, bondOcclusion, LINE_TERMS, occlusionAt, OCCLUSION_TERMS } from "./occlusion3d";
import { occlusionKnown, occlusionNow } from "./occlusions";

const at = (xyz: number[]) => Float32Array.from(xyz);

describe("ambient occlusion, per atom", () => {
  it("leaves an atom alone open all round", () => {
    const t = atomOcclusion(at([0, 0, 0]), at([1]), 3);
    for (const n of [[0, 0, 1], [1, 0, 0], [0, -1, 0], [0.6, 0.8, 0]] as [number, number, number][]) expect(occlusionAt(t, 0, n)).toBeCloseTo(1, 2);
  });

  it("shades a ball where another stands beside it, and not on its far side", () => {
    // two carbons, space-filling, bonded along x
    const t = atomOcclusion(at([0, 0, 0, 1.5, 0, 0]), at([1.7, 1.7]), 3);
    const far = occlusionAt(t, 0, [-1, 0, 0]);
    const side = occlusionAt(t, 0, [0, 1, 0]);
    const near = occlusionAt(t, 0, [0.5, 0.866, 0]);
    expect(far).toBeGreaterThan(0.95);
    expect(side).toBeLessThan(far);
    expect(near).toBeLessThan(side);
    // (the same for both, as near as its rays fall: they shade each other alike)
    expect(occlusionAt(t, 1, [-0.5, 0.866, 0])).toBeCloseTo(near, 1);
  });

  it("shades a ball shut in all round darkest, and one not drawn neither shades nor is shaded", () => {
    // a ball in the middle of six touching it, and one drawn with none
    const six = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1].map((v) => v * 1.6);
    const places = at([0, 0, 0, ...six, 0.5, 0.5, 0.5]);
    const radii = at([1, 1, 1, 1, 1, 1, 1, 0]);
    const t = atomOcclusion(places, radii, 3);
    const alone = atomOcclusion(at([0, 0, 0]), at([1]), 3);
    expect(t[0]).toBeLessThan(0.5 * alone[0]);
    // (not drawn: open, should it come to be drawn; and it shades nothing)
    expect(Array.from(t.slice(7 * OCCLUSION_TERMS, 8 * OCCLUSION_TERMS))).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    const without = atomOcclusion(at([0, 0, 0, ...six]), at([1, 1, 1, 1, 1, 1, 1]), 3);
    expect(t[0]).toBeCloseTo(without[0], 5);
  });

  it("shades a bond's end near a ball, and leaves one alone open", () => {
    const line = at([0, 0, 0, 1.5, 0, 0, 0.1]);
    expect(LINE_TERMS).toBe(7);
    const alone = bondOcclusion(at([]), at([]), line, 3);
    expect(alone[0]).toBeCloseTo(1, 5);
    expect(alone[1]).toBeCloseTo(1, 5);
    // a ball beside its first end
    const beside = bondOcclusion(at([0.4, 0.6, 0]), at([0.5]), line, 3);
    expect(beside[0]).toBeLessThan(0.95);
    expect(beside[1]).toBeGreaterThan(beside[0]);
  });

  it("is worked out once for what it is worked out from, and kept", () => {
    const places = at([0, 0, 0, 1.5, 0, 0]);
    const radii = at([1.7, 1.7]);
    const lines = at([]);
    expect(occlusionKnown(places, radii, lines)).toBeUndefined();
    const o = occlusionNow(places, radii, lines);
    expect(occlusionNow(places, radii, lines)).toBe(o);
    expect(occlusionKnown(places, radii, lines)).toBe(o);
    // (other radii - another look - are another's)
    expect(occlusionKnown(places, at([0.34, 0.34]), lines)).toBeUndefined();
  });
});
