import { describe, expect, it, vi } from "vitest";
import { onLayer, PX, shuttingCard } from "./look";

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

describe("a step's card shut", () => {
  it("stays over the others while it shrinks back, and goes down only once it has", () => {
    vi.useFakeTimers();
    const said: (number | null)[] = [];
    const told = shuttingCard((id) => said.push(id), 160);
    told(4);
    expect(said).toEqual([null]);
    // (shut: over the others for 160 ms, then down)
    told(null);
    expect(said[said.length - 1]).toBe(4);
    vi.advanceTimersByTime(150);
    expect(said[said.length - 1]).toBe(4);
    vi.advanceTimersByTime(20);
    expect(said[said.length - 1]).toBeNull();
    // (another opened as one shuts: the one shutting kept over, its own time)
    told(5);
    told(6);
    expect(said[said.length - 1]).toBe(5);
    vi.advanceTimersByTime(200);
    expect(said[said.length - 1]).toBeNull();
    vi.useRealTimers();
  });
});
