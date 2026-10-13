import { describe, expect, it } from "vitest";
import { FIND_EVERY_MS, movedUnderPress, stillPointer, viewMoved } from "./stillPointer";

const ev = (type: string, x: number, y: number, more: { buttons?: number; pointerType?: string } = {}) => ({
  type,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: more.pointerType ?? "mouse",
  buttons: more.buttons ?? 0,
});

describe("what is under a pointer held still, found again", () => {
  it("is found where a mouse last moved to once something has moved under it, and once only", () => {
    const p = stillPointer();
    p.moved();
    expect(p.findAgain()).toBeNull();
    p.heard(ev("pointermove", 500, 313));
    expect(p.findAgain()).toBeNull();
    p.moved();
    expect(p.findAgain()).toEqual({ clientX: 500, clientY: 313, pointerId: 1, buttons: 0 });
    expect(p.findAgain()).toBeNull();
  });

  it("is found at most every tenth of a second with no button held, the rest put off - not with one held", () => {
    const p = stillPointer();
    p.heard({ type: "pointermove", clientX: 500, clientY: 313, pointerId: 1, pointerType: "mouse", buttons: 0 });
    p.moved();
    expect(p.findAgain(1000)).not.toBeNull();
    p.moved();
    expect(p.findAgain(1040)).toBeNull();
    expect(p.wait(1040)).toBe(FIND_EVERY_MS - 40);
    expect(p.findAgain(1000 + FIND_EVERY_MS)).not.toBeNull();
    expect(p.wait(1000 + FIND_EVERY_MS)).toBeNull();
    // (a press held: every frame)
    p.heard({ type: "pointerdown", clientX: 500, clientY: 313, pointerId: 1, pointerType: "mouse", buttons: 1 });
    p.moved();
    expect(p.findAgain(2000)).not.toBeNull();
    p.moved();
    expect(p.findAgain(2010)).not.toBeNull();
  });

  it("is found with the button held too: what the press drags follows the pointer as the view moves", () => {
    const p = stillPointer();
    p.heard(ev("pointermove", 500, 313));
    p.heard(ev("pointerdown", 500, 313, { buttons: 1 }));
    p.heard(ev("pointermove", 560, 380, { buttons: 1 }));
    // (two fingers move the view while the press is held)
    p.moved();
    expect(p.findAgain()).toEqual({ clientX: 560, clientY: 380, pointerId: 1, buttons: 1 });
  });

  it("asks for a frame when the button is let go with something moved under it not yet found", () => {
    const p = stillPointer();
    p.heard(ev("pointerdown", 500, 313, { buttons: 1 }));
    // (the view moved by the drag itself: found once it is let go)
    p.moved();
    expect(p.heard(ev("pointerup", 500, 313))).toBe(true);
    expect(p.findAgain()).toEqual({ clientX: 500, clientY: 313, pointerId: 1, buttons: 0 });
    expect(p.heard(ev("pointerup", 500, 313))).toBe(false);
  });

  it("is left to a move, which finds for itself", () => {
    const p = stillPointer();
    p.heard(ev("pointermove", 500, 313));
    p.moved();
    p.heard(ev("pointermove", 504, 313));
    expect(p.findAgain()).toBeNull();
  });

  it("is over nothing once it has left the view, or was a finger or a pen", () => {
    const p = stillPointer();
    p.heard(ev("pointermove", 500, 313));
    p.moved();
    p.heard(ev("pointerleave", 999, 313));
    expect(p.findAgain()).toBeNull();
    p.heard(ev("pointermove", 500, 313));
    p.heard(ev("pointercancel", 500, 313));
    p.moved();
    expect(p.findAgain()).toBeNull();
    p.heard(ev("pointerup", 500, 313, { pointerType: "touch" }));
    p.moved();
    expect(p.findAgain()).toBeNull();
    p.heard(ev("pointermove", 500, 313, { pointerType: "pen" }));
    p.moved();
    expect(p.findAgain()).toBeNull();
  });
});

describe("a view moved", () => {
  it("is moved when two fingers move it, the wheel zooms it, it is fitted or the window resized - not when it is first drawn", () => {
    const was = { x: 0, y: 0, zoom: 40, width: 1280, height: 800 };
    expect(viewMoved(null, was)).toBe(false);
    expect(viewMoved(was, { ...was })).toBe(false);
    expect(viewMoved(was, { ...was, x: -6 })).toBe(true);
    expect(viewMoved(was, { ...was, zoom: 46 })).toBe(true);
    expect(viewMoved(was, { ...was, width: 1000 })).toBe(true);
  });
});

describe("a press the view moved under", () => {
  it("is one once the page under the pointer has gone as far as a press may travel and still be a click", () => {
    // (at 40 px a page unit, a press may travel 5 px: an eighth of a unit)
    expect(movedUnderPress({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 40, 5)).toBe(false);
    expect(movedUnderPress({ x: 0, y: 0 }, { x: 0.125, y: 0 }, 40, 5)).toBe(true);
    expect(movedUnderPress({ x: 0, y: 0 }, { x: 3, y: 4 }, 1, 5)).toBe(true);
    // (a wheel's zoom about the pointer leaves the page under it where it was)
    expect(movedUnderPress({ x: 2, y: 1 }, { x: 2, y: 1 }, 300, 5)).toBe(false);
  });
});
