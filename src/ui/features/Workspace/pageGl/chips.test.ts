import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHIP, CHIP_HTML, CHIP_SHUT, chipLine } from "./chips";
import { textWidth } from "./texts";

describe("a frames chip's line", () => {
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

describe("the chip's look in HTML", () => {
  const px = (prefix: string) => Number(new RegExp(`(?:^| )${prefix}-\\[(\\d+)px\\]`).exec(CHIP_HTML)?.[1]);
  it("has the room, line, words and rest opacity the chip WebGL draws has", () => {
    // (the border is inside the room either side, as the box's is)
    expect(px("px") + CHIP.border).toBe(CHIP.side);
    expect(px("py")).toBe(CHIP.pad);
    expect(px("leading")).toBe(CHIP.line);
    expect(px("text")).toBe(CHIP.size);
    expect(CHIP_HTML).toContain(`bg-white/${Math.round(CHIP_SHUT.fill * 100)}`);
    expect(CHIP_HTML).toContain(`opacity-${Math.round(CHIP_SHUT.opacity * 100)}`);
    const css = readFileSync(join(__dirname, "../../../../App.css"), "utf8");
    expect(CHIP_HTML).toContain("meno-chip-shadow");
    // (pointed at, it is whole, eased; round, hairline-bordered, and as wide as its words)
    for (const c of ["hover:opacity-100", "transition-opacity", "duration-150", "ease-meno", "rounded-full", "border border-gh-line", "w-max", "whitespace-nowrap"]) expect(CHIP_HTML).toContain(c);
    expect(css).toContain(`.meno-chip-shadow {\n  box-shadow: 0 ${CHIP.shadow.offsetYPx}px ${CHIP.shadow.blurPx}px rgb(0 0 0 / ${CHIP.shadow.alpha});`);
  });
});
