import { describe, expect, it } from "vitest";
import { backToFront } from "./backToFront";

/** A triangle about (x, y, z), small. */
const tri = (x: number, y: number, z: number) => [x, y, z, x + 0.1, y, z, x, y + 0.1, z];

describe("backToFront", () => {
  it("draws the farthest triangle first, as seen along the way it looks", () => {
    // seen from above (looking down -z): the lowest is the farthest
    const positions = Float32Array.from([...tri(0, 0, 1), ...tri(0, 0, -2), ...tri(0, 0, 3), ...tri(0, 0, 0)]);
    const order = backToFront(positions, [0, 0, -1]);
    expect(Array.from(order)).toEqual([3, 4, 5, 0, 1, 2, 9, 10, 11, 6, 7, 8]);
    // seen from below, the other way round
    const up = backToFront(positions, [0, 0, 1]);
    expect(Array.from(up)).toEqual([6, 7, 8, 0, 1, 2, 9, 10, 11, 3, 4, 5]);
  });

  it("keeps every triangle, whole, once - level ones in the order they come", () => {
    const positions = Float32Array.from([...tri(0, 0, 0), ...tri(1, 0, 0), ...tri(2, 0, 0)]);
    const order = backToFront(positions, [0, 0, -1]);
    expect(Array.from(order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("sorts a large surface in little more than the time it takes to read it, reusing what it is given", () => {
    const tris = 100_000;
    const positions = new Float32Array(9 * tris);
    for (let i = 0; i < positions.length; i++) positions[i] = Math.sin(i * 12.9898) * 10;
    const out = new Uint32Array(3 * tris);
    const scratch = { keys: new Float32Array(tris), counts: new Uint32Array(tris + 1) };
    // Timed against reading the surface once, each run of one beside a run
    // of the other and the fastest of each kept: a busy machine only ever
    // adds time, and to both alike, where a bound in milliseconds failed
    // under load (99.8 ms at a load average of 34, 2026-10-12). Sorting is
    // about 1.6 times the read on a Mac; a sort by comparisons takes over
    // 30 times, and even the engine's own sort of the depths alone 10.
    let sink = 0;
    const read = () => {
      let sum = 0;
      for (let i = 0; i < positions.length; i++) sum += positions[i];
      sink += sum;
    };
    let reading = Infinity;
    let sorting = Infinity;
    for (let run = 0; run < 15; run++) {
      const t0 = performance.now();
      read();
      const t1 = performance.now();
      expect(backToFront(positions, [0.3 + run / 1000, -0.2, -0.93], out, scratch)).toBe(out);
      const t2 = performance.now();
      reading = Math.min(reading, t1 - t0);
      sorting = Math.min(sorting, t2 - t1);
    }
    expect(Number.isFinite(sink)).toBe(true);
    expect(sorting).toBeLessThan(5 * reading);
    backToFront(positions, [0.31, -0.2, -0.93], out, scratch);
    // (the depths went where it was given room for them)
    expect(scratch.keys[1]).toBeCloseTo((positions[9] + positions[12] + positions[15]) * 0.31 + (positions[10] + positions[13] + positions[16]) * -0.2 + (positions[11] + positions[14] + positions[17]) * -0.93, 3);
    // each triangle once, and in order of depth
    const seen = new Uint8Array(tris);
    let last = Infinity;
    for (let k = 0; k < tris; k++) {
      const t = out[3 * k] / 3;
      seen[t]++;
      const p = 9 * t;
      const depth = (positions[p] + positions[p + 3] + positions[p + 6]) * 0.31 + (positions[p + 1] + positions[p + 4] + positions[p + 7]) * -0.2 + (positions[p + 2] + positions[p + 5] + positions[p + 8]) * -0.93;
      expect(depth).toBeLessThanOrEqual(last + 1e-3);
      last = Math.min(last, depth);
    }
    expect(seen.every((s) => s === 1)).toBe(true);
  });
});
