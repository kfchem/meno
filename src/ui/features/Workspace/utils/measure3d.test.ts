import { describe, expect, it } from "vitest";
import { solidOf, WORLD_PER_ANGSTROM } from "./molecule3d";
import { measureLabelBox } from "../../../../lib/chem/layout2d";
import type { Molecule3D } from "../store/types";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { dashesOf, kindOf, measureMarks, measurePictureMarks, measureText, measureValue, MEASURE_RADIUS } from "./measure3d";
import * as THREE from "three";

/** Atoms' places in world units, from ångströms. */
const places = (...xyz: number[][]) => Float32Array.from(xyz.flat(), (v) => v * WORLD_PER_ANGSTROM);

describe("a measurement on a molecule in 3D", () => {
  it("is a distance, an angle or a torsion angle by how many atoms it takes", () => {
    expect([kindOf([0, 1]), kindOf([0, 1, 2]), kindOf([0, 1, 2, 3])]).toEqual(["distance", "angle", "torsion"]);
  });

  it("comes to the distance in ångströms", () => {
    expect(measureValue(places([0, 0, 0], [1.2, 0.9, 0]), [0, 1])).toBeCloseTo(1.5, 6);
  });

  it("comes to the angle at the middle atom", () => {
    expect(measureValue(places([1, 0, 0], [0, 0, 0], [0, 2, 0]), [0, 1, 2])).toBeCloseTo(90, 6);
    expect(measureValue(places([1, 0, 0], [0, 0, 0], [-1, 1, 0]), [0, 1, 2])).toBeCloseTo(135, 6);
  });

  it("comes to the torsion angle with IUPAC's sign: clockwise, looking along the middle bond, positive", () => {
    // looking from atom 1 to atom 2 (along +z), atom 0 up, atom 3 to the
    // viewer's right: a quarter clockwise
    const p = places([0, 1, 0], [0, 0, 0], [0, 0, 1.5], [-1, 0, 1.5]);
    expect(measureValue(p, [0, 1, 2, 3])).toBeCloseTo(90, 6);
    expect(measureValue(places([0, 1, 0], [0, 0, 0], [0, 0, 1.5], [1, 0, 1.5]), [0, 1, 2, 3])).toBeCloseTo(-90, 6);
    // anti, and the same read from the other end
    expect(Math.abs(measureValue(places([0, 1, 0], [0, 0, 0], [0, 0, 1.5], [0, -1, 1.5]), [0, 1, 2, 3]))).toBeCloseTo(180, 6);
    expect(measureValue(p, [3, 2, 1, 0])).toBeCloseTo(90, 6);
  });

  it("is written as a chemist writes it", () => {
    expect(measureText("distance", 1.5349)).toBe("1.53 Å");
    expect(measureText("angle", 109.47)).toBe("109.5°");
    expect(measureText("torsion", -60.24)).toBe("−60.2°");
    expect(measureText("torsion", -0.01)).toBe("0.0°");
  });

  it("is shown by a dashed line for a distance, its value at the middle", () => {
    const marks = measureMarks(places([0, 0, 0], [1.5, 0, 0]), [0, 1]);
    expect(marks.dashed).toBe(true);
    expect(marks.lines).toHaveLength(2);
    expect(marks.label.x).toBeCloseTo(0.75 * WORLD_PER_ANGSTROM, 6);
  });

  it("is shown by an arc between the bonds for an angle, the value beyond its middle", () => {
    const marks = measureMarks(places([1, 0, 0], [0, 0, 0], [0, 1, 0]), [0, 1, 2]);
    expect(marks.dashed).toBe(false);
    // the arc's ends on the two bonds, the same way out
    const first = marks.lines[0];
    const last = marks.lines[marks.lines.length - 1];
    expect(first.y).toBeCloseTo(0, 6);
    expect(last.x).toBeCloseTo(0, 6);
    expect(first.length()).toBeCloseTo(last.length(), 6);
    expect(marks.label.x).toBeCloseTo(marks.label.y, 6);
    expect(marks.label.length()).toBeGreaterThan(first.length());
    expect(marks.fan.length % 3).toBe(0);
  });

  it("is shown about the middle bond for a torsion angle, square to it", () => {
    const marks = measureMarks(places([0, 1, 0], [0, 0, 0], [0, 0, 1.5], [-1, 0, 1.5]), [0, 1, 2, 3]);
    for (const p of marks.lines) expect(p.z).toBeCloseTo(0.75 * WORLD_PER_ANGSTROM, 6);
  });
});

