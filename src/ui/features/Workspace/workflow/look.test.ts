import { describe, expect, it } from "vitest";
import { onLayer, PX } from "./look";

describe("a part on the workflow's layer", () => {
  it("lies at its place on the page, its pixels the page's", () => {
    const at = onLayer(10 * PX, -20 * PX);
    expect(at.position).toBe("absolute");
    expect(at.left).toBeCloseTo(10);
    expect(at.top).toBeCloseTo(20);
    expect(at.zIndex).toBeUndefined();
  });

  it("lies over the parts drawn after it where it is a step's card opened - its form over the cards below", () => {
    // (the parts are drawn in the order they come: a card below, drawn later, covered one opened above it)
    const opened = onLayer(0, 0, true);
    const below = onLayer(0, -80 * PX);
    expect(opened.zIndex).toBeGreaterThan(below.zIndex ?? 0);
  });
});
