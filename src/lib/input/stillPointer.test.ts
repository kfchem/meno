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

describe("a pointer resting over a view", () => {
  it("rests where a mouse last moved to, or was let go", () => {
    const p = stillPointer();
    expect(p.resting()).toBeNull();
    p.heard(ev("pointermove", 500, 313));
    expect(p.resting()).toEqual({ clientX: 500, clientY: 313, pointerId: 1 });
    p.heard(ev("pointerdown", 500, 313, { buttons: 1 }));
    p.heard(ev("pointermove", 560, 380, { buttons: 1 }));
    p.heard(ev("pointerup", 560, 380));
    expect(p.resting()).toEqual({ clientX: 560, clientY: 380, pointerId: 1 });
  });

  it("is not found again under while a button is held: a gesture has it", () => {
    const p = stillPointer();
    p.heard(ev("pointerdown", 500, 313, { buttons: 2 }));
    expect(p.resting()).toBeNull();
  });

  it("is over nothing once it has left the view, or was a finger or a pen", () => {
    const p = stillPointer();
    p.heard(ev("pointermove", 500, 313));
    p.heard(ev("pointerleave", 999, 313));
    expect(p.resting()).toBeNull();
    p.heard(ev("pointermove", 500, 313));
    p.heard(ev("pointercancel", 500, 313));
    expect(p.resting()).toBeNull();
    p.heard(ev("pointerup", 500, 313, { pointerType: "touch" }));
    expect(p.resting()).toBeNull();
    p.heard(ev("pointermove", 500, 313, { pointerType: "pen" }));
    expect(p.resting()).toBeNull();
  });
});

describe("what is under a resting pointer, found again", () => {
  it("is found once something has moved under it, and once only", () => {
    const p = stillPointer();
    p.heard(ev("pointermove", 500, 313));
    expect(p.findAgain()).toBeNull();
    p.moved();
    expect(p.findAgain()).toEqual({ clientX: 500, clientY: 313, pointerId: 1 });
    expect(p.findAgain()).toBeNull();
  });

  it("waits, when the view was moved with a button held, until the button is let go", () => {
    const p = stillPointer();
    p.heard(ev("pointermove", 500, 313));
    expect(p.heard(ev("pointerdown", 500, 313, { buttons: 1 }))).toBe(false);
    // (two fingers move the view while the press is held)
    p.moved();
    expect(p.findAgain()).toBeNull();
    p.moved();
    // (let go: a frame is wanted, which finds what has come under the pointer)
    expect(p.heard(ev("pointerup", 500, 313))).toBe(true);
    expect(p.findAgain()).toEqual({ clientX: 500, clientY: 313, pointerId: 1 });
    expect(p.heard(ev("pointerup", 500, 313))).toBe(false);
  });

  it("is left to a move, which finds for itself, and to nothing once the pointer has left", () => {
    const p = stillPointer();
    p.heard(ev("pointermove", 500, 313));
    p.moved();
    p.heard(ev("pointermove", 504, 313));
    expect(p.findAgain()).toBeNull();
    p.moved();
    p.heard(ev("pointerleave", 999, 313));
    p.heard(ev("pointermove", 500, 313));
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
