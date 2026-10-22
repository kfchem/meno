import { describe, expect, it } from "vitest";
import { asideOf } from "./chipAside";

// A canvas from 0 to 1000 px; a chip kept 8 px in from its sides.
describe("a molecule's chip by the canvas's edge", () => {
  it("stays where it is within the canvas", () => {
    expect(asideOf(100, 400, 0, 1000)).toBe(0);
  });
  it("slides left past the right edge, and right past the left - 8 px in", () => {
    expect(asideOf(800, 1100, 0, 1000)).toBe(108);
    expect(asideOf(-50, 250, 0, 1000)).toBe(-58);
  });
  it("wider than the canvas, keeps its left edge in, where its words begin", () => {
    expect(asideOf(300, 1500, 0, 1000)).toBe(292);
  });
});
