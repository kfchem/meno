import { describe, expect, it } from "vitest";
import { stillPointer, viewMoved } from "./stillPointer";

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
  it("is moved when two fingers move it, the wheel zooms it, or it is fitted - not when it is first drawn", () => {
    const was = { x: 0, y: 0, zoom: 40 };
    expect(viewMoved(null, was)).toBe(false);
    expect(viewMoved(was, { ...was })).toBe(false);
    expect(viewMoved(was, { ...was, x: -6 })).toBe(true);
    expect(viewMoved(was, { ...was, zoom: 46 })).toBe(true);
  });
});
