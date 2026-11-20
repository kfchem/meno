// Held beside textAndCharts.test.ts: what lies on the edge of a picture's box is within it - a mark over the picture, not a stray to leave out.
import { describe, expect, it } from "vitest";
import { withoutStrays, type ReadAtom } from "./read";

const at = (x: number, y: number, more: Partial<ReadAtom> = {}): ReadAtom => ({ x, y, ...more });
const box: [number, number, number, number] = [0, 0, 10, 5];

describe("withoutStrays at a picture's edge", () => {
  it("keeps a bare point on each of the four edges of a picture's box and leaves out one a hair outside each", () => {
    const on = [at(0, 2), at(10, 2), at(5, 0), at(5, 5)];
    expect(withoutStrays(on, [], 10, [box]).atoms).toEqual(on);
    for (const out of [at(-0.001, 2), at(10.001, 2), at(5, -0.001), at(5, 5.001)]) {
      expect(withoutStrays([out], [], 10, [box]).atoms).toEqual([]);
    }
  });

  it("keeps a bare line alone whose two ends are on the box's edges, said by no count, and leaves out the same line beside the box", () => {
    const atoms = [at(0, 0), at(10, 0)];
    const bonds = [{ a: 0, b: 1, order: 1 as const }];
    expect(withoutStrays(atoms, bonds, 10, [box])).toMatchObject({ atoms, lone: 0 });
    expect(withoutStrays(atoms, bonds, 10, [[20, 0, 30, 5]])).toMatchObject({ atoms: [], lone: 1 });
  });
});
