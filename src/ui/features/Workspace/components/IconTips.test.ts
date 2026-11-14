import { describe, expect, it } from "vitest";
import { iconTipPlace, ICON_TIP_REST_MS } from "./IconTips";
import { TIP_GAP_PX } from "./markTip";

// An icon's name, as the pointer rests on it (components/IconTips): where it goes on the screen.

describe("an icon's name", () => {
  const win = { width: 800, height: 600 };
  it("stands under the icon, centred on it", () => {
    const at = iconTipPlace({ left: 100, top: 100, right: 132, bottom: 132 }, 60, 20, win);
    expect(at).toEqual({ left: 116 - 30, top: 132 + TIP_GAP_PX });
  });
  it("over the icon where there is no room under it, and moved along to lie in the window", () => {
    const low = iconTipPlace({ left: 100, top: 570, right: 132, bottom: 598 }, 60, 20, win);
    expect(low.top).toBe(570 - TIP_GAP_PX - 20);
    expect(iconTipPlace({ left: 0, top: 10, right: 20, bottom: 30 }, 120, 20, win).left).toBe(TIP_GAP_PX);
    expect(iconTipPlace({ left: 780, top: 10, right: 800, bottom: 30 }, 120, 20, win).left).toBe(800 - TIP_GAP_PX - 120);
  });
  it("waits for a rest, so that passing over a row of icons shows none", () => {
    expect(ICON_TIP_REST_MS).toBeGreaterThanOrEqual(300);
  });
});
