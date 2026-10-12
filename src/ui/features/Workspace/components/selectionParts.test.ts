import { describe, expect, it } from "vitest";
import { roomFor, selectedParts } from "./selectionParts";

const propane = {
  atoms: [
    { id: 1, x: -1.3, y: -0.4, el: "C" },
    { id: 2, x: 0, y: 0.35, el: "C" },
    { id: 3, x: 1.3, y: -0.4, el: "C" },
  ],
  bonds: [
    { id: 4, a: 1, b: 2, order: 1 },
    { id: 5, a: 2, b: 3, order: 1 },
  ],
} as unknown as Parameters<typeof selectedParts>[0];

describe("the selection's shading", () => {
  it("is a disc under each atom selected and a band under each bond, where they stand", () => {
    const parts = selectedParts(propane, new Set([1, 2]), new Set([4]));
    expect([...parts.keys()]).toEqual(["a1", "a2", "b4"]);
    expect(parts.get("a2")).toEqual({ atom: { x: 0, y: 0.35 } });
    expect(parts.get("b4")).toEqual({ bond: { p: { x: -1.3, y: -0.4 }, q: { x: 0, y: 0.35 } } });
    // (an atom or a bond the drawing no longer has: nothing)
    expect([...selectedParts(propane, new Set([9]), new Set([8])).keys()]).toEqual([]);
  });

  it("is drawn as instances of two meshes, made again only as a selection outgrows them", () => {
    expect(roomFor(0)).toBe(64);
    expect(roomFor(64)).toBe(64);
    expect(roomFor(65)).toBe(128);
    // (a thousand records of cholesterol selected whole: its 28 000 atoms and 31 000 bonds in two meshes)
    expect(roomFor(28_000)).toBe(32_768);
    expect(roomFor(31_000)).toBe(32_768);
  });
});
