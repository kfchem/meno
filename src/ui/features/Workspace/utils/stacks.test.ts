import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { freshStackId, gridPlaces, hiddenInStacks, middleOf, placeInStack, seenOnly, shownOf, stackMembers } from "./stacks";

// (two stacks - one of three, one laid out as a grid - and a molecule of its own)
const molecules = [
  { id: 1, stack: { id: 1 } },
  { id: 2, stack: { id: 1 } },
  { id: 3, stack: { id: 1 } },
  { id: 4 },
  { id: 5, stack: { id: 2, spread: true as const } },
  { id: 6, stack: { id: 2, spread: true as const } },
];

describe("a stack of molecules in 3D", () => {
  it("is its molecules in the order its file gave them, showing its first until another is shown", () => {
    expect(stackMembers(molecules, 1).map((m) => m.id)).toEqual([1, 2, 3]);
    expect(shownOf(molecules, 1, {})).toBe(1);
    expect(shownOf(molecules, 1, { 1: 3 })).toBe(3);
    // (one it no longer has: its first again)
    expect(shownOf(molecules, 1, { 1: 9 })).toBe(1);
    expect(shownOf(molecules, 7, {})).toBeNull();
  });

  it("keeps out of sight all but the one it shows - none of a stack laid out as a grid, nor a molecule of its own", () => {
    expect([...hiddenInStacks(molecules, {})]).toEqual([2, 3]);
    expect([...hiddenInStacks(molecules, { 1: 2 })]).toEqual([1, 3]);
  });

  it("says where one stands in it and how many it holds - none of a grid's, a lone molecule's or a stack of one", () => {
    expect(placeInStack(molecules, molecules[1])).toEqual({ index: 1, count: 3, members: [1, 2, 3] });
    expect(placeInStack(molecules, molecules[3])).toBeNull();
    expect(placeInStack(molecules, molecules[4])).toBeNull();
    expect(placeInStack([{ id: 1, stack: { id: 1 } }], { id: 1, stack: { id: 1 } })).toBeNull();
  });

  it("is numbered after the document's own stacks", () => {
    expect(freshStackId(molecules)).toBe(3);
    expect(freshStackId([{ id: 1 }])).toBe(1);
  });
});

describe("a stack laid out as a grid", () => {
  it("stands in rows about as many as its columns, left to right and downwards, about where it stood", () => {
    // (five molecules each reaching 2: cells 2 * 2 + a bond's room wide, three columns, two rows)
    const places = gridPlaces({ x: 0, y: 0 }, [2, 2, 2, 2, 2]);
    const cell = 4 + NOMINAL_BOND_LENGTH;
    expect(places[0]).toEqual({ x: -cell, y: cell / 2 });
    expect(places[2]).toEqual({ x: cell, y: cell / 2 });
    expect(places[3]).toEqual({ x: -cell, y: -cell / 2 });
    expect(gridPlaces({ x: 0, y: 0 }, [])).toEqual([]);
  });

  it("stacks again in its middle - where it stood as it was laid out, its last row short or not", () => {
    expect(middleOf([{ x: 0, y: 0 }, { x: 4, y: 2 }])).toEqual({ x: 2, y: 1 });
    const at = { x: 3, y: -2 };
    const middle = middleOf(gridPlaces(at, [2, 2, 2, 2, 2]));
    expect(middle.x).toBeCloseTo(at.x, 9);
    expect(middle.y).toBeCloseTo(at.y, 9);
  });
});

describe("a stack in a picture", () => {
  it("shows the one it shows - its first where none says so - a grid's every one, and the rest as they are", () => {
    const carried = [
      { name: "a", stack: { id: 1 } },
      { name: "b", stack: { id: 1 }, shown: true as const },
      { name: "c" },
      { name: "d", stack: { id: 2 } },
      { name: "e", stack: { id: 2 } },
      { name: "f", stack: { id: 3, spread: true as const } },
      { name: "g", stack: { id: 3, spread: true as const } },
    ];
    expect(seenOnly(carried).map((m) => m.name)).toEqual(["b", "c", "d", "f", "g"]);
  });
});
