import { describe, expect, it } from "vitest";
import { labelSpot, solidOf, stereoMarks3d, stereoPictureSpots3d, stereoSpotsShown, STEREO_APART, WORLD_PER_ANGSTROM, type StereoMark3D } from "./molecule3d";
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

describe("the canvas's R, S, E and Z, against a picture of the molecule", () => {
  // ((E)-hex-4-ene-3-ol, 2-chloro - C/C=C/[C@@H](O)[C@H](C)Cl - written by hand: its C-3 R, its C-2 S, its C=C E)
  const mol: Carried3D = {
    name: "chlorohexenol",
    atoms: [
      { el: "C", x: -3.8, y: 0.5, z: 0 },
      { el: "C", x: -2.5, y: 0, z: 0 },
      { el: "C", x: -1.3, y: 0.6, z: 0 },
      { el: "C", x: 0, y: -0.1, z: 0 },
      { el: "O", x: 0.2, y: -1.5, z: 0.3 },
      { el: "C", x: 1.3, y: 0.6, z: 0 },
      { el: "C", x: 2.5, y: -0.2, z: 0.3 },
      { el: "Cl", x: 1.5, y: 2.2, z: -0.6 },
      { el: "H", x: -0.1, y: 0.2, z: 1.05 },
      { el: "H", x: 1.2, y: 0.8, z: 1.05 },
      { el: "H", x: 1.0, y: -1.8, z: -0.1 },
    ],
    bonds: [
      [0, 1, 1],
      [1, 2, 2],
      [2, 3, 1],
      [3, 4, 1],
      [3, 5, 1],
      [5, 6, 1],
      [5, 7, 1],
      [3, 8, 1],
      [5, 9, 1],
      [4, 10, 1],
    ].map(([a1, a2, order]) => ({ a1, a2, order })),
    at: { x: 4, y: 3 },
    stereo: { atoms: { 3: "R", 5: "S" }, bonds: { 1: "E" } },
  } as unknown as Carried3D;
  const all = { atoms: [3, 5], bonds: [1] };

  /** The canvas's spots for `m`, its marks given in `given` order (by index into those named) and `going` beside them, at `zoom`; and the picture's on the canvas's pixels. */
  const both = (m: Carried3D, shown: { atoms: number[]; bonds: number[] }, font: number, zoom: number, given: number[], going: StereoMark3D[] = []) => {
    const picture = stereoPictureSpots3d(m, style, shown, font, GAP, false);
    const solid = solidOf({ ...m, id: 0 } as Molecule3D, style);
    const places = solid.frames[0];
    const radii = solid.radii.primary;
    const bondR = bondRadiusOf(style.primary) * WORLD_PER_ANGSTROM;
    const named = stereoMarks3d(m, shown);
    const screen = (x: number, y: number) => ({ x: (m.at.x + x) * zoom, y: -(m.at.y + y) * zoom });
    const balls = m.atoms.map((_, i) => ({ ...screen(places[3 * i], places[3 * i + 1]), r: radii[i] * zoom }));
    const sticks = m.bonds.map((b) => ({ a: balls[b.a1], b: balls[b.a2], r: bondR * zoom }));
    const entry = (mark: StereoMark3D, leaving = false) => {
      const p = mark.atoms.reduce((s, i) => ({ x: s.x + places[3 * i] / mark.atoms.length, y: s.y + places[3 * i + 1] / mark.atoms.length }), { x: 0, y: 0 });
      return { mark, leaving, o: screen(p.x, p.y), own: (mark.atoms.length === 1 ? radii[mark.atoms[0]] : bondR) * zoom };
    };
    const canvas = stereoSpotsShown([...going.map((g) => entry(g, true)), ...given.map((k) => entry(named[k]))], named, balls, sticks, [], font * zoom, GAP, false);
    return named.map((mark, k) => ({ text: mark.text, canvas: canvas.get(mark.key)!, picture: { x: picture[k].x * zoom, y: -picture[k].y * zoom }, pictureText: picture[k].text }));
  };

  it("stands two centres' labels as the picture does though shown the other way round, one going first beside them: each leaning to the other", () => {
    // (two centres side by side, each's widest way out leaning toward the other's: which is placed first decides both)
    const d = 1.2;
    const hs = (side: number) => [140, 230, 300].map((deg) => ({ el: "H", x: side * (d / 2 - Math.cos((deg * Math.PI) / 180)), y: Math.sin((deg * Math.PI) / 180), z: 0 }));
    const two = {
      ...centre,
      atoms: [{ el: "C", x: -d / 2, y: 0, z: 0 }, { el: "C", x: d / 2, y: 0, z: 0 }, ...hs(-1), ...hs(1)],
      bonds: [{ a1: 0, a2: 1, order: 1 }, ...[2, 3, 4].map((i) => ({ a1: 0, a2: i, order: 1 })), ...[5, 6, 7].map((i) => ({ a1: 1, a2: i, order: 1 }))],
      stereo: { atoms: { 0: "R", 1: "S" }, bonds: {} },
    } as unknown as Carried3D;
    // (an S going on the first centre's place, given before them: no obstacle to them)
    const going: StereoMark3D = { key: "a2", atoms: [0], around: [1, 2, 3, 4], text: "S" };
    for (const zoom of [20, 60]) {
      for (const r of both(two, { atoms: [0, 1], bonds: [] }, 0.6, zoom, [1, 0], [going])) {
        expect(Math.hypot(r.canvas.x - r.picture.x, r.canvas.y - r.picture.y), `${r.text} at ${zoom}`).toBeLessThan(1e-6 * zoom);
      }
    }
  });

  it("stands each where the picture stands it, whatever order they were shown in, one going beside them, at any zoom", () => {
    const picture = stereoPictureSpots3d(mol, style, all, FONT, GAP, false);
    const solid = solidOf({ ...mol, id: 0 } as Molecule3D, style);
    const places = solid.frames[0];
    const radii = solid.radii.primary;
    const bondR = bondRadiusOf(style.primary) * WORLD_PER_ANGSTROM;
    const named = stereoMarks3d(mol, all);
    for (const zoom of [12, 40, 90]) {
      // (as the canvas sees it: its pixels, y down)
      const screen = (x: number, y: number) => ({ x: (mol.at.x + x) * zoom, y: -(mol.at.y + y) * zoom });
      const balls = mol.atoms.map((_, i) => ({ ...screen(places[3 * i], places[3 * i + 1]), r: radii[i] * zoom }));
      const sticks = mol.bonds.map((b) => ({ a: balls[b.a1], b: balls[b.a2], r: bondR * zoom }));
      const entry = (mark: StereoMark3D, leaving = false) => {
        const p = mark.atoms.reduce((s, i) => ({ x: s.x + places[3 * i] / mark.atoms.length, y: s.y + places[3 * i + 1] / mark.atoms.length }), { x: 0, y: 0 });
        return { mark, leaving, o: screen(p.x, p.y), own: (mark.atoms.length === 1 ? radii[mark.atoms[0]] : bondR) * zoom };
      };
      // (shown in another order than named - E, then S, then R - and an R on the methyl's carbon going)
      const going: StereoMark3D = { key: "a6", atoms: [6], around: [5], text: "R" };
      const entries = [entry(named[2]), entry(named[1]), entry(named[0]), entry(going, true)];
      const canvas = stereoSpotsShown(entries, named, balls, sticks, [], FONT * zoom, GAP, false);
      named.forEach((mark, k) => {
        const c = canvas.get(mark.key)!;
        const o = entry(mark).o;
        // (the picture's, its y up, on the canvas's pixels)
        const want = { x: picture[k].x * zoom, y: -picture[k].y * zoom };
        const side = (p: { x: number; y: number }) => Math.atan2(p.y - o.y, p.x - o.x);
        expect(picture[k].text, `${zoom}`).toBe(mark.text);
        expect(Math.abs(Math.atan2(Math.sin(side(c) - side(want)), Math.cos(side(c) - side(want)))), `${mark.text} at ${zoom}`).toBeLessThan(1e-6);
        expect(Math.hypot(c.x - want.x, c.y - want.y), `${mark.text} at ${zoom}`).toBeLessThan(1e-6 * zoom);
      });
    }
  });
});

