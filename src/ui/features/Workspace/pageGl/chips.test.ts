import { describe, expect, it } from "vitest";
import { chipLine } from "./chips";
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
