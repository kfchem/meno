import { describe, expect, it } from "vitest";
import { TAB_RISE, flipFrom, risesAfter, tabInitial, tabRoom } from "./tabMotion";
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

  it("comes in with its room and nothing else: no width, minimum or margin opening from 0 as it rises", () => {
    for (const selected of [true, false]) {
      const initial = tabInitial(selected);
      expect(initial).toEqual(tabRoom(selected));
      expect(Object.keys(initial).sort()).toEqual(["marginRight", "minWidth", "width"]);
      for (const v of Object.values(initial)) expect(v).toBeGreaterThan(0);
    }
  });

  it("rises when it was added after the bar was first drawn, and not when it was there at the first draw", () => {
    const first = new Set(["a", "b"]);
    expect(risesAfter(first, "a")).toBe(false);
    expect(risesAfter(first, "b")).toBe(false);
    expect(risesAfter(first, "c")).toBe(true);
  });
});

describe("what a tab's coming in moves along", () => {
  it("is put back where it was: a place moved right by 192 is eased from 192 to the left of where it now is", () => {
    // (it was at 100, and is now at 296: it starts 196 to the left of its place, by translateX(-196px), and goes to 0)
    expect(flipFrom({ left: 100, count: 1 }, 296, 2)).toBe(-196);
    // (a tab closed: it moved left, and starts to the right)
    expect(flipFrom({ left: 296, count: 2 }, 100, 1)).toBe(196);
  });

  it("is eased only when the number of tabs changed and the place with it", () => {
    // (a window resized: the place changed, the count did not)
    expect(flipFrom({ left: 100, count: 2 }, 150, 2)).toBeNull();
    // (the count changed, the place did not)
    expect(flipFrom({ left: 100, count: 1 }, 100, 2)).toBeNull();
    // (nothing known of where it was: the first read)
    expect(flipFrom(null, 100, 1)).toBeNull();
  });
});
