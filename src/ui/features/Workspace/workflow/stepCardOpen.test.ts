import { describe, expect, it } from "vitest";
import { clickedOpen, DOUBLE_CLICK_MS } from "./cardOpen";

describe("a step's card clicked", () => {
  it("opens it, and shuts it clicked again - but a double-click's second click leaves it open", () => {
    // (shut, or another open: it opens)
    expect(clickedOpen(null, 3, null, 1000)).toBe(3);
    expect(clickedOpen(5, 3, null, 1000)).toBe(3);
    // (open, clicked again later: it shuts)
    expect(clickedOpen(3, 3, { step: 3, at: 0 }, 1000)).toBeNull();
    // (open by a click a moment ago - the same double-click: it stays open)
    expect(clickedOpen(3, 3, { step: 3, at: 1000 }, 1000 + DOUBLE_CLICK_MS - 1)).toBe(3);
    // (another card opened a moment ago: this one, open before, shuts)
    expect(clickedOpen(3, 3, { step: 5, at: 1000 }, 1100)).toBeNull();
  });
});
