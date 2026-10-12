import { describe, expect, it } from "vitest";
import { ringShape } from "./conformation";
import { solidOf } from "./cage";
import { perceive, type LayoutInput } from "./perceive";

/** Carbons joined by the bonds given, as [a, b, order?]. */
const carbons = (n: number, bonds: [number, number, number?][]): LayoutInput => ({
  atoms: Array.from({ length: n }, () => ({ el: "C" })),
  bonds: bonds.map(([a, b, order]) => ({ a, b, order: order ?? 1 })),
});

describe("a ring's shape in a solid", () => {
  const shapeOf = (input: LayoutInput, ring: number[]) => {
    const mol = perceive(input);
    const X = solidOf(mol, mol.systems[0]);
    return ringShape(mol, ring, (a) => X.get(a)!);
  };

  it("is a chair for bicyclo[3.3.1]nonane's rings, as the solid has them", () => {
    // (the one-atom bridge 0, the bridgeheads 1 and 5)
    const twin = carbons(9, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 8], [8, 7], [7, 6], [6, 5]]);
    expect(shapeOf(twin, [0, 1, 2, 3, 4, 5]).kind).toBe("chair");
    expect(shapeOf(twin, [0, 5, 6, 7, 8, 1]).kind).toBe("chair");
  });

  it("is a boat for norbornane's six-membered ring, its bridge across bow and stern", () => {
    const norbornane = carbons(7, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3]]);
    const shape = shapeOf(norbornane, [0, 1, 2, 3, 4, 5]);
    expect(shape.kind).toBe("boat");
    // (its bow and stern the bridgeheads, 0 and 3)
    expect(shape.kind === "boat" && shape.bow).toBe(0);
  });

  it("is flat with a double bond in it, whatever else", () => {
    const octene = carbons(8, [[0, 1, 2], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [2, 6], [6, 7], [7, 5]]);
    expect(shapeOf(octene, [0, 1, 2, 3, 4, 5]).kind).toBe("flat");
  });
});
