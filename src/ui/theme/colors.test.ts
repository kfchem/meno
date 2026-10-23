import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COLORS } from "./colors";

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
  });
});
