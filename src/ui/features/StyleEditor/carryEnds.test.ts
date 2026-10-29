/** A style card carried (StylePicker3D) ended other than by its let-go: the window left, or Escape. */
import { describe, expect, it } from "vitest";
import { carryEnds } from "./carryEnds";

// (no page in Node: a window as far as a carry's end uses one - its events)
const escape = (key = "Escape") => Object.assign(new Event("keydown", { cancelable: true }), { key });

describe("a style card carried", () => {
  it("goes back where it came from as the window loses focus, its let-go lost", () => {
    const win = new EventTarget();
    let back = 0;
    carryEnds(win, () => true, () => back++);
    win.dispatchEvent(new Event("blur"));
    expect(back).toBe(1);
  });

  it("goes back on Escape, which then ends only the carry - not what the cards are on", () => {
    const win = new EventTarget();
    let back = 0;
    carryEnds(win, () => true, () => back++);
    const e = escape();
    win.dispatchEvent(e);
    expect(back).toBe(1);
    // (taken: nothing after it closes Settings as well)
    expect(e.defaultPrevented).toBe(true);
  });

  it("leaves Escape alone with no card pressed, and every other key", () => {
    const win = new EventTarget();
    let back = 0;
    let pressed = false;
    carryEnds(win, () => pressed, () => back++);
    const e = escape();
    win.dispatchEvent(e);
    expect([back, e.defaultPrevented]).toEqual([0, false]);
    pressed = true;
    const enter = escape("Enter");
    win.dispatchEvent(enter);
    expect([back, enter.defaultPrevented]).toEqual([0, false]);
  });

  it("hears neither once stopped", () => {
    const win = new EventTarget();
    let back = 0;
    const stop = carryEnds(win, () => true, () => back++);
    stop();
    win.dispatchEvent(new Event("blur"));
    win.dispatchEvent(escape());
    expect(back).toBe(0);
  });
});
