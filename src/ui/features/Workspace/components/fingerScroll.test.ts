import { describe, expect, it } from "vitest";
import { fingerScroll, FINGER_STILL_PX } from "./fingerScroll";

/** A body a finger is followed on, with its moves and presses kept, and frames given by hand. */
function body() {
  const el = Object.assign(new EventTarget(), { style: { touchAction: "" }, captured: [] as number[] });
  (el as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = (id: number) => el.captured.push(id);
  const moved: [number, number][] = [];
  const presses: [string, string][] = [];
  let next: ((t: number) => void) | null = null;
  const frames = {
    ask: (f: (t: number) => void) => {
      next = f;
      return 1;
    },
    cancel: () => {
      next = null;
    },
  };
  const off = fingerScroll(el as never, { scrollBy: (dx, dy) => moved.push([dx, dy]), press: (d, u) => presses.push([d.type, u.type]) }, frames);
  const send = (type: string, x: number, y: number, t: number, more: Record<string, unknown> = {}) => {
    const e = Object.assign(new Event(type), { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, ...more });
    Object.defineProperty(e, "timeStamp", { value: t });
    el.dispatchEvent(e);
  };
  const frame = (t: number) => {
    const f = next;
    next = null;
    f?.(t);
    return !!f;
  };
  return { el, off, moved, presses, send, frame, glides: () => next !== null };
}

describe("a finger over what is read in the column", () => {
  it("leaves the web view no pan of its own there, and gives back what was there once it is no longer followed", () => {
    const b = body();
    expect(b.el.style.touchAction).toBe("none");
    b.off();
    expect(b.el.style.touchAction).toBe("");
  });

  it("dragged up, moves it down by as far as it went, and holds the pointer", () => {
    const b = body();
    b.send("pointerdown", 100, 300, 0);
    b.send("pointermove", 100, 290, 16);
    b.send("pointermove", 100, 250, 32);
    expect(b.moved).toEqual([
      [0, 10],
      [0, 40],
    ]);
    expect(b.el.captured).toEqual([1]);
    expect(b.presses).toEqual([]);
  });

  it("put down and taken up where it was - or nearly - is a press, not a move", () => {
    const b = body();
    b.send("pointerdown", 100, 300, 0);
    b.send("pointermove", 100 + FINGER_STILL_PX - 1, 300, 16);
    b.send("pointerup", 100 + FINGER_STILL_PX - 1, 300, 60);
    expect(b.moved).toEqual([]);
    expect(b.presses).toEqual([["pointerdown", "pointerup"]]);
    expect(b.glides()).toBe(false);
  });

  it("let go while moving, goes on and slows until it stops; held still first, it stays", () => {
    const b = body();
    b.send("pointerdown", 100, 400, 0);
    [16, 32, 48, 64].forEach((t, i) => b.send("pointermove", 100, 380 - 20 * i, t));
    b.send("pointerup", 100, 320, 70);
    expect(b.presses).toEqual([]);
    const before = b.moved.length;
    let frames = 0;
    for (let t = 80; b.frame(t) && frames < 1000; t += 16) frames++;
    const glided = b.moved.slice(before);
    expect(glided.length).toBeGreaterThan(3);
    expect(glided.every(([, dy]) => dy > 0)).toBe(true);
    expect(glided[glided.length - 1][1]).toBeLessThan(glided[0][1]);

    const c = body();
    c.send("pointerdown", 100, 400, 0);
    [16, 32, 48].forEach((t, i) => c.send("pointermove", 100, 380 - 20 * i, t));
    c.send("pointerup", 100, 340, 400);
    expect(c.glides()).toBe(false);
  });

  it("is stopped gliding by anything put down, or by the wheel", () => {
    const b = body();
    b.send("pointerdown", 100, 400, 0);
    [16, 32, 48].forEach((t, i) => b.send("pointermove", 100, 380 - 20 * i, t));
    b.send("pointerup", 100, 340, 50);
    expect(b.glides()).toBe(true);
    b.send("pointerdown", 10, 10, 60, { pointerType: "mouse" });
    expect(b.glides()).toBe(false);

    b.send("pointerdown", 100, 400, 100);
    [116, 132, 148].forEach((t, i) => b.send("pointermove", 100, 380 - 20 * i, t));
    b.send("pointerup", 100, 340, 150);
    expect(b.glides()).toBe(true);
    b.el.dispatchEvent(new Event("wheel"));
    expect(b.glides()).toBe(false);
  });

  it("leaves a mouse, a pen, a second finger and a finger taken by the system alone", () => {
    const b = body();
    for (const pointerType of ["mouse", "pen"]) {
      b.send("pointerdown", 100, 300, 0, { pointerType });
      b.send("pointermove", 100, 200, 16, { pointerType });
      b.send("pointerup", 100, 200, 32, { pointerType });
    }
    b.send("pointerdown", 100, 300, 40, { pointerId: 2, isPrimary: false });
    b.send("pointermove", 100, 200, 56, { pointerId: 2, isPrimary: false });
    b.send("pointerup", 100, 200, 72, { pointerId: 2, isPrimary: false });
    b.send("pointerdown", 100, 300, 80);
    b.send("pointercancel", 100, 300, 90);
    b.send("pointerup", 100, 300, 100);
    expect(b.moved).toEqual([]);
    expect(b.presses).toEqual([]);
  });
});
