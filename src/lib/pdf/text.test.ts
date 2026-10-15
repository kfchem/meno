import { describe, expect, it } from "vitest";
import { blockOf, findIn, letterAt, letterNear, lineAt, linesOf, marksBetween, pageTextFrom, pageTextOf, placeAt, searchable, textBetween, wordAt, wordBoxesBetween, wordsBetween, type PageText } from "./text";

/** A page of lines as PDFium reads them: each letter 6 points wide, each line 12 tall, 14 apart, starting where it is given (72, else); its ends "\r\n" with no box. */
function page(lines: (string | [string, number])[]): PageText {
  let text = "";
  const boxes: ([number, number, number, number] | null)[] = [];
  lines.forEach((given, l) => {
    const [line, x] = typeof given === "string" ? [given, 72] : given;
    [...line].forEach((ch, k) => {
      text += ch;
      boxes.push(ch === "\u0002" ? null : [x + k * 6, 100 + l * 14, x + 6 + k * 6, 112 + l * 14]);
    });
    if (l < lines.length - 1) {
      text += "\r\n";
      boxes.push(null, null);
    }
  });
  return pageTextFrom(text, boxes);
}

const p = page(["Rotational barriers of the hy-", "droxyl group were confor\u0002", "mational, as found."]);

describe("a PDF page's words", () => {
  it("are read from the reader's answer: a letter and its box in 20 bytes", () => {
    const buf = new ArrayBuffer(40);
    const v = new DataView(buf);
    v.setUint32(0, 65, true);
    [1, 2, 3, 4].forEach((n, k) => v.setFloat32(4 + k * 4, n, true));
    v.setUint32(20, 0x3042, true);
    const t = pageTextOf(buf);
    expect([...t.codes]).toEqual([65, 0x3042]);
    expect([...t.boxes.slice(0, 4)]).toEqual([1, 2, 3, 4]);
  });

  it("lie in lines, each with the box round its letters", () => {
    const lines = linesOf(p);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatchObject({ x0: 72, y0: 114, y1: 126 });
  });

  it("are found under the pointer, and the place between letters nearest it", () => {
    expect(String.fromCodePoint(p.codes[letterAt(p, 73, 105)!])).toBe("R");
    expect(letterAt(p, 10, 10)).toBeNull();
    // (between two lines, or just past a line's end: the nearest letter of the line beside it)
    expect(letterAt(p, 73, 113)).toBeNull();
    expect(String.fromCodePoint(p.codes[letterNear(p, 73, 113)!])).toBe("R");
    expect(letterNear(p, 72 + 30 * 6 + 2, 105)).toBe(29);
    expect(letterNear(p, 10, 10)).toBeNull();
    // (left of a letter's middle, before it; right, after it)
    expect(placeAt(p, 73, 105)).toBe(0);
    expect(placeAt(p, 77, 105)).toBe(1);
    // (beyond a line's end, after its last letter, not its end)
    const [, end] = lineAt(p, 0);
    expect(placeAt(p, 500, 105)).toBe(end);
    // (above every line, the first place; between lines, the nearer)
    expect(placeAt(p, 73, 0)).toBe(0);
    expect(placeAt(p, 73, 119)).toBe(linesOf(p)[1].start);
  });

  it("make words and lines, as two clicks and three select them", () => {
    const i = letterAt(p, 72 + 12 * 6 + 1, 105)!;
    const [a, b] = wordAt(p, i);
    expect(wordsBetween(p, a, b)).toBe("barriers");
    const [s, e] = lineAt(p, i);
    expect(wordsBetween(p, s, e)).toBe("Rotational barriers of the hy-");
    // (a space alone, or a stop)
    const space = 10;
    // (on a space between words, the word on the nearer side)
    expect(wordsBetween(p, ...wordAt(p, space, 72 + space * 6 + 1))).toBe("Rotational");
    expect(wordsBetween(p, ...wordAt(p, space, 72 + space * 6 + 5))).toBe("barriers");
    expect(wordsBetween(p, ...wordAt(p, lineAt(p, 0)[1] - 1))).toBe("hy-");
  });

  it("are marked a line at a time, and copied with a line's end a space and a word broken at one whole", () => {
    const from = 11;
    const to = linesOf(p)[2].start + 8;
    expect(marksBetween(p, from, to)).toHaveLength(3);
    expect(marksBetween(p, from, to)[0][0]).toBe(72 + 11 * 6);
    // (a hyphen PDFium left at a line's end kept, as a word's own)
    expect(wordsBetween(p, from, to)).toBe("barriers of the hy-droxyl group were conformational");
    // (each word where it lies, on the line it starts on)
    const boxes = wordBoxesBetween(p, from, to);
    expect(boxes).toHaveLength(7);
    expect(boxes[0]).toEqual([72 + 11 * 6, 100, 72 + 19 * 6, 112]);
    expect(boxes[3]).toEqual([72 + 27 * 6, 100, 72 + 30 * 6, 112]);
    expect(boxes[6]).toEqual([72 + 18 * 6, 114, 72 + 24 * 6, 126]);
  });

  it("are searched without regard to case, across a line's end, and whole where broken there", () => {
    const s = searchable(p);
    expect(s.text).toBe("rotational barriers of the hy-droxyl group were conformational, as found.");
    expect(s.back).toHaveLength(s.text.length);
    const hits = findIn(p, "CONFORMATIONAL");
    expect(hits).toHaveLength(1);
    expect(wordsBetween(p, hits[0][0], hits[0][1])).toBe("conformational");
    expect(findIn(p, "the   hy-droxyl")).toHaveLength(1);
    expect(findIn(p, "were confor mational")).toHaveLength(0);
    // (a word broken at a line's end, asked with its hyphen, found too - once)
    expect(findIn(p, "confor-mational")).toHaveLength(1);
    expect(findIn(p, "were confor")).toHaveLength(1);
    expect(findIn(p, "  ")).toEqual([]);
  });

  it("lie in blocks, set as the lines about them are: spread, to the left, to the right, or centred", () => {
    const words = (q: PageText, from: number, to: number) => blockOf(q, linesOf(q)[from].start + 1, linesOf(q)[to].start + 2);
    // spread to both edges, a paragraph's last line short, and a word broken at a line's end short by its hyphen
    const spread = page(["the quick brown fox jumps over", "lazy dogs and runs far away in", "the night, and comes back in \u0002", "the day, as foxes do in tales.", "and stories."]);
    expect(words(spread, 1, 2)).toMatchObject({ x0: 72, y0: 114, x1: 72 + 30 * 6, lines: 2, align: "justify" });
    // to the left, ragged at the right
    const ragged = page(["the quick brown fox", "jumps over the lazy dog and", "runs far away", "in the night"]);
    expect(words(ragged, 1, 2)?.align).toBe("left");
    // to the right, and centred
    const toRight = page([["the quick brown fox", 120], ["jumps over", 174], ["the lazy dog and runs", 108]]);
    expect(words(toRight, 0, 1)?.align).toBe("right");
    const centred = page([["the quick brown fox", 120], ["jumps over", 147], ["the lazy dog and runs", 114]]);
    expect(words(centred, 0, 1)?.align).toBe("center");
    // (only lines of the same column: one after its foot, at the top, is another's)
    const columns = page(["the quick brown fox", "jumps over the lazy dog and", "runs far away"]);
    expect(blockOf(columns, 0, 3)).toMatchObject({ lines: 1, align: "left" });
    expect(blockOf(spread, 0, 0)).toBeNull();
  });
});

