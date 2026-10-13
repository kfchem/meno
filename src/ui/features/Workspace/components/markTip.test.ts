import { describe, expect, it } from "vitest";
import { tipPlace, tipUnder, TIP_GAP_PX, TIP_MARGIN_PX, type ScreenBox } from "./markTip";

const box = (left: number, top: number, right: number, bottom: number): ScreenBox => ({ left, top, right, bottom });
/** The canvas as seen: 1280 wide, 820 tall, from 40 down - the column over its right 480 where it is open. */
const room = box(0, 40, 1280, 860);
/** Words 300 wide, 20 tall, under a mark 40 wide whose middle is at `x`, its top at `y`. */
function under(x: number, y: number) {
  const mark = box(x - 20, y, x + 20, y + 30);
  return { mark, tip: tipUnder(mark, 300, 20) };
}

describe("what a mark says", () => {
  it("stays under the mark's middle where it can be seen there", () => {
    const { mark, tip } = under(600, 400);
    expect(tip).toEqual(box(450, 430 + TIP_GAP_PX, 750, 450 + TIP_GAP_PX));
    expect(tipPlace(tip, mark, room)).toEqual({ dx: 0, above: false });
  });

  it("moves along to keep clear of the canvas's edge, or of the column's", () => {
    // (a mark by the window's right edge: its words cut off there before)
    const a = under(1250, 400);
    expect(tipPlace(a.tip, a.mark, room).dx).toBe(1280 - TIP_MARGIN_PX - (1250 + 150));
    const b = under(780, 400);
    const seen = { ...room, right: room.right - 480 };
    expect(b.tip.right + tipPlace(b.tip, b.mark, seen).dx).toBe(800 - TIP_MARGIN_PX);
    const c = under(30, 400);
    expect(c.tip.left + tipPlace(c.tip, c.mark, room).dx).toBe(TIP_MARGIN_PX);
  });

  it("goes over the mark where there is no room under it, and keeps its start in view where it is wider than the room", () => {
    const a = under(600, 820);
    expect(tipPlace(a.tip, a.mark, room).above).toBe(true);
    const b = under(600, 400);
    const narrow = box(500, 40, 700, 860);
    expect(b.tip.left + tipPlace(b.tip, b.mark, narrow).dx).toBe(500 + TIP_MARGIN_PX);
  });
});
