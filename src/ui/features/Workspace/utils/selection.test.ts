import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { inBox, inLasso, insidePolygon, middleOf, pathBetween, turned, turnedArrows, turnedOver, turnedOverArrows, wordsIn } from "./selection";

const atom = (id: number, x: number, y: number) => ({ id, x, y, r: 0.9, el: "C" });

// a chain 1-2-3-4 along x, a wedge on 2-3, and apart from it an ethane 5-6
const model: Model = {
  atoms: [atom(1, 0, 0), atom(2, 1, 0), atom(3, 2, 0), atom(4, 3, 0), atom(5, 10, 0), atom(6, 11, 0)],
  bonds: [
    { id: 11, a: 1, b: 2, order: 1 },
    { id: 12, a: 2, b: 3, order: 1, stereo: "up" },
    { id: 13, a: 3, b: 4, order: 1 },
    { id: 14, a: 5, b: 6, order: 1 },
  ],
};

describe("inBox and inLasso", () => {
  it("take the atoms inside, and only the bonds between two of them", () => {
    const box = inBox(model, { x: 0.5, y: -1 }, { x: 2.5, y: 1 });
    expect([...box.atoms]).toEqual([2, 3]);
    expect([...box.bonds]).toEqual([12]);
    // drawn from either corner
    expect([...inBox(model, { x: 2.5, y: 1 }, { x: 0.5, y: -1 }).atoms]).toEqual([2, 3]);
  });

  it("take what a lasso encloses, whatever its shape", () => {
    // a triangle round atoms 1 and 2, not 3
    const lasso = inLasso(model, [
      { x: -1, y: -1 },
      { x: 1.6, y: -1 },
      { x: -1, y: 2 },
    ]);
    expect([...lasso.atoms].sort()).toEqual([1]);
    const wide = inLasso(model, [
      { x: -1, y: -1 },
      { x: 2.5, y: -1 },
      { x: 2.5, y: 1 },
      { x: -1, y: 1 },
    ]);
    expect([...wide.atoms].sort()).toEqual([1, 2, 3]);
    expect([...wide.bonds].sort()).toEqual([11, 12]);
    expect(insidePolygon({ x: 0, y: 0 }, [{ x: 1, y: 1 }])).toBe(false);
  });
});

describe("wordsIn", () => {
  it("takes the words on the page a box or a lasso holds - not those over an arrow, which go with it", () => {
    const words = [
      { id: 1, x: 1, y: 1 },
      { id: 2, x: 9, y: 9 },
      { id: 3, x: 2, y: 2, arrow: 7 },
    ];
    expect(wordsIn(words, "box", [{ x: 0, y: 0 }, { x: 5, y: 5 }])).toEqual([1]);
    expect(wordsIn(words, "lasso", [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toEqual([1, 2]);
    expect(wordsIn(words, "box", [{ x: 20, y: 20 }, { x: 30, y: 30 }])).toEqual([]);
  });
});

describe("pathBetween", () => {
  it("takes the atoms and bonds along the bonds from one atom to another", () => {
    const path = pathBetween(model, 1, 4)!;
    expect([...path.atoms].sort()).toEqual([1, 2, 3, 4]);
    expect([...path.bonds].sort()).toEqual([11, 12, 13]);
  });

  it("finds none between atoms no bonds join", () => {
    expect(pathBetween(model, 1, 5)).toBeNull();
  });
});

describe("turned and turnedOver", () => {
  it("turns the selection about its middle", () => {
    const mid = middleOf(model, new Set([1, 2, 3]))!;
    expect(mid).toEqual({ x: 1, y: 0 });
    const t = turned(model.atoms.slice(0, 3), mid, Math.PI / 2);
    expect(t[0].x).toBeCloseTo(1);
    expect(t[0].y).toBeCloseTo(-1);
  });

  it("turns it over: mirrored, its wedges made hashes, so the molecule stays the one it was", () => {
    const over = turnedOver(model, new Set([1, 2, 3, 4]), "vertical");
    expect(over.atoms.map((a) => a.x)).toEqual([3, 2, 1, 0]);
    expect(over.bonds).toEqual([{ id: 12, stereo: "down" }]);
    // a bond reaching out of the selection keeps its wedge
    expect(turnedOver(model, new Set([2]), "horizontal").bonds).toEqual([]);
  });

  it("carries arrows round, each pointing as far round, and turns them over, each pointing the mirrored way, its corners on its other side", () => {
    const [a] = turnedArrows([{ id: 1, x: 3, y: 0, angle: 0 }], { x: 1, y: 0 }, Math.PI / 2);
    expect(a.x).toBeCloseTo(1);
    expect(a.y).toBeCloseTo(2);
    expect(a.angle).toBeCloseTo(Math.PI / 2);
    const arrow = { id: 1, x: 3, y: 1, angle: 0.3, corners: [{ along: 0.5, across: 2 }] };
    const [lr] = turnedOverArrows([arrow], { x: 1, y: 0 }, "vertical");
    expect(lr).toMatchObject({ x: -1, y: 1, corners: [{ along: 0.5, across: -2 }] });
    expect(lr.angle).toBeCloseTo(Math.PI - 0.3);
    const [ud] = turnedOverArrows([arrow], { x: 1, y: 0 }, "horizontal");
    expect(ud).toMatchObject({ x: 3, y: -1, angle: -0.3, corners: [{ along: 0.5, across: -2 }] });
    // (one with no corners has none after)
    expect(turnedOverArrows([{ id: 2, x: 0, y: 0, angle: 0 }], { x: 1, y: 0 }, "vertical")[0]).not.toHaveProperty("corners");
  });
});
