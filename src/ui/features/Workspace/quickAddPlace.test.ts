import { describe, expect, it } from "vitest";
import { placeQuickAdd } from "./quickAddPlace";

describe("placeQuickAdd", () => {
  const within = { width: 1000, height: 800 };
  const row = { width: 200, height: 44 };
  const open = { width: 300, height: 200 };

  it("opens up and to the right of the point; a panel opening grows down from its row, which stays", () => {
    expect(placeQuickAdd(400, 500, within, row, [row, open])).toEqual({ left: 414, top: 442, origin: "bottom left" });
  });

  it("opens below the point where there is no room above", () => {
    expect(placeQuickAdd(400, 40, within, row, [row, open])).toEqual({ left: 414, top: 54, origin: "top left" });
  });

  it("stands higher near the bottom, so that its largest fits, chosen as it opens", () => {
    expect(placeQuickAdd(400, 700, within, row, [row, open]).top).toBe(596);
  });

  it("goes to the left of the point where its largest would not fit to the right, room made for its largest", () => {
    // (the row alone would fit to the right; with its calculations open it would not)
    expect(placeQuickAdd(750, 500, within, row, [row, open])).toEqual({ left: 436, top: 442, origin: "bottom right" });
    expect(placeQuickAdd(750, 500, within, row, [row]).left).toBe(764);
  });

  it("stays inside a canvas too small for it on either side", () => {
    // (held for its row: the panel, too wide to stand beside the point at all, is eased back within as it opens)
    expect(placeQuickAdd(160, 120, { width: 320, height: 240 }, row, [row, open])).toMatchObject({ left: 116, top: 62 });
  });

  it("opens at the point, wherever it is, though a panel of it is too wide to stand beside the point on either side", () => {
    // (Meno's own steps, thirty in a row: 1100 px, in a canvas 1440 wide - a laptop at 150 or 200 %)
    const canvas = { width: 1440, height: 800 };
    const calculations = { width: 1100, height: 300 };
    const rowWide = { width: 330, height: 44 };
    for (const x of [100, 400, 700, 1000]) {
      const at = placeQuickAdd(x, 500, canvas, rowWide, [rowWide, calculations]);
      // (beside the point, up and to the right - never held off at one place for the panel)
      expect(at.left, `x ${x}`).toBe(x + 14);
      expect(at.origin).toBe("bottom left");
    }
    // (near the right edge: to the left of the point, by its row - not a panel's width away)
    expect(placeQuickAdd(1300, 500, canvas, rowWide, [rowWide, calculations])).toMatchObject({ left: 1300 - 14 - 330, origin: "bottom right" });
  });
});