describe("a measurement in a picture", () => {
  const water = {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.76, y: 0.59, z: 0 },
      { el: "H", x: -0.76, y: 0.59, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    at: { x: 10, y: 5 },
    measures: [{ id: 1, atoms: [1, 2] }, { id: 2, atoms: [1, 0, 2] }, { id: 3, atoms: [0, 9] }],
  };

  it("is dashed as on the canvas: whole dashes, as many as fit, inset by half a gap at each end", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(2 * WORLD_PER_ANGSTROM, 0, 0);
    const dashes = dashesOf(a, b);
    expect(dashes).toHaveLength(Math.round(2 / (0.16 + 0.11)));
    expect(dashes[0][0].x).toBeGreaterThan(0);
    expect(dashes[dashes.length - 1][1].x).toBeLessThan(b.x);
  });

  it("is drawn where the molecule stands, seen from straight above, turned as it is: a distance dashed, an angle an arc and a fan", () => {
    const marks = measurePictureMarks(water, STYLE_3D, 0.75);
    // (the third measurement names an atom it has not got: left out)
    expect(marks).toHaveLength(2);
    const [distance, angle] = marks;
    expect(distance.text).toBe("1.52 Å");
    expect(distance.label.x).toBeCloseTo(10, 6);
    expect(distance.fan).toHaveLength(0);
    expect(distance.width).toBeCloseTo(2 * MEASURE_RADIUS * WORLD_PER_ANGSTROM, 9);
    expect(angle.fan.length).toBeGreaterThan(0);
    expect(angle.text).toMatch(/°$/);
    // turned a half turn about y: the molecule's left and right swap, the distance's middle stays
    const turned = measurePictureMarks({ ...water, turn: [0, 1, 0, 0] }, STYLE_3D, 0.75)[0];
    expect(turned.label.x).toBeCloseTo(10, 6);
    expect(turned.lines[0][0].x).toBeCloseTo(2 * 10 - distance.lines[0][0].x, 6);
  });

  // an O and an N 2.87 Å apart, as in an amino alcohol, and a carbon off to one side
  const pair = (d: number) => ({
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "N", x: d, y: 0, z: 0 },
      { el: "C", x: d / 2, y: -1.2, z: 0 },
    ],
    bonds: [],
    at: { x: 0, y: 0 },
    measures: [{ id: 1, atoms: [0, 1] }],
  });
  /** Whether a value's box, as a picture writes it, covers any of the atoms' balls. */
  const coversAnAtom = (m: ReturnType<typeof pair>, mark: ReturnType<typeof measurePictureMarks>[number]) => {
    const solid = solidOf({ ...m, id: 0 } as unknown as Molecule3D, STYLE_3D);
    const box = measureLabelBox(mark, undefined);
    return Array.from({ length: m.atoms.length }, (_, i) => i).some((i) => {
      const x = solid.frames[0][3 * i] + m.at.x;
      const y = solid.frames[0][3 * i + 1] + m.at.y;
      const dx = Math.max(box.min.x - x, x - box.max.x, 0);
      const dy = Math.max(box.min.y - y, y - box.max.y, 0);
      return Math.hypot(dx, dy) < solid.radii.primary[i];
    });
  };

  it("writes a value on its line's middle when it covers no atom there", () => {
    const long = pair(9);
    const [mark] = measurePictureMarks(long, STYLE_3D, 0.75);
    const [a, b] = [mark.lines[0][0], mark.lines[mark.lines.length - 1][1]];
    expect(mark.label.x).toBeCloseTo((a.x + b.x) / 2, 1);
    expect(mark.label.y).toBeCloseTo((a.y + b.y) / 2, 6);
    expect(coversAnAtom(long, mark)).toBe(false);
  });

  it("moves a value off a short distance's line, away from the molecule, rather than cover the atoms it measures", () => {
    const short = pair(2.87);
    const [mark] = measurePictureMarks(short, STYLE_3D, 0.75);
    const lineY = mark.lines[0][0].y;
    // (the carbon is below the line: the value goes above it, clear of the balls)
    expect(mark.label.y).toBeGreaterThan(lineY);
    expect(coversAnAtom(short, mark)).toBe(false);
    // on the middle, it would have covered them
    expect(coversAnAtom(short, { ...mark, label: { x: mark.label.x, y: lineY } })).toBe(true);
  });

  it("keeps two values from covering each other", () => {
    const m = { ...pair(2.87), measures: [{ id: 1, atoms: [0, 1] }, { id: 2, atoms: [1, 0] }] };
    const [one, two] = measurePictureMarks(m, STYLE_3D, 0.75);
    const a = measureLabelBox(one, undefined);
    const b = measureLabelBox(two, undefined);
    const overlap = Math.min(a.max.x, b.max.x) > Math.max(a.min.x, b.min.x) && Math.min(a.max.y, b.max.y) > Math.max(a.min.y, b.min.y);
    expect(overlap).toBe(false);
  });
});
