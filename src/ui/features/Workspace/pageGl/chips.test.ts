import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import { FRAMES_CHIP_GAP } from "../utils/molecule3d";
import { CHIP, CHIP_SHUT, chipLine, shutChip } from "./chips";
import { textWidth } from "./texts";
import { pagePx } from "./units";

describe("a frames chip, shut, drawn by WebGL", () => {
  const runs = [
    { text: "7 / 19", tone: "quiet" as const },
    { text: " · 0.42 kcal/mol", tone: "ink" as const },
  ];

  it("is as wide as what it says and its room either side, as tall as its line, its padding and its line - hung its gap below where it hangs, its middle under it", () => {
    const d = shutChip("chip:4", runs, { x: 10, y: 5 });
    const box = d.shapes[0];
    if (box.kind !== "box") throw new Error("a box");
    const said = textWidth("7 / 19", 11) + textWidth(" · 0.42 kcal/mol", 11);
    expect(box.x1 - box.x0).toBeCloseTo(pagePx(said + 2 * CHIP.side), 9);
    expect(box.y1 - box.y0).toBeCloseTo(pagePx(CHIP.line + 2 * CHIP.pad + 2 * CHIP.border), 9);
    expect(box.y1).toBeCloseTo(5 - pagePx(FRAMES_CHIP_GAP), 9);
    expect((box.x0 + box.x1) / 2).toBeCloseTo(10, 9);
    expect(box).toMatchObject({ radiusPx: CHIP.radius, fill: COLORS.background, fillAlpha: CHIP_SHUT.fill, opacity: CHIP_SHUT.opacity, line: { widthPx: 1, color: COLORS.hairline }, shadow: CHIP.shadow });
    // (it takes the pointer over its box)
    expect(d.regions).toEqual([{ key: "chip:4", part: "chip", rect: { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 } }]);
  });

  it("says its runs one after another from its room's edge, each in its tone, on one baseline", () => {
    const d = shutChip("chip:4", runs, { x: 10, y: 5 });
    const box = d.shapes[0];
    if (box.kind !== "box") throw new Error("a box");
    expect(d.texts.map((t) => t.color)).toEqual([COLORS.quiet, COLORS.ink]);
    expect(d.texts[0].x).toBeCloseTo(box.x0 + pagePx(CHIP.side), 9);
    expect(d.texts[1].x).toBeCloseTo(d.texts[0].x + pagePx(textWidth("7 / 19", 11)), 9);
    expect(d.texts[1].y).toBe(d.texts[0].y);
    expect(d.texts[0].y).toBeLessThan(box.y1);
    expect(d.texts[0].y).toBeGreaterThan(box.y0);
  });

  it("cuts its title at its most, after its room", () => {
    const line = chipLine([
      { text: "1 / 3", tone: "quiet" },
      { text: "A title far too long to be said whole on a chip of the page, by a good way", tone: "ink", gapPx: 8, mostPx: 224 },
    ]);
    expect(line.runs[1].text.endsWith("…")).toBe(true);
    expect(textWidth(line.runs[1].text, 11)).toBeLessThanOrEqual(224);
    expect(line.runs[1].from).toBeCloseTo(textWidth("1 / 3", 11) + 8, 9);
  });
});
