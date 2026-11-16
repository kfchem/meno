import { describe, expect, it } from "vitest";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { labelBox, labelSetOf, layoutMolecule, type Atom, type Bond } from "../../../../lib/chem/layout2d";
import type { Model } from "../store/types";
import { notesBoxes, stereoPlaces, type Rect } from "./marks";

const L = NOMINAL_BOND_LENGTH;
const meet = (p: Rect, q: Rect) => p.minX < q.maxX && q.minX < p.maxX && p.minY < q.maxY && q.minY < p.maxY;

describe("R and S keep off what is written beside the drawing", () => {
  const model: Model = {
    atoms: [
      { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
      { id: 2, x: 1.5, y: 0, r: 0.9, el: "C" },
      { id: 3, x: -0.75, y: 1.3, r: 0.9, el: "C" },
    ],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 1, b: 3, order: 1 },
    ],
  };
  const common = {
    model,
    centres: new Map([[1, "R"]]),
    doubleBonds: new Map<number, string>(),
    boxes: new Map(),
    half: () => ({ x: 0.1, y: 0.1 }),
    apart: 0.05,
    off: 0.1,
    bond: 1.5,
  };

  it("a note where R would go moves R off it", () => {
    const [free] = stereoPlaces(common);
    const note = { minX: free.x - 0.15, maxX: free.x + 0.15, minY: free.y - 0.15, maxY: free.y + 0.15 };
    const [moved] = stereoPlaces({ ...common, notes: [note] });
    expect(meet({ minX: moved.x - 0.1, maxX: moved.x + 0.1, minY: moved.y - 0.1, maxY: moved.y + 0.1 }, note)).toBe(false);
  });

  it("notesBoxes takes the texts set beside the drawing, not the atoms' labels", () => {
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: L * 0.866, y: L / 2, el: "C", stereoGroup: { kind: "or", n: 1 } },
      { id: 3, x: L * 1.732, y: 0, el: "C" },
      { id: 4, x: L * 2.598, y: L / 2, el: "C" },
      { id: 5, x: L * 1.732, y: -L, el: "O" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 1 },
      { a1: 2, a2: 3, order: 1 },
      { a1: 2, a2: 4, order: 1, stereo: "up" },
    ];
    const opts = acsWorldOptions([], [], { units: "world" });
    const layout = layoutMolecule(atoms, bonds, opts, 40);
    const set = labelSetOf(opts);
    const boxes = notesBoxes(layout.texts, (t) => t.fontPx, set);
    // (the or1 beside C2; the O's label is the atom's, kept off by the label boxes)
    expect(boxes).toHaveLength(1);
    const or1 = layout.texts.find((t) => t.text === "or1")!;
    const b = labelBox(or1, or1.fontPx, set);
    expect(boxes[0]).toEqual({ minX: or1.x - b.left, maxX: or1.x + b.right, minY: or1.y - b.bottom, maxY: or1.y + b.top });
  });
});
