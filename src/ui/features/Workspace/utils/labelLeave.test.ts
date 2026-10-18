import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GONE, LEAVE_MS, leaveWatch, pastLabel, STILL_AT } from "./labelLeave";
import { ATOM_PICK_RADIUS_RATIO } from "../constants";

const L = 1.5;
const at = { x: 0, y: 0 };
// (letters to the right of the atom: as a label begun with its first letter on it)
const box = { x0: -0.2, x1: 1, y0: -0.2, y1: 0.2 };

describe("where the pointer is still at a label being written", () => {
  it("is the atom's disc, its letters, and a margin round both", () => {
    expect(pastLabel({ x: 0, y: 0 }, at, box, L)).toBe(0);
    expect(pastLabel({ x: 0.9, y: 0.1 }, at, box, L)).toBe(0);
    // (the margin)
    expect(pastLabel({ x: 1 + 0.1 * L, y: 0 }, at, box, L)).toBe(0);
    expect(pastLabel({ x: 0, y: -(ATOM_PICK_RADIUS_RATIO + STILL_AT) * L + 1e-6 }, at, box, L)).toBe(0);
    // (past it: how far)
    expect(pastLabel({ x: 1 + 0.25 * L, y: 0 }, at, box, L)).toBeCloseTo(0.1 * L, 9);
  });
});

describe("the pointer leaving a label being written", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps it once out a moment together - a tremor out and back keeps nothing", () => {
    const keep = vi.fn();
    const w = leaveWatch({ keep, L, armed: true });
    w.point(0.05, false);
    vi.advanceTimersByTime(LEAVE_MS - 50);
    w.point(0, false);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(keep).not.toHaveBeenCalled();
    w.point(0.05, false);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(keep).toHaveBeenCalledTimes(1);
    // (once)
    w.point(GONE * L + 1, false);
    w.out(false);
    expect(keep).toHaveBeenCalledTimes(1);
  });

  it("keeps it at once, moved well away, or off the canvas", () => {
    const keep = vi.fn();
    leaveWatch({ keep, L, armed: true }).point(GONE * L + 0.01, false);
    expect(keep).toHaveBeenCalledTimes(1);
    const off = vi.fn();
    leaveWatch({ keep: off, L, armed: true }).out(false);
    expect(off).toHaveBeenCalledTimes(1);
  });

  it("keeps nothing while a button is held - letters being selected by a drag", () => {
    const keep = vi.fn();
    const w = leaveWatch({ keep, L, armed: true });
    w.point(GONE * L + 1, true);
    w.out(true);
    vi.advanceTimersByTime(LEAVE_MS * 2);
    expect(keep).not.toHaveBeenCalled();
  });

  it("waits, opened from the menu away from the atom, for the pointer to come to it first", () => {
    const keep = vi.fn();
    const w = leaveWatch({ keep, L, armed: false });
    w.point(GONE * L + 1, false);
    w.out(false);
    vi.advanceTimersByTime(LEAVE_MS * 2);
    expect(keep).not.toHaveBeenCalled();
    w.point(0, false);
    w.point(GONE * L + 1, false);
    expect(keep).toHaveBeenCalledTimes(1);
  });
});
