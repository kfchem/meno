import { describe, expect, it } from "vitest";
import { hoverFollows, type View } from "./hoverFollows";

/**
 * The pointer resting on a PDF, the view fitted to the page (Cmd+1): the PDF
 * went to a corner and stayed lit, and Delete took it away, from under
 * nothing. What is under the pointer is now found again as the view moves.
 */
describe("what is under a resting pointer, the view moving", () => {
  function follow(held = false) {
    let view: View = { x: 0, y: 0, zoom: 20 };
    let found = 0;
    let raycasts = 0;
    let holding = held;
    const frame = hoverFollows(
      () => view,
      () => holding,
      (raycast) => {
        found++;
        raycast();
      },
      () => raycasts++,
    );
    return {
      frame,
      move: (to: Partial<View>) => (view = { ...view, ...to }),
      hold: (h: boolean) => (holding = h),
      found: () => found,
      raycasts: () => raycasts,
    };
  }

  it("is found again each frame the view has moved, the canvas's own things too", () => {
    const f = follow();
    f.frame();
    expect(f.found()).toBe(0);
    f.move({ x: 3 });
    f.frame();
    f.move({ zoom: 30 });
    f.frame();
    expect(f.found()).toBe(2);
    expect(f.raycasts()).toBe(2);
  });

  it("is left as it is while the view is still", () => {
    const f = follow();
    f.frame();
    f.frame();
    f.frame();
    expect(f.found()).toBe(0);
  });

  it("is left to the drag while a button is held", () => {
    const f = follow(true);
    f.frame();
    f.move({ y: 5 });
    f.frame();
    expect(f.found()).toBe(0);
    f.hold(false);
    f.move({ y: 6 });
    f.frame();
    expect(f.found()).toBe(1);
  });
});
