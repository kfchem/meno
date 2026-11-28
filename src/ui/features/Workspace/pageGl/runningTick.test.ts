import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dashAdvance, RUNNING_FRAME_MS, runningFramesAsked, runningTick } from "./runningTick";
import { PAGE_PX } from "../utils/pageScale";

describe("a running mark's frames", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never has more than one asked for", () => {
    const tick = runningTick();
    const invalidate = vi.fn();
    for (let i = 0; i < 100; i++) tick.ask(invalidate);
    expect(vi.getTimerCount()).toBe(1);
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(RUNNING_FRAME_MS);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("asks once in each RUNNING_FRAME_MS, however often it is asked to", () => {
    const tick = runningTick();
    const invalidate = vi.fn();
    // (a display frame every 1/60 s, for a second, each asking again)
    for (let ms = 0; ms < 1000; ms += 1000 / 60) {
      tick.ask(invalidate);
      vi.advanceTimersByTime(1000 / 60);
    }
    // (about thirty a second: the claim, not the constant)
    expect(RUNNING_FRAME_MS).toBe(33);
    expect(invalidate.mock.calls.length).toBeGreaterThanOrEqual(25);
    expect(invalidate.mock.calls.length).toBeLessThanOrEqual(31);
  });

  it("asks no frame after it is stopped, and none is left waiting", () => {
    const tick = runningTick();
    const invalidate = vi.fn();
    tick.ask(invalidate);
    tick.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 * RUNNING_FRAME_MS);
    expect(invalidate).not.toHaveBeenCalled();
    // (and asks again after being stopped)
    tick.ask(invalidate);
    vi.advanceTimersByTime(RUNNING_FRAME_MS);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});

describe("a wire's dashes", () => {
  const P = PAGE_PX;
  const along = (frames: number, dt: number) => {
    let offset = 0;
    for (let i = 0; i < frames; i++) offset = dashAdvance(offset, dt, 12, 6, 4);
    return offset;
  };
  it("stand at the same place after the same time, in frames of 1/60 s or of 1/30 s", () => {
    expect(along(60, 1 / 60)).toBeCloseTo(along(30, 1 / 30), 9);
    expect(along(10, 1 / 60)).toBeCloseTo(along(5, 1 / 30), 9);
  });
  it("are page lengths, the same on the page at every zoom - so on the screen in the zoom's ratio - and go along in page px a second", () => {
    // (nothing of them told the zoom: 12 page px a second, a tenth of a second 1.2 page px)
    expect(dashAdvance(0, 0.1, 12, 600, 400)).toBeCloseTo(1.2 * P, 9);
  });
  it("go round the length of a dash and a gap, not of a dash: a place between the two is reached", () => {
    // (a period of 10 page px: after 7.5 of travel they stand at 7.5, past a dash's 6; after 10, round to 0)
    expect(dashAdvance(0, 0.1, 75, 6, 4)).toBeCloseTo(7.5 * P, 9);
    expect(dashAdvance(7.5 * P, 0.1, 25, 6, 4)).toBeCloseTo(0, 9);
  });
  it("never go past one dash and gap, nor leap on a stalled page", () => {
    expect(along(1000, 1 / 30)).toBeLessThan(10 * P);
    expect(dashAdvance(0, 5, 12, 6, 4)).toBeCloseTo(((0.1 * 12) % 10) * P, 9);
  });
});

/** A page whose document the web view says is visible or hidden, and whose system asks for less motion or not: the page's own gate reads these. */
function aPage() {
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  const less = Object.assign(new EventTarget(), { matches: false, media: "(prefers-reduced-motion: reduce)" });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("matchMedia", () => less);
  return {
    hide: () => ((doc.visibilityState = "hidden"), doc.dispatchEvent(new Event("visibilitychange"))),
    show: () => ((doc.visibilityState = "visible"), doc.dispatchEvent(new Event("visibilitychange"))),
    lessMotion: (on: boolean) => ((less.matches = on), less.dispatchEvent(new Event("change"))),
  };
}

/** A mark running for `ms`: a frame drawn as each is asked for, `dt` the seconds since the last, each moving it and asking again; the frames asked for. */
function run(tick: ReturnType<typeof runningTick>, ms: number, drawn: number[] = []): number {
  let frames = 0;
  let last = Date.now();
  const invalidate = () => {
    frames++;
    // (the frame drawn at once, as the canvas would: the mark moved by the time gone, and asking again)
    const now = Date.now();
    drawn.push(tick.step((now - last) / 1000));
    last = now;
    tick.ask(invalidate);
  };
  tick.ask(invalidate);
  vi.advanceTimersByTime(ms);
  return frames;
}

