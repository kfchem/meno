import { describe, expect, it } from "vitest";
import { acceptPalette, MENO_PALETTE, PALETTE_MOST } from "./palette";
import { MENO, ACS_1996, RSC, NATURE, WILEY } from "./style";

describe("a palette", () => {
  it("is Meno's four unless the settings hold a list", () => {
    expect(acceptPalette(undefined)).toEqual([...MENO_PALETTE]);
    expect(acceptPalette("red")).toEqual([...MENO_PALETTE]);
    expect(MENO_PALETTE).toEqual(["#317689", "#cd4560", "#141414", "#c0c0c0"]);
  });

  it("keeps an empty one, and only colours, each once, no more than it holds", () => {
    expect(acceptPalette([])).toEqual([]);
    expect(acceptPalette(["#ABCDEF", "#abcdef", "red", 3, "#12345", "#123456"])).toEqual(["#abcdef", "#123456"]);
    const many = Array.from({ length: 20 }, (_, i) => `#0000${(i + 16).toString(16)}`);
    expect(acceptPalette(many)).toHaveLength(PALETTE_MOST);
  });
});

describe("the ground ink", () => {
  it("is the palette's black in Meno's style, and pure black in a journal's", () => {
    expect([MENO.bondColor, MENO.labelColor]).toEqual(["#141414", "#141414"]);
    for (const s of [ACS_1996, RSC, NATURE, WILEY]) expect([s.bondColor, s.labelColor]).toEqual(["#000000", "#000000"]);
  });
});
