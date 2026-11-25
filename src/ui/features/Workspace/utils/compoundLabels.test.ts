import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import { figuresOf, type PageObject } from "../../../../lib/pdf/figures";
import { compoundLabelsOf, labelText, leadingLabel, numbersIn, pageStructuresOf, wordsJoined, type PageMarks, type PageStructure } from "./pageStructures";

type P = { x: number; y: number };
/** cos 30°: a zigzag's step along its length, in bonds. */
const ALONG = Math.sqrt(3) / 2;
type B = [number, number, number, number];
const NONE: PageMarks = { segments: [], points: [], boxes: [] };
/** A structure read, as a figure gives one: a zigzag of bonds 14.4 points long from `x`, `y`, its box round them. */
function zigzag(key: string, x: number, y = 300, read = true): PageStructure {
  const L = 14.4;
  const atoms: P[] = [0, 1, 2, 3, 4].map((i) => ({ x: x + i * L * ALONG, y: y + (i % 2) * L * 0.5 }));
  const bonds = atoms.slice(1).map((a, i): [P, P] => [atoms[i], a]);
  const box: B = [x, y, atoms[4].x, y + L * 0.5];
  return { key, bonds, atoms, labels: [], box, ends: [atoms[0], atoms[4]], reach: L / 3, read: read ? { model: {} as never } : { none: "not read" } };
}
const word = (text: string, x: number, y: number, h = 8): { text: string; box: B } => ({ text, box: [x, y, x + 5 * text.length, y + h] });

describe("a compound's number, as Meno writes it", () => {
  it("is a number, perhaps with letters or primes, in parentheses or not - its parentheses and spaces set aside", () => {
    expect(["12", "3a", "(4b)", "12ab", "7'", "7′", "( 9 )"].map(labelText)).toEqual(["12", "3a", "4b", "12ab", "7'", "7'", "9"]);
    expect(["12 h", "Table", "1.5", "1234", "a", "12abc", "-3", "2+", ""].map(labelText)).toEqual(Array(9).fill(null));
  });
});

