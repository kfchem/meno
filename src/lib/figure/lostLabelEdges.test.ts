/**
 * Held beside the label-lost rules of a picture read (lib/figure/trace `stoppedAt`, tracedRead `lostLabelEnds`): the edges the tests of
 * those rules leave open - a big N-shaped patch is a letter only where two lines of a structure stop short of it, each pointing into its
 * box, from a patch of a bond or more, and the patch is of three lines; two ends are one label's only where the lines cross ahead of both
 * and neither is another element's. (Found in review.)
 */
import { describe, expect, it } from "vitest";
import type { Pixels } from "./inkFit";
import { tracePicture, type Traced } from "./trace";
import { lostLabelEnds } from "./tracedRead";
import type { ReadAtom, ReadBond } from "./read";

type Pt = [number, number];
type Shape = (x: number, y: number) => boolean;
const line = (p: Pt, q: Pt, w: number): Shape => (x, y) => {
  const d = [q[0] - p[0], q[1] - p[1]];
  const t = Math.min(Math.max(((x - p[0]) * d[0] + (y - p[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]), 0), 1);
  return Math.hypot(x - (p[0] + t * d[0]), y - (p[1] + t * d[1])) <= w / 2;
};
function picture(width: number, height: number, shapes: Shape[]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let n = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (shapes.some((s) => s(x + (i + 0.5) / 4, y + (j + 0.5) / 4))) n++;
      const v = Math.round(255 * (1 - n / 16));
      data.set([v, v, v, 255], 4 * (y * width + x));
    }
  return { width, height, data };
}
const hexagon = (c: Pt, bond: number): Pt[] => Array.from({ length: 6 }, (_, k) => [c[0] + bond * Math.sin((k * Math.PI) / 3), c[1] - bond * Math.cos((k * Math.PI) / 3)] as Pt);
const traced = (t: Traced | { none: string }): Traced => {
  if ("none" in t) throw new Error(t.none);
  return t;
};

describe("a big N-shaped patch, a letter only where bonds stop short of it", () => {
  const bond = 40;
  const corners = hexagon([100, 100], bond);
  /** The ring's bonds, those into corner `at` stopping `short` of a bond before it; `skip` leaves a bond out. */
  const ringTo = (at: number, short: number, skip: number[] = []): Shape[] =>
    corners.flatMap((p, k) => {
      if (skip.includes(k)) return [];
      const q = corners[(k + 1) % 6];
      const cut = (from: Pt, to: Pt): Pt => [to[0] + (from[0] - to[0]) * short, to[1] + (from[1] - to[1]) * short];
      return [line(k === at ? cut(q, p) : p, (k + 1) % 6 === at ? cut(p, q) : q, 3)];
    });
  const bigN = (at: Pt): Shape[] => {
    const [h, w] = [0.85 * bond, 0.6 * bond];
    const [l, r, t, b] = [at[0] - w / 2, at[0] + w / 2, at[1] - h / 2, at[1] + h / 2];
    return [line([l, b], [l, t], 3), line([l, t], [r, b], 3), line([r, b], [r, t], 3)];
  };
  const tall = (blobs: Traced["shapes"]["blobs"]) => blobs.filter((b) => b.box[3] - b.box[1] > 0.6 * bond);

  it("is lines where one bond stops short of it and no other: two stops are the least", { timeout: 30_000 }, () => {
    // (the ring open at corner 3's other bond: one bond into the corner, the N over the corner)
    const t = traced(tracePicture(picture(200, 200, [...ringTo(3, 0.55, [3]), ...bigN(corners[3])])));
    expect(tall(t.shapes.blobs)).toHaveLength(0);
    const two = traced(tracePicture(picture(200, 200, [...ringTo(3, 0.55), ...bigN(corners[3])])));
    expect(tall(two.shapes.blobs)).toHaveLength(1);
  });

  it("is lines where two lines end beside it but run past it, none pointing into its box", { timeout: 30_000 }, () => {
    // (the N apart from the ring, a vertical line a half bond off each side of it, each ending level with its middle, running up)
    const at: Pt = [150, 100];
    const t = traced(tracePicture(picture(260, 200, [...ringTo(-1, 0), ...bigN(at), line([120, 100], [120, 40], 3), line([180, 100], [180, 40], 3)])));
    expect(tall(t.shapes.blobs)).toHaveLength(0);
  });

  it("is lines where the lines that point into it are short marks, under a bond across", { timeout: 30_000 }, () => {
    const at: Pt = [150, 100];
    const t = traced(tracePicture(picture(260, 200, [...ringTo(-1, 0), ...bigN(at), line([105, 100], [125, 100], 3), line([195, 100], [175, 100], 3)])));
    expect(tall(t.shapes.blobs)).toHaveLength(0);
  });

  it("is lines where it is two lines, a V a bond across, between two bonds that stop short of it", { timeout: 30_000 }, () => {
    const c = corners[3];
    const leg = 0.9 * bond;
    const v: Shape[] = [line([c[0] - leg * 0.5, c[1] - leg * 0.43], [c[0], c[1] + leg * 0.43], 3), line([c[0], c[1] + leg * 0.43], [c[0] + leg * 0.5, c[1] - leg * 0.43], 3)];
    const t = traced(tracePicture(picture(200, 200, [...ringTo(3, 0.55), ...v])));
    expect(tall(t.shapes.blobs)).toHaveLength(0);
  });
});

describe("two bonds' ends, one label's where their lines cross ahead of both, and neither is another element's", () => {
  const read = (pts: Pt[], bonds: [number, number][], el: (k: number) => Partial<ReadAtom> = () => ({})) => ({
    atoms: pts.map(([x, y], k): ReadAtom => ({ x, y, ...el(k) })),
    bonds: bonds.map(([a, b]): ReadBond => ({ a, b, order: 1 })),
    bond: 10,
  });
  it("marks nothing where the lines cross behind the second end: that bond points away from the crossing", () => {
    // (the first end at 0,0 heading right; the second at 8.54,3.54 heading down and right, its line behind it passing through 5,0)
    const ahead = read([[-10, 0], [0, 0], [1.47, -3.53], [8.54, 3.54]], [[0, 1], [2, 3]]);
    expect(lostLabelEnds(ahead)).toEqual([]);
    // (the same second bond turned to point at the crossing: marked)
    const toward = read([[-10, 0], [0, 0], [11.6, 7.07], [8.54, 3.54]].map(([x, y]) => [x, y] as Pt), [[0, 1], [2, 3]]);
    expect(lostLabelEnds(toward).sort()).toEqual([1, 3]);
  });
  it("marks nothing where an end is another element's - an N, an O - and its bond is one to that atom", () => {
    const at = (k: number): Partial<ReadAtom> => (k === 3 ? { el: "N" } : {});
    const pts: Pt[] = [[-8.66, -5], [8.66, -5], [-3.46, -2], [3.46, -2]];
    expect(lostLabelEnds(read(pts, [[0, 2], [1, 3]])).sort()).toEqual([2, 3]);
    expect(lostLabelEnds(read(pts, [[0, 2], [1, 3]], at))).toEqual([]);
  });
});
