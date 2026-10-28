import { describe, expect, it } from "vitest";
import { SWITCH_BAND, SWITCH_S, switchedAt, switchFade, switchStep } from "./zoomSwitch";

describe("what a zoom shows or hides by its size, switched", () => {
  it("switches past its threshold by the band either way, and holds between: a zoom stopped at it, or turned a little back, does not switch it back and forth", () => {
    const t = 10;
    expect(switchedAt(false, t * SWITCH_BAND, t)).toBe(true);
    expect(switchedAt(true, t / SWITCH_BAND - 1e-9, t)).toBe(false);
    for (const v of [t / SWITCH_BAND, t, t * SWITCH_BAND - 1e-9]) {
      expect(switchedAt(true, v, t)).toBe(true);
      expect(switchedAt(false, v, t)).toBe(false);
    }
    // (a zoom wobbling about the threshold, within the band: it never switches)
    let on = true;
    let switches = 0;
    for (let k = 0; k < 200; k++) {
      const next = switchedAt(on, t * (1 + 0.04 * Math.sin(k / 3)), t);
      if (next !== on) switches++;
      on = next;
    }
    expect(switches).toBe(0);
  });

  it("is never half there at a zoom: switched, it fades over a short time, all there or gone at its end", () => {
    const f = switchFade(true);
    let t = 0;
    let last = f.v;
    while (switchStep(f, false, 1 / 60)) {
      t += 1 / 60;
      expect(f.v).toBeLessThanOrEqual(last);
      last = f.v;
    }
    expect(f.v).toBe(0);
    expect(t).toBeLessThanOrEqual(SWITCH_S + 1e-9);
    expect(t).toBeGreaterThan(SWITCH_S / 2);
    // (back again from halfway: from where it is, not from the start)
    const g = switchFade(false);
    switchStep(g, true, SWITCH_S / 2);
    const half = g.v;
    switchStep(g, false, 0);
    expect(g.v).toBe(half);
    while (switchStep(g, false, 1 / 60));
    expect(g.v).toBe(0);
    // (left alone at any zoom, it rests at 0 or 1)
    expect(switchStep(switchFade(true), true, 1)).toBe(false);
  });
});
