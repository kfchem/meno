import { describe, expect, it } from "vitest";
import { pageTextFrom } from "../../../../lib/pdf/text";
import { mentionUnder } from "./compoundLens";

/** A line of words, each letter 6 points wide from x = 72, 12 points tall from y = 100; the words in `bold` set bold. */
function line(text: string, bold: string[] = []) {
  const chars = [...text];
  const marks = chars.map(() => false);
  for (const w of bold) {
    const at = text.indexOf(w);
    for (let k = at; k < at + w.length; k++) marks[k] = true;
  }
  return pageTextFrom(text, chars.map((c, k) => (c === " " ? null : ([72 + 6 * k, 100, 78 + 6 * k, 112] as const))), marks);
}

describe("the compound-number lens's reading of a page, the same in the column and on the canvas", () => {
  it("gives the number under a point, and its word's box on the page", () => {
    const text = "Ketone 12 gave 13a in 2 h.";
    const t = line(text, ["12", "13a"]);
    // (the 1 of "12": letters 7 and 8, x 114 to 126)
    expect(mentionUnder(t, 117, 106, false)).toEqual({ label: "12", box: [114, 100, 126, 112] });
    expect(mentionUnder(t, 72 + 6 * 16 + 3, 106, false)?.label).toBe("13a");
  });

  it("gives none off a number, or on a number no compound's, unless ⌥ is held: then any of that shape", () => {
    const text = "Ketone 12 gave 13a in 2 h.";
    const t = line(text, ["12", "13a"]);
    expect(mentionUnder(t, 75, 106, false)).toBeNull();
    const two = 72 + 6 * text.indexOf("2 h") + 3;
    expect(mentionUnder(t, two, 106, false)).toBeNull();
    expect(mentionUnder(t, two, 106, true)?.label).toBe("2");
  });
});
