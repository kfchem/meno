import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import type { Box } from "./shapes";
import { positionBadge, recordLabel } from "./workflowMarks";
import { textWidth } from "./texts";
import { pagePx } from "./units";

describe("a workflow's small marks drawn by WebGL", () => {
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

describe("a workflow's small marks' least sizes", () => {
  it("are a round badge at least 16 px across for a single figure, and a structure's number taking 16 px of height for its tip", () => {
    const b = positionBadge("p", 0, 0, 3);
    expect(b.shape.kind === "box" && b.shape.x1 - b.shape.x0).toBeCloseTo(pagePx(16), 9);
    const r = recordLabel("r", 0, 0, "#3", true).region!;
    expect("rect" in r && r.rect.y1 - r.rect.y0).toBeCloseTo(pagePx(16), 9);
  });
});
