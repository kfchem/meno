import { describe, expect, it } from "vitest";
import { solidOf, stereoMarks3d, stereoPictureSpots3d, STEREO_APART, WORLD_PER_ANGSTROM } from "./molecule3d";
import { bondRadiusOf } from "../../../../lib/chem/style3d";
import { style3dOf } from "../style3d";
import { MARK_SCALE, stereoTextEms } from "../chem/marks";
import type { Carried3D, Molecule3D } from "../store/types";

const style = style3dOf({});
// (a stereocentre whose four bonds all go down the page and to either side: its widest way out is up)
const centre: Carried3D = {
  name: "c",
  atoms: [
    { el: "C", x: 0, y: 0, z: 0 },
    { el: "F", x: -1.2, y: -0.8, z: 0 },
    { el: "Cl", x: 1.2, y: -0.8, z: 0 },
    { el: "Br", x: 0, y: -0.6, z: 1.3 },
    { el: "H", x: 0, y: -0.4, z: -1 },
  ],
  bonds: [1, 2, 3, 4].map((i) => ({ a1: 0, a2: i, order: 1 })),
  at: { x: 10, y: 5 },
  stereo: { atoms: { 0: "R" }, bonds: {} },
} as unknown as Carried3D;
const shown = { atoms: [0], bonds: [] };
const FONT = 0.3;
const GAP = 0.35;

describe("stereoMarks3d", () => {
  it("gives those named, each with the atoms whose ways out it keeps clear of; none where none are named", () => {
    const m = { ...centre, stereo: { atoms: { 0: "R" }, bonds: { 0: "E" } } } as unknown as Pick<Molecule3D, "stereo" | "bonds">;
    expect(stereoMarks3d(m, shown)).toEqual([{ key: "a0", atoms: [0], around: [1, 2, 3, 4], text: "R" }]);
    expect(stereoMarks3d(m, { atoms: [], bonds: [0] })).toEqual([{ key: "b0", atoms: [0, 1], around: [1, 2, 3, 4, 0], text: "E" }]);
    expect(stereoMarks3d(m, null)).toEqual([]);
  });
});