describe("words copied from a PDF", () => {
  /** Lines set where they are given - each [text, x, y], letters 6 points wide and 12 tall - in the order PDFium reads them, each ended "\r\n". */
  const placed = (lines: [string, number, number][]): PageText => {
    let text = "";
    const boxes: ([number, number, number, number] | null)[] = [];
    for (const [line, x, y] of lines) {
      [...line].forEach((ch, k) => {
        text += ch;
        boxes.push(ch === " " ? null : [x + k * 6, y, x + 6 + k * 6, y + 12]);
      });
      text += "\r\n";
      boxes.push(null, null);
    }
    return pageTextFrom(text, boxes);
  };

  it("keep the page's lines, a blank line where one stands apart, across two columns read one after the other", () => {
    // (a heading set apart over the left column; the right column's lines, read after the left's, going on from it)
    const t = placed([
      ["Ethanol (1a)", 60, 100],
      ["0 1", 60, 130],
      ["C -1.170000 -0.400000 0.000000", 60, 144],
      ["C 0.190000 0.290000 0.000000", 60, 158],
      ["O 1.200000 -0.710000 0.000000", 330, 100],
      ["H -1.980000 0.330000 0.000000", 330, 114],
    ]);
    expect(textBetween(t, 0, t.codes.length)).toBe(
      ["Ethanol (1a)", "", "0 1", "C -1.170000 -0.400000 0.000000", "C 0.190000 0.290000 0.000000", "O 1.200000 -0.710000 0.000000", "H -1.980000 0.330000 0.000000"].join("\n"),
    );
  });

  it("join a word PDFium broke at a line's end, as a search reads it", () => {
    expect(textBetween(p, 0, p.codes.length)).toBe("Rotational barriers of the hy-\ndroxyl group were conformational, as found.");
  });
});
