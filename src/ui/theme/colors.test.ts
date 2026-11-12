import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { colourHex, colourMix, COLORS } from "./colors";

/** src/App.css, where the tokens are set (read as text: Vitest hands a stylesheet imported raw over empty). */
const css = readFileSync(new URL("../../App.css", import.meta.url), "utf8");

/** A colour of src/App.css's @theme, by its token's name, as #rrggbb. */
function token(name: string): string {
  const m = new RegExp(`--color-${name}:\\s*rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)`).exec(css);
  if (!m) throw new Error(`no --color-${name}`);
  return `#${m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
}

describe("the interface's colours in code and in CSS (docs/LOOK.md, Colours)", () => {
  it("are the same: what is drawn in code takes the tokens' own values", () => {
    expect(COLORS.highlight).toBe(token("highlight"));
    expect(COLORS.found).toBe(token("found"));
    expect(COLORS.base).toBe(token("accel-base"));
    expect(COLORS.attention).toBe(token("accel-accent"));
    expect(COLORS.stereo3d).toBe(token("accel-blue"));
    expect(COLORS.ink).toBe(token("gh-black"));
    expect(COLORS.quiet).toBe(token("gh-gray"));
    expect(COLORS.hairline).toBe(token("gh-line"));
    expect(COLORS.ground).toBe(token("gh-base"));
    expect(COLORS.lightBase).toBe(token("accel-lightbase"));
  });
});

describe("a colour made from data, for WebGL", () => {
  it("is written as three.js reads it, each part clamped to a byte", async () => {
    const THREE = await import("three");
    expect(new THREE.Color(colourHex(207, 222, 229)).getHex()).toBe((207 << 16) | (222 << 8) | 229);
    expect(new THREE.Color(colourHex(-4, 300, 7.6)).getHex()).toBe((0 << 16) | (255 << 8) | 8);
    expect(colourMix(colourHex(0, 0, 0), colourHex(200, 100, 50), 0.5)).toBe(colourHex(100, 50, 25));
    expect(colourMix(colourHex(0, 0, 0), colourHex(200, 100, 50), 2)).toBe(colourHex(200, 100, 50));
  });
});
