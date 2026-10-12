import { describe, expect, it } from "vitest";
import { isPinch, looksLikeFingers, scrollsAlong, wheelReader, zoomTaken, type WheelLike } from "./wheel";

const ev = (over: Partial<WheelLike>): WheelLike => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  timeStamp: 0,
  ...over,
});

describe("looksLikeFingers", () => {
  it("reads a mouse wheel's notch as a wheel", () => {
    expect(looksLikeFingers(ev({ deltaY: 120 }))).toBe(false); // WebKit, macOS
    expect(looksLikeFingers(ev({ deltaY: -100 }))).toBe(false); // Chromium, Windows
    expect(looksLikeFingers(ev({ deltaY: 3, deltaMode: 1 }))).toBe(false); // lines
  });

  it("reads a smoothly scrolling mouse's notch as a wheel, and a trackpad's start as fingers", () => {
    // measured on macOS (WebKit): a Logitech MX Master 3S, a notch and a spin
    expect(looksLikeFingers(ev({ deltaY: -13 }))).toBe(false);
    expect(looksLikeFingers(ev({ deltaY: -101 }))).toBe(false);
    // a trackpad, slowly and flicked: it begins small whichever
    expect(looksLikeFingers(ev({ deltaY: -1 }))).toBe(true);
    expect(looksLikeFingers(ev({ deltaY: 1 }))).toBe(true);
    expect(looksLikeFingers(ev({ deltaY: 2 }))).toBe(true);
  });

  it("reads small, sideways or fractional steps as fingers", () => {
    expect(looksLikeFingers(ev({ deltaY: 7, deltaX: -2 }))).toBe(true);
    expect(looksLikeFingers(ev({ deltaY: 5 }))).toBe(true);
    expect(looksLikeFingers(ev({ deltaY: 42.5 }))).toBe(true);
    // Shift turns a wheel sideways on Windows: still a wheel
    expect(looksLikeFingers(ev({ deltaX: 100, shiftKey: true }))).toBe(false);
  });

  it("reads notches a hair off whole, as display scaling leaves them, as a wheel", () => {
    // Chromium on Windows at 175 %: ten notches sent at once, measured
    expect(looksLikeFingers(ev({ deltaY: 999.9999302455357 }))).toBe(false);
    expect(looksLikeFingers(ev({ deltaY: -999.9999302455357 }))).toBe(false);
    // (and the run they begin is a wheel's: it zooms, it does not move the view)
    expect(wheelReader()(ev({ deltaY: 999.9999302455357, timeStamp: 1000 }))).toBe("zoom");
    // a trackpad's fractions are still fingers
    expect(looksLikeFingers(ev({ deltaY: 13.25 }))).toBe(true);
  });
});

describe("isPinch", () => {
  it("follows a pinch, which Chromium gives as Ctrl with small, fractional steps", () => {
    expect(isPinch(ev({ deltaY: 2.4, ctrlKey: true }))).toBe(true);
    expect(isPinch(ev({ deltaY: -3, ctrlKey: true }))).toBe(true);
  });

  it("takes Ctrl with a mouse's notch as the wheel, not as a pinch", () => {
    // Chromium on Windows: a notch is 100 px, which a pinch's reading would
    // turn into a zoom of e, 2.7 times, at one click
    expect(isPinch(ev({ deltaY: 100, ctrlKey: true }))).toBe(false);
    expect(isPinch(ev({ deltaY: -100, ctrlKey: true }))).toBe(false);
    // a wheel scrolled a line at a time says so
    expect(isPinch(ev({ deltaY: 3, deltaMode: 1, ctrlKey: true }))).toBe(false);
  });

  it("is never a pinch without Ctrl", () => {
    expect(isPinch(ev({ deltaY: 2.4 }))).toBe(false);
  });
});

describe("wheelReader", () => {
  it("zooms on a pinch, which comes with Ctrl", () => {
    const read = wheelReader();
    expect(read(ev({ deltaY: 2, ctrlKey: true }))).toBe("zoom");
  });

  it("keeps a run's first answer to its end", () => {
    const read = wheelReader();
    // fingers: a small first step, then a large one mid-stroke
    expect(read(ev({ deltaY: 4, timeStamp: 0 }))).toBe("pan");
    expect(read(ev({ deltaY: 120, timeStamp: 16 }))).toBe("pan");
    // a pause, then a wheel's notch: a new run
    expect(read(ev({ deltaY: 120, timeStamp: 600 }))).toBe("zoom");
    expect(read(ev({ deltaY: 4, timeStamp: 650 }))).toBe("zoom");
  });
});

describe("zoomTaken", () => {
  const all = (left: number, dts: number[]) => {
    let taken = 0;
    for (const dt of dts) {
      if (left === 0) break;
      const t = zoomTaken(left, dt, 10);
      taken += t;
      left -= t;
    }
    return { taken, left };
  };

  it("takes all a notch has to zoom and no more, at sixty frames a second or at a hundred and twenty", () => {
    for (const dt of [1 / 60, 1 / 120, 1 / 240]) {
      const { taken, left } = all(0.16, Array(2000).fill(dt));
      expect(taken).toBeCloseTo(0.16, 9);
      expect(left).toBe(0);
    }
  });

  it("takes no more than a thirtieth of a second's worth in a frame long in coming - the first after the view was still", () => {
    expect(zoomTaken(0.16, 5, 10)).toBeCloseTo(0.16 * (1 - Math.exp(-10 / 30)), 9);
    const { taken } = all(-0.16, [5, ...Array(500).fill(1 / 60)]);
    expect(taken).toBeCloseTo(-0.16, 9);
  });
});

describe("scrollsAlong", () => {
  // a list of rows 300 px long in a card 120 px tall, scrolled 50 px down
  const list = { overflowX: "hidden", overflowY: "auto", scrollLeft: 0, scrollTop: 50, scrollWidth: 200, scrollHeight: 300, clientWidth: 200, clientHeight: 120 };

  it("lets a list on the page take a wheel it can scroll further with", () => {
    expect(scrollsAlong(list, 0, 40)).toBe(true);
    expect(scrollsAlong(list, 0, -40)).toBe(true);
  });

  it("gives the wheel to the view once the list is at its end that way, or cannot scroll", () => {
    expect(scrollsAlong({ ...list, scrollTop: 0 }, 0, -40)).toBe(false);
    expect(scrollsAlong({ ...list, scrollTop: 180 }, 0, 40)).toBe(false);
    // (sideways, where it does not scroll sideways)
    expect(scrollsAlong(list, 40, 0)).toBe(false);
    // (a chip, its words all in view, or clipped rather than scrolled)
    expect(scrollsAlong({ ...list, scrollHeight: 120 }, 0, 40)).toBe(false);
    expect(scrollsAlong({ ...list, overflowY: "hidden" }, 0, 40)).toBe(false);
  });
});
