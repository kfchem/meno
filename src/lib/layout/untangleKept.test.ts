import { describe, expect, it } from "vitest";
import type { Point } from "./geometry";
import type { LayoutInput } from "./perceive";
import { untangledKeeping } from "./untangleKept";

const B = 1.8;
/** Atoms at `at`, in bonds, bonded as `bonds` says, all carbons. */
function drawing(at: [number, number][], bonds: [number, number][]): { input: LayoutInput; places: Point[] } {
  return {
    input: { atoms: at.map(() => ({ el: "C" })), bonds: bonds.map(([a, b]) => ({ a, b, order: 1 })) },
    places: at.map(([x, y]) => ({ x: x * B, y: y * B })),
  };
}
const far = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y) / B;
/** Which way round each pair of each atom's neighbours lies, about it. */
function sides(input: LayoutInput, at: readonly Point[]): number[] {
  const next = at.map((): number[] => []);
  for (const b of input.bonds) {
    next[b.a].push(b.b);
    next[b.b].push(b.a);
  }
  return next.flatMap((ns, u) =>
    ns.flatMap((v) => ns.filter((w) => w !== v).map((w) => Math.sign((at[v].x - at[u].x) * (at[w].y - at[u].y) - (at[v].y - at[u].y) * (at[w].x - at[u].x)))),
  );
}
const dir = (p: [number, number], deg: number): [number, number] => [p[0] + Math.cos((deg * Math.PI) / 180), p[1] + Math.sin((deg * Math.PI) / 180)];

