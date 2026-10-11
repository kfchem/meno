import { describe, expect, it } from "vitest";
import { coloursOf, isosurface, sampleAt, scaleColour, type MeshGrid, type Vec3 } from "./isosurface";

/** A grid of `f` over a cube of side 2 about the origin, `n` points a side, its axes `axes` (each scaled to the step). */
function gridOf(f: (x: number, y: number, z: number) => number, n: number, axes: [Vec3, Vec3, Vec3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]): MeshGrid {
  const step = 2 / (n - 1);
  const ax = axes.map((a) => a.map((v) => v * step)) as [Vec3, Vec3, Vec3];
  const origin: Vec3 = [-(ax[0][0] + ax[1][0] + ax[2][0]) * (n - 1) / 2, -(ax[0][1] + ax[1][1] + ax[2][1]) * (n - 1) / 2, -(ax[0][2] + ax[1][2] + ax[2][2]) * (n - 1) / 2];
  const values = new Float32Array(n * n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        const p = [0, 1, 2].map((x) => origin[x] + i * ax[0][x] + j * ax[1][x] + k * ax[2][x]);
        values[(i * n + j) * n + k] = f(p[0], p[1], p[2]);
      }
  return { values, counts: [n, n, n], origin, axes: ax };
}

const radii = (m: { positions: Float32Array }) => {
  const out: number[] = [];
  for (let i = 0; i < m.positions.length; i += 3) out.push(Math.hypot(m.positions[i], m.positions[i + 1], m.positions[i + 2]));
  return out;
};

describe("a grid's surface", () => {
  // a ball: the value falling from 1 at the middle
  const ball = (x: number, y: number, z: number) => 1 - (x * x + y * y + z * z);

  it("is where the values come to the value asked for: a ball's, at its radius", () => {
    const m = isosurface(gridOf(ball, 21), 0.5);
    expect(m.positions.length).toBeGreaterThan(300);
    expect(m.positions.length % 9).toBe(0);
    for (const r of radii(m)) expect(r).toBeCloseTo(Math.SQRT1_2, 1);
  });

  it("is shaded outwards: each point's normal away from where the values are higher", () => {
    const m = isosurface(gridOf(ball, 21), 0.5);
    for (let i = 0; i < m.positions.length; i += 3) {
      const out = m.positions[i] * m.normals[i] + m.positions[i + 1] * m.normals[i + 1] + m.positions[i + 2] * m.normals[i + 2];
      expect(out).toBeGreaterThan(0);
      expect(Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2])).toBeCloseTo(1, 5);
    }
  });

  it("of the other sign, is where the values come to the value's negative: an orbital's other phase", () => {
    // (positive on one side, negative on the other: a p orbital's two lobes)
    const p = (x: number, y: number, z: number) => x * Math.exp(-2 * (x * x + y * y + z * z));
    const g = gridOf(p, 25);
    const plus = isosurface(g, 0.1, 1);
    const minus = isosurface(g, 0.1, -1);
    const xs = (m: { positions: Float32Array }) => Array.from(m.positions).filter((_, i) => i % 3 === 0);
    expect(xs(plus).every((x) => x > 0)).toBe(true);
    expect(xs(minus).every((x) => x < 0)).toBe(true);
    expect(plus.positions.length).toBe(minus.positions.length);
  });

  it("follows a grid whose axes lean", () => {
    const m = isosurface(gridOf(ball, 25, [[1, 0, 0], [0.3, 1, 0], [0, 0.2, 1]]), 0.5);
    expect(m.positions.length).toBeGreaterThan(300);
    for (const r of radii(m)) expect(r).toBeCloseTo(Math.SQRT1_2, 1);
  });

  it("is nothing where the values never come to it", () => {
    expect(isosurface(gridOf(ball, 9), 2).positions.length).toBe(0);
  });
});

describe("a surface coloured by another grid", () => {
  it("reads the other grid where each of its points is, by the eight nearest of its points - along skewed axes too, none outside it", () => {
    // (a value that goes linearly is read exactly between the points)
    const g = gridOf((x, y, z) => x + 2 * y + 3 * z, 5);
    expect(sampleAt(g, 0.3, -0.2, 0.1)).toBeCloseTo(0.2, 6);
    expect(sampleAt(g, 5, 0, 0)).toBeNull();
    const skew = gridOf((x, y) => x + y, 5, [[1, 0, 0], [0.5, 1, 0], [0, 0, 1]]);
    const p = [0, 1, 2].map((x) => skew.origin[x] + 2.5 * skew.axes[0][x] + 1.25 * skew.axes[1][x] + 2 * skew.axes[2][x]);
    expect(sampleAt(skew, p[0], p[1], p[2])).toBeCloseTo(p[0] + p[1], 5);
  });

  it("is coloured blue through green to red as the values run from the scale's start to its end, held at its ends", () => {
    expect(scaleColour(-1, -1, 1)).toEqual([0, 0, 1]);
    expect(scaleColour(0, -1, 1)).toEqual([0, 1, 0]);
    expect(scaleColour(1, -1, 1)).toEqual([1, 0, 0]);
    expect(scaleColour(5, -1, 1)).toEqual([1, 0, 0]);
    expect(scaleColour(null, -1, 1)).toEqual([0.6, 0.6, 0.6]);
    const mesh = isosurface(gridOf((x, y, z) => Math.hypot(x, y, z), 9), 0.6);
    // (coloured by height: the top red, the bottom blue - three numbers a point, linear)
    const colours = coloursOf(mesh, gridOf((_x, _y, z) => z, 9), -0.6, 0.6);
    expect(colours.length).toBe(mesh.positions.length);
    let top = 2;
    let bottom = 2;
    for (let i = 2; i < mesh.positions.length; i += 3) {
      if (mesh.positions[i] > mesh.positions[top]) top = i;
      if (mesh.positions[i] < mesh.positions[bottom]) bottom = i;
    }
    expect(colours[top - 2]).toBeGreaterThan(colours[top]);
    expect(colours[bottom]).toBeGreaterThan(colours[bottom - 2]);
  });
});
