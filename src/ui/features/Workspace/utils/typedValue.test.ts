import { describe, expect, it } from "vitest";
import { typedValue } from "./typedValue";

describe("a measurement's value as typed", () => {
  it("reads a number with a true minus or a hyphen, a point or a comma", () => {
    expect(typedValue("1.54")).toBe(1.54);
    expect(typedValue(" −60,5 ")).toBe(-60.5);
    expect(typedValue("-120")).toBe(-120);
  });

  it("is none where nothing, or no number, is written - the measurement left as it was", () => {
    expect(typedValue("")).toBeNaN();
    expect(typedValue("   ")).toBeNaN();
    expect(typedValue("abc")).toBeNaN();
  });
});
