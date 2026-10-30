/** A render's frame carried by a drag (carry, Renders2D): the drag itself, its moves and its end. */
import { describe, expect, it } from "vitest";
import { carryFrame } from "./carry";

// (no page in Node: an element as far as a carry uses one - its events, its pointer capture, its cursor)
function element() {
  const el = new EventTarget() as EventTarget & { style: { cursor: string }; captured: number[]; setPointerCapture: (id: number) => void };
  el.style = { cursor: "grab" };
  el.captured = [];
  el.setPointerCapture = (id) => void el.captured.push(id);
  return el;
}
const pointer = (type: string, clientX: number, clientY: number) => Object.assign(new Event(type), { clientX, clientY });

describe("a render's frame carried", () => {
  it("goes as far as the pointer does, in the page's units at the zoom, the page up where the screen is down", () => {
    const el = element();
    const moves: [number, number][] = [];
    carryFrame(el as unknown as HTMLElement, { pointerId: 7, clientX: 100, clientY: 200 }, { x: 40, y: -10 }, 0.5, (x, y) => moves.push([x, y]));
    expect(el.captured).toEqual([7]);
    el.dispatchEvent(pointer("pointermove", 120, 190));
    el.dispatchEvent(pointer("pointermove", 90, 230));
    // (from where it was pressed each time, not from the move before)
    expect(moves).toEqual([
      [50, -5],
      [35, -25],
    ]);
  });

  it("shows the closed hand while it is carried, the open one let go - and moves no more after", () => {
    for (const end of ["pointerup", "pointercancel"]) {
      const el = element();
      const moves: [number, number][] = [];
      carryFrame(el as unknown as HTMLElement, { pointerId: 1, clientX: 0, clientY: 0 }, { x: 0, y: 0 }, 1, (x, y) => moves.push([x, y]));
      expect(el.style.cursor).toBe("grabbing");
      el.dispatchEvent(pointer("pointermove", 3, 4));
      el.dispatchEvent(new Event(end));
      expect(el.style.cursor).toBe("grab");
      el.dispatchEvent(pointer("pointermove", 30, 40));
      expect(moves).toEqual([[3, -4]]);
    }
  });
});
