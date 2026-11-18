import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { blocksOf } from "./make3d";
import { partsAlone } from "./partsAlone";

// Parts whose configuration is not read from their wedges (a wedge at an amine's N, which keeps none) are alike to no other; and a block with a multi-centre bond is searched whole.

const together = (...drawn: Model[]): Model => {
  const atoms: Model["atoms"] = [];
  const bonds: Model["bonds"] = [];
  drawn.forEach((m, k) => {
    const id = (n: number) => n + 1000 * (k + 1);
    for (const a of m.atoms) atoms.push({ ...a, id: id(a.id), x: a.x + 10 * k, joined: 1 });
    for (const b of m.bonds) bonds.push({ ...b, id: id(b.id), a: id(b.a), b: id(b.b) });
  });
  return { atoms, bonds } as Model;
};
const alikeOf = (m: Model) => {
  const [block] = blocksOf(m, [m.atoms[0].id]);
  return partsAlone(block.part, block)!.map((p) => p.alike);
};
/** Trimethylamine with a wedge drawn at its N: the N keeps no configuration, so the wedge says nothing that can be read. */
const wedged = (): Model => {
  const m = drawnFromSmiles("CN(C)C");
  const n = m.atoms.find((a) => a.el === "N")!;
  let done = false;
  return { ...m, bonds: m.bonds.map((b) => (!done && b.a === n.id ? ((done = true), { ...b, stereo: "up" as const }) : b)) };
};

describe("which parts are alike", () => {
  it("two trimethylamines drawn alike, each with a wedge at its N that says nothing: alike to no other, each searched", () => {
    expect(alikeOf(together(wedged(), wedged()))).toEqual([undefined, undefined]);
    // (the same two with no wedge: alike)
    expect(alikeOf(together(drawnFromSmiles("CN(C)C"), drawnFromSmiles("CN(C)C")))).toEqual([undefined, 0]);
  });
  it("two parts written alike in element and bond but not in what the file says of an atom are not alike (a charge)", () => {
    // (CCO and CC[O-]: the identity input already tells them apart - this pins that a part is never alike to a different compound)
    expect(alikeOf(together(drawnFromSmiles("CCO"), drawnFromSmiles("CC[O-]")))).toEqual([undefined, undefined]);
  });
});
