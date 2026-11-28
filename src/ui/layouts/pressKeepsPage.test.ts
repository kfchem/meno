import { describe, expect, it, vi } from "vitest";
import { KEEPS_PAGE, keepPress, onKeptPress } from "./pressKeepsPage";

/** An element that keeps the page, or one that does not, as `closest` finds it. */
function el(keeps: boolean) {
  const self = { closest: (selector: string) => (keeps && selector === `[${KEEPS_PAGE}]` ? self : null) } as unknown as Element;
  return self;
}

/** A press of `type` on `target`, what was done to it counted. */
function press(type: "pointerdown" | "mousedown", target: unknown) {
  return { type, target, button: 0, stopImmediatePropagation: vi.fn(), preventDefault: vi.fn() };
}

describe("a press on the title bar's Undo, or its history", () => {
  it("is heard by no other listener - no press away from words being typed, Quick Add or a chain - and only by its own handler", () => {
    const undo = el(true);
    const handle = vi.fn();
    const off = onKeptPress(undo, handle);
    const down = press("pointerdown", undo);
    expect(keepPress(down)).toBe(true);
    expect(down.stopImmediatePropagation).toHaveBeenCalled();
    expect(handle).toHaveBeenCalledWith(down);
    off();
  });

  it("leaves the focus where it was: the press's mousedown is not let move it", () => {
    const down = press("mousedown", el(true));
    expect(keepPress(down)).toBe(true);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(down.stopImmediatePropagation).toHaveBeenCalled();
  });

  it("is the only press so kept: one on the page goes on to all that listen", () => {
    for (const type of ["pointerdown", "mousedown"] as const) {
      const down = press(type, el(false));
      expect(keepPress(down)).toBe(false);
      expect(down.stopImmediatePropagation).not.toHaveBeenCalled();
      expect(down.preventDefault).not.toHaveBeenCalled();
    }
    expect(keepPress(press("pointerdown", null))).toBe(false);
  });
});
