import { describe, expect, it } from "vitest";
import { fadeAt } from "./faded";

describe("what WebGL draws coming and going", () => {
  it("fades in from none as it comes, and out to none as it goes, over its time", () => {
    expect(fadeAt({ since: 100, leaving: false }, 100, 120)).toBe(0);
    expect(fadeAt({ since: 100, leaving: false }, 160, 120)).toBeCloseTo(0.5, 9);
    expect(fadeAt({ since: 100, leaving: false }, 400, 120)).toBe(1);
    expect(fadeAt({ since: 100, leaving: true }, 160, 120)).toBeCloseTo(0.5, 9);
    expect(fadeAt({ since: 100, leaving: true }, 400, 120)).toBe(0);
  });
});
