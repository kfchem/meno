import { describe, expect, it } from "vitest";
import { clickedOpen, DOUBLE_CLICK_MS } from "./cardOpen";

describe("a step's card clicked", () => {
  it("opens it; clicked again it stays open; only a double-click on it, open, shuts it", () => {
    // (shut, or another open: it opens)
    expect(clickedOpen(null, 3, null, 1000)).toBe(3);
    expect(clickedOpen(5, 3, null, 1000)).toBe(3);
    // (open, clicked again later - a single click: it stays open)
    expect(clickedOpen(3, 3, { step: 3, at: 0, wasOpen: true }, 1000)).toBe(3);
    // (open, double-clicked: the second click shuts it)
    expect(clickedOpen(3, 3, { step: 3, at: 1000, wasOpen: true }, 1000 + DOUBLE_CLICK_MS - 1)).toBeNull();
    // (shut, double-clicked: the first click opened it, the second leaves it open)
    expect(clickedOpen(3, 3, { step: 3, at: 1000, wasOpen: false }, 1100)).toBe(3);
    // (another card clicked a moment ago: this one, open, stays open)
    expect(clickedOpen(3, 3, { step: 5, at: 1000, wasOpen: true }, 1100)).toBe(3);
  });
});