describe("the canvas's labels going", () => {
  // (in pixels, y down: two centres 40 apart on a line, each with one bond out away from the other - so each one's widest way out is
  // toward the other - and a third centre above them, its bond out going up; a label shown on the first; those on the second and the third going)
  const font = 12;
  const balls = [
    { x: 0, y: 0, r: 8 },
    { x: 40, y: 0, r: 8 },
    { x: -40, y: 0, r: 6 },
    { x: 80, y: 0, r: 6 },
    { x: 30, y: -50, r: 8 },
    { x: 30, y: -90, r: 6 },
  ];
  const sticks = [
    { a: balls[0], b: balls[2], r: 3 },
    { a: balls[1], b: balls[3], r: 3 },
    { a: balls[4], b: balls[5], r: 3 },
  ];
  const mark = (i: number, around: number[], text: string): StereoMark3D => ({ key: `a${i}`, atoms: [i], around, text });
  const shownMark = mark(0, [2], "R");
  const going = mark(1, [3], "S");
  const third = mark(4, [5], "R");
  const entry = (m: StereoMark3D, leaving: boolean) => ({ mark: m, leaving, o: { x: balls[m.atoms[0]].x, y: balls[m.atoms[0]].y }, own: balls[m.atoms[0]].r });
  const overlaps = (p: { x: number; y: number; hx: number; hy: number }, q: { x: number; y: number; hx: number; hy: number }) =>
    Math.abs(p.x - q.x) < p.hx + q.hx - 1e-9 && Math.abs(p.y - q.y) < p.hy + q.hy - 1e-9;
  const kept = (s: { x: number; y: number; hx: number; hy: number }) => ({ ...s, hx: s.hx + STEREO_APART * font, hy: s.hy + STEREO_APART * font });
  const spots = (entries: ReturnType<typeof entry>[], placed: { x: number; y: number; hx: number; hy: number }[] = []) =>
    stereoSpotsShown(entries, [shownMark], balls, sticks, placed, font, GAP, false);

  it("each has a place, clear of those shown by the margin labels keep - and those shown stand as they would with none going", () => {
    // (where it stands alone, the going label's place is over the shown one's: the case where keeping clear of it matters)
    const alone = spots([entry(going, false)]).get(going.key)!;
    const shown = spots([entry(shownMark, false)]).get(shownMark.key)!;
    expect(overlaps(alone, kept(shown))).toBe(true);
    const both = spots([entry(going, true), entry(shownMark, false)]);
    expect(both.get(shownMark.key)).toEqual(shown);
    const g = both.get(going.key);
    expect(g).toBeDefined();
    expect(overlaps(g!, kept(shown))).toBe(false);
  });

  it("keeps clear of what is already written over the molecule", () => {
    // (a measurement's value written where the going label would stand, shown label or none)
    const free = spots([entry(going, true), entry(shownMark, false)]).get(going.key)!;
    const value = { x: free.x, y: free.y, hx: 14, hy: 8 };
    const g = spots([entry(going, true), entry(shownMark, false)], [value]).get(going.key)!;
    expect(overlaps(g, value)).toBe(false);
  });

  it("stands each where it would with no other going: those going are no obstacle to each other", () => {
    const one = spots([entry(going, true), entry(shownMark, false)]).get(going.key)!;
    const two = spots([entry(third, true), entry(going, true), entry(shownMark, false)]);
    // (the two going stand over each other: were one an obstacle to the next, the second would move)
    expect(overlaps(two.get(third.key)!, two.get(going.key)!)).toBe(true);
    expect(two.get(going.key)).toEqual(one);
    expect(two.get(third.key)).toEqual(spots([entry(third, true), entry(shownMark, false)]).get(third.key));
  });
});

describe("a label's place, at any scale", () => {
  it("is the same in the canvas's pixels as in the page's units: what counts as clear is a share of the label's own size", () => {
    // (a label tried first to the right of its point, a ball just touching that place: covered by a hundredth of the ball's size)
    const half = { x: 0.5, y: 0.45 };
    const first = labelSpot({ x: 0, y: 0 }, 1, half, { x: 1, y: 0 }, [], []);
    const ball = { x: first.x + first.hx + 1 - 0.1, y: first.y, r: 1 };
    const at = (k: number) => {
      const s = labelSpot({ x: 0, y: 0 }, k, { x: half.x * k, y: half.y * k }, { x: 1, y: 0 }, [{ x: ball.x * k, y: ball.y * k, r: ball.r * k }], []);
      return { x: s.x / k, y: s.y / k };
    };
    for (const k of [1, 12, 60, 200]) {
      expect(at(k).x, `${k}`).toBeCloseTo(at(0.1).x, 9);
      expect(at(k).y, `${k}`).toBeCloseTo(at(0.1).y, 9);
    }
    // (and that ball is not covered: the label went round it)
    expect(at(1).y).not.toBeCloseTo(first.y, 6);
  });
});
