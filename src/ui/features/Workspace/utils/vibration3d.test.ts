import { describe, expect, it } from "vitest";
import { VIBRATION_PEAK, vibrationOffsets } from "./vibration3d";
import { valueText } from "../../../../lib/calc/results";
import { WORLD_PER_ANGSTROM } from "./molecule3d";

describe("a vibration", () => {
  it("is written by its frequency, an imaginary one with an i", () => {
    expect(valueText(1650.24, { quantity: "wavenumber" })).toBe("1650.2 cm⁻¹");
    expect(valueText(-120.46, { quantity: "wavenumber" })).toBe("120.5i cm⁻¹");
  });

  it("moves its atoms along its displacements, the one that moves most as far as the peak", () => {
    // water's bend: the hydrogens move most, the oxygen a little
    const d = [0, 0, 0.07, 0, -0.43, -0.56, 0, 0.43, -0.56];
    const out = vibrationOffsets(d, 1);
    const reach = (i: number) => Math.hypot(out[3 * i], out[3 * i + 1], out[3 * i + 2]);
    expect(reach(1)).toBeCloseTo(VIBRATION_PEAK * WORLD_PER_ANGSTROM, 6);
    expect(reach(0)).toBeLessThan(reach(1));
    // (the other way at the other end of the swing, and nothing at rest)
    expect(vibrationOffsets(d, -1)[4]).toBeCloseTo(-out[4], 6);
    expect([...vibrationOffsets(d, 0)].every((v) => v === 0)).toBe(true);
  });

  it("moves nothing where nothing moves", () => {
    expect([...vibrationOffsets([0, 0, 0, 0, 0, 0], 1)]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
