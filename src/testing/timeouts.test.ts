import { describe, expect, it } from "vitest";
import { measured, TIMEOUT_STEPS, TIMES_MEASURED } from "./timeouts";

describe("a test's timeout from its measured time", () => {
  it("is the least step that is at least twenty times the time", () => {
    expect(measured(260)).toBe(30_000);
    expect(measured(1_500)).toBe(30_000);
    expect(measured(1_501)).toBe(60_000);
    expect(measured(8_600)).toBe(300_000);
    expect(measured(16_000)).toBe(600_000);
    for (const ms of [300, 900, 2_000, 4_000, 7_000, 14_000, 29_000, 60_000]) expect(measured(ms)).toBeGreaterThanOrEqual(TIMES_MEASURED * ms);
  });

  it("is the largest step past it", () => {
    expect(measured(68_000)).toBe(TIMEOUT_STEPS[TIMEOUT_STEPS.length - 1]);
  });
});
