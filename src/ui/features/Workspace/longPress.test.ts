import { afterEach, describe, expect, it } from "vitest";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { DOUBLE_CLICK_MS, FREE_MS, LONG_PRESSES, LONG_PRESS_SHOW_MS } from "./constants";
import { longPressMs } from "./longPress";

const was = useAppSettings.getState().pointer;
afterEach(() => useAppSettings.setState({ pointer: was }));

describe("a long press", () => {
  it("is about a quarter of a second unless Settings says shorter or longer", () => {
    expect(longPressMs()).toBe(LONG_PRESSES.normal);
    expect(LONG_PRESSES).toEqual({ shorter: 220, normal: 260, longer: 400 });
    useAppSettings.setState({ pointer: { ...was, longPress: "shorter" } });
    expect(longPressMs()).toBe(220);
    useAppSettings.setState({ pointer: { ...was, longPress: "longer" } });
    expect(longPressMs()).toBe(400);
  });

  it("is never a click: each well past a click's press and the time before anything shows, and short of a double-click's time and a drag's pause", () => {
    // (a click is held a tenth of a second or so; the longest quick clicks measured on a Mac, about 150 ms)
    for (const ms of Object.values(LONG_PRESSES)) {
      expect(ms).toBeGreaterThanOrEqual(200);
      expect(ms - LONG_PRESS_SHOW_MS).toBeGreaterThanOrEqual(80);
      expect(ms).toBeLessThan(DOUBLE_CLICK_MS);
      expect(ms).toBeLessThan(FREE_MS);
    }
  });
});