describe("a running mark, seen or not", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks no frame while the page is hidden, and goes on asking once it is shown again", () => {
    const page = aPage();
    const tick = runningTick();
    const invalidate = vi.fn(() => tick.ask(invalidate));
    tick.ask(invalidate);
    vi.advanceTimersByTime(1000);
    const seen = invalidate.mock.calls.length;
    expect(seen).toBeGreaterThanOrEqual(25);
    page.hide();
    // (an hour hidden: not one frame, and no timer left waiting)
    vi.advanceTimersByTime(3600 * 1000);
    expect(invalidate).toHaveBeenCalledTimes(seen);
    expect(vi.getTimerCount()).toBe(0);
    // (shown again: a frame at once, then about thirty a second again)
    page.show();
    expect(invalidate).toHaveBeenCalledTimes(seen + 1);
    vi.advanceTimersByTime(1000);
    expect(invalidate.mock.calls.length - seen).toBeGreaterThanOrEqual(25);
    tick.stop();
  });

  it("asks no frame while the page is hidden, counted as the page counts them", () => {
    const page = aPage();
    page.hide();
    const before = runningFramesAsked();
    const tick = runningTick();
    expect(run(tick, 60 * 1000)).toBe(0);
    expect(runningFramesAsked()).toBe(before);
    tick.stop();
  });

  it("asks no frame while its tab is not the one shown, and goes on once it is", () => {
    aPage();
    const tick = runningTick();
    const invalidate = vi.fn(() => tick.ask(invalidate));
    tick.ask(invalidate);
    vi.advanceTimersByTime(100);
    tick.shown(false);
    const before = invalidate.mock.calls.length;
    vi.advanceTimersByTime(60 * 1000);
    expect(invalidate).toHaveBeenCalledTimes(before);
    tick.shown(true);
    vi.advanceTimersByTime(1000);
    expect(invalidate.mock.calls.length - before).toBeGreaterThanOrEqual(25);
    tick.stop();
  });

  it("goes on where it stood once seen again: no leap for the time it was hidden", () => {
    const page = aPage();
    const tick = runningTick();
    const drawn: number[] = [];
    run(tick, 1000, drawn);
    const at = tick.time();
    expect(at).toBeGreaterThan(0.9);
    page.hide();
    vi.advanceTimersByTime(3600 * 1000);
    page.show();
    vi.advanceTimersByTime(RUNNING_FRAME_MS * 2);
    // (no step longer than a frame's own: the hour hidden not made up, nor a tenth of a second)
    expect(Math.max(...drawn)).toBeLessThanOrEqual(RUNNING_FRAME_MS / 1000 + 1e-9);
    expect(tick.time() - at).toBeLessThan(0.1);
    tick.stop();
  });

  it("is still where the system asks for less motion: no frame asked, and moved by none at a frame drawn for something else", () => {
    const page = aPage();
    page.lessMotion(true);
    const tick = runningTick();
    expect(run(tick, 10 * 1000)).toBe(0);
    expect(tick.step(1 / 60)).toBe(0);
    expect(tick.time()).toBe(0);
    // (and moving again as the setting is let go)
    page.lessMotion(false);
    const invalidate = vi.fn(() => tick.ask(invalidate));
    tick.ask(invalidate);
    vi.advanceTimersByTime(1000);
    expect(invalidate.mock.calls.length).toBeGreaterThanOrEqual(25);
    tick.stop();
  });

  it("goes by the document's being hidden, not by the window's being in front: a window behind another is seen", () => {
    aPage();
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    const tick = runningTick();
    win.dispatchEvent(new Event("blur"));
    expect(run(tick, 1000)).toBeGreaterThanOrEqual(25);
    tick.stop();
  });

  it("leaves nothing watching once stopped: shown again, it asks nothing", () => {
    const page = aPage();
    const tick = runningTick();
    const invalidate = vi.fn(() => tick.ask(invalidate));
    tick.ask(invalidate);
    page.hide();
    tick.stop();
    page.show();
    vi.advanceTimersByTime(1000);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
