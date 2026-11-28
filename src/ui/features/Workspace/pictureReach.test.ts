import { describe, expect, it } from "vitest";
import { labelSetOf, measureLabelBox, solidsBounds } from "../../../lib/chem/layout2d";
import { ACS_1996 } from "../../../lib/chem/style";
import { bondsByDistance } from "../../../utils/structureParsers";
import { drawingLayout } from "./fileActions";
import { pictureItems } from "./picture";
import { solidReach, steppedThrough } from "./render3d";
import type { Carried3D } from "./store/types";
import { notePictureMarks, pictureMarks } from "./utils/molecule3d";
import { pictureSurface } from "./utils/surfaceMesh";
import { style3dOf } from "./style3dOf";

const aromatic = { aromaticEnabled: false, aromaticRings: {} };

/** Water, turned a quarter about z and a little more. */
const water: Carried3D = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0.3 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  at: { x: 3, y: -2 },
  turn: [0.1, 0.2, Math.SQRT1_2, Math.SQRT1_2 - 0.02],
};

/** A block of carbons `n` a side, 1.54 Å apart, bonded by distance, standing at `at`. */
function block(n: number, at = { x: 0, y: 0 }): Carried3D {
  const atoms = Array.from({ length: n * n * n }, (_, i) => ({ el: "C", x: 1.54 * (i % n), y: 1.54 * (Math.floor(i / n) % n), z: 1.54 * Math.floor(i / (n * n)) }));
  return { atoms, bonds: bondsByDistance(atoms).map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })), at };
}

/** What a picture's 3D step worked out for itself before: how far a molecule reaches, from its marks made again, and its surface. */
function reachAfresh(m: Carried3D) {
  const style = style3dOf({});
  const marks = solidsBounds(pictureMarks(m, style));
  const surface = pictureSurface(m, style)?.bounds ?? null;
  if (!marks || !surface) return marks ?? surface;
  return { min: { x: Math.min(marks.min.x, surface.min.x), y: Math.min(marks.min.y, surface.min.y) }, max: { x: Math.max(marks.max.x, surface.max.x), y: Math.max(marks.max.y, surface.max.y) } };
}

describe("a picture of molecules in 3D", () => {
  const fixtures: Carried3D[] = [water, block(4, { x: -6, y: 9 }), { ...block(3), look: "secondary" }, { ...block(3, { x: 2, y: 2 }), turn: [0.3, -0.1, 0.2, 0.927] }];

  it("is drawn in just where the layout found each to reach: the same numbers as it worked out again before", () => {
    const { reach } = drawingLayout({ atoms: [], bonds: [], molecules3d: fixtures } as unknown as Parameters<typeof drawingLayout>[0], aromatic, ACS_1996);
    expect(reach).toHaveLength(fixtures.length);
    fixtures.forEach((m, i) => expect(reach[i]).toEqual(reachAfresh(m)));
    // (and as solidReach works it out with no marks given)
    fixtures.forEach((m, i) => expect(reach[i]).toEqual(solidReach(m, style3dOf({}))));
  });

  it("puts what a molecule says over it in the same place from the marks already made as from its marks made again", () => {
    const style = style3dOf({});
    // (carbons alone, no hydrogen in its file: said over it)
    const m = block(3);
    const again = notePictureMarks(m, style, 12);
    expect(again.length).toBeGreaterThan(0);
    expect(notePictureMarks(m, style, 12, undefined, pictureMarks(m, style))).toEqual(again);
  });

  /** A zigzag of thirty carbons 1.54 Å apart, no hydrogen in its file and its bond orders not known, its two ends' distance measured. */
  const chain: Carried3D = {
    atoms: Array.from({ length: 30 }, (_, i) => ({ el: "C", x: 1.27 * i, y: i % 2 ? 0.43 : -0.43, z: 0 })),
    bonds: Array.from({ length: 29 }, (_, i) => ({ a1: i, a2: i + 1, order: 1 })),
    bondOrders: "unknown",
    at: { x: 0, y: 0 },
    measures: [{ id: 1, atoms: [0, 29] }],
  } as Carried3D;
  const boxOf = (m: { label: { x: number; y: number }; text: string; size: number }, family: string | undefined) => measureLabelBox(m, family);
  const apart = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
    Math.min(a.max.x, b.max.x) <= Math.max(a.min.x, b.min.x) || Math.min(a.max.y, b.max.y) <= Math.max(a.min.y, b.min.y);

  it("writes what a molecule says over it clear of its measurements' values, inside the picture", () => {
    const { layout, opts } = drawingLayout({ atoms: [], bonds: [], molecules3d: [chain] } as unknown as Parameters<typeof drawingLayout>[0], aromatic, ACS_1996);
    const family = labelSetOf(opts).fontFamily;
    const marks = layout.measures ?? [];
    const values = marks.filter((m) => m.lines.length);
    const notes = marks.filter((m) => !m.lines.length);
    expect(values).toHaveLength(1);
    expect(notes.length).toBeGreaterThanOrEqual(2);
    const { min, max } = layout.bounds;
    for (const note of notes) {
      const box = boxOf(note, family);
      expect(apart(box, boxOf(values[0], family))).toBe(true);
      for (const other of notes) if (other !== note) expect(apart(box, boxOf(other, family))).toBe(true);
      expect(box.min.x).toBeGreaterThanOrEqual(min.x);
      expect(box.max.x).toBeLessThanOrEqual(max.x);
      expect(box.min.y).toBeGreaterThanOrEqual(min.y);
      expect(box.max.y).toBeLessThanOrEqual(max.y);
    }
  });

  it("writes what a molecule says just where it did when no value is in its way", () => {
    const style = style3dOf({});
    const m = { ...chain, measures: [] } as Carried3D;
    // (a value far off it changes nothing)
    const far = { x: 1000, y: 0, hx: 1, hy: 1 };
    expect(notePictureMarks(m, style, 12, undefined, undefined, [far])).toEqual(notePictureMarks(m, style, 12));
  });

  it("are none, made a step at a time, once a copy begun since no longer wants them", async () => {
    const solid = { atoms: [], bonds: [], molecules3d: [water] };
    expect(await pictureItems(solid, aromatic, ACS_1996, null, 300, () => true)).toEqual([]);
    expect((await pictureItems(solid, aromatic, ACS_1996, null, 300, () => false)).length).toBeGreaterThan(0);
  });
});

describe("a render a step at a time", () => {
  /** Three steps, what it made let go however it ends: what happened, in order. */
  function* steps(seen: string[]): Generator<void, string, void> {
    try {
      seen.push("made");
      yield;
      seen.push("scene");
      yield;
      seen.push("drawn");
      return "picture";
    } finally {
      seen.push("let go");
    }
  }

  it("gives the picture, the page given a turn between its steps", async () => {
    const seen: string[] = [];
    const done = steppedThrough(steps(seen));
    // (nothing past the first step until the page has had its turn)
    expect(seen).toEqual(["made"]);
    expect(await done).toBe("picture");
    expect(seen).toEqual(["made", "scene", "drawn", "let go"]);
  });

  it("stops at the next step once it is no longer wanted, and lets go of what it made", async () => {
    const seen: string[] = [];
    let wanted = true;
    const done = steppedThrough(steps(seen), () => !wanted);
    wanted = false;
    expect(await done).toBeNull();
    expect(seen).toEqual(["made", "let go"]);
  });
});
