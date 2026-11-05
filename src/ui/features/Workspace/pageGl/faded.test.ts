import { describe, expect, it } from "vitest";
import { stepToward } from "./faded";

describe("a value eased toward where it is going", () => {
  it("goes a whole unit in its time, never past where it goes, either way", () => {
    expect(stepToward(0, 1, 75, 150)).toBeCloseTo(0.5, 9);
    expect(stepToward(0.9, 1, 75, 150)).toBe(1);
    expect(stepToward(2, 0, 150, 150)).toBe(1);
    expect(stepToward(0.2, 0, 150, 150)).toBe(0);
  });
});
