import { describe, expect, it } from "vitest";
import { easeInOut, flightMs, zoomPath } from "./zoomPath";

describe("the way from one slide's view to the next", () => {
  it("starts at the one and ends at the other, exactly", () => {
    const a = { x: 0, y: 0, w: 40 };
    const b = { x: 120, y: -30, w: 25 };
    const p = zoomPath(a, b);
    expect(p.at(0).x).toBeCloseTo(0, 9);
    expect(p.at(0).y).toBeCloseTo(0, 9);
    expect(p.at(0).w).toBeCloseTo(40, 9);
    const end = p.at(1);
    expect(end.x).toBeCloseTo(120, 9);
    expect(end.y).toBeCloseTo(-30, 9);
    expect(end.w).toBe(25);
  });

  it("zooms out on the way between two far apart, so both are seen, and keeps to the line between their middles", () => {
    const a = { x: 0, y: 0, w: 10 };
    const b = { x: 200, y: 0, w: 10 };
    const p = zoomPath(a, b);
    const mid = p.at(0.5);
    expect(mid.w).toBeGreaterThan(50);
    expect(mid.x).toBeCloseTo(100, 6);
    expect(mid.y).toBeCloseTo(0, 9);
    // (out, then in: widest about the middle)
    expect(p.at(0.25).w).toBeLessThan(mid.w);
    expect(p.at(0.75).w).toBeLessThan(mid.w);
  });

  it("is longer the farther apart, and between two near ones hardly zooms out", () => {
    const a = { x: 0, y: 0, w: 10 };
    const near = zoomPath(a, { x: 12, y: 0, w: 10 });
    const far = zoomPath(a, { x: 300, y: 0, w: 10 });
    expect(far.length).toBeGreaterThan(near.length);
    expect(near.at(0.5).w).toBeLessThan(20);
  });

  it("only zooms - by ratio, the same at each step - into a slide within the one shown", () => {
    const p = zoomPath({ x: 5, y: 5, w: 80 }, { x: 5, y: 5, w: 20 });
    expect(p.at(0.5).w).toBeCloseTo(40, 9);
    expect(p.at(0.5).x).toBe(5);
    expect(p.length).toBeCloseTo(Math.log(4) / Math.SQRT2, 9);
    // (staying where it is: nothing to go)
    expect(zoomPath({ x: 1, y: 1, w: 3 }, { x: 1, y: 1, w: 3 }).length).toBe(0);
  });

  it("takes from 0.6 s to 1.4 s, longer the longer the way", () => {
    expect(flightMs({ length: 0 })).toBe(600);
    expect(flightMs({ length: 1 })).toBe(820);
    expect(flightMs({ length: 50 })).toBe(1400);
  });

  it("eases gently out of the start and into the end", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });
});