describe("the compounds' numbers of a figure", () => {
  const a = zigzag("0:0", 100);
  const b = zigzag("0:1", 200);
  const mid = (s: PageStructure) => (s.box[0] + s.box[2]) / 2;

  it("are the words of a number's shape under, over or beside a structure, within a bond of it, each the nearest structure's", () => {
    const words = [word("1", mid(a) - 2.5, a.box[3] + 6), word("(2a)", mid(b) - 10, b.box[1] - 14), word("3", b.box[2] + 4, b.box[1])];
    expect(compoundLabelsOf([a, b], words, NONE).map((l) => [l.label, l.key])).toEqual([
      ["1", "0:0"],
      ["2a", "0:1"],
      ["3", "0:1"],
    ]);
  });

  it("are none further than a bond, off to a corner, much shorter than the figure's words, or of a structure not read", () => {
    const far = word("1", mid(a) - 2.5, a.box[3] + 16);
    const corner = word("2", a.box[2] + 6, a.box[3] + 6);
    const sup = word("3", mid(a) - 2.5, a.box[3] + 4, 4);
    expect(compoundLabelsOf([a], [far, corner, sup, word("cat", 0, 0)], NONE)).toEqual([]);
    expect(compoundLabelsOf([zigzag("0:0", 100, 300, false)], [word("1", mid(a) - 2.5, a.box[3] + 6)], NONE)).toEqual([]);
  });

  it("are numbers a little shorter than the figure's words, and of their usual height however tall one word is - a title", () => {
    const usual = [word("Scheme", 0, 0), word("of", 50, 0), word("this", 70, 0)];
    expect(compoundLabelsOf([a], [...usual, word("1", mid(a) - 2.5, a.box[3] + 6, 0.8 * 8)], NONE).map((l) => l.label)).toEqual(["1"]);
    // (a title three times as tall: the numbers still the usual height's)
    const title = word("Synthesis", 0, -60, 24);
    expect(compoundLabelsOf([a], [title, ...usual, word("1", mid(a) - 2.5, a.box[3] + 6)], NONE).map((l) => l.label)).toEqual(["1"]);
  });

  it("are a structure's centred under it as a whole, though its lowest bond lies off to one side, more than a bond from the number", () => {
    // (a hook: across the top, then down the right side - nothing at the foot's middle)
    const L = 14.4;
    const atoms: P[] = [0, 1, 2, 3, 4].map((i) => ({ x: 100 + i * L, y: 300 })).concat([{ x: 100 + 4 * L, y: 300 + L }, { x: 100 + 4 * L, y: 300 + 2 * L }]);
    const hook: PageStructure = { ...zigzag("0:0", 100), atoms, bonds: atoms.slice(1).map((q, i): [P, P] => [atoms[i], q]), box: [100, 300, 100 + 4 * L, 300 + 2 * L] };
    // (its middle under the box's, 8 points below it: two bonds from the nearest bond, the hook's corner)
    const w = word("13", 100 + 2 * L - 5, 300 + 2 * L + 8);
    expect(compoundLabelsOf([hook], [w], NONE).map((l) => l.label)).toEqual(["13"]);
  });

  it("are, where two structures' boxes hold the word alike - a ring within a macrocycle's box - the one whose bonds are nearer", () => {
    const big: PageStructure = { ...zigzag("0:0", 100), box: [60, 260, 260, 360] };
    // (the ring's box reaching under its bonds - a label's, say - the word within it and within the big one's)
    const zz = zigzag("0:1", 140, 300);
    const ring: PageStructure = { ...zz, box: [zz.box[0], zz.box[1], zz.box[2], zz.box[3] + 16] };
    const w = word("7", mid(ring) - 2.5, zz.box[3] + 4);
    expect(compoundLabelsOf([big, ring], [w], NONE).map((l) => l.key)).toEqual(["0:1"]);
    expect(compoundLabelsOf([ring, big], [w], NONE).map((l) => l.key)).toEqual(["0:1"]);
  });

  it("are the nearer box's, though another structure's ink lies nearer than the first's own ink", () => {
    // (A: its box reaching down to 2 points over the word - a label's, say - its bonds ten points off; B: its box, and so its ink, six off)
    const zA = zigzag("0:0", 100, 300);
    const a: PageStructure = { ...zA, box: [zA.box[0], zA.box[1], zA.box[2], zA.box[3] + 8] };
    const w = word("8", mid(a) - 2.5, zA.box[3] + 10);
    const b = zigzag("0:1", w.box[2] + 6, w.box[1]);
    expect(compoundLabelsOf([a, b], [w], NONE).map((l) => l.key)).toEqual(["0:0"]);
    expect(compoundLabelsOf([b, a], [w], NONE).map((l) => l.key)).toEqual(["0:0"]);
  });

  it("are none off a corner even within a bond: beyond the structure's breadth and its height both", () => {
    const corner = word("2", a.box[2] + 2, a.box[3] + 2);
    expect(compoundLabelsOf([a], [corner], NONE)).toEqual([]);
  });

  it("are a structure's by its labels and its lone atom too: a number by OH, and by a lone atom", () => {
    const oh: PageStructure = { ...zigzag("0:0", 100), labels: [[100 + 4 * 14.4 * Math.sqrt(3) / 2 + 2, 296, 100 + 4 * 14.4 * Math.sqrt(3) / 2 + 14, 306]] };
    const beyondOh = word("4", oh.labels[0][2] + 6, 297);
    // (its box made as the bonds alone, the label passing it - the number within a bond of OH, not of the bonds)
    expect(compoundLabelsOf([{ ...oh, box: [oh.box[0], 296, oh.labels[0][2], oh.box[3]] }], [beyondOh], NONE).map((l) => l.label)).toEqual(["4"]);
    // (a lone atom, by its place alone: no bond to it, and no label's box)
    const lone: PageStructure = { key: "0:1", bonds: [], atoms: [{ x: 300, y: 300 }], labels: [], box: [296, 296, 304, 304], ends: [], reach: 14.4 / 3, read: { model: {} as never } };
    expect(compoundLabelsOf([lone], [word("5", 297, 312)], NONE).map((l) => l.key)).toEqual(["0:1"]);
  });

  it("are none where an arrow or a \"+\" lies nearer: a scheme's conditions, a step's number", () => {
    const w = word("2", mid(a) - 2.5, a.box[3] + 8);
    const arrow: PageMarks = { segments: [[{ x: w.box[0] - 10, y: w.box[3] + 1 }, { x: w.box[2] + 10, y: w.box[3] + 1 }]], points: [], boxes: [] };
    expect(compoundLabelsOf([a], [w], arrow)).toEqual([]);
    const plus: PageMarks = { segments: [], points: [{ x: w.box[2] + 1, y: w.box[1] }], boxes: [] };
    expect(compoundLabelsOf([a], [w], plus)).toEqual([]);
    expect(compoundLabelsOf([a], [w], NONE)).toHaveLength(1);
  });

  it("are each a structure's once, set by the drawing and by the page's words alike", () => {
    const w = word("12", mid(a) - 5, a.box[3] + 6);
    expect(compoundLabelsOf([a], [w, { ...w }], NONE)).toHaveLength(1);
  });
});

