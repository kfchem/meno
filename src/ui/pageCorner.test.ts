import { beforeEach, describe, expect, it } from "vitest";
import { CORNER_GAP, cornerRight, NOTICES_WIDTH, usePageCorner } from "./pageCorner";

describe("the page's bottom-right corner", () => {
  beforeEach(() => usePageCorner.setState({ right: CORNER_GAP, of: null }));

  it("lies where it always has with no panel at the window's right side", () => {
    expect(CORNER_GAP).toBe(12);
    expect(cornerRight(0)).toBe(12);
    // (nothing sensible said: as with no panel)
    expect(cornerRight(-40)).toBe(12);
    expect(cornerRight(Number.NaN)).toBe(12);
  });

  it("lies left of a panel by the same distance", () => {
    expect(cornerRight(320)).toBe(332);
    expect(cornerRight(487.5)).toBe(499.5);
    // (in a window 1024 wide: room enough beside a column 440 wide)
    expect(cornerRight(440, 1024)).toBe(452);
  });

  it("never leaves the window at its left: beside a column filling the workspace, or in a narrow window, they keep to its left edge", () => {
    expect(NOTICES_WIDTH).toBe(320);
    // (1024 - 12 - 320: the notices' left edge 12 from the window's)
    expect(cornerRight(1024, 1024)).toBe(692);
    expect(cornerRight(500, 640)).toBe(308);
    // (a window narrower than the notices: at its right corner, as ever)
    expect(cornerRight(200, 300)).toBe(12);
  });

  it("follows the tab in front: one no longer in front lets go only of what it said itself", () => {
    const { say, letGo } = usePageCorner.getState();
    say("tab-a", 332);
    expect(usePageCorner.getState().right).toBe(332);
    // (another tab comes to the front and speaks before the first lets go)
    say("tab-b", 12);
    letGo("tab-a");
    expect(usePageCorner.getState()).toMatchObject({ right: 12, of: "tab-b" });
    say("tab-b", 422);
    letGo("tab-b");
    expect(usePageCorner.getState()).toMatchObject({ right: 12, of: null });
  });
});
