import { describe, expect, it } from "vitest";
import { panFor, type PxBox } from "./menuAt";

const view: PxBox = { left: 0, top: 0, right: 1000, bottom: 700 };
const at = (left: number, top: number, w = 200, h = 100): PxBox => ({ left, top, right: left + w, bottom: top + h });

describe("panFor", () => {
  it("asks for nothing where the menu is inside, margin and all", () => {
    expect(panFor(at(400, 300), view, 0)).toEqual({ dx: 0, dy: 0 });
  });

  it("asks for exactly what a menu lies past each edge, and the margin - one edge alone", () => {
    expect(panFor(at(900, 300), view, 0)).toEqual({ dx: 1000 - 16 - 1100, dy: 0 });
    expect(panFor(at(400, 650), view, 0)).toEqual({ dx: 0, dy: 700 - 16 - 750 });
    expect(panFor(at(5, 300), view, 0)).toEqual({ dx: 11, dy: 0 });
    expect(panFor(at(400, -30), view, 0)).toEqual({ dx: 0, dy: 46 });
  });

  it("asks for both at a corner", () => {
    expect(panFor(at(950, 680), view, 0)).toEqual({ dx: 1000 - 16 - 1150, dy: 700 - 16 - 780 });
    expect(panFor(at(-10, -10), view, 0)).toEqual({ dx: 26, dy: 26 });
  });

  it("counts the column's cover on the right", () => {
    expect(panFor(at(700, 300), view, 300)).toEqual({ dx: 1000 - 300 - 16 - 900, dy: 0 });
    // (the same menu, with no column over the canvas, needs none)
    expect(panFor(at(700, 300), view, 0)).toEqual({ dx: 0, dy: 0 });
  });

  it("brings the top of a menu taller than the canvas in, and the left of one wider", () => {
    expect(panFor(at(400, 100, 200, 900), view, 0)).toEqual({ dx: 0, dy: 16 - 100 });
    expect(panFor(at(100, 300, 1200, 100), view, 0)).toEqual({ dx: 16 - 100, dy: 0 });
  });

  it("holds at exactly the margin, both sides, and asks 1 px at 1 px past it", () => {
    expect(panFor(at(1000 - 16 - 200, 300), view, 0).dx).toBe(0);
    expect(panFor(at(1000 - 16 - 200 + 1, 300), view, 0).dx).toBe(-1);
    expect(panFor(at(16, 300), view, 0).dx).toBe(0);
    expect(panFor(at(15, 300), view, 0).dx).toBe(1);
    expect(panFor(at(400, 700 - 16 - 100), view, 0).dy).toBe(0);
    expect(panFor(at(400, 700 - 16 - 100 + 1), view, 0).dy).toBe(-1);
    expect(panFor(at(400, 16), view, 0).dy).toBe(0);
    expect(panFor(at(400, 15), view, 0).dy).toBe(1);
  });

  it("keeps a cover wider than the canvas from taking the canvas away", () => {
    expect(panFor(at(100, 300, 200, 100), view, 5000)).toEqual({ dx: 0 + 16 - 100, dy: 0 });
  });
});
