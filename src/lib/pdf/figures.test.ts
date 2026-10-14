import { describe, expect, it } from "vitest";
import { figureAt, figuresOf, pageObjectsOf, type Box, type PageObject } from "./figures";

const path = (box: Box): PageObject => ({ kind: "path", box });
const text = (box: Box): PageObject => ({ kind: "text", box });

/** A structure drawn as a paper draws one: short bonds, near one another, its atoms' labels over and beside them. */
function structureAt(x: number, y: number): PageObject[] {
  const bonds: PageObject[] = [];
  for (let i = 0; i < 6; i++) bonds.push(path([x + i * 12, y + (i % 2) * 7, x + i * 12 + 12, y + (i % 2) * 7 + 7]));
  return [...bonds, text([x - 9, y + 2, x - 1, y + 10]), text([x + 70, y + 20, x + 80, y + 28])];
}

describe("a PDF page's figures", () => {
  it("are read from the reader's answer: what each thing is and where it lies, 20 bytes each", () => {
    const buf = new ArrayBuffer(60);
    const v = new DataView(buf);
    [
      [2, 1, 2, 3, 4],
      [3, 5, 6, 7, 8],
      [9, 0, 0, 1, 1],
    ].forEach((row, i) => {
      v.setUint32(i * 20, row[0], true);
      row.slice(1).forEach((n, k) => v.setFloat32(i * 20 + 4 + k * 4, n, true));
    });
    expect(pageObjectsOf(buf)).toEqual([
      { kind: "path", box: [1, 2, 3, 4] },
      { kind: "image", box: [5, 6, 7, 8] },
    ]);
  });

  it("are where pictures and paths lie together, with their labels", () => {
    const figures = figuresOf(structureAt(100, 300));
    expect(figures).toHaveLength(1);
    // (the bonds, and the labels beside them)
    expect(figures[0]).toEqual([91, 300, 180, 328]);
  });

  it("are each their own where they lie apart; a picture, however small, is one", () => {
    const figures = figuresOf([...structureAt(100, 300), ...structureAt(100, 500), { kind: "image", box: [300, 100, 316, 112] }]);
    expect(figures).toHaveLength(3);
    expect(figureAt(figures, 120, 510)).toEqual(figures.find((f) => f[1] === 500));
    expect(figureAt(figures, 10, 10)).toBeNull();
  });

  it("are no rule, no page's frame, and do not take a column's lines of words beside them", () => {
    const rule = path([72, 60, 523, 61]);
    const frame = path([0, 0, 595, 842]);
    const line = text([60, 330, 400, 340]);
    const figures = figuresOf([rule, frame, line, ...structureAt(100, 300), text([0, 0, 595, 842])]);
    expect(figures).toEqual([[91, 300, 180, 328]]);
    expect(figuresOf([rule, frame])).toEqual([]);
  });

  it("take a structure's part beyond a label as its, however small: an acetyl past an NH", () => {
    // (a ring, an NH beside it, and past the NH a C=O and a methyl - 20 points across, smaller than a figure alone)
    const ring = structureAt(100, 300);
    const nh = text([174, 306, 186, 316]);
    const acetyl = [path([188, 304, 200, 311]), path([200, 304, 208, 311]), path([199, 294, 201, 304])];
    const figures = figuresOf([...ring, nh, ...acetyl]);
    expect(figures).toHaveLength(1);
    expect(figures[0][2]).toBeGreaterThanOrEqual(208);
  });

  it("are a small structure too, its labels taking it to 18 points, but no icon in a line of words nor a bullet", () => {
    // (an acetate drawn small: a bond 10 points long to the carbonyl's carbon, its two lines up to an O, one down to the other O)
    const acetate = [path([100, 306, 110, 312]), path([109, 296, 110, 306]), path([111, 296, 112, 306]), path([110, 312, 118, 316])];
    const os = [text([106, 286, 114, 294]), text([119, 313, 127, 321])];
    const figures = figuresOf([...acetate, ...os]);
    expect(figures).toEqual([[100, 286, 127, 321]]);
    // (the same lines - an icon - set in a line of running words, right beside them and level with them)
    const icon = acetate.map((o): PageObject => ({ ...o, box: [o.box[0] + 100, o.box[1] + 200, o.box[2] + 100, o.box[3] + 200] }));
    const line = [text([60, 500, 196, 510]), text([222, 500, 400, 510]), text([206, 486, 214, 494])];
    expect(figuresOf([...icon, ...line])).toEqual([]);
    // (bullets - each smaller than a bond, a line of words apart - none, however short their words)
    expect(figuresOf([600, 614, 628].flatMap((y) => [path([60, y, 64, y + 4]), text([68, y - 2, 80, y + 6])]))).toEqual([]);
  });

  it("take a counter-ion with its charge drawn by it, and a row of them, but no short word as far off without one", () => {
    // (a charge as Meno draws one: a ring of small pieces, its sign in it)
    const ring = (cx: number, cy: number): PageObject[] => [
      ...Array.from({ length: 24 }, (_, k): PageObject => {
        const [x, y] = [cx + 2.5 * Math.cos((k * Math.PI) / 12), cy + 2.5 * Math.sin((k * Math.PI) / 12)];
        return path([x - 0.3, y - 0.3, x + 0.3, y + 0.3]);
      }),
      path([cx - 1.5, cy - 0.2, cx + 1.5, cy + 0.2]),
    ];
    // (a structure ending at 180; K+ K+ 22 points apart, each its ring at its upper right; a number as far off, alone)
    const ions = [200, 230].flatMap((x) => [text([x, 305, x + 6, 313]), ...ring(x + 9, 304)]);
    const figures = figuresOf([...structureAt(100, 300), ...ions]);
    expect(figures).toHaveLength(1);
    expect(figures[0][2]).toBeGreaterThanOrEqual(241);
    const number = figuresOf([...structureAt(100, 300), text([200, 305, 206, 313])]);
    expect(number).toEqual([[91, 300, 180, 328]]);
  });

  it("are none on a page scanned in strips, as on a page scanned whole; a picture beside its words still one", () => {
    // (a page scanned as eight strips, one under another, its words read over them)
    const strips: PageObject[] = Array.from({ length: 8 }, (_, i) => ({ kind: "image", box: [0, i * 105.25, 595, (i + 1) * 105.25] }));
    expect(figuresOf([...strips, text([72, 300, 520, 310]), text([253, 214, 268, 224])])).toEqual([]);
    expect(figuresOf([{ kind: "image", box: [0, 0, 595, 842] }])).toEqual([]);
    // (pictures side by side, over less of the page: a figure)
    const panels: PageObject[] = [
      { kind: "image", box: [72, 100, 200, 200] },
      { kind: "image", box: [200, 100, 328, 200] },
    ];
    expect(figuresOf([...panels, text([72, 300, 520, 310]), text([72, 700, 520, 710])])).toEqual([[72, 100, 328, 200]]);
  });

  it("at a point: none that is most of its page - a page scanned, its picture and words over it read as one - but a figure on it", () => {
    // (a page scanned in three strips a few points apart, its words read over them: taken for figures, the strips widened by the words)
    const page: [number, number] = [612, 842];
    const strips: PageObject[] = [0, 1, 2].map((i) => ({ kind: "image", box: [6, 10 + i * 275, 606, 10 + i * 275 + 270] }));
    const words = Array.from({ length: 40 }, (_, i) => text([60, 20 + i * 20, 560, 28 + i * 20]));
    const whole: Box = [6, 10, 606, 830];
    expect(figureAt([whole], 300, 400, page)).toBeNull();
    expect(figureAt([whole], 300, 400)).toEqual(whole);
    // (a figure on a page, found as before)
    expect(figureAt([[100, 100, 200, 200]], 150, 150, page)).toEqual([100, 100, 200, 200]);
    for (const f of figuresOf([...strips, ...words])) {
      const [x0, y0, x1, y1] = f;
      const most = (x1 - x0) * (y1 - y0) >= 0.8 * page[0] * page[1];
      expect(figureAt([f], (x0 + x1) / 2, (y0 + y1) / 2, page)).toEqual(most ? null : f);
    }
  });

  it("take a reaction scheme whole: its arrow joins the compounds beyond its ends, a + joins those beside it, and its conditions and numbers are its", () => {
    // (two compounds and a "+", an arrow 20 points on - its line straight and long, its head - and a product 20 points beyond)
    const plus: PageObject = { kind: "plus", box: [192, 305, 199, 312] };
    const arrow = [path([268, 308, 330, 309]), path([328, 305, 336, 312])];
    const conditions = [text([280, 290, 325, 298]), text([276, 279, 330, 287]), text([284, 312, 322, 320])];
    const numbers = [text([125, 330, 131, 338]), text([215, 330, 221, 338]), text([380, 330, 386, 338])];
    const figures = figuresOf([...structureAt(100, 300), plus, ...structureAt(210, 300), ...arrow, ...structureAt(356, 300), ...conditions, ...numbers]);
    expect(figures).toHaveLength(1);
    const [x0, y0, x1, y1] = figures[0];
    expect(x0).toBeLessThanOrEqual(91);
    expect(x1).toBeGreaterThanOrEqual(436);
    // (both lines of the conditions over the arrow, the line under it, and the numbers under the compounds)
    expect(y0).toBeLessThanOrEqual(279);
    expect(y1).toBeGreaterThanOrEqual(338);
  });

  it("join no compounds without an arrow or a + between them: not by a small word, nor by a chain drawn flat", () => {
    // (a small word between two compounds - an atom's label, a number - is no "+")
    const word = text([192, 305, 199, 312]);
    expect(figuresOf([...structureAt(100, 300), word, ...structureAt(210, 300)])).toHaveLength(2);
    // (a chain drawn flat is long and thin, but its bonds slant: no arrow's straight line)
    const chain = [0, 1, 2, 3, 4].map((i) => path([100 + i * 12, 300 + (i % 2) * 7, 112 + i * 12, 307 + (i % 2) * 7]));
    expect(figuresOf([...chain, ...structureAt(185, 300)])).toHaveLength(2);
    // (a compound's label at its end, beside its neighbour 12 points on: the compound's, not the neighbour's - the two apart)
    const label = text([173, 303, 203, 311]);
    expect(figuresOf([...structureAt(100, 300).slice(0, 6), label, ...structureAt(215, 300).slice(0, 6)])).toHaveLength(2);
  });

  it("take no column's line of words beside a scheme across two columns, however close", () => {
    const arrow = [path([150, 308, 212, 309]), path([210, 305, 218, 312])];
    const lines = [text([50, 291, 290, 299]), text([305, 291, 545, 299])];
    const figures = figuresOf([...structureAt(60, 300), ...arrow, ...structureAt(238, 300), ...lines, text([0, 0, 595, 10])]);
    expect(figures).toHaveLength(1);
    expect(figures[0][1]).toBe(300);
  });
});

