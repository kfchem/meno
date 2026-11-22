import { describe, expect, it } from "vitest";
import { DURATION } from "../../../theme/motion";
import { markGlideStep, type MarkGlides } from "./markGlide";

// R, S, E and Z glide to a new place, never jump (the maintainer's report: they jumped when the structure changed).

const MS = DURATION.move * 1000;

describe("a mark glides to its new place", () => {
  it("is drawn where it is placed when new; moved, it sets off from there, is part of the way at half time, and there at the end", () => {
    const glides: MarkGlides = new Map();
    const first = markGlideStep(glides, [{ key: "centre-3", x: 0, y: 0, text: "S" }], 0);
    expect(first).toEqual({ marks: [{ key: "centre-3", x: 0, y: 0, text: "S" }], moving: false });
    const set = markGlideStep(glides, [{ key: "centre-3", x: 1, y: 0, text: "S" }], 100);
    expect(set.marks[0].x).toBe(0);
    expect(set.moving).toBe(true);
    const half = markGlideStep(glides, [{ key: "centre-3", x: 1, y: 0, text: "S" }], 100 + MS / 2).marks[0].x;
    expect(half).toBeGreaterThan(0.5);
    expect(half).toBeLessThan(1);
    expect(markGlideStep(glides, [{ key: "centre-3", x: 1, y: 0, text: "S" }], 100 + MS)).toEqual({ marks: [{ key: "centre-3", x: 1, y: 0, text: "S" }], moving: false });
  });

  it("moved again on its way, sets off again from where it had reached: no jump back", () => {
    const glides: MarkGlides = new Map();
    markGlideStep(glides, [{ key: "k", x: 0, y: 0 }], 0);
    markGlideStep(glides, [{ key: "k", x: 1, y: 0 }], 0);
    const reached = markGlideStep(glides, [{ key: "k", x: 1, y: 0 }], MS / 2).marks[0].x;
    const again = markGlideStep(glides, [{ key: "k", x: 1, y: 1 }], MS / 2).marks[0];
    expect(again.x).toBeCloseTo(reached, 12);
    expect(again.y).toBeCloseTo(0, 12);
  });

  it("goes at once where it is to go at once (dragged by hand), and lets go of marks gone", () => {
    const glides: MarkGlides = new Map();
    markGlideStep(glides, [{ key: "k", x: 0, y: 0 }, { key: "gone", x: 5, y: 5 }], 0);
    expect(markGlideStep(glides, [{ key: "k", x: 2, y: 0 }], 10, (k) => k === "k").marks[0].x).toBe(2);
    expect([...glides.keys()]).toEqual(["k"]);
  });
});
