import { describe, expect, it } from "vitest";
import { wireRoute } from "./look";

const p = { x: 0, y: 0 };
const q = { x: 30, y: 0 };
const from = { x0: -10, x1: 0, y0: -5, y1: 5 };
const to = { x0: 30, x1: 40, y0: -5, y1: 5 };
/** A frame standing between the two ends, across the way a wire would go. */
const between = { x0: 12, x1: 18, y0: -6, y1: 6 };

describe("a wire's way, worked out once", () => {
  it("is the same way, the same object, asked again for the same wire among the same frames", () => {
    const a = wireRoute(p, q, { from, to }, [between]);
    expect(wireRoute({ ...p }, { ...q }, { from: { ...from }, to: { ...to } }, [{ ...between }])).toBe(a);
  });

  it("goes another way when what it goes round moves, or is gone: never a way kept for other frames", () => {
    const round = wireRoute(p, q, { from, to }, [between]);
    const clear = wireRoute(p, q, { from, to }, []);
    expect(clear.pts).not.toEqual(round.pts);
    const moved = wireRoute(p, q, { from, to }, [{ ...between, y0: 20, y1: 30 }]);
    expect(moved.pts).toEqual(clear.pts);
    // (and its ends: a step moved a bond)
    expect(wireRoute({ x: 0, y: 1 }, q, { from, to }, [between]).pts).not.toEqual(round.pts);
  });

  it("keeps apart a way asked with the way it went before, and one without", () => {
    const fresh = wireRoute(p, q, { from, to }, [between]);
    const wasAbove = wireRoute(p, q, { from, to }, [between], "above");
    const wasBelow = wireRoute(p, q, { from, to }, [between], "below");
    expect(wasAbove).not.toBe(fresh);
    expect(wasBelow).not.toBe(wasAbove);
  });
});