describe("the compounds' numbers a figure's drawn words set, line by line", () => {
  const box: B = [100, 300, 220, 324];
  const labels = (w: Parameters<typeof numbersIn>[0]) => numbersIn(w).map((n) => [n.label, n.withYield]);

  it("are each line's number heading it - a series under one structure - each in its own line's share of the box", () => {
    const found = numbersIn({ text: "5, n = 1, 64%\n6, n = 3, 71%", box });
    expect(found.map((n) => [n.label, n.withYield])).toEqual([
      ["5", true],
      ["6", true],
    ]);
    expect(found.map((n) => [n.box[1], n.box[3]])).toEqual([
      [300, 312],
      [312, 324],
    ]);
  });

  it("are a number after words, on its own line, with its yield", () => {
    expect(labels({ text: "From the alcohol\n12, 64%", box })).toEqual([["12", true]]);
  });

  it("are the run set bold mid-line, its yield plain after it", () => {
    const text = "R = Me, 14, 41% 2:1 d.r.";
    expect(labels({ text, box, marks: [{ from: 8, to: 10, bold: true }] })).toEqual([["14", true]]);
    // (no bold: no number heads the line, none)
    expect(labels({ text, box })).toEqual([]);
  });

  it("are a line's first bold number only, and none after a \"from\": a product's line names what it was made from too", () => {
    expect(labels({ text: "3 (52% from 8)", box, marks: [{ from: 0, to: 1, bold: true }, { from: 12, to: 13, bold: true }] })).toEqual([["3", false]]);
    expect(labels({ text: "(88% from 4b and 5)", box, marks: [{ from: 10, to: 12, bold: true }, { from: 17, to: 18, bold: true }] })).toEqual([]);
    // (a caption's number - a table's, a scheme's - is none)
    expect(labels({ text: "Table 2. Screening of bases", box, marks: [{ from: 6, to: 7, bold: true }] })).toEqual([]);
    expect(labels({ text: "Scheme 4", box, marks: [{ from: 7, to: 8, bold: true }] })).toEqual([]);
  });

  it("are none in a line all bold, or a word that reads as no number: the line is read as one", () => {
    expect(labels({ text: "Table 2", box, marks: [{ from: 0, to: 7, bold: true }] })).toEqual([]);
    expect(labels({ text: "12", box, marks: [{ from: 0, to: 2, bold: true }] })).toEqual([["12", false]]);
  });

  it("are none in a line set much smaller than the figure's - a formula's subscript left over above a name - by that line's own height", () => {
    const st = zigzag("0:0", 100);
    const mid = (st.box[0] + st.box[2]) / 2;
    const top = st.box[3] + 4;
    const block = {
      text: "2\nAmide (6)",
      box: [mid - 20, top, mid + 20, top + 13] as B,
      marks: [
        { from: 0, to: 1, bold: true },
        { from: 9, to: 10, bold: true },
      ],
      lines: [[mid - 1, top, mid + 1, top + 4] as B, [mid - 20, top + 5, mid + 20, top + 13] as B],
    };
    // (beside the figure's other words, of the usual height)
    const others = [0, 1, 2].map((k) => word("text", 0, 20 * k));
    expect(compoundLabelsOf([st], [block, ...others], NONE).map((l) => l.label)).toEqual(["6"]);
  });

  it("are a structure's two bonds below it where their line sets the yield, and only one bond where the number is bare", () => {
    const st = zigzag("0:0", 100);
    const mid = (st.box[0] + st.box[2]) / 2;
    const at = (text: string, dy: number) => ({ text, box: [mid - 10, st.box[3] + dy, mid + 10, st.box[3] + dy + 8] as B });
    // (a bond is 14.4: 25 below is past one bond, short of two)
    expect(compoundLabelsOf([st], [at("7, 83%", 25)], NONE).map((l) => l.label)).toEqual(["7"]);
    expect(compoundLabelsOf([st], [at("7", 25)], NONE)).toEqual([]);
    expect(compoundLabelsOf([st], [at("7, 83%", 30)], NONE)).toEqual([]);
    // (an NMR figure's locant by its shift: no yield, one bond)
    expect(compoundLabelsOf([st], [at("5\n148.5, CH", 25)], NONE)).toEqual([]);
  });
});

