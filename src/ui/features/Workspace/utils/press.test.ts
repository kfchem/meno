import { describe, expect, it, vi } from "vitest";
import { MOV_PX } from "../constants";
import { chordedPress, endsDrag, joinedBy, movePress, onChord, releaseClicksBond, startPress, swallowPress, togglesOn, traceEndedBy, flushesClick, turnTakenBack, bondTakesPress } from "./press";

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

describe("a long press another button joins", () => {
  it("is joined as a second button goes down with it - the move that says so - and not by the move of the button held alone", () => {
    // (the primary button held; the right one pressed with it)
    expect(joinedBy(1, 3)).toBe(true);
    expect(joinedBy(1, 1 | 4)).toBe(true);
    expect(joinedBy(1, 1)).toBe(false);
    // (the held button let go is no chord)
    expect(joinedBy(1, 0)).toBe(false);
  });

  it("calls off the press once, on the first move with another button, and listens no more", () => {
    // (a window of its own, as the test runs with none)
    const had = (globalThis as { window?: unknown }).window;
    const win = new EventTarget();
    (globalThis as { window?: unknown }).window = win;
    try {
      const fire = (type: string, buttons: number) => win.dispatchEvent(Object.assign(new Event(type), { buttons }));
      let chords = 0;
      const off = onChord(1, () => chords++);
      fire("pointermove", 1);
      expect(chords).toBe(0);
      fire("pointermove", 3);
      fire("mousedown", 3);
      fire("contextmenu", 3);
      expect(chords).toBe(1);
      // (let go before any chord: nothing heard after)
      let late = 0;
      const offLate = onChord(1, () => late++);
      offLate();
      fire("pointermove", 3);
      expect(late).toBe(0);
      off();
    } finally {
      (globalThis as { window?: unknown }).window = had;
    }
  });
});

describe("a press on a chain traced with the button up", () => {
  it("ends it with the primary button, and lets it go with the other", () => {
    expect(traceEndedBy(0, 2000, true, 500)).toBe("end");
    expect(traceEndedBy(2, 2000, true, 500)).toBe("let go");
  });

  it("takes the second press of the double-click that began it - as it begins, where it began - as nothing", () => {
    expect(traceEndedBy(0, 120, false, 500)).toBe("second click");
    // (a click once the pointer has gone on, or a moment later, ends it)
    expect(traceEndedBy(0, 120, true, 500)).toBe("end");
    expect(traceEndedBy(0, 800, false, 500)).toBe("end");
    // (the other button lets it go, whenever)
    expect(traceEndedBy(2, 120, false, 500)).toBe("let go");
  });
});

describe("a click on a panel's toggle", () => {
  it("toggles on the first click of a double-click only - double-clicked, the panel opens and stays - and from the keyboard", () => {
    expect(togglesOn(1)).toBe(true);
    expect(togglesOn(2)).toBe(false);
    expect(togglesOn(3)).toBe(false);
    expect(togglesOn(0)).toBe(true);
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

describe("a click on a bond, never lost and never in a double-click's way (the maintainer, 2026-11-17)", () => {
  it("a second click on the same bond soon after the first's turn takes that turn back - a slow double-click makes a double bond", () => {
    const turned = { id: 7, releasedAt: 1000, after: {} };
    expect(turnTakenBack(turned, 7, 1300, 350)).toBe(true);
    expect(turnTakenBack(turned, 7, 1350, 350)).toBe(true);
    // (too late, another bond, or no turn: none taken back)
    expect(turnTakenBack(turned, 7, 1351, 350)).toBe(false);
    expect(turnTakenBack(turned, 8, 1100, 350)).toBe(false);
    expect(turnTakenBack(null, 7, 1100, 350)).toBe(false);
  });

  it("a click waiting is turned at once as a press lands elsewhere - another bond, an atom, empty space - and waits on for one on its bond", () => {
    expect(flushesClick(7, 8)).toBe(true);
    expect(flushesClick(7, null)).toBe(true);
    expect(flushesClick(7, 7)).toBe(false);
    expect(flushesClick(null, 8)).toBe(false);
  });
});

describe("a press on a bond's hit area", () => {
  const L = 1;
  const [a1, a2] = [{ x: 0, y: 0 }, { x: L, y: 0 }];
  it("is the bond's away from its ends where no atom is lit", () => {
    expect(bondTakesPress(a1, a2, L, { x: 0.5, y: 0.05 }, null)).toBe(true);
  });
  it("is not the bond's near either of its own ends", () => {
    expect(bondTakesPress(a1, a2, L, { x: 0.2, y: 0 }, null)).toBe(false);
    expect(bondTakesPress(a1, a2, L, { x: 0.85, y: 0.05 }, null)).toBe(false);
  });
  it("is not the bond's where an atom of another bond is lit over it, an atom standing a tenth of a bond off its middle", () => {
    expect(bondTakesPress(a1, a2, L, { x: 0.5, y: 0.1 }, 7)).toBe(false);
  });
});
