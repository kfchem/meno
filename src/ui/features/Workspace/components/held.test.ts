import { describe, expect, it } from "vitest";
import { LONG_PRESS_MS, LONG_PRESS_SHOW_MS } from "../constants";
import { holdProgress } from "./held";

/**
 * 0.1.11 (the maintainer, 2026-10-13): a click on an atom glowed, every
 * time - the long press's shade showed as the click's press faded, the time
 * running on after it was let go.
 */
describe("how far a press held still has come", () => {
  const start = 1000;

  it("shows nothing for its first part, then comes on to the long press", () => {
    expect(holdProgress(start, start + LONG_PRESS_SHOW_MS)).toBe(0);
    expect(holdProgress(start, start + (LONG_PRESS_SHOW_MS + LONG_PRESS_MS) / 2)).toBeCloseTo(0.5);
    expect(holdProgress(start, start + LONG_PRESS_MS + 500)).toBe(1);
  });

  it("goes no further once let go: a click shows nothing as it fades", () => {
    const click = start + 80;
    for (const later of [100, 150, 200, 300]) expect(holdProgress(start, start + later, click)).toBe(0);
  });

  it("stays where it had come to when let go part way", () => {
    const half = start + (LONG_PRESS_SHOW_MS + LONG_PRESS_MS) / 2;
    expect(holdProgress(start, half + 200, half)).toBeCloseTo(0.5);
  });
});