describe("a figure's own words on its page", () => {
  it("are joined where a PDF sets each glyph apart on one line, and left out where the drawing holds words there already", () => {
    const glyph = (c: string, x: number, y = 300) => ({ text: c, box: [x, y, x + 5, y + 8] as B });
    expect(wordsJoined([glyph("2", 105), glyph("1", 100), glyph("7", 140)], []).map((w) => w.text)).toEqual(["12", "7"]);
    // (on the next line: apart)
    expect(wordsJoined([glyph("1", 100), glyph("2", 105, 320)], []).map((w) => w.text)).toEqual(["1", "2"]);
    expect(wordsJoined([glyph("1", 100), glyph("2", 105)], [{ text: "12", box: [100, 300, 110, 308] }])).toEqual([]);
  });

  it("join glyphs no more than a fifth of their height apart - 0.15 of it, not 0.3", () => {
    const glyph = (c: string, x: number) => ({ text: c, box: [x, 300, x + 5, 308] as B });
    expect(wordsJoined([glyph("1", 100), glyph("2", 105 + 0.15 * 8)], []).map((w) => w.text)).toEqual(["12"]);
    expect(wordsJoined([glyph("1", 100), glyph("2", 105 + 0.3 * 8)], []).map((w) => w.text)).toEqual(["1", "2"]);
  });

  it("join glyphs on one line - middles 0.2 of their height apart, not 0.5 - the joined box over the raised one's top", () => {
    const glyph = (c: string, x: number, y: number) => ({ text: c, box: [x, y, x + 5, y + 8] as B });
    const raised = wordsJoined([glyph("1", 100, 300), glyph("2", 105, 300 - 0.2 * 8)], []);
    // (the 2 raised a little, as a PDF may set it: one word still, its box over the 2's top)
    expect(raised).toHaveLength(1);
    expect(raised[0].box[1]).toBeCloseTo(300 - 0.2 * 8, 9);
    expect(raised[0].box[3]).toBe(308);
    expect(wordsJoined([glyph("1", 100, 300), glyph("2", 105, 300 + 0.5 * 8)], [])).toHaveLength(2);
  });

  it("are not bridged by a blank glyph, and never take a glyph to the left of the last", () => {
    const glyph = (c: string, x: number, y = 300) => ({ text: c, box: [x, y, x + 5, y + 8] as B });
    expect(wordsJoined([glyph("1", 100), glyph(" ", 105), glyph("2", 110)], []).map((w) => w.text)).toEqual(["1", "2"]);
    // (taken left to right: a glyph set before another, whatever their order on the page, reads first - never "21")
    expect(wordsJoined([glyph("2", 105, 299.5), glyph("1", 100, 300)], []).map((w) => w.text)).toEqual(["12"]);
    // (and one overlapping the word's start, to its left, is no part of it)
    expect(wordsJoined([glyph("1", 100), glyph("2", 105), glyph("3", 98, 314)], []).map((w) => w.text)).toEqual(["3", "12"]);
    // (a glyph set over another - a bold faked by striking twice - is not read as two: "1", not "11")
    expect(wordsJoined([glyph("1", 100), glyph("1", 100.6)], []).map((w) => w.text)).toEqual(["1", "1"]);
  });
});

