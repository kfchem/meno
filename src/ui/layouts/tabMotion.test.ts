import { describe, expect, it } from "vitest";
import { TAB_RISE, flipFrom, placeBefore, risesAfter, tabInitial, tabRoom } from "./tabMotion";
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

describe("the place a moved element is eased from", () => {
  it("is the one it had as the count changed: read then, and not where the count is the same", () => {
    expect(placeBefore(3, 2, 600)).toBe(600);
    expect(placeBefore(2, 3, 404)).toBe(404);
    expect(placeBefore(3, 3, 600)).toBeNull();
    expect(placeBefore(3, 2, null)).toBeNull();
  });

  it("eases an add after a close from where the room left it, not from where it was before the close", () => {
    // ("+" at 600 with three tabs; one closes - at the render with two, its room is still held, so "+" reads 600 and does not
    // ease; the exit moves it to 404 with no render; a tab is added: the render with three reads 404, and the room taken puts it at 600)
    expect(flipFrom({ left: placeBefore(3, 2, 600)!, count: 3 }, 600, 2)).toBeNull();
    const first = placeBefore(2, 3, 404)!;
    expect(flipFrom({ left: first, count: 2 }, 600, 3)).toBe(-196);
  });
});
