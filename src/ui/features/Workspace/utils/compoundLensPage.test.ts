import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import type { Box, PageObject } from "../../../../lib/pdf/figures";
import type { PageText } from "../../../../lib/pdf/text";
import { mentionUnder } from "./compoundLens";
import { figureRead } from "./structuresRead";
import page from "./fixtures/lens-scope-page.json";

/**
 * A page made by Meno's own drawing code, its words invented, set into a PDF with its words kept as words, and read by the app's own PDF
 * reader: what that reader answered for it (fixtures/lens-scope-page.json) - the page's things and their boxes (`objects`), its letters
 * with their boxes and weights (`text`), its figures' boxes as lib/pdf/figures finds them, and each figure as the reader draws it
 * (`drawn`). Under a "Scheme 4" caption: a pentanol with the lines "5, n = 1, 64%" and "6, n = 3, 71%" under it, a cyclohexane
 * "ent-21", an aniline "IV", and a cyclopentanol with "R = Me, 14, 41%" under it, each number set bold, the rest plain; and the line of
 * text "The alcohol 5 gave ent-21 and then 14 and IV.", each number bold.
 */
const text: PageText = { codes: Uint32Array.from(page.text.codes), boxes: Float32Array.from(page.text.boxes), bold: Uint8Array.from(page.text.bold) };
const objects = page.objects as PageObject[];
const figures = page.figures as Box[];
const letters = String.fromCodePoint(...text.codes);

/** The middle of the letters `word` of the page's text, after `after`, in points from the page's top left. */
function middleOf(word: string, after = ""): { x: number; y: number } {
  const i = letters.indexOf(word, after ? letters.indexOf(after) : 0);
  const b = text.boxes.subarray(i * 4, i * 4 + 4);
  return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 };
}

describe("a page's compounds' numbers, read as the app reads them from the PDF's reader's answers", () => {
  it("gives each figure's numbers: those heading their lines, a bold one alone, and one set bold mid-line after words", () => {
    const labels = figures.map((_, k) => figureRead({ objects, text, figures: [...figures], k, drawn: page.drawn[k] as unknown as FigureDrawn, sha256: "b".repeat(64), page: 0 }).labels.map((l) => l.label));
    // (the cyclopentanol's line "R = Me, 14, 41%" lies under it with its OH label set larger than the line, as the page's own letters:
    //  the line is the figure's only words, and its 14 no superscript)
    expect(labels).toEqual([["5", "6"], ["ent-21"], ["IV"], ["14"]]);
  });

  it("brings a card for each bold number of the text's line, and none for the caption's number", () => {
    const under = (p: { x: number; y: number }) => mentionUnder(text, p.x, p.y, false)?.label ?? null;
    expect(["5", "ent-21", "14", "IV"].map((w) => under(middleOf(w, "The alcohol")))).toEqual(["5", "ent-21", "14", "IV"]);
    // ("Scheme 4", set bold: a display item's number)
    expect(under(middleOf("4", "Scheme"))).toBeNull();
  });
});
