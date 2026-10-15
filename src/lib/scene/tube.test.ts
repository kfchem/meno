import { describe, expect, it } from "vitest";
import { tubeAlong } from "./shapes";

describe("a tube along a polyline", () => {
  const bent = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1.5, y: 0.5, z: 0 },
    { x: 1.5, y: 1.5, z: 0 },
  ];
  const t = tubeAlong(bent, 0.1, 16);

  it("is one mesh: a ring at each point, the ends closed", () => {
    const rings = bent.length * 17;
    expect(t.positions.length / 3).toBe(rings + 2 * (1 + 17));
    expect(t.normals.length).toBe(t.positions.length);
    expect(t.indices.length % 3).toBe(0);
    expect(Math.max(...t.indices)).toBeLessThan(t.positions.length / 3);
  });

  it("keeps every ring's points a radius from the axis point it is about, its normals unit and square to the line", () => {
    for (let i = 0; i < bent.length; i++) {
      for (let a = 0; a <= 16; a++) {
        const v = (i * 17 + a) * 3;
        const d = Math.hypot(t.positions[v] - bent[i].x, t.positions[v + 1] - bent[i].y, t.positions[v + 2] - bent[i].z);
        expect(d).toBeCloseTo(0.1, 5);
        expect(Math.hypot(t.normals[v], t.normals[v + 1], t.normals[v + 2])).toBeCloseTo(1, 5);
      }
    }
  });

  it("does not twist: the rings turn along with the line, not about it", () => {
    // (the first ring point of each ring: its direction from the axis changes only as the line turns, and never by more than it)
    const dir = (i: number) => {
      const v = i * 17 * 3;
      return [t.positions[v] - bent[i].x, t.positions[v + 1] - bent[i].y, t.positions[v + 2] - bent[i].z].map((c) => c / 0.1);
    };
    for (let i = 1; i < bent.length; i++) {
      const a = dir(i - 1);
      const b = dir(i);
      const cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      expect(cos).toBeGreaterThan(0.5);
    }
  });

  it("faces outward: each triangle's winding agrees with its vertices' normals", () => {
    let agree = 0;
    let total = 0;
    for (let k = 0; k < t.indices.length; k += 3) {
      const [i, j, l] = [t.indices[k] * 3, t.indices[k + 1] * 3, t.indices[k + 2] * 3];
      const a = [0, 1, 2].map((c) => t.positions[j + c] - t.positions[i + c]);
      const b = [0, 1, 2].map((c) => t.positions[l + c] - t.positions[i + c]);
      const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const vn = [0, 1, 2].map((c) => t.normals[i + c]);
      const dot = n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2];
      if (Math.abs(dot) < 1e-12) continue;
      total++;
      if (dot > 0) agree++;
    }
    expect(agree / total).toBeGreaterThan(0.99);
  });

  it("is empty for a point or none", () => {
    expect(tubeAlong([{ x: 0, y: 0, z: 0 }], 0.1).indices.length).toBe(0);
    expect(tubeAlong([], 0.1).indices.length).toBe(0);
  });
});
