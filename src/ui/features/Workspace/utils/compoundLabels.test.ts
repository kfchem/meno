import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import { figuresOf, type PageObject } from "../../../../lib/pdf/figures";
import { compoundLabelsOf, labelText, pageStructuresOf, type PageMarks, type PageStructure } from "./pageStructures";

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
});
