import { describe, expect, it } from "vitest";
import type { Model, Molecule3D } from "../store/types";
import type { Frame } from "./entries";
import { selectionInSet } from "./selectionSet";

// (ethane drawn about (1, 0); a molecule in 3D at (20, 0), another at (40, 0); a set round the first molecule alone)
const model = {
  atoms: [
    { id: 1, el: "C", x: 0, y: 0 },
    { id: 2, el: "C", x: 2, y: 0 },
  ],
  bonds: [{ id: 1, a: 1, b: 2, order: 1 }],
} as unknown as Model;
const molecules3d = [
  { id: 7, at: { x: 20, y: 0 } },
  { id: 8, at: { x: 40, y: 0 } },
] as unknown as Molecule3D[];
const page = { model, molecules3d };
const set: Frame = { x0: 15, x1: 25, y0: -5, y1: 5 };

describe("the selection, where it lies in a set", () => {
  it("takes no port of its own: a molecule in 3D chosen inside a set, or with others outside it - the port there is the set's", () => {
    expect(selectionInSet(page, new Set(), new Set([7]), [set])).toBe(true);
    expect(selectionInSet(page, new Set(), new Set([7, 8]), [set])).toBe(true);
  });

  it("takes one where none of it lies in a set: a molecule, a structure drawn, wholly or by one atom - and where there is no set", () => {
    expect(selectionInSet(page, new Set(), new Set([8]), [set])).toBe(false);
    expect(selectionInSet(page, new Set([1, 2]), new Set(), [set])).toBe(false);
    expect(selectionInSet(page, new Set(), new Set([7]), [])).toBe(false);
    // (the structure in a set by its middle: one atom of it chosen is in it too)
    expect(selectionInSet(page, new Set([1]), new Set(), [{ x0: -1, x1: 3, y0: -1, y1: 1 }])).toBe(true);
  });
});
