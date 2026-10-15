import { describe, expect, it } from "vitest";
import { SEEN_ROOM_PX, viewBack, viewShowingCopy, type PageBox } from "./copySeen";

// A view 800 x 600 px at 20 px a unit about (0, 0): x from -20 to 20, y from -15 to 15.
const view = { zoom: 20, x: 0, y: 0 };
const seen = { width: 800, height: 600, cover: 0 };
const box = (x: number, y: number, r = 2): PageBox => ({ minX: x - r, maxX: x + r, minY: y - r, maxY: y + r });
const room = SEEN_ROOM_PX / view.zoom;

describe("a copy put beside what it was made from, brought into view", () => {
  it("is left as it is where the copy is in view already", () => {
    expect(viewShowingCopy(view, seen, box(-5, 0), box(5, 0))).toBeNull();
  });

  it("glides as little as shows the copy and the one it was made from, the zoom kept", () => {
    const goal = viewShowingCopy(view, seen, box(10, 0), box(22, 0))!;
    expect(goal.zoom).toBe(20);
    expect(goal.y).toBe(0);
    // (the copy's right edge, with room round it, at the right edge of what is seen)
    expect(goal.x + 20).toBeCloseTo(24 + room, 9);
    // (and the one it was made from still in view)
    expect(goal.x - 20).toBeLessThan(8 - room);
  });

  it("keeps clear of the column over the canvas's right side", () => {
    const goal = viewShowingCopy(view, { ...seen, cover: 200 }, box(0, 0), box(12, 0))!;
    // (what is seen ends 200 px short of the canvas's right edge: 10 units)
    expect(goal.x + 20 - 10).toBeCloseTo(14 + room, 9);
  });

  it("shows the copy where both do not fit, as far as the copy alone needs", () => {
    const goal = viewShowingCopy(view, seen, box(-60, 0), box(30, 0))!;
    expect(goal.x + 20).toBeCloseTo(32 + room, 9);
    expect(goal.x - 20).toBeGreaterThan(-58);
  });

  it("puts a copy larger than what is seen in its middle", () => {
    const goal = viewShowingCopy(view, seen, box(0, 0), box(100, 40, 30))!;
    expect(goal).toEqual({ zoom: 20, x: 100, y: 40 });
  });

  it("goes back as the copy is undone - but only where the view is still where the copy took it", () => {
    const before = { zoom: 20, x: 0, y: 0 };
    const went = { zoom: 20, x: 5.3, y: 0 };
    expect(viewBack(before, went, { zoom: 20, x: 5.3 + 0.01, y: 0 })).toEqual(before);
    expect(viewBack(before, went, { zoom: 20, x: 9, y: 0 })).toBeNull();
    expect(viewBack(before, went, { zoom: 30, x: 5.3, y: 0 })).toBeNull();
  });
});
