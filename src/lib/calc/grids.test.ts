import { describe, expect, it } from "vitest";
import { GRID_LAID_MOST, GRID_MARGIN, GRID_SPACING, gridAbout, ISO_DENSITY, ISO_ORBITAL, isoOf } from "./grids";
import { GRID_SIDE_MOST } from "./results";

describe("the value a surface is drawn at first", () => {
  it("is the program's own where it gives one; else an orbital's or a density's, by what its values are, else by their signs", () => {
    expect(isoOf({ iso: 0.3, quantity: "density" })).toBe(0.3);
    expect(isoOf({ quantity: "orbital" })).toBe(ISO_ORBITAL);
    // (a spin density: two-signed, and a density)
    expect(isoOf({ quantity: "density", signed: true })).toBe(ISO_DENSITY);
    expect(isoOf({ signed: true })).toBe(ISO_ORBITAL);
    expect(isoOf({})).toBe(ISO_DENSITY);
  });
});

describe("the grid about a molecule", () => {
  it("reaches the margin past the atoms each way, its points the spacing apart", () => {
    const g = gridAbout([0, 0, 0, 1.5, 0, 0]);
    expect(g.origin).toEqual([-GRID_MARGIN, -GRID_MARGIN, -GRID_MARGIN]);
    expect(g.axes).toEqual([
      [GRID_SPACING, 0, 0],
      [0, GRID_SPACING, 0],
      [0, 0, GRID_SPACING],
    ]);
    // (9.5 Å along x, 8 Å the other ways: as many points as cover them)
    expect(g.counts).toEqual([49, 41, 41]);
  });

  it("keeps its points the spacing apart on a long molecule, past 90 to a side, where the points in all are not too many", () => {
    // (hexadecane's length: 145 points along it, as many in all as fit)
    const long = gridAbout([0, 0, 0, 20.9, 0.9, 0]);
    expect(long.axes[0][0]).toBe(GRID_SPACING);
    expect(long.counts[0]).toBeGreaterThan(90);
  });

  it("spaces its points farther apart, alike each way, only where so many would be more than a grid Meno lays may have", () => {
    const big = gridAbout([0, 0, 0, 60, 60, 60]);
    const step = big.axes[0][0];
    expect(step).toBeGreaterThan(GRID_SPACING);
    expect(big.axes[1][1]).toBe(step);
    expect(big.counts[0] * big.counts[1] * big.counts[2]).toBeLessThanOrEqual(GRID_LAID_MOST);
    expect(big.counts[0] * big.counts[1] * big.counts[2]).toBeGreaterThan(0.9 * GRID_LAID_MOST);
    expect(Math.max(...big.counts)).toBeLessThanOrEqual(GRID_SIDE_MOST);
    // (it still covers the atoms and the margin)
    expect((big.counts[0] - 1) * step).toBeGreaterThanOrEqual(60 + 2 * GRID_MARGIN - 1e-9);
    // (a long one: no side past the most)
    expect(Math.max(...gridAbout([0, 0, 0, 200, 0, 0]).counts)).toBeLessThanOrEqual(GRID_SIDE_MOST);
  });
});
