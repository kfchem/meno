/**
 * Held beside compoundLabels.test.ts: what may follow a compound's number on its line - a yield or a ratio with its sign and its spacing,
 * a word - and what may not: a signed size or heat, and a tail of more than one line. (Found in review.)
 */
import { describe, expect, it } from "vitest";
import { leadingLabel } from "./pageStructures";

describe("a number heading a line, with what follows its comma", () => {
  it("takes a yield or a ratio set with a sign, a space before its percent, or on a second line", () => {
    expect(["21, ≥ 95%", "21, ≤ 5%", "21, 83 %", "21, <1%", "21, ~80%"].map(leadingLabel)).toEqual(["21", "21", "21", "21", "21"]);
    expect(["21, 83%\n1:1 d.r.", "21, 20 : 1"].map(leadingLabel)).toEqual(["21", "21"]);
  });

  it("takes none where a signed number follows that is no yield or ratio: a size, a heat", () => {
    expect(["21, <10 nm", "21, < 10 nm", "21, ~20 nm", "21, ≥ 5 mm", "21, >80 °C"].map(leadingLabel)).toEqual([null, null, null, null, null]);
  });
});
