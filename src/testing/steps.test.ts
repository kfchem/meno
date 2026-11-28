import { describe, expect, it } from "vitest";
import { stepsOf } from "./steps";

describe("stepsOf", () => {
  it("counts the calls a run makes, the same each time, and as the square where the work is", () => {
    const pairs = (n: number) => () => {
      const seen = new Set<number>();
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) seen.add(Math.max(i, j));
    };
    expect(stepsOf(pairs(10))).toBe(200);
    expect(stepsOf(pairs(10))).toBe(stepsOf(pairs(10)));
    expect(stepsOf(pairs(30)) / stepsOf(pairs(10))).toBe(9);
  });

  it("puts every function counted back as it was, a run that throws or not", () => {
    const own = [Math.max, Map.prototype.get, Set.prototype.add, Array.prototype.push];
    expect(() =>
      stepsOf(() => {
        throw new Error("a run that fails");
      }),
    ).toThrow("a run that fails");
    stepsOf(() => [1].push(2));
    expect([Math.max, Map.prototype.get, Set.prototype.add, Array.prototype.push]).toEqual(own);
  });
});
