import { describe, expect, it, vi } from "vitest";
import { MOV_PX } from "../constants";
import { chordedPress, endsDrag, movePress, releaseClicksBond, startPress, swallowPress } from "./press";

describe("press", () => {
  it("is a click when the button comes up where it went down", () => {
    const p = startPress(100, 100);
    expect(endsDrag(p, 100, 100)).toBe(false);
    expect(endsDrag(movePress(p, 102, 101), 101, 100)).toBe(false);
  });

  it("ends a drag when it comes up away from where it went down", () => {
    expect(endsDrag(startPress(100, 100), 100 + MOV_PX, 100)).toBe(true);
  });

  it("ends a drag that came back to where it began", () => {
    // a chain dragged out of an atom and brought back onto it
    let p = startPress(100, 100);
    p = movePress(p, 180, 60);
    p = movePress(p, 100, 100);
    expect(p.travelled).toBe(true);
    expect(endsDrag(p, 100, 100)).toBe(true);
  });

  it("is a click when no press was seen", () => {
    expect(endsDrag(null, 500, 500)).toBe(false);
  });
});

describe("a right press", () => {
  it("in the middle of a drag - the primary button held - is chorded, and opens no menu", () => {
    // (the menu's event, or the move the press came as, with both buttons held)
    expect(chordedPress(3, 1)).toBe(true);
    expect(chordedPress(2, 3)).toBe(true);
    // a right-click of its own; a Ctrl-click on a Mac, the primary button alone
    expect(chordedPress(2, 2)).toBe(false);
    expect(chordedPress(1, 1)).toBe(false);
    expect(chordedPress(0, 0)).toBe(false);
  });
});

/**
 * A press that closes a menu or Quick Add went on to what was under it: an
 * atom's label began to be written half a second later. It only closes it
 * now, as on a Mac (the maintainer, 2026-10-12).
 */
describe("a press swallowed", () => {
  const event = (type: string) => new Event(type, { cancelable: true });

  it("goes no further, nor does its release, its click or its menu", () => {
    vi.useFakeTimers();
    try {
      const on = new EventTarget();
      const down = event("pointerdown");
      swallowPress(down, on);
      expect(down.defaultPrevented).toBe(true);
      for (const type of ["mousedown", "contextmenu", "pointerup", "mouseup", "click"]) {
        const e = event(type);
        on.dispatchEvent(e);
        expect(e.defaultPrevented, type).toBe(true);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("is over once it has been let go: the next press is heard", () => {
    vi.useFakeTimers();
    try {
      const on = new EventTarget();
      swallowPress(event("pointerdown"), on);
      on.dispatchEvent(event("pointerup"));
      on.dispatchEvent(event("click"));
      vi.runAllTimers();
      const next = event("mousedown");
      on.dispatchEvent(next);
      expect(next.defaultPrevented).toBe(false);
      const click = event("click");
      on.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is over after a while should no release come", () => {
    vi.useFakeTimers();
    try {
      const on = new EventTarget();
      swallowPress(event("pointerdown"), on, 1000);
      vi.advanceTimersByTime(1001);
      const click = event("click");
      on.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * A right-click on the bond clicked last cycled it - a wedge became hashed -
 * and shut the menu it had opened: the left press's arming was never used
 * up, and the right release counted it as a click.
 */
describe("a release on a bond", () => {
  const armed = { armed: true, downBondId: 7 };

  it("clicks it after a press with the main button that began on it", () => {
    expect(releaseClicksBond(armed, 7, 0)).toBe(true);
  });

  it("is no click of the right button's, nor on another bond, nor unarmed", () => {
    expect(releaseClicksBond(armed, 7, 2)).toBe(false);
    expect(releaseClicksBond(armed, 8, 0)).toBe(false);
    expect(releaseClicksBond({ armed: false, downBondId: null }, 7, 0)).toBe(false);
  });
});
