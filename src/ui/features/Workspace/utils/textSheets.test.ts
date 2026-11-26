import { describe, expect, it } from "vitest";
import { sheetNameRoom } from "./textSheets";
import { pageLength } from "./pageScale";

// A full-size sheet's name: components/TextSheets2D draws it with this function's size, gap and width (its top
// `gap` under the sheet's foot, from its left, a line of `size` type no wider than `width`), and the built
// document's layout (scripts/document/build) counts this function's `room` - so the room counted is the room
// drawn. The component is not mounted here; the function both call is tested.
describe("a sheet's name under it", () => {
  const box = (w: number) => ({ x0: 3, x1: 3 + w, y0: -10 });

  it("is sized on the page, as all on it: no zoom or window is asked", () => {
    const n = sheetNameRoom(box(50));
    expect(n.size).toBeCloseTo(pageLength(12), 12);
    expect(n.gap).toBeCloseTo(pageLength(14), 12);
    expect(sheetNameRoom.length).toBe(1);
  });

  it("takes the room it is drawn in: the gap and a line of its type under the sheet, from its left", () => {
    const n = sheetNameRoom(box(50));
    expect(n.room).toEqual({ x0: 3, x1: 3 + n.width, y0: -10 - n.gap - 1.2 * n.size, y1: -10 });
    expect(n.room.y0).toBeLessThan(-10 - n.gap - n.size);
  });

  it("is as wide as the sheet, or as wide as it may be where the sheet is narrower", () => {
    const wide = 2 * pageLength(120);
    expect(sheetNameRoom(box(wide)).width).toBeCloseTo(wide, 12);
    expect(sheetNameRoom(box(wide)).room.x1).toBeCloseTo(3 + wide, 12);
    const narrow = pageLength(120) / 4;
    expect(sheetNameRoom(box(narrow)).width).toBeCloseTo(pageLength(120), 12);
    expect(sheetNameRoom(box(narrow)).room.x1).toBeGreaterThan(3 + narrow);
  });
});
