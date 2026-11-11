import { describe, expect, it } from "vitest";
import { TAB_RISE, tabRoom } from "./tabMotion";
import { DURATION } from "../theme/motion";

describe("a tab coming in", () => {
  it("rises by transform and opacity alone - no width, margin or position, which lay the page out again", () => {
    expect(Object.keys(TAB_RISE.from).sort()).toEqual(["opacity", "transform"]);
    expect(Object.keys(TAB_RISE.to).sort()).toEqual(["opacity", "transform"]);
    expect(TAB_RISE.from.opacity).toBe(0);
    expect(TAB_RISE.to.opacity).toBe(1);
    expect(TAB_RISE.from.transform).toBe("translateY(30px)");
    expect(TAB_RISE.to.transform).toBe("translateY(0)");
  });

  it("takes in the time and on the curve everything on the page eases in", () => {
    expect(TAB_RISE.timing.duration).toBe(DURATION.base * 1000);
    expect(TAB_RISE.timing.easing).toBe("cubic-bezier(0.2,0.8,0.2,1)");
  });

  it("has its room at once, as wide as the bar lets a tab be, the chosen tab keeping more of it", () => {
    expect(tabRoom(true)).toEqual({ width: 192, minWidth: 96, marginRight: 4 });
    expect(tabRoom(false)).toEqual({ width: 192, minWidth: 32, marginRight: 4 });
  });
});
