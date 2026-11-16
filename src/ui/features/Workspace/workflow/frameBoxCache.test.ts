import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import type { Model } from "../store/types";
import { structureBox } from "./fitFrames";

/** Methanol (C 1, O 2) with a water's O 3 held by a hydrogen bond to O 2, the water at `wx`; every atom and bond a new object. */
function pair(wx: number) {
  const model = {
    atoms: [
      { id: 1, el: "C", x: 0, y: 0 },
      { id: 2, el: "O", x: 1.8, y: 0 },
      { id: 3, el: "O", x: wx, y: 0 },
    ],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 2, b: 3, order: 1, hydrogen: true },
    ],
  } as unknown as Model;
  return { model, byId: new Map(model.atoms.map((a) => [a.id, a])) };
}

describe("the box is worked out again where the atom a bond reaches in another structure changes", () => {
  it("the methanol's box, its own atoms and bonds the same objects, follows the water to the other side", () => {
    const right = pair(4.68);
    const first = structureBox(right.model, right.byId, [1, 2]);
    // (the same methanol - its atoms' and bonds' objects kept, as moving the water replaces its atom alone - with the water now on its left: the O's label is laid out toward it)
    const left = pair(-3);
    const kept = { ...left.model, atoms: [right.model.atoms[0], right.model.atoms[1], left.model.atoms[2]], bonds: [right.model.bonds[0], right.model.bonds[1]] } as unknown as Model;
    const byId = new Map(kept.atoms.map((a) => [a.id, a]));
    const moved = structureBox(kept, byId, [1, 2]);
    // what it is worked out from nothing: every atom and bond a new object
    const fresh = pair(-3);
    const expected = structureBox(fresh.model, fresh.byId, [1, 2]);
    expect(first).not.toEqual(moved);
    expect(moved).toEqual(expected);
  });
});
