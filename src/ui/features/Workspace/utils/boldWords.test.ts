/**
 * Held beside compoundLabels.test.ts: `boldInBox` itself, and a figure's job carrying the page's letters' weight through `figureRead` to
 * the compounds' numbers. (Found in review.)
 */
import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import type { PageObject } from "../../../../lib/pdf/figures";
import { pageTextFrom } from "../../../../lib/pdf/text";
import { boldInBox, figureRead, type FigureJob } from "./structuresRead";

type B = [number, number, number, number];

describe("whether the letters a box holds are set bold", () => {
  // ("ab c": a and b side by side, a blank with no box, c further on)
  const t = (bold: boolean[]) => pageTextFrom("ab c", [[0, 0, 5, 8], [5, 0, 10, 8], null, [20, 0, 25, 8]], bold);
  it("is yes where every letter with a box in it is bold, a blank with no box set aside", () => {
    expect(boldInBox(t([true, true, false, false]), [0, 0, 12, 8])).toBe(true);
  });
  it("is no where one letter in it is plain, where none is in it, and where the page tells no weight", () => {
    expect(boldInBox(t([true, true, false, false]), [0, 0, 25, 8])).toBe(false);
    expect(boldInBox(t([true, true, false, false]), [30, 0, 40, 8])).toBe(false);
    expect(boldInBox(t([false, false, false, false]), [0, 0, 12, 8])).toBe(false);
    expect(boldInBox(null, [0, 0, 12, 8])).toBe(false);
  });
  it("counts a letter by its middle: one whose middle lies in the box is in it", () => {
    // (a plain, b bold; the box starts at 2, over a's middle at 2.5 though a begins at 0)
    expect(boldInBox(t([false, true, false, false]), [2, 0, 12, 8])).toBe(false);
    expect(boldInBox(t([false, true, false, false]), [3, 0, 12, 8])).toBe(true);
  });
});

describe("a figure's job, read: the weight of the page's letters reaches the compounds' numbers", () => {
  const L = 14.4;
  const ALONG = Math.sqrt(3) / 2;
  const zig = { fill: null, stroke: "#000000ff", width: 0.6, d: [0, 1, 2, 3, 4].map((i) => [i ? "L" : "M", 100 + i * L * ALONG, 300 + (i % 2) * L * 0.5]) } as FigureDrawn["paths"][number];
  /**
   * A zigzag and under it a line set as runs of text, [what it says, whether bold], each run its own thing on the page and each letter
   * of it - a blank too - a letter of the page with its box; the line placed so that its first bold run, else its start, is under the zigzag's middle.
   */
  const row = (runs: [string, boolean][]) => {
    const y = 300 + 1.4 * L;
    const first = Math.max(0, runs.findIndex(([, bold]) => bold));
    let x = 100 + 2 * L * ALONG - 5 - runs.slice(0, first).reduce((t, [text]) => t + 5 * text.length, 0);
    const left = x;
    const boxes: B[] = [];
    const bold: boolean[] = [];
    const objects: PageObject[] = [{ kind: "path", box: [100, 300, 100 + 4 * L * ALONG, 300 + L * 0.5] }];
    for (const [text, isBold] of runs) {
      objects.push({ kind: "text", box: [x, y - 3.6, x + 5 * text.length, y + 3.6] });
      for (let i = 0; i < text.length; i++) {
        boxes.push([x + 5 * i, y - 3.6, x + 5 * i + 5, y + 3.6]);
        bold.push(isBold);
      }
      x += 5 * text.length;
    }
    const drawn: FigureDrawn = { paths: [zig], letters: [], pictures: [] };
    const job: FigureJob = { objects, text: pageTextFrom(runs.map(([text]) => text).join(""), boxes, bold), figures: [[Math.min(left, 98) - 2, 298, Math.max(x, 104 + 4 * L * ALONG) + 2, y + 6]], k: 0, drawn, sha256: "pdf", page: 0 };
    return figureRead(job).labels.map((l) => l.label);
  };

  it("reads a bold number after words as its own: \"From the alcohol 12, 64%\" gives 12 where the 12 is bold, none where all is one weight", () => {
    expect(row([["From the alcohol ", false], ["12", true], [", 64%", false]])).toEqual(["12"]);
    expect(row([["From the alcohol 12, 64%", false]])).toEqual([]);
  });

  it("reads the bold number before its plain yield, and the number heading a plain line", () => {
    expect(row([["21", true], [", 83%, 1:1 d.r.", false]])).toEqual(["21"]);
    expect(row([["21, 83%, 1:1 d.r.", false]])).toEqual(["21"]);
  });
});
