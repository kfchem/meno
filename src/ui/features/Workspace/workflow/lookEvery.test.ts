import { describe, expect, it } from "vitest";
import { EASED_BY_MS, LOOK_MS, lookEvery, QUICK_FOR_MS, QUICK_LOOK_MS } from "./lookEvery";

// (a quick step shows done as quickly as it ran; a run that goes on costs no more to watch)
describe("how often the page looks at a run's jobs", () => {
  it("is often while the run is young, then eases back to the step it took before", () => {
    expect(lookEvery(0)).toBe(QUICK_LOOK_MS);
    expect(lookEvery(QUICK_FOR_MS)).toBe(QUICK_LOOK_MS);
    expect(lookEvery((QUICK_FOR_MS + EASED_BY_MS) / 2)).toBeCloseTo((QUICK_LOOK_MS + LOOK_MS) / 2);
    expect(lookEvery(EASED_BY_MS)).toBe(LOOK_MS);
    expect(lookEvery(10 * 60_000)).toBe(LOOK_MS);
    // (a run started, by the clock, a little after now - or a time not known - looked at quickly)
    expect(lookEvery(-50)).toBe(QUICK_LOOK_MS);
    expect(lookEvery(NaN)).toBe(QUICK_LOOK_MS);
  });

  it("looks at a 0.2 s step's jobs often enough to see it done in under half a second, and at a long run no more than before", () => {
    // (the looks of the first second, and of a minute's run)
    let t = 0;
    const firstSecond: number[] = [];
    while (t < 1000) firstSecond.push((t += lookEvery(t)));
    expect(firstSecond.filter((x) => x <= 1000).length).toBeGreaterThanOrEqual(9);
    // (a minute's run: some 33 looks more than the 60 it took before, all in its first 6 s; then one a second, as before)
    let looks = 0;
    for (t = 0; t < 60_000; t += lookEvery(t)) looks++;
    expect(looks).toBeLessThanOrEqual(60 + 35);
    let settled = 0;
    for (t = EASED_BY_MS; t < 60_000; t += lookEvery(t)) settled++;
    expect(settled).toBe(54);
  });
});
