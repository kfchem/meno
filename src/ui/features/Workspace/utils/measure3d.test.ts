import { describe, expect, it } from "vitest";
import { coveredLength, pictureMarks, solidOf, WORLD_PER_ANGSTROM } from "./molecule3d";
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
    expect(measureText("distance", 1.5349)).toBe("1.535 Å");
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
    expect(distance.text).toBe("1.520 Å");
    // (beside the line's middle, where it would cover a hydrogen's ball - "1.520 Å" a little wider than "1.52 Å" was)
    expect(Math.abs(distance.label.x - 10)).toBeLessThan(1.5);
    expect(distance.fan).toHaveLength(0);
    expect(distance.width).toBeCloseTo(2 * MEASURE_RADIUS * WORLD_PER_ANGSTROM, 9);
    expect(angle.fan.length).toBeGreaterThan(0);
    expect(angle.text).toMatch(/°$/);
    // turned a half turn about y: the molecule's left and right swap, the distance's middle stays
    const turned = measurePictureMarks({ ...water, turn: [0, 1, 0, 0] }, STYLE_3D, 0.75)[0];
    expect(Math.abs(turned.label.x - 10)).toBeLessThan(1.5);
    expect(turned.lines[0][0].x).toBeCloseTo(2 * 10 - distance.lines[0][0].x, 6);
  });

  it("leaves out a measurement of an atom its look leaves out, as the canvas does - a C-H, hydrogens on carbon hidden", () => {
    const methane = {
      atoms: [
        { el: "C", x: 0, y: 0, z: 0 },
        { el: "H", x: 1.09, y: 0, z: 0 },
        { el: "O", x: -1.43, y: 0, z: 0 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      at: { x: 0, y: 0 },
      measures: [{ id: 1, atoms: [0, 1] }, { id: 2, atoms: [0, 2] }],
    };
    expect(measurePictureMarks(methane, STYLE_3D, 0.75).map((x) => x.text)).toEqual(["1.090 Å", "1.430 Å"]);
    const hiding = { ...STYLE_3D, primary: { ...STYLE_3D.primary, hydrogens: "carbonHidden" as const } };
    expect(measurePictureMarks(methane, hiding, 0.75).map((x) => x.text)).toEqual(["1.430 Å"]);
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

  // a flat six-ring of carbons 1.39 Å apart, each with its hydrogen 1.09 Å further out, its bonds alternating, and the distance
  // across it from one carbon to the one opposite measured
  const ring = (() => {
    const atoms: { el: string; x: number; y: number; z: number }[] = [];
    for (let k = 0; k < 6; k++) atoms.push({ el: "C", x: 1.39 * Math.cos((k * Math.PI) / 3), y: 1.39 * Math.sin((k * Math.PI) / 3), z: 0 });
    for (let k = 0; k < 6; k++) atoms.push({ el: "H", x: 2.48 * Math.cos((k * Math.PI) / 3), y: 2.48 * Math.sin((k * Math.PI) / 3), z: 0 });
    const bonds = [
      ...Array.from({ length: 6 }, (_, k) => ({ a1: k, a2: (k + 1) % 6, order: k % 2 ? 1 : 2 })),
      ...Array.from({ length: 6 }, (_, k) => ({ a1: k, a2: k + 6, order: 1 })),
    ];
    return { atoms, bonds, at: { x: 4, y: -3 }, measures: [{ id: 1, atoms: [0, 3] }] };
  })();
  const hidingH = { ...STYLE_3D, primary: { ...STYLE_3D.primary, hydrogens: "carbonHidden" as const } };
  /** How far a value's box, as a picture writes it, runs into what the picture draws: the deepest into a drawn ball, and the most of a drawn stick's band it covers. */
  const runsInto = (m: typeof ring, style: typeof STYLE_3D, mark: ReturnType<typeof measurePictureMarks>[number], apart = 0) => {
    const b = measureLabelBox(mark, undefined);
    const box = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, hx: (b.max.x - b.min.x) / 2, hy: (b.max.y - b.min.y) / 2 };
    let ball = -Infinity;
    let stick = 0;
    for (const k of pictureMarks(m, style)) {
      if (k.kind === "ball") {
        const dx = Math.max(Math.abs(k.c.x - box.x) - box.hx, 0);
        const dy = Math.max(Math.abs(k.c.y - box.y) - box.hy, 0);
        ball = Math.max(ball, k.r - Math.hypot(dx, dy));
      } else stick = Math.max(stick, coveredLength(box, { a: k.a, b: k.b, r: k.width / 2 + apart }));
    }
    return { ball, stick };
  };

  it("writes a value across a ring clear of every ball and every bond the picture draws, its hydrogens hidden or shown", () => {
    for (const style of [hidingH, STYLE_3D]) {
      for (const size of [0.75, 1]) {
        const [mark] = measurePictureMarks(ring, style, size);
        const { ball, stick } = runsInto(ring, style, mark);
        // (clear, and a little way off: a quarter of its letters' size from every ball and bond, but for a hair)
        expect(ball).toBeLessThan(-0.2 * size);
        expect(stick).toBe(0);
        expect(runsInto(ring, style, mark, 0.2 * size).stick).toBe(0);
        // and beside what it measures: its middle no further from the line's middle than the ring and the value reach
        const line = { x: (mark.lines[0][0].x + mark.lines[mark.lines.length - 1][1].x) / 2, y: (mark.lines[0][0].y + mark.lines[mark.lines.length - 1][1].y) / 2 };
        expect(Math.hypot(mark.label.x - line.x, mark.label.y - line.y)).toBeLessThan((2.48 + 0.6) * WORLD_PER_ANGSTROM + 2 * size);
      }
    }
  });

  it("keeps a value that covered nothing just where it was: on its line's middle", () => {
    // (the long pair, bonds drawn between its three atoms, none near the middle of the line)
    const long = { ...pair(9), bonds: [{ a1: 0, a2: 2, order: 1 }] };
    const [mark] = measurePictureMarks(long, STYLE_3D, 0.75);
    const [a, b] = [mark.lines[0][0], mark.lines[mark.lines.length - 1][1]];
    expect(mark.label.x).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(mark.label.y).toBeCloseTo((a.y + b.y) / 2, 6);
  });

  it("keeps a value clear of those written before it over another molecule", () => {
    const long = pair(9);
    const [first] = measurePictureMarks(long, STYLE_3D, 0.75);
    const b = measureLabelBox(first, undefined);
    const before = [{ x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, hx: (b.max.x - b.min.x) / 2, hy: (b.max.y - b.min.y) / 2 }];
    const [second] = measurePictureMarks(long, STYLE_3D, 0.75, undefined, undefined, undefined, before);
    const c = measureLabelBox(second, undefined);
    const overlap = Math.min(b.max.x, c.max.x) > Math.max(b.min.x, c.min.x) && Math.min(b.max.y, c.max.y) > Math.max(b.min.y, c.min.y);
    expect(overlap).toBe(false);
  });

  it("puts a value across a ring on the same side however little the ring is turned: up, for a line across the page", () => {
    // (the line through the ring's middle: which side is away from the middle is a sign of nothing; the upper side is taken)
    const hair = (deg: number) => {
      const h = (deg * Math.PI) / 360;
      return [Math.sin(h), 0, 0, Math.cos(h)] as [number, number, number, number];
    };
    for (const deg of [0, 0.01, -0.01, 1, -1]) {
      const [mark] = measurePictureMarks({ ...ring, turn: hair(deg) }, hidingH, 0.75);
      const lineY = (mark.lines[0][0].y + mark.lines[mark.lines.length - 1][1].y) / 2;
      expect(mark.label.y).toBeGreaterThan(lineY);
    }
  });

  it("puts each of three values across one ring nearer its own line than either other's", () => {
    const three = { ...ring, measures: [{ id: 1, atoms: [0, 3] }, { id: 2, atoms: [1, 4] }, { id: 3, atoms: [2, 5] }] };
    const marks = measurePictureMarks(three, hidingH, 0.75);
    expect(marks).toHaveLength(3);
    const off = (p: { x: number; y: number }, m: (typeof marks)[number]) => {
      const a = m.lines[0][0], b = m.lines[m.lines.length - 1][1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    };
    marks.forEach((m, k) => {
      for (const [j, other] of marks.entries()) if (j !== k) expect(off(m.label, m)).toBeLessThan(off(m.label, other));
      const { ball, stick } = runsInto(three, hidingH, m);
      expect(ball).toBeLessThan(0);
      expect(stick).toBe(0);
    });
  });

  it("finds a clear place for a value across a ring drawn space-filling", () => {
    const space = { ...hidingH, primary: { ...hidingH.primary, atoms: "space" as const } };
    const [mark] = measurePictureMarks(ring, space, 0.75);
    const { ball } = runsInto(ring, space, mark);
    expect(ball).toBeLessThan(0);
  });

  it("keeps a value clear of the atom numbers drawn where the sticks meet", () => {
    const sticks = { ...hidingH, primary: { ...hidingH.primary, atoms: "sticks" as const } };
    const numbered = { ...ring, atomNumbers: { kind: "order" as const }, measures: [{ id: 1, atoms: [0, 3] }, { id: 2, atoms: [1, 4] }, { id: 3, atoms: [2, 5] }] };
    // (a number's box: centred on its atom, 0.27 Å high and its ring round it - three digits' width at most here, one digit each)
    const solid = solidOf({ ...numbered, id: 0 } as unknown as Molecule3D, sticks);
    for (const m of measurePictureMarks(numbered, sticks, 0.75)) {
      const b = measureLabelBox(m, undefined);
      for (let i = 0; i < 6; i++) {
        const x = solid.frames[0][3 * i] + numbered.at.x;
        const y = solid.frames[0][3 * i + 1] + numbered.at.y;
        const h = 0.27 * WORLD_PER_ANGSTROM;
        const hx = (h * (0.62 + 0.24)) / 2, hy = (h * 1.24) / 2;
        const apart = Math.min(b.max.x, x + hx) <= Math.max(b.min.x, x - hx) || Math.min(b.max.y, y + hy) <= Math.max(b.min.y, y - hy);
        expect(apart).toBe(true);
      }
    }
  });
});
