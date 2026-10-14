import { describe, expect, it } from "vitest";
import { readStructures } from "../../../../lib/io/structures";
import { measureText, measureValue } from "./measure3d";
import { WORLD_PER_ANGSTROM } from "./molecule3d";
import samplePdb from "../../../../samples/cholesterol.pdb?raw";
import sampleXyz from "../../../../samples/cholesterol.xyz?raw";

// Every number a measurement shows, checked against the coordinates by an
// independent computation: plain arithmetic in ångströms, not three.js, the
// torsion's sign worked out from IUPAC's definition by another road (the
// two outer bonds projected onto the plane across the middle one).

type P = [number, number, number];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P, b: P): P => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: P) => Math.sqrt(dot(a, a));
const scale = (a: P, k: number): P => [a[0] * k, a[1] * k, a[2] * k];

function distance(a: P, b: P): number {
  return len(sub(a, b));
}
function angle(a: P, b: P, c: P): number {
  const u = sub(a, b);
  const v = sub(c, b);
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v))))) * 180) / Math.PI;
}
/** IUPAC: looking along B to C, positive where B-A must turn clockwise, by at most 180°, to cover C-D. */
function torsion(a: P, b: P, c: P, d: P): number {
  const axis = scale(sub(c, b), 1 / len(sub(c, b)));
  const v = sub(a, b);
  const w = sub(d, c);
  const vp = sub(v, scale(axis, dot(v, axis)));
  const wp = sub(w, scale(axis, dot(w, axis)));
  return (Math.atan2(dot(axis, cross(vp, wp)), dot(vp, wp)) * 180) / Math.PI;
}

/** A molecule's atoms in ångströms, its bonds, and its places as the canvas holds them (world units). */
function molecule(kind: "pdb" | "xyz", text: string) {
  const m = readStructures(kind, `m.${kind}`, text).molecules3d![0];
  const xyz: P[] = m.atoms.map((a) => [a.x, a.y, a.z]);
  const places = Float64Array.from(xyz.flatMap((p) => scale(p, WORLD_PER_ANGSTROM)));
  return { xyz, bonds: m.bonds, places };
}

/** The value as written, rounded by decimal arithmetic; null where it lies too near a tie to say. */
function written(kind: "distance" | "angle" | "torsion", v: number): string | null {
  // (a distance to three decimals, as a length a calculation gives; an angle to one)
  const k = kind === "distance" ? 1000 : 10;
  const x = v * k;
  if (Math.abs(Math.abs(x - Math.trunc(x)) - 0.5) < 1e-6) return null;
  const r = Math.round(Math.abs(x)) / k;
  const n = r.toFixed(kind === "distance" ? 3 : 1);
  const s = v < 0 && r !== 0 ? `−${n}` : n;
  return kind === "distance" ? `${s} Å` : `${s}°`;
}

describe("a measurement in 3D", () => {
  for (const [name, kind, text] of [
    ["cholesterol (PDB)", "pdb", samplePdb],
    ["cholesterol (XYZ)", "xyz", sampleXyz],
  ] as const) {
    it(`agrees with its coordinates - every bond, bond angle and torsion of ${name}`, () => {
      const { xyz, bonds, places } = molecule(kind, text);
      const neighbours = xyz.map(() => [] as number[]);
      for (const b of bonds) {
        neighbours[b.a1].push(b.a2);
        neighbours[b.a2].push(b.a1);
      }
      let checked = 0;
      const check = (atoms: number[], expected: number, kind: "distance" | "angle" | "torsion") => {
        const got = measureValue(places, atoms);
        expect(Math.abs(got - expected)).toBeLessThan(1e-9 * Math.max(1, Math.abs(expected)));
        const text = written(kind, expected);
        if (text) expect(measureText(kind, got)).toBe(text);
        checked++;
      };
      for (const b of bonds) check([b.a1, b.a2], distance(xyz[b.a1], xyz[b.a2]), "distance");
      for (let j = 0; j < xyz.length; j++)
        for (const i of neighbours[j]) for (const k of neighbours[j]) if (i < k) check([i, j, k], angle(xyz[i], xyz[j], xyz[k]), "angle");
      for (const b of bonds)
        for (const i of neighbours[b.a1])
          for (const l of neighbours[b.a2])
            if (i !== b.a2 && l !== b.a1 && i !== l) check([i, b.a1, b.a2, l], torsion(xyz[i], xyz[b.a1], xyz[b.a2], xyz[l]), "torsion");
      expect(checked).toBeGreaterThan(200);
    });
  }

  it("gives none where there is none to give - an angle with two atoms in one place, a torsion with three in a line - and writes a dash", () => {
    const w = (xs: number[]) => Float64Array.from(xs.map((v) => v * WORLD_PER_ANGSTROM));
    // (an alkyne: C-C≡C-C, its middle three in a line)
    const alkyne = w([0, 1, 0, 0, 0, 0, 1.2, 0, 0, 2.4, 0, 0, 3.4, 1, 0]);
    expect(measureValue(alkyne, [0, 1, 2, 3])).toBeNaN();
    expect(measureText("torsion", measureValue(alkyne, [0, 1, 2, 3]))).toBe("–");
    // (but a bent one, and a torsion of 180°, are measured)
    expect(measureValue(w([0, 1, 0, 0, 0, 0, 1.5, 0.1, 0, 2.9, 0.2, 0]), [0, 1, 2, 3])).not.toBeNaN();
    expect(Math.abs(measureValue(w([0, 1, 0, 0, 0, 0, 1.5, 0, 0, 1.5, -1, 0]), [0, 1, 2, 3]))).toBeCloseTo(180, 9);
    const together = w([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(measureValue(together, [0, 1, 2])).toBeNaN();
    expect(measureText("angle", NaN)).toBe("–");
    // (a distance is always one: two atoms in one place are 0.000 Å apart)
    expect(measureText("distance", measureValue(together, [1, 2]))).toBe("0.000 Å");
  });

  it("gives a torsion IUPAC's sign, and writes a true minus and no −0.0", () => {
    // (looking down the y axis from B to C, x to the right and z up: A to the right, D up - a quarter turn anticlockwise, as seen: -90)
    const places = Float64Array.from([1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1].map((v) => v * WORLD_PER_ANGSTROM));
    expect(measureValue(places, [0, 1, 2, 3])).toBeCloseTo(torsion([1, 0, 0], [0, 0, 0], [0, 1, 0], [0, 1, 1]), 9);
    expect(measureValue(places, [0, 1, 2, 3])).toBeCloseTo(-90, 9);
    expect(measureText("torsion", -60.24)).toBe("−60.2°");
    expect(measureText("torsion", -0.04)).toBe("0.0°");
    expect(measureText("distance", 1.5349)).toBe("1.535 Å");
  });
});
