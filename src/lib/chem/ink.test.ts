import { describe, expect, it } from "vitest";
import { inkColour, type InkStroke, markerColour, OneEuro, placesOf, pressureFelt, strokeHit, strokeMoved, strokeOutline, strokesBounds, strokeTriangles, thinned } from "./ink";
import { MENO_SET, OKABE_ITO_SET } from "./palette";

const line: InkStroke = { points: [0, 0, 0.5, 5, 0, 0.5, 10, 0, 0.5] };

describe("a stroke written by hand", () => {
  it("is drawn round, up one side and down the other, even and tapered at its ends - or as thick as it was pressed", () => {
    const o = strokeOutline(line, 2);
    // (three points a side, and a cap of five at each end)
    expect(o).toHaveLength(3 + 5 + 3 + 5);
    // (tapered: thinner at its ends than in its middle)
    const at = (x: number) => Math.max(...o.filter((p) => Math.abs(p.x - x) < 1e-9).map((p) => p.y));
    expect(at(0)).toBeLessThan(at(5));
    expect(at(5)).toBeCloseTo(1);
    // (pressed hard in its middle: thicker there)
    const pressed: InkStroke = { points: [0, 0, 0.1, 5, 0, 1, 10, 0, 0.1], pressure: true };
    const p = strokeOutline(pressed, 2);
    const top = (x: number) => Math.max(...p.filter((q) => Math.abs(q.x - x) < 1e-9).map((q) => q.y));
    expect(top(5)).toBeGreaterThan(top(0) * 2);
    // (a dot: round)
    expect(strokeOutline({ points: [3, 3, 0.5] }, 2)).toHaveLength(12);
    // (its ends round outward, beyond its first and last points - never back over it, where a marker would be seen twice)
    const even = strokeOutline(line, 2, false);
    expect(Math.max(...even.map((q) => q.x))).toBeCloseTo(11);
    expect(Math.min(...even.map((q) => q.x))).toBeCloseTo(-1);
  });

  it("is made of triangles for the canvas, a strip and a fan at each end", () => {
    const t = strokeTriangles(line, 2);
    expect(t.indices.length % 3).toBe(0);
    // (two triangles between each pair of points; a fan of six at each end)
    expect(t.indices.length / 3).toBe(2 * 2 + 2 * 6);
    expect(strokeTriangles({ points: [0, 0, 0.5] }, 2).indices.length / 3).toBe(12);
  });

  it("is pressed on within reach of its line, reaches as far as its width, and moves whole", () => {
    expect(strokeHit(line, { x: 5, y: 1.2 }, 0.3, 2)).toBe(true);
    expect(strokeHit(line, { x: 5, y: 2 }, 0.3, 2)).toBe(false);
    expect(strokesBounds([line], 2)).toEqual({ x0: -2, y0: -2, x1: 12, y1: 2 });
    expect(placesOf(strokeMoved(line, { x: 1, y: 2 }))[2]).toEqual({ x: 11, y: 2 });
  });

  it("keeps only the points its shape needs, its last always", () => {
    expect(thinned([0, 0, 0.5, 0.01, 0, 0.5, 1, 0, 0.5, 1.001, 0, 0.5], 0.1)).toEqual([0, 0, 0.5, 1, 0, 0.5, 1.001, 0, 0.5]);
  });
});

describe("the 1€ filter", () => {
  it("smooths a slow hand's jitter and follows a quick one closely", () => {
    const slow = new OneEuro();
    const jitter = [0, 0.4, -0.4, 0.4, -0.4, 0.4].map((v, i) => slow.next(v, i / 100));
    expect(Math.max(...jitter.slice(1).map(Math.abs))).toBeLessThan(0.3);
    const quick = new OneEuro();
    let last = 0;
    for (let i = 0; i < 20; i++) last = quick.next(i * 50, i / 100);
    expect(19 * 50 - last).toBeLessThan(150);
  });
});

describe("the colour a piece is written in", () => {
  it("is its own; else a pen's is the drawing's ink and a marker's the first colour of the set in use", () => {
    expect(markerColour(MENO_SET)).toBe(MENO_SET.colours[0]);
    expect(markerColour(OKABE_ITO_SET)).toBe(OKABE_ITO_SET.colours[0]);
    // (a set with no colours: Meno's first)
    expect(markerColour({ id: "none", name: "None", colours: [] })).toBe(MENO_SET.colours[0]);
    const marker = markerColour(OKABE_ITO_SET);
    expect(inkColour({ pen: "marker" }, "#000000", marker)).toBe(marker);
    expect(inkColour({ pen: "pen" }, "#000000", marker)).toBe("#000000");
    expect(inkColour({ pen: "marker", color: "#cd4560" }, "#000000", marker)).toBe("#cd4560");
  });
});

describe("a pen's pressure", () => {
  it("is felt where it changes along a stroke - not where a pen that tells none gives the same throughout", () => {
    expect(pressureFelt([0, 0, 0.5, 1, 1, 0.5, 2, 0, 0.5])).toBe(false);
    expect(pressureFelt([0, 0, 0.3, 1, 1, 0.6, 2, 0, 0.4])).toBe(true);
    expect(pressureFelt([0, 0, 0.5])).toBe(false);
  });
});
