import { describe, expect, it } from "vitest";
import { hoverKeeper } from "./keptHover";

/** A store's hovered thing, a window and a canvas, and a keeper over them. */
function setUp(hovered: number | null) {
  const st = { hovered };
  const win = new EventTarget();
  const canvas = new EventTarget();
  const keeper = hoverKeeper<number>({ get: () => st.hovered, set: (id) => void (st.hovered = id) }, win, canvas);
  return { st, win, canvas, keeper };
}

describe("a thing pressed, kept hovered", () => {
  it("is hovered again where stopping the press took its hover away, and stays so as the canvas hovers it at the next move", () => {
    // (pressed on PDF 1, the press stopped: the canvas said the pointer was out of it)
    const { st, win, keeper } = setUp(null);
    keeper.keep(1);
    expect(st.hovered).toBe(1);
    // (the second click of a double-click, before any move: still hovered)
    keeper.keep(1);
    expect(st.hovered).toBe(1);
    // (the pointer moves on it: the canvas hovers it again, then the move reaches the window)
    keeper.over(1);
    win.dispatchEvent(new Event("pointermove"));
    expect(st.hovered).toBe(1);
  });

  it("lets the hover go at the next move if the canvas does not hover it again - the pointer is elsewhere - or as the pointer leaves the canvas", () => {
    const a = setUp(null);
    a.keeper.keep(1);
    a.win.dispatchEvent(new Event("pointermove"));
    expect(a.st.hovered).toBeNull();
    const b = setUp(null);
    b.keeper.keep(1);
    b.canvas.dispatchEvent(new Event("pointerleave"));
    expect(b.st.hovered).toBeNull();
    // (once: a later move does not let a later hover go)
    b.st.hovered = 1;
    b.win.dispatchEvent(new Event("pointermove"));
    expect(b.st.hovered).toBe(1);
  });

  it("does nothing where the press kept its hover, nor lets go another thing hovered since", () => {
    const a = setUp(1);
    a.keeper.keep(1);
    a.win.dispatchEvent(new Event("pointermove"));
    expect(a.st.hovered).toBe(1);
    const b = setUp(null);
    b.keeper.keep(1);
    b.st.hovered = 2;
    b.win.dispatchEvent(new Event("pointermove"));
    expect(b.st.hovered).toBe(2);
  });
});
