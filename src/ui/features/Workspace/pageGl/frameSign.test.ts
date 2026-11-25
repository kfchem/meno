import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import { frameTabParts, FRAME_PX, type FrameTab } from "./frameParts";
import type { Box } from "./shapes";

const set = (sign?: FrameTab["sign"]): FrameTab => ({ key: "set:1", box: { x0: 0, y0: -4, x1: 6, y1: 0 }, tone: "rest", tab: { icon: "copies", name: "Input", status: "1 structure" }, iconWhenSmall: true, ...(sign ? { sign } : {}) });
const boxes = (it: FrameTab) => frameTabParts([it], true).shapes.filter((s): s is Box => s.kind === "box");

describe("a set's frame while the pointer is held", () => {
  it("that would take what is held: its own frame's edge in Meno's colour and a wash of it over its room, as far as it has come", () => {
    const shapes = boxes(set({ takes: 0.5, letsGo: 0 }));
    const takes = shapes.find((s) => s.key === "set:1:takes")!;
    expect(takes).toMatchObject({ x0: 0, y0: -4, x1: 6, y1: 0, radiusPx: FRAME_PX.radius, fill: COLORS.base, fillAlpha: 0.05, line: { widthPx: 1, color: COLORS.base }, opacity: 0.5 });
    // (its hairline stays under it: the edge is not dashed)
    expect(shapes.find((s) => s.key === "set:1:frame")!.opacity).toBe(1);
  });

  it("that would let a member go: its edge drawn dashed grey in page pixels, no wash - its hairline giving way as the dashes come", () => {
    const shapes = boxes(set({ takes: 0, letsGo: 0.75 }));
    const goes = shapes.find((s) => s.key === "set:1:letsGo")!;
    expect(goes).toMatchObject({ x0: 0, y0: -4, x1: 6, y1: 0, line: { widthPx: 1, color: COLORS.quiet, dashed: { onPx: 3, offPx: 3 } }, opacity: 0.75 });
    expect(goes.fill).toBeUndefined();
    expect(shapes.find((s) => s.key === "set:1:frame")!.opacity).toBeCloseTo(0.25, 9);
  });

  it("at rest: the frame alone, and no box anywhere but the frame's", () => {
    const shapes = boxes(set());
    expect(shapes.map((s) => s.key)).toEqual(["set:1:frame"]);
    expect(shapes[0]).toMatchObject({ x0: 0, y0: -4, x1: 6, y1: 0, opacity: 1 });
  });
});