describe("a drawing made regular, its parts in each other's way, cleared keeping its arrangement", () => {
  it("turns a branch's end off another's, every atom's neighbours on the sides they are drawn", () => {
    // a carbon with three branches, the end of one put on an atom of another
    const c: [number, number] = [0, 0];
    const [a1, a2, a3] = [dir(c, 90), dir(c, 210), dir(c, 330)];
    const a4 = dir(a1, 30);
    const a5 = dir(a3, 30);
    const a6 = dir(a5, 90);
    const { input, places } = drawing([c, a1, a2, a3, a4, a5, a6, dir(a6, 30), dir(a4, 330)], [[0, 1], [0, 2], [0, 3], [1, 4], [4, 8], [3, 5], [5, 6], [6, 7]]);
    expect(far(places[8], places[6])).toBeLessThan(1e-9);
    const out = untangledKeeping(input, places, places, B);
    expect(far(out[8], out[6])).toBeGreaterThan(0.45);
    expect(sides(input, out)).toEqual(sides(input, places));
    for (const b of input.bonds) expect(far(out[b.a], out[b.b])).toBeLessThan(1.6 + 1e-9);
    // (what the caller keeps as drawn stays: the other branch is moved instead)
    const kept = untangledKeeping(input, places, places, B, (a) => a === 8);
    expect(kept[8]).toEqual(places[8]);
    expect(far(kept[8], kept[6])).toBeGreaterThan(0.45);
    // (a drawing with a pair the other way round - an unsure atom's, put by the bonds about it - cleared all the same, as made regular)
    const drawn = places.map((p, i) => (i === 2 ? { x: Math.cos(Math.PI / 4) * B, y: Math.sin(Math.PI / 4) * B } : p));
    expect(sides(input, drawn)).not.toEqual(sides(input, places));
    expect(untangledKeeping(input, places, drawn, B)).toEqual(out);
  });

  it("turns no ring off where it is fitted: what is in its way is moved instead", () => {
    // as above, a cyclopropyl for the branch's end, its atom on the other branch's
    const c: [number, number] = [0, 0];
    const [a1, a2, a3] = [dir(c, 90), dir(c, 210), dir(c, 330)];
    const a4 = dir(a1, 30);
    const a5 = dir(a3, 30);
    const a6 = dir(a5, 90);
    const a8 = dir(a4, 330);
    const at = [c, a1, a2, a3, a4, a5, a6, dir(a6, 30), a8, dir(a8, 300), dir(a8, 0)];
    const { input, places } = drawing(at, [[0, 1], [0, 2], [0, 3], [1, 4], [4, 8], [3, 5], [5, 6], [6, 7], [8, 9], [9, 10], [10, 8]]);
    const out = untangledKeeping(input, places, places, B);
    for (const i of [8, 9, 10]) expect(out[i]).toEqual(places[i]);
    expect(far(out[8], out[6])).toBeGreaterThan(0.45);
    expect(sides(input, out)).toEqual(sides(input, places));
    // (the other branch kept as drawn, the ring alone could clear it - by a turn, or a bond drawn longer: it is left as it is)
    expect(untangledKeeping(input, places, places, B, (a) => a === 5 || a === 6 || a === 7)).toEqual(places);
    expect(untangledKeeping(input, places, places, B, (a) => a >= 5 && a <= 8)).toEqual(places);
  });

  it("bends nothing drawn in line - a triple bond's neighbours - to clear what is in the way", () => {
    // pent-2-ynyl and a pentyl on one carbon, the pentyl's end on the pentynyl's; all but the pentynyl's end kept as drawn
    const c: [number, number] = [0, 0];
    const a5 = dir(c, 60);
    const a6 = dir(a5, 0);
    const a7 = dir(a6, 0);
    const a8 = dir(a7, 0);
    const { input, places } = drawing([c, [1, 0], [2, 0], [3, 0], [4, 0], a5, a6, a7, a8, dir(a8, 300)], [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [8, 9]]);
    input.bonds[2].order = 3;
    expect(far(places[9], places[4])).toBeLessThan(1e-9);
    const out = untangledKeeping(input, places, places, B, (a) => a !== 4);
    expect(far(out[9], out[4])).toBeGreaterThan(0.45);
    const along = (u: number, v: number, w: number) => Math.abs((out[v].x - out[u].x) * (out[w].y - out[u].y) - (out[v].y - out[u].y) * (out[w].x - out[u].x)) / (far(out[u], out[v]) * far(out[u], out[w]) * B * B);
    expect(along(3, 2, 4)).toBeLessThan(1e-9);
  });

  it("leaves a chain curled on itself, which only a turn the other way would clear, as it is", () => {
    // heptane drawn round on itself, every turn the same way: its seventh atom on its first
    const at = [0, 1, 2, 3, 4, 5, 6].map((i): [number, number] => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]);
    const { input, places } = drawing(at, [0, 1, 2, 3, 4, 5].map((i) => [i, i + 1]));
    expect(untangledKeeping(input, places, places, B)).toEqual(places);
  });

  it("moves no ring's atom, and leaves a drawing with nothing in the way as it is", () => {
    // a cyclohexane, a substituent of one atom run onto its neighbour's
    const ring = [0, 1, 2, 3, 4, 5].map((i): [number, number] => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]);
    const a6 = dir(ring[0], 0);
    const a7 = dir(a6, 60);
    const a9 = dir(ring[1], 60);
    const at: [number, number][] = [...ring, a6, a7, dir(a7, 120), a9, dir(a9, 0)];
    const { input, places } = drawing(at, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 7], [7, 8], [1, 9], [9, 10]]);
    expect(far(places[8], places[10])).toBeLessThan(1e-9);
    const out = untangledKeeping(input, places, places, B);
    for (let i = 0; i < 6; i++) expect(out[i]).toEqual(places[i]);
    expect(far(out[8], out[10])).toBeGreaterThan(0.45);
    expect(sides(input, out)).toEqual(sides(input, places));
    const clear = drawing([[0, 0], [0.866, 0.5], [1.732, 0], [2.598, 0.5]], [[0, 1], [1, 2], [2, 3]]);
    expect(untangledKeeping(clear.input, clear.places, clear.places, B)).toEqual(clear.places);
  });
});
