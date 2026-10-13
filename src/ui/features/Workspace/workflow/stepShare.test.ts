import { describe, expect, it } from "vitest";
import { shareOf } from "./StepCard";

describe("how far a step's run is, on its card", () => {
  it("follows a lone job as far as its log says - a render's progress 12/240", () => {
    expect(shareOf([{ state: "running", progress: { done: 12, total: 240 } }])).toBeCloseTo(0.05);
    expect(shareOf([{ state: "running", progress: { done: 240, total: 240 } }])).toBe(1);
  });

  it("counts ended jobs whole and running ones as far as they say", () => {
    const seen = [{ state: "done" as const }, { state: "running" as const, progress: { done: 1, total: 4 } }, { state: "waiting" as const }, undefined];
    expect(shareOf(seen)).toBeCloseTo((1 + 0.25) / 4);
  });

  it("says nothing where no running job says how far it is: the card counts its ended jobs as before", () => {
    expect(shareOf([{ state: "running" }, { state: "done" }])).toBeUndefined();
    expect(shareOf([])).toBeUndefined();
  });
});
