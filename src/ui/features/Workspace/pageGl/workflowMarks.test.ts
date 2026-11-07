import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import type { Box } from "./shapes";
import { MEMBER_MS, memberMarkBox, memberPulse, positionBadge, recordLabel } from "./workflowMarks";
import { textWidth } from "./texts";
import { pagePx } from "./units";

describe("a workflow's small marks drawn by WebGL", () => {
  it("marks what joined a set or left it a moment: in to whole over its first 30 %, out to none by its end", () => {
    expect(memberPulse(0)).toBe(0);
    expect(memberPulse(0.3 * MEMBER_MS)).toBeCloseTo(1, 9);
    expect(memberPulse(MEMBER_MS)).toBeCloseTo(0, 9);
    expect(memberPulse(2 * MEMBER_MS)).toBeCloseTo(0, 9);
    const f = { x0: 0, y0: 0, x1: 4, y1: 3 };
    expect(memberMarkBox("m", f, true, 1)).toMatchObject({ fill: COLORS.base, fillAlpha: 0.05, line: { color: COLORS.base }, radiusPx: 8 });
    expect((memberMarkBox("m", f, false, 1) as Box).line).toMatchObject({ color: COLORS.quiet, dashed: { onPx: 3, offPx: 3 } });
  });

  it("numbers a position in a round badge as wide as its number and at least as high, its middle where it stands", () => {
    const b = positionBadge("p", 1, 2, 12);
    const box = b.shape as Box;
    expect(box.x1 - box.x0).toBeCloseTo(pagePx(Math.max(16, textWidth("12", 10) + 8)), 9);
    expect(box.y1 - box.y0).toBeCloseTo(pagePx(16), 9);
    expect(b.text).toMatchObject({ text: "12", x: 1, y: 2, anchor: "middle", color: COLORS.base });
  });

  it("says a structure's number under it, quietly, taking the pointer only where it has more to say in the tip", () => {
    const r = recordLabel("r", 0, 0, "#3", true);
    expect(r.text).toMatchObject({ text: "#3", color: COLORS.quiet, sizePx: 10 });
    expect(r.region).toMatchObject({ key: "r", part: "record" });
    expect(recordLabel("r", 0, 0, "#3", false).region).toBeNull();
  });
});
