import { describe, expect, it } from "vitest";
import type { Point } from "./geometry";
import type { LayoutInput } from "./perceive";
import { angleFloor, untangledKeeping } from "./untangleKept";

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
    // (and with the other branch kept too, nothing kept moves at all - no ring among them, nothing to be moved whole)
    const both = untangledKeeping(input, places, places, B, (a) => a >= 5);
    for (const i of [5, 6, 7, 8]) expect(both[i]).toEqual(places[i]);
    // (a drawing with a pair the other way round - an unsure atom's, put by the bonds about it - cleared all the same, as made regular)
    const drawn = places.map((p, i) => (i === 2 ? { x: Math.cos(Math.PI / 4) * B, y: Math.sin(Math.PI / 4) * B } : p));
    expect(sides(input, drawn)).not.toEqual(sides(input, places));
    expect(untangledKeeping(input, places, drawn, B)).toEqual(out);
  });

  it("turns no ring off where it is fitted, but may move it whole, by at most 0.6 of a bond", () => {
    // as above, a cyclopropyl for the branch's end, its atom on the other branch's
    const c: [number, number] = [0, 0];
    const [a1, a2, a3] = [dir(c, 90), dir(c, 210), dir(c, 330)];
    const a4 = dir(a1, 30);
    const a5 = dir(a3, 30);
    const a6 = dir(a5, 90);
    const a8 = dir(a4, 330);
    const at = [c, a1, a2, a3, a4, a5, a6, dir(a6, 30), a8, dir(a8, 300), dir(a8, 0)];
    const { input, places } = drawing(at, [[0, 1], [0, 2], [0, 3], [1, 4], [4, 8], [3, 5], [5, 6], [6, 7], [8, 9], [9, 10], [10, 8]]);
    // (moved whole, if at all: each of its atoms by one shift, no longer than 0.6 of a bond, its shape and turn kept)
    const whole = (out: Point[]) => {
      const d = { x: out[8].x - places[8].x, y: out[8].y - places[8].y };
      expect(Math.hypot(d.x, d.y) / B).toBeLessThanOrEqual(0.6 + 1e-9);
      for (const i of [9, 10]) {
        expect(out[i].x - places[i].x).toBeCloseTo(d.x, 9);
        expect(out[i].y - places[i].y).toBeCloseTo(d.y, 9);
      }
    };
    const out = untangledKeeping(input, places, places, B);
    whole(out);
    expect(far(out[8], out[6])).toBeGreaterThan(0.45);
    expect(sides(input, out)).toEqual(sides(input, places));
    // (the other branch kept as drawn: the ring alone moved, whole, to clear it - and that branch not at all)
    const ringOnly = untangledKeeping(input, places, places, B, (a) => a === 5 || a === 6 || a === 7);
    whole(ringOnly);
    for (const i of [5, 6, 7]) expect(ringOnly[i]).toEqual(places[i]);
    expect(far(ringOnly[8], ringOnly[6])).toBeGreaterThan(0.45);
    expect(sides(input, ringOnly)).toEqual(sides(input, places));
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

  it("clears a chain curled on itself by opening its turns, never closing them nor turning one the other way", () => {
    // heptane drawn round on itself, every turn the same way: its seventh atom on its first
    const at = [0, 1, 2, 3, 4, 5, 6].map((i): [number, number] => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]);
    const { input, places } = drawing(at, [0, 1, 2, 3, 4, 5].map((i) => [i, i + 1]));
    const out = untangledKeeping(input, places, places, B);
    expect(far(out[0], out[6])).toBeGreaterThan(0.45);
    expect(sides(input, out)).toEqual(sides(input, places));
    for (let i = 1; i < 6; i++) {
      const u = { x: out[i - 1].x - out[i].x, y: out[i - 1].y - out[i].y };
      const v = { x: out[i + 1].x - out[i].x, y: out[i + 1].y - out[i].y };
      expect(Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)))).toBeGreaterThanOrEqual((120 * Math.PI) / 180 - 1e-6);
    }
  });

  it("leaves no atom's bonds closer than 100 degrees, or 110 at one with a double bond, where they were not", () => {
    // as the branch's end on another's above, at an atom with a double bond: its turns not taken past 110 degrees
    const c: [number, number] = [0, 0];
    const [a1, a2, a3] = [dir(c, 90), dir(c, 210), dir(c, 330)];
    const a4 = dir(a1, 30);
    const a5 = dir(a3, 30);
    const a6 = dir(a5, 90);
    const { input, places } = drawing([c, a1, a2, a3, a4, a5, a6, dir(a6, 30), dir(a4, 330), dir(a4, 90)], [[0, 1], [0, 2], [0, 3], [1, 4], [4, 8], [3, 5], [5, 6], [6, 7], [4, 9]]);
    input.bonds[8].order = 2;
    const out = untangledKeeping(input, places, places, B);
    const angles = (u: number, ns: number[]) => {
      const t = ns.map((n) => Math.atan2(out[n].y - out[u].y, out[n].x - out[u].x)).sort((p, q) => p - q);
      return t.map((v, i) => (i ? v - t[i - 1] : 2 * Math.PI - (t[t.length - 1] - t[0])));
    };
    for (const a of angles(4, [1, 8, 9])) expect(a).toBeGreaterThanOrEqual((110 * Math.PI) / 180 - 1e-6);
    for (const [u, ns] of [[0, [1, 2, 3]], [1, [0, 4]], [3, [0, 5]], [5, [3, 6]], [6, [5, 7]]] as [number, number[]][])
      for (const a of angles(u, ns)) expect(a).toBeGreaterThanOrEqual((100 * Math.PI) / 180 - 1e-6);
    // (the other branch kept as drawn: the end on it cleared by its bond drawn longer, not by a turn past 110 degrees)
    const kept = untangledKeeping(input, places, places, B, (a) => a >= 5 && a <= 7);
    const angled = (u: number, ns: number[]) => {
      const t = ns.map((n) => Math.atan2(kept[n].y - kept[u].y, kept[n].x - kept[u].x)).sort((p, q) => p - q);
      return t.map((v, i) => (i ? v - t[i - 1] : 2 * Math.PI - (t[t.length - 1] - t[0])));
    };
    expect(far(kept[8], kept[6])).toBeGreaterThan(0.45);
    for (const a of angled(4, [1, 8, 9])) expect(a).toBeGreaterThanOrEqual((110 * Math.PI) / 180 - 1e-6);
    // (the floors themselves: 100 degrees, 110 at an atom with a double bond, or as close as they were)
    const deg = (d: number) => (d * Math.PI) / 180;
    expect(angleFloor(false, deg(120))).toBeCloseTo(deg(100), 9);
    expect(angleFloor(true, deg(120))).toBeCloseTo(deg(110), 9);
    expect(angleFloor(true, deg(90))).toBeCloseTo(deg(90), 6);
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