describe("stereoPictureSpots3d", () => {
  const solid = solidOf({ ...centre, id: 0 } as Molecule3D, style);
  const radius = () => solid.radii.primary[0];
  // (the molecule is placed about its own centre: where its C stands on the page, `mag` times as far from it)
  const atomY = (mag = 1) => centre.at.y + mag * solid.frames[0][1];

  it("puts R the widest way out between its bonds - up the page, where they all go down - clear of its ball by the style's gap", () => {
    const [spot] = stereoPictureSpots3d(centre, style, shown, FONT, GAP, false);
    expect(spot.text).toBe("R");
    expect(spot.x).toBeCloseTo(centre.at.x, 6);
    // (its box's lowest edge as far above the atom as the canvas sets it: its ball, and the gap, in ems of the labels)
    const halfHeight = FONT * 0.45;
    expect(spot.y - halfHeight - atomY()).toBeCloseTo(radius() + (GAP * FONT) / MARK_SCALE, 3);
  });

  it("sees the molecule as the picture does: turned and magnified as it is shown", () => {
    // (turned half round about the line of sight: its bonds now go up the page, and R goes down)
    const turned = { ...centre, turn: [0, 0, 1, 0] } as Carried3D;
    const [down] = stereoPictureSpots3d(turned, style, shown, FONT, GAP, false);
    const reach = radius() + (GAP * FONT) / MARK_SCALE;
    expect(down.x).toBeCloseTo(centre.at.x, 6);
    expect(centre.at.y - solid.frames[0][1] - (down.y + FONT * 0.45)).toBeCloseTo(reach, 3);
    // (a quarter turn, anticlockwise: its bonds now go right, and R stands to the left, its box's right edge `reach` off)
    const quarter = { ...centre, turn: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } as Carried3D;
    const [left] = stereoPictureSpots3d(quarter, style, shown, FONT, GAP, false);
    const halfWidth = FONT * (stereoTextEms("R", false) / 2 + 0.1);
    expect(left.y).toBeCloseTo(centre.at.y, 6);
    expect(centre.at.x - solid.frames[0][1] - (left.x + halfWidth)).toBeCloseTo(reach, 3);
    const big = { ...centre, magnified: 2 } as Carried3D;
    const [far] = stereoPictureSpots3d(big, style, shown, FONT, GAP, false);
    expect(far.y - FONT * 0.45 - atomY(2)).toBeCloseTo(2 * radius() + (GAP * FONT) / MARK_SCALE, 3);
  });

  it("keeps off what is already written over the molecule - a measurement's value - and two labels apart", () => {
    const [free] = stereoPictureSpots3d(centre, style, shown, FONT, GAP, false);
    // (a value where R would go: R goes elsewhere, clear of it)
    const value = { x: free.x, y: free.y, hx: FONT * 2, hy: FONT };
    const [moved] = stereoPictureSpots3d(centre, style, shown, FONT, GAP, false, [value]);
    const half = { x: FONT * (stereoTextEms("R", false) / 2 + 0.1), y: FONT * 0.45 };
    const clear = Math.abs(moved.x - value.x) >= half.x + value.hx - 1e-9 || Math.abs(moved.y - value.y) >= half.y + value.hy - 1e-9;
    expect(clear).toBe(true);
    // (two centres side by side, each's widest way out leaning toward the other's: their labels a little way apart, not just clear)
    const d = 1.2;
    const font = 0.6;
    const hs = (side: number) => [140, 230, 300].map((deg) => ({ el: "H", x: side * (d / 2 - Math.cos((deg * Math.PI) / 180)), y: Math.sin((deg * Math.PI) / 180), z: 0 }));
    const two = {
      ...centre,
      atoms: [{ el: "C", x: -d / 2, y: 0, z: 0 }, { el: "C", x: d / 2, y: 0, z: 0 }, ...hs(-1), ...hs(1)],
      bonds: [{ a1: 0, a2: 1, order: 1 }, ...[2, 3, 4].map((i) => ({ a1: 0, a2: i, order: 1 })), ...[5, 6, 7].map((i) => ({ a1: 1, a2: i, order: 1 }))],
      stereo: { atoms: { 0: "R", 1: "S" }, bonds: {} },
    } as unknown as Carried3D;
    const [a, b] = stereoPictureSpots3d(two, style, { atoms: [0, 1], bonds: [] }, font, GAP, false);
    const halfWide = font * (stereoTextEms("R", false) / 2 + 0.1);
    const apart = Math.max(Math.abs(a.x - b.x) - 2 * halfWide, Math.abs(a.y - b.y) - 2 * font * 0.45);
    // (STEREO_APART: 0.6 ems)
    expect(STEREO_APART).toBe(0.6);
    expect(apart).toBeGreaterThanOrEqual(0.6 * font - 1e-6);
  });

  it("puts E off its double bond's middle by the bond's own radius and the gap, the widest way out - up, its groups going down", () => {
    const alkene = {
      name: "e",
      atoms: [
        { el: "C", x: -0.67, y: 0, z: 0 },
        { el: "C", x: 0.67, y: 0, z: 0 },
        { el: "F", x: -1.4, y: -1.1, z: 0 },
        { el: "Cl", x: 1.4, y: -1.1, z: 0 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 2 },
        { a1: 0, a2: 2, order: 1 },
        { a1: 1, a2: 3, order: 1 },
      ],
      at: { x: 0, y: 0 },
      stereo: { atoms: {}, bonds: { 0: "E" } },
    } as unknown as Carried3D;
    const s = solidOf({ ...alkene, id: 0 } as Molecule3D, style);
    const middle = { x: (s.frames[0][0] + s.frames[0][3]) / 2, y: (s.frames[0][1] + s.frames[0][4]) / 2 };
    const [e] = stereoPictureSpots3d(alkene, style, { atoms: [], bonds: [0] }, FONT, GAP, false);
    expect(e.text).toBe("E");
    expect(e.x).toBeCloseTo(middle.x, 6);
    expect(e.y - FONT * 0.45 - middle.y).toBeCloseTo(bondRadiusOf(style.primary) * WORLD_PER_ANGSTROM + (GAP * FONT) / MARK_SCALE, 3);
  });

  it("keeps off a bond crossing its widest way out", () => {
    // (a bond of two atoms far either side, running across above the centre where R would stand)
    const crossed = {
      ...centre,
      atoms: [...centre.atoms, { el: "C", x: -5, y: 0.75, z: 0 }, { el: "C", x: 5, y: 0.75, z: 0 }],
      bonds: [...centre.bonds, { a1: 5, a2: 6, order: 1 }],
    } as unknown as Carried3D;
    const s = solidOf({ ...crossed, id: 0 } as Molecule3D, style);
    const lineY = crossed.at.y + s.frames[0][16];
    const [r] = stereoPictureSpots3d(crossed, style, shown, FONT, GAP, false);
    const stick = bondRadiusOf(style.primary) * WORLD_PER_ANGSTROM;
    expect(Math.abs(r.y - lineY)).toBeGreaterThanOrEqual(FONT * 0.45 + stick - 1e-6);
    // (where it would stand without the bond: straight up, over the line)
    const [free] = stereoPictureSpots3d({ ...crossed, bonds: centre.bonds } as Carried3D, style, shown, FONT, GAP, false);
    expect(Math.abs(free.y - lineY)).toBeLessThan(FONT * 0.45 + stick);
  });

  it("gives none for a centre past the molecule's atoms", () => {
    expect(stereoPictureSpots3d({ ...centre, stereo: { atoms: { 9: "R" }, bonds: {} } } as unknown as Carried3D, style, { atoms: [9], bonds: [] }, FONT, GAP, false)).toEqual([]);
  });

  it("gives none where none are shown", () => {
    expect(stereoPictureSpots3d(centre, style, null, FONT, GAP, false)).toEqual([]);
    expect(stereoPictureSpots3d({ ...centre, stereo: undefined } as Carried3D, style, shown, FONT, GAP, false)).toEqual([]);
  });
});
