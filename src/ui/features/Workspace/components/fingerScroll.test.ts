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

/** A body that two fingers pinch, with what they asked for kept. */
function pinched() {
  const el = Object.assign(new EventTarget(), { style: { touchAction: "" }, captured: [] as number[] });
  (el as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = (id: number) => el.captured.push(id);
  const moved: [number, number][] = [];
  const presses: string[] = [];
  const begun: number[] = [];
  const pinches: { begun: number; a0: number[]; b0: number[]; a1: number[]; b1: number[] }[] = [];
  const xy = (p: { x: number; y: number }) => [p.x, p.y];
  fingerScroll(el as never, {
    scrollBy: (dx, dy) => moved.push([dx, dy]),
    press: (d) => presses.push(d.type),
    pinch: {
      begin: () => begun.push(begun.length + 1),
      to: (b, f) => pinches.push({ begun: b, a0: xy(f.a0), b0: xy(f.b0), a1: xy(f.a1), b1: xy(f.b1) }),
    },
  }, { ask: () => 1, cancel: () => {} });
  const send = (type: string, id: number, x: number, y: number, more: Record<string, unknown> = {}) => {
    const e = Object.assign(new Event(type), { pointerId: id, pointerType: "touch", isPrimary: id === 1, clientX: x, clientY: y, ...more });
    Object.defineProperty(e, "timeStamp", { value: 0 });
    el.dispatchEvent(e);
  };
  return { el, moved, presses, begun, pinches, send };
}

describe("two fingers over a PDF in the column", () => {
  it("spread apart, ask for it pinched from where both came down to where they are, followed at every move", () => {
    const b = pinched();
    b.send("pointerdown", 1, 100, 300);
    b.send("pointerdown", 2, 140, 300);
    b.send("pointermove", 1, 90, 300);
    b.send("pointermove", 2, 150, 300);
    expect(b.begun).toEqual([1]);
    expect(b.pinches).toEqual([
      { begun: 1, a0: [100, 300], b0: [140, 300], a1: [90, 300], b1: [140, 300] },
      { begun: 1, a0: [100, 300], b0: [140, 300], a1: [90, 300], b1: [150, 300] },
    ]);
    expect(b.el.captured).toEqual([1, 2]);
    expect(b.moved).toEqual([]);
  });

  it("begin from where the first finger is, though it had begun to drag, and make no press of it", () => {
    const b = pinched();
    b.send("pointerdown", 1, 100, 300);
    b.send("pointermove", 1, 100, 280);
    b.send("pointerdown", 2, 140, 300);
    b.send("pointermove", 2, 140, 320);
    b.send("pointerup", 2, 140, 320);
    b.send("pointerup", 1, 100, 280);
    expect(b.pinches[0].a0).toEqual([100, 280]);
    expect(b.moved).toEqual([[0, 20]]);
    expect(b.presses).toEqual([]);
  });

  it("one lifted, the other goes on as a drag from where it is, with no jump", () => {
    for (const lifted of [1, 2]) {
      const b = pinched();
      b.send("pointerdown", 1, 100, 300);
      b.send("pointerdown", 2, 140, 300);
      b.send("pointermove", 1, 80, 300);
      b.send("pointermove", 2, 160, 310);
      b.send("pointerup", lifted, 0, 0);
      const pinchedBy = b.pinches.length;
      const left = lifted === 1 ? 2 : 1;
      const at = left === 1 ? [80, 300] : [160, 310];
      b.send("pointermove", left, at[0], at[1] - 2);
      b.send("pointermove", left, at[0] + 3, at[1] - 7);
      expect(b.pinches.length).toBe(pinchedBy);
      expect(b.moved).toEqual([
        [0, 2],
        [-3, 5],
      ]);
      b.send("pointerup", left, at[0] + 3, at[1] - 7);
      expect(b.presses).toEqual([]);
    }
  });

  it("leave a third finger alone, the first two pinching on", () => {
    const b = pinched();
    b.send("pointerdown", 1, 100, 300);
    b.send("pointerdown", 2, 140, 300);
    b.send("pointerdown", 3, 200, 400);
    b.send("pointermove", 3, 250, 450);
    b.send("pointerup", 3, 250, 450);
    b.send("pointermove", 2, 160, 300);
    expect(b.begun).toEqual([1]);
    expect(b.pinches).toEqual([{ begun: 1, a0: [100, 300], b0: [140, 300], a1: [100, 300], b1: [160, 300] }]);
    expect(b.moved).toEqual([]);
  });

  it("are never a mouse or a pen with a finger", () => {
    for (const pointerType of ["mouse", "pen"]) {
      const b = pinched();
      b.send("pointerdown", 1, 100, 300);
      b.send("pointerdown", 2, 140, 300, { pointerType });
      b.send("pointermove", 2, 180, 300, { pointerType });
      b.send("pointermove", 1, 100, 280);
      expect(b.begun).toEqual([]);
      expect(b.moved).toEqual([[0, 20]]);
    }
  });

  it("taken by the system, one at a time or both, leave nothing held: a finger after is a finger again", () => {
    const b = pinched();
    b.send("pointerdown", 1, 100, 300);
    b.send("pointerdown", 2, 140, 300);
    b.send("pointercancel", 2, 140, 300);
    b.send("pointermove", 1, 100, 290);
    expect(b.moved).toEqual([[0, 10]]);
    b.send("pointercancel", 1, 100, 290);
    b.send("pointermove", 1, 100, 200);
    b.send("pointermove", 2, 100, 200);
    expect(b.moved).toEqual([[0, 10]]);
    b.send("pointerdown", 1, 50, 50);
    b.send("pointerup", 1, 50, 50);
    expect(b.presses).toEqual(["pointerdown"]);
    expect(b.pinches).toEqual([]);
  });

  it("over a text, which has no zoom, are as before: the second is not followed", () => {
    const b = body();
    b.send("pointerdown", 100, 300, 0);
    b.send("pointerdown", 140, 300, 8, { pointerId: 2, isPrimary: false });
    b.send("pointermove", 180, 300, 16, { pointerId: 2, isPrimary: false });
    b.send("pointermove", 100, 280, 24);
    expect(b.moved).toEqual([[0, 20]]);
  });
});