describe("the compounds' numbers on a page drawn as Meno draws one", () => {
  const L = 14.4;
  const stroke = (...pts: [number, number][]) => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i) => [i ? "L" : "M", x, y]) }) as FigureDrawn["paths"][number];
  const letters = (text: string, [x, y]: [number, number]) => [...text].map((c, i) => ({ c, box: [x - 3.4 + 6.8 * i, y - 3.6, x + 3.4 + 6.8 * i, y + 3.6] as B, at: [x - 3.4 + 6.8 * i, y + 3.6] as [number, number], size: 10 }));
  const zig = (x: number) => stroke(...[0, 1, 2, 3, 4].map((i): [number, number] => [x + i * L * ALONG, 300 + (i % 2) * L * 0.5]));

  it("are read with its structures: each zigzag's number under it", () => {
    const drawn: FigureDrawn = { paths: [zig(100), zig(200)], letters: [...letters("1", [100 + 2 * L * ALONG, 300 + 1.4 * L]), ...letters("2", [200 + 2 * L * ALONG, 300 + 1.4 * L])], pictures: [] };
    const boxOf = (p: FigureDrawn["paths"][number]): B => {
      const xs = p.d.flatMap((st) => (st[0] === "Z" ? [] : [st[1]]));
      const ys = p.d.flatMap((st) => (st[0] === "Z" ? [] : [st[2]]));
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };
    const objects: PageObject[] = [...drawn.paths.map((p) => ({ kind: "path" as const, box: boxOf(p) })), ...drawn.letters.map((l) => ({ kind: "text" as const, box: l.box }))];
    const wordsIn = (bx: B) => drawn.letters.filter((l) => (l.box[0] + l.box[2]) / 2 >= bx[0] && (l.box[0] + l.box[2]) / 2 <= bx[2] && (l.box[1] + l.box[3]) / 2 >= bx[1] && (l.box[1] + l.box[3]) / 2 <= bx[3]).map((l) => l.c).join("");
    const figures = figuresOf(objects, wordsIn);
    // (each figure drawn as the reader draws one: what lies within it)
    const inside = (b: B, f: B) => (b[0] + b[2]) / 2 >= f[0] && (b[0] + b[2]) / 2 <= f[2] && (b[1] + b[3]) / 2 >= f[1] && (b[1] + b[3]) / 2 <= f[3];
    const drawnOf = (k: number): FigureDrawn => ({ paths: drawn.paths.filter((p) => inside(boxOf(p), figures[k])), letters: drawn.letters.filter((l) => inside(l.box, figures[k])), pictures: [] });
    const read = pageStructuresOf({ objects, wordsIn }, figures, drawnOf, "pdf", 0);
    const byKey = new Map(read.structures.map((s) => [s.key, (s.box[0] + s.box[2]) / 2]));
    const labelled = read.labels.map((l) => [l.label, Math.round(byKey.get(l.key)! / 100)]).sort();
    expect(labelled).toEqual([
      ["1", 1],
      ["2", 2],
    ]);
  });

  it("are read from the page's glyphs set one by one, joined: \"1\" and \"2\" apart on the page, \"12\" its number", () => {
    const drawn: FigureDrawn = { paths: [zig(100)], letters: [], pictures: [] };
    const x = 100 + 2 * L * ALONG - 5;
    const one: B = [x, 300 + 1.4 * L - 3.6, x + 5, 300 + 1.4 * L + 3.6];
    const two: B = [x + 5, one[1], x + 10, one[3]];
    const objects: PageObject[] = [{ kind: "path", box: [100, 300, 100 + 4 * L * ALONG, 300 + L * 0.5] }, { kind: "text", box: one }, { kind: "text", box: two }];
    const figures: B[] = [[98, 298, 104 + 4 * L * ALONG, one[3] + 2]];
    const read = pageStructuresOf({ objects, wordsIn: (b) => (b === one ? "1" : b === two ? "2" : "") }, figures, () => drawn, "pdf", 0);
    expect(read.labels.map((l) => l.label)).toEqual(["12"]);
  });

  describe("set on a line with the compound's yield, as a scope table sets them", () => {
    /**
     * A zigzag, and under it its line set as runs of text, each its own thing on the page, side by side: [what it says, whether bold] - the
     * line set so that its first bold run, or else its start, lies under the zigzag's middle, as a scope table centres a compound's number.
     */
    const scopeRow = (runs: [string, boolean][]) => {
      const drawn: FigureDrawn = { paths: [zig(100)], letters: [], pictures: [] };
      const y = 300 + 1.4 * L;
      const before = runs.slice(0, Math.max(0, runs.findIndex(([, bold]) => bold))).reduce((t, [text]) => t + 5 * text.length + 0.5, 0);
      let x = 100 + 2 * L * ALONG - 5 - before;
      const left = x;
      const placed = runs.map(([text, bold]) => {
        const box: B = [x, y - 3.6, x + 5 * text.length, y + 3.6];
        x = box[2] + 0.5;
        return { text, bold, box };
      });
      const objects: PageObject[] = [{ kind: "path", box: [100, 300, 100 + 4 * L * ALONG, 300 + L * 0.5] }, ...placed.map((r) => ({ kind: "text" as const, box: r.box }))];
      const figures: B[] = [[Math.min(left, 98) - 2, 298, Math.max(x, 104 + 4 * L * ALONG) + 2, y + 6]];
      const find = (b: B) => placed.find((r) => r.box === b);
      return (fonts: boolean) =>
        pageStructuresOf({ objects, wordsIn: (b) => find(b)?.text ?? "", ...(fonts ? { boldIn: (b: B) => find(b)?.bold ?? false } : {}) }, figures, () => drawn, "pdf", 0).labels.map((l) => l.label);
    };

    it("is the bold number before its plain yield - \"21, 83%, 1:1 d.r.\" - read as 21", () => {
      expect(scopeRow([["21", true], [", 83%, 1:1 d.r.", false]])(true)).toEqual(["21"]);
    });

    it("is the number heading the line where its yield is set in the same weight: the number before the line's first comma", () => {
      expect(scopeRow([["21", false], [", 83%, 1:1 d.r.", false]])(true)).toEqual(["21"]);
      expect(scopeRow([["21, 83%, 1:1 d.r.", false]])(false)).toEqual(["21"]);
    });

    it("is the bold number set after words or mid-line: \"From the alcohol 12, 64%\", \"R = Me, 14, 41%\"", () => {
      expect(scopeRow([["From the alcohol ", false], ["12", true], [", 64%", false]])(true)).toEqual(["12"]);
      expect(scopeRow([["R = Me, ", false], ["14", true], [", 41% 2:1 d.r.", false]])(true)).toEqual(["14"]);
    });

    it("is none in a line of yields, ratios, equivalents and times: no number of the shape heads it before a comma, nor is set bold", () => {
      for (const line of ["83%, 1:1 d.r.", "n = 2", "2.0 equiv, 80 °C", "3 h, 80%", "1:1 d.r., 75%"]) expect(scopeRow([[line, false]])(true), line).toEqual([]);
      expect(["21, 83%", "(3a), 70%", " 7', 91%", "21,83%", "21 , 83%", "21; 83%", "1.5, 2"].map(leadingLabel)).toEqual(["21", "3a", "7'", null, null, null, null]);
      // (a list of numbers of the shape - atoms' locants, a table's - is no number with its yield)
      expect(["6', 8a', 11'", "2, 4, 5", "9a, 9b, 9c", "4, alkene", "12, 95:5 e.r.", "3c, <2%"].map(leadingLabel)).toEqual([null, null, null, "4", "12", "3c"]);
      // (what follows, where it begins with a digit, a yield or a ratio - no list, locant, size or heat; a word, as it comes)
      expect(["8d, <2%", "8d, 96:4 e.r.", "8d, 1.3:1 d.r.", "8d, Pd(OAc)2", "8d, E"].map(leadingLabel)).toEqual(["8d", "8d", "8d", "8d", "8d"]);
      expect(["1, 3-dichlorobenzene", "1, 2-diol", "6, 8", "10, 20 nm", "21, 83", "10, 80 °C", "8d, 7"].map(leadingLabel)).toEqual(Array(7).fill(null));
    });
  });

  it("are read from the page's own words too, where the figure's drawing holds no letters of them", () => {
    const drawn: FigureDrawn = { paths: [zig(100)], letters: [], pictures: [] };
    const number: B = [100 + 2 * L * ALONG - 3.4, 300 + 1.4 * L - 3.6, 100 + 2 * L * ALONG + 3.4, 300 + 1.4 * L + 3.6];
    const objects: PageObject[] = [{ kind: "path", box: [100, 300, 100 + 4 * L * ALONG, 300 + L * 0.5] }, { kind: "text", box: number }];
    const figures: B[] = [[98, 298, 104 + 4 * L * ALONG, number[3] + 2]];
    const read = pageStructuresOf({ objects, wordsIn: (b) => (b === number ? "9" : "") }, figures, () => drawn, "pdf", 0);
    expect(read.labels.map((l) => l.label)).toEqual(["9"]);
  });
});
