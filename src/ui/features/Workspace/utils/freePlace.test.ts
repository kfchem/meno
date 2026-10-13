import { describe, expect, it } from "vitest";
import { freePlace } from "./freePlace";

const foot = { x0: -2, y0: -1, x1: 2, y1: 1 };

describe("where a file opened onto a page goes", () => {
  it("goes in the middle of the view where nothing is there", () => {
    expect(freePlace([], foot, { x: 3, y: 4 }, 1.5)).toEqual({ x: 3, y: 4 });
    // (nor anything near: what is there, well clear of it)
    expect(freePlace([{ x0: 20, y0: 20, x1: 30, y1: 30 }], foot, { x: 0, y: 0 }, 1.5)).toEqual({ x: 0, y: 0 });
  });

  it("goes in the nearest clear place where something is drawn there, kept a step from it", () => {
    const drawn = { x0: -5, y0: -3, x1: 5, y1: 3 };
    const at = freePlace([drawn], foot, { x: 0, y: 0 }, 1.5);
    const box = { x0: at.x + foot.x0, y0: at.y + foot.y0, x1: at.x + foot.x1, y1: at.y + foot.y1 };
    const apart = Math.max(box.x0 - drawn.x1, drawn.x0 - box.x1, box.y0 - drawn.y1, drawn.y0 - box.y1);
    expect(apart).toBeGreaterThanOrEqual(1.5 - 1e-9);
    // (above or below it, the nearer way out: its box is wider than it is tall)
    expect(at.x).toBe(0);
    expect(Math.abs(at.y)).toBe(6);
  });

  it("goes to the right of what is there, of places as near", () => {
    const at = freePlace([{ x0: -3, y0: -3, x1: 3, y1: 3 }], { x0: -1, y0: -1, x1: 1, y1: 1 }, { x: 0, y: 0 }, 1);
    expect(at).toEqual({ x: 5, y: 0 });
  });

  it("stays in the middle of the view where no place near is clear", () => {
    const everywhere = { x0: -1000, y0: -1000, x1: 1000, y1: 1000 };
    expect(freePlace([everywhere], foot, { x: 1, y: 2 }, 1.5)).toEqual({ x: 1, y: 2 });
  });
});
