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

describe("the view moving under a label being written", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  // (the pointer at a point of the screen, the page under it as a view shows it: zoom about the origin, panned)
  const view = { zoom: 100, pan: { x: 0, y: 0 } };
  const onPage = (s: { x: number; y: number }) => ({ x: (s.x - view.pan.x) / view.zoom, y: (s.y - view.pan.y) / view.zoom });
  const past = (s: { x: number; y: number }) => pastLabel(onPage(s), at, box, L);
  // (as LabelTyping2D tells it: each move, against the label drawn now; each frame, the view's own doing)
  const mover = (keep: () => void, start: { x: number; y: number }) => {
    let cur = start;
    const w = leaveWatch({ keep, L, armed: past(cur) === 0 });
    return {
      move(to: { x: number; y: number }) {
        const before = past(cur);
        cur = to;
        const now = past(cur);
        w.point(now, false, now > before);
      },
      frame: () => w.point(past(cur), false, false),
    };
  };

  it("keeps nothing as a pan or a zoom carries the label off from under a still pointer", () => {
    const keep = vi.fn();
    view.zoom = 100;
    view.pan = { x: 0, y: 0 };
    const m = mover(keep, { x: 10, y: 0 });
    view.pan = { x: 400, y: 0 };
    m.frame();
    view.zoom = 400;
    m.frame();
    vi.advanceTimersByTime(LEAVE_MS * 3);
    expect(keep).not.toHaveBeenCalled();
    // (nor a move back towards it)
    m.move({ x: 50, y: 0 });
    vi.advanceTimersByTime(LEAVE_MS * 3);
    expect(keep).not.toHaveBeenCalled();
  });

  it("sees a move away after a zoom as one - where the label is drawn now", () => {
    const keep = vi.fn();
    view.zoom = 100;
    view.pan = { x: 0, y: 0 };
    const m = mover(keep, { x: 10, y: 0 });
    // (zoomed in four times about the pointer: the label grows round it, the pointer still at it)
    view.zoom = 400;
    view.pan = { x: 10 - (10 / 100) * 400, y: 0 };
    m.frame();
    // (a move of 120 screen px: half a bond before the zoom, an eighth after - still at it)
    m.move({ x: 10, y: 120 });
    vi.advanceTimersByTime(LEAVE_MS * 2);
    expect(keep).not.toHaveBeenCalled();
    // (on, well past it as drawn now: kept at once)
    m.move({ x: 10, y: 600 });
    expect(keep).toHaveBeenCalledTimes(1);
  });

  it("is at the label the view brings to a still pointer", () => {
    const keep = vi.fn();
    view.zoom = 100;
    view.pan = { x: 0, y: 0 };
    // (from the menu, away from the atom: not yet at it)
    const m = mover(keep, { x: 300, y: 0 });
    view.pan = { x: 300, y: 0 };
    m.frame();
    m.move({ x: 300, y: 300 });
    expect(keep).toHaveBeenCalledTimes(1);
  });
});
