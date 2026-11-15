import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { cipMarksOf, cipSaid } from "./cipMarks";
import { chair, haworth } from "../../../../lib/layout/testdata/projections";
import type { DrawnAtom, DrawnBond } from "../../../../lib/layout/drawn";
import { NOT_MARKED } from "../../../../lib/chem/perception/projection/recognise";

/**
 * What a centre's tip says where it is in a ring drawn in perspective with no depth stored (docs/EDITOR-2D.md, *Drawn in perspective*):
 * that its R or S was read from the ring as drawn, or as a Haworth ring - or, where the ring is not read, why, and what to draw.
 */
function modelOf(d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }, asked: number[]): Model {
  return {
    atoms: d.atoms.map((a, i) => ({ id: i + 1, x: a.x, y: a.y, r: 0.9, el: a.el ?? "C", ...(asked.includes(i) ? { stereoShown: true as const } : {}) })),
    bonds: d.bonds.map((b, k) => ({ id: 100 + k, a: b.a + 1, b: b.b + 1, order: b.order as 1 | 2 | 3 })),
  };
}
/** The drawing with its depth taken away: drawn bond by bond. */
const flat = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }) => ({ atoms: d.atoms.map(({ z: _z, centre: _c, ...a }) => a), bonds: d.bonds });

describe("a centre of a ring drawn in perspective with no depth, its R or S asked for", () => {
  const twoMethyls = flat(chair({ 0: "equatorial", 1: "equatorial" }));

  it("has its R or S, and says it was read from the ring as drawn in perspective", () => {
    const m = cipMarksOf(modelOf(twoMethyls, [0, 1]));
    expect(m.centres.size).toBe(2);
    expect(m.said.get("centre-1")).toBe("Read from the ring as drawn in perspective.");
    expect(m.said.get("centre-2")).toBe("Read from the ring as drawn in perspective.");
  });

  it("has none where the ring is on its side with no mark, and says what to draw", () => {
    const onItsSide = { atoms: twoMethyls.atoms.map((a) => ({ ...a, x: -a.y, y: a.x })), bonds: twoMethyls.bonds };
    const m = cipMarksOf(modelOf(onItsSide, [0, 1]));
    expect(m.centres.size).toBe(0);
    expect(m.said.get("centre-1")).toBe(`No R or S: ${NOT_MARKED}.`);
    expect(m.said.get("centre-1")).toBe("No R or S: the ring is drawn in perspective, but its near and far are not marked: draw its near bonds bold.");
  });

  it("says a Haworth ring's centre was read as a Haworth ring", () => {
    const glucose = flat(haworth([true, false, true, false, true]));
    const m = cipMarksOf(modelOf(glucose, [1]));
    expect(m.centres.size).toBe(1);
    expect(m.said.get("centre-2")).toBe("Read as a Haworth ring.");
  });

  it("says of a ring drawn flat, no wedge, what it always said: no configuration drawn", () => {
    const hexagon: { atoms: DrawnAtom[]; bonds: DrawnBond[] } = {
      atoms: [...[...Array(6)].map((_, k) => ({ x: Math.cos((k * Math.PI) / 3), y: Math.sin((k * Math.PI) / 3), hs: k < 2 ? 1 : 2 })), { x: 2, y: 0, hs: 3 }, { x: 1, y: 1.73, hs: 3 }],
      bonds: [...[...Array(6)].map((_, k) => ({ a: k, b: (k + 1) % 6, order: 1 as const })), { a: 0, b: 6, order: 1 }, { a: 1, b: 7, order: 1 }],
    };
    const m = cipMarksOf(modelOf(hexagon, [0]));
    expect(m.said.get("centre-1")).toBe(cipSaid("undrawn", "centre"));
  });
});
