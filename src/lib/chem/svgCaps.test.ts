import { describe, expect, it } from "vitest";
import { sampleSvg, SAMPLE_BONDS } from "./styleSamples";
import { ACS_1996, MENO } from "./style";

const count = (svg: string, tag: string) => (svg.match(new RegExp(`<${tag} `, "g")) ?? []).length;

describe("a line with round ends in a picture", () => {
  it("is one line with round caps - a hash, a dash - not a line and a disc at either end, which shows as seams on a screen at its own pixels", () => {
    for (const name of ["Hashed", "Hashed wedge", "Dashed"]) {
      const svg = sampleSvg(SAMPLE_BONDS.find((b) => b.name === name)!, MENO, 2);
      expect(count(svg, "line"), name).toBeGreaterThan(2);
      expect(svg, name).toContain('stroke-linecap="round"');
      // (no disc left over at a hash's or a dash's end)
      expect(count(svg, "circle"), name).toBe(0);
    }
  });

  it("leaves square ends square, as ACS 1996 draws them", () => {
    const svg = sampleSvg(SAMPLE_BONDS.find((b) => b.name === "Dashed")!, ACS_1996, 2);
    expect(svg).not.toContain('stroke-linecap="round"');
  });
});
