import { describe, expect, it } from "vitest";
import { fadeAt, stepToward } from "./faded";

describe("what WebGL draws coming and going", () => {
  it("fades in from none as it comes, and out to none as it goes, over its time", () => {
    expect(fadeAt({ since: 100, leaving: false }, 100, 120)).toBe(0);
    expect(fadeAt({ since: 100, leaving: false }, 160, 120)).toBeCloseTo(0.5, 9);
    expect(fadeAt({ since: 100, leaving: false }, 400, 120)).toBe(1);
    expect(fadeAt({ since: 100, leaving: true }, 160, 120)).toBeCloseTo(0.5, 9);
    expect(fadeAt({ since: 100, leaving: true }, 400, 120)).toBe(0);
  });
});

describe("a value eased toward where it is going", () => {
  it("goes a whole unit in its time, never past where it goes, either way", () => {
    expect(stepToward(0, 1, 75, 150)).toBeCloseTo(0.5, 9);
    expect(stepToward(0.9, 1, 75, 150)).toBe(1);
    expect(stepToward(2, 0, 150, 150)).toBe(1);
    expect(stepToward(0.2, 0, 150, 150)).toBe(0);
  });
});
