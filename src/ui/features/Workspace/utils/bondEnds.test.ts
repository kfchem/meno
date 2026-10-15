import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { acceptStyle3dChoice, BALL_AND_STICK, look3dPreset, lookOfStyle, style3dOf, DEFAULT_STYLE_3D_CHOICE, withLookSetting, type BondEnds, type MoleculeLook, type Style3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import { bentLinesOf, bondLines, bondReach, endsAt, endsShow, linesBetween, solidOf, WORLD_PER_ANGSTROM } from "./molecule3d";
import { bentCourse, bentPieces, stickBends } from "./stickBend";

/** Formaldehyde, flat: its oxygen lone at the end of a double bond. */
const formaldehyde = (): Molecule3D => ({
  id: 1,
  atoms: [
    { el: "C", x: 0, y: 0, z: 0 },
    { el: "O", x: 1.21, y: 0, z: 0 },
    { el: "H", x: -0.55, y: 0.94, z: 0 },
    { el: "H", x: -0.55, y: -0.94, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 2 },
    { a1: 0, a2: 2, order: 1 },
    { a1: 0, a2: 3, order: 1 },
  ],
  at: { x: 0, y: 0 },
});

/** Hydrogen cyanide: its nitrogen lone at the end of a triple bond. */
const cyanide = (): Molecule3D => ({
  id: 2,
  atoms: [
    { el: "H", x: -1.07, y: 0, z: 0 },
    { el: "C", x: 0, y: 0, z: 0 },
    { el: "N", x: 1.16, y: 0, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 3 },
  ],
  at: { x: 0, y: 0 },
});

const sticks = look3dPreset("licorice").look;
const withEnds = (look: MoleculeLook, ends: BondEnds): MoleculeLook => ({ ...look, doubleEnds: ends, tripleEnds: ends });
const styleOf = (look: MoleculeLook): Style3D => ({ ...style3dOf(DEFAULT_STYLE_3D_CHOICE), primary: look, secondary: look });
const r = 0.16 * WORLD_PER_ANGSTROM;
const linesIn = (m: Molecule3D, look: MoleculeLook) => {
  const solid = solidOf(m, styleOf(look));
  const p = solid.frames[0];
  return { solid, lines: bondLines(m, p, r, solid.ends.primary), at: (i: number) => new THREE.Vector3(p[3 * i], p[3 * i + 1], p[3 * i + 2]) };
};

describe("how a double or triple bond's lines end at a lone atom", () => {
  it("are settings of every style, plain unless it is sticks alone - curving in there", () => {
    expect(BALL_AND_STICK.doubleEnds).toBe("plain");
    expect(BALL_AND_STICK.tripleEnds).toBe("plain");
    expect([sticks.doubleEnds, sticks.tripleEnds]).toEqual(["curve", "curve"]);
  });

  it("cost nothing where a style's balls cover the lines' ends: no ends worked out, nothing drawn apart", () => {
    // (every style but sticks alone, as built in)
    for (const id of ["balls", "glossy", "outlined", "print", "pastel", "modelKit", "space"]) {
      const look = look3dPreset(id).look;
      for (const m of [formaldehyde(), cyanide()]) {
        expect([id, endsAt(m, look)]).toEqual([id, null]);
        expect(bentLinesOf(m, solidOf(m, styleOf(look)))).toBeNull();
      }
    }
    // (set to curve, where the balls do cover them: none either - a carbonyl's oxygen in ball and stick)
    for (const id of ["balls", "glossy", "outlined", "space"]) expect([id, endsAt(formaldehyde(), withEnds(look3dPreset(id).look, "curve"))]).toEqual([id, null]);
    // (sticks alone, plain: none either)
    expect(endsAt(formaldehyde(), withEnds(sticks, "plain"))).toBeNull();
    expect(endsShow(BALL_AND_STICK, 2)).toBe(false);
    expect(endsShow(sticks, 2)).toBe(true);
    expect(endsShow(look3dPreset("space").look, 3)).toBe(false);
  });

  it("curve: side by side, then turning round at the lone atom - a double bond's two, a triple's outer two, as one tube", () => {
    const m = formaldehyde();
    const { solid, lines, at } = linesIn(m, sticks);
    const [l1, l2] = lines;
    expect(l1.bend?.atB).toBe(true);
    // (each comes in by as much as it stands off the axis, to the oxygen's centre - the two from either side)
    expect(l1.bend!.by.clone().add(l1.b).distanceTo(at(1))).toBeCloseTo(0, 6);
    expect(l2.bend!.by.clone().add(l1.bend!.by).length()).toBeCloseTo(0, 9);
    // (the lone atom no ball of its own beyond the lines: as thin as they are, inside the turn)
    expect(solid.radii.primary[1]).toBeCloseTo(l1.r, 6);
    // (the single bonds, straight)
    expect(lines.slice(2).every((l) => !l.bend)).toBe(true);
    expect(bentLinesOf(m, solid)).toEqual([0, 1]);
    // (a triple's outer two turning round as one, its middle one straight in to the atom's centre, inside the turn)
    const hcn = linesIn(cyanide(), sticks);
    expect(hcn.lines.slice(1).map((l) => !!l.bend)).toEqual([true, false, true]);
    expect(hcn.lines[2].b.distanceTo(hcn.at(2))).toBeCloseTo(0, 9);
  });

  it("curve: straight, then round a half circle about the axis - smoothly - arriving at the atom across the bond", () => {
    const { lines, at } = linesIn(formaldehyde(), sticks);
    const line = lines[0];
    const pieces = bentPieces(line);
    expect(pieces[0].a.distanceTo(line.a)).toBeCloseTo(0, 9);
    // (ending on the bond's axis, at the oxygen's centre)
    expect(pieces[pieces.length - 1].b.distanceTo(at(1))).toBeCloseTo(0, 6);
    for (let i = 1; i < pieces.length; i++) expect(pieces[i].a.distanceTo(pieces[i - 1].b)).toBeCloseTo(0, 9);
    // (standing off a fifth of the bond: straight to a fifth short of the atom, then a quarter circle - half of the U - arriving across it)
    const end = bentCourse(1, 0.2);
    expect([end.across, end.along, end.dAlong]).toEqual([expect.closeTo(0, 9), expect.closeTo(1, 9), expect.closeTo(0, 9)]);
    expect(bentCourse(0.5, 0.2)).toEqual({ across: 1, along: expect.closeTo(0.8, 9), dAcross: 0, dAlong: expect.closeTo(1.6, 9) });
    // (no kink where it starts to turn: still going straight along)
    expect(bentCourse(0.5 + 1e-6, 0.2).dAcross).toBeCloseTo(0, 3);
    // (round about a centre on the axis: as far from it all the way as it stood off)
    for (const u of [0.6, 0.75, 0.9]) {
      const c = bentCourse(u, 0.2);
      expect(Math.hypot(c.across * 0.2, c.along - 0.8)).toBeCloseTo(0.2, 9);
    }
    // (as its instance takes it: across its stick, in stick radii, toward its b end)
    const bend = stickBends([line]);
    expect(Math.hypot(bend[0], bend[2])).toBeCloseTo(line.bend!.by.length() / line.r, 6);
    expect(bend[3]).toBe(1);
    expect([...stickBends([{ ...line, bend: undefined }])]).toEqual([0, 0, 0, 1]);
  });

  it("joint: plain lines, the lone atom's ball as large as takes all their ends in", () => {
    const { solid, lines } = linesIn(formaldehyde(), withEnds(sticks, "joint"));
    expect(lines.every((l) => !l.bend)).toBe(true);
    expect(solid.radii.primary[1]).toBeCloseTo(bondReach(2, r), 6);
    expect(linesIn(cyanide(), withEnds(sticks, "joint")).solid.radii.primary[2]).toBeCloseTo(bondReach(3, r), 6);
  });

  it("main stick: one full stick on the axis, the others thinner beside it and short of both atoms", () => {
    const { lines, at } = linesIn(cyanide(), withEnds(sticks, "main"));
    const [, main, s1, s2] = lines;
    expect(main.r).toBeCloseTo(r, 9);
    expect(main.a.distanceTo(at(1))).toBeCloseTo(0, 9);
    expect(main.b.distanceTo(at(2))).toBeCloseTo(0, 9);
    for (const s of [s1, s2]) {
      expect(s.r).toBeLessThan(r);
      expect(s.a.distanceTo(s.b)).toBeLessThan(main.a.distanceTo(main.b) * 0.7);
    }
    // (as many lines as a triple bond's always: three)
    expect(lines).toHaveLength(4);
  });

  it("fork: each from where it stands at the other atom straight to the lone atom's centre", () => {
    const { lines, at } = linesIn(formaldehyde(), withEnds(sticks, "fork"));
    const centre = at(1);
    expect(lines[0].b.distanceTo(centre)).toBeCloseTo(0, 6);
    expect(lines[1].b.distanceTo(centre)).toBeCloseTo(0, 6);
    expect(lines[0].a.distanceTo(lines[1].a)).toBeGreaterThan(0.1);
  });

  it("go over from one look's to another's smoothly, line by line", () => {
    const m = formaldehyde();
    const plain = linesIn(m, withEnds(sticks, "plain")).lines;
    const curve = linesIn(m, sticks).lines;
    const half = linesBetween(plain, curve, 0.5);
    expect(half[0].bend!.by.length()).toBeCloseTo(curve[0].bend!.by.length() / 2, 9);
    expect(linesBetween(plain, curve, 0)).toBe(plain);
    expect(linesBetween(plain, curve, 1)).toBe(curve);
  });

  it("is chosen in Settings among five, each kept by the settings file as set", () => {
    for (const key of ["doubleEnds", "tripleEnds"] as const) {
      for (const ends of ["curve", "joint", "main", "fork", "plain"] as const) {
        const choice = withLookSetting(DEFAULT_STYLE_3D_CHOICE, "balls", key, ends);
        const read = acceptStyle3dChoice(JSON.parse(JSON.stringify(choice)));
        expect([key, lookOfStyle(read, "balls")[key]]).toEqual([key, ends]);
      }
    }
  });
});
