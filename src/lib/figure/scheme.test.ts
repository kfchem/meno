import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { readScheme, type SchemeRead } from "./scheme";

// Schemes drawn as a drawing program draws them, in points from the page's
// top left (y down): bonds 14.4 points long, lines 0.6 thick, letters 10
// points tall and about 6 wide - a structure on either side of an arrow.
const L = 14.4;
type P = [number, number];

const stroke = (pts: P[], width = 0.6, extra: Partial<FigurePath> = {}): FigurePath => ({
  fill: null,
  stroke: "#000000ff",
  width,
  d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]),
  ...extra,
});
const filled = (pts: P[], fill = "#000000ff"): FigurePath => ({
  fill,
  stroke: null,
  width: 0,
  d: [...pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]), ["Z"]],
});
/** A head with its point at `tip`, coming along `[ux, uy]`, 6 long and 5 wide - or half of it, on its left (1) or right (-1) as the page has it. */
const head = (tip: P, [ux, uy]: P, side: 0 | 1 | -1 = 0, fill?: string): FigurePath => {
  const back: P = [tip[0] - ux * 6, tip[1] - uy * 6];
  const n: P = [-uy, ux];
  const l: P = [back[0] - n[0] * 2.5, back[1] - n[1] * 2.5];
  const r: P = [back[0] + n[0] * 2.5, back[1] + n[1] * 2.5];
  // (left, as the page has it: cross(u, p - tip) > 0)
  const [left, right] = cross([ux, uy], [l[0] - tip[0], l[1] - tip[1]]) > 0 ? [l, r] : [r, l];
  return filled(side === 0 ? [tip, left, right] : side === 1 ? [tip, left, back] : [tip, back, right], fill);
};
const cross = (u: P, v: P) => u[0] * v[1] - u[1] * v[0];
/** A chain of `n` bonds from `p`, zigzag to the right. */
const chain = ([x, y]: P, n = 3): FigurePath => stroke(Array.from({ length: n + 1 }, (_, i): P => [x + i * L * 0.866, y + (i % 2 ? -L / 2 : 0)]));
/** Letters set from a point, the first's left edge there, its baseline `y`; `_2` a subscript, `^o` raised. */
function word(text: string, [x, y]: P, font = "Helvetica"): FigureLetter[] {
  const out: FigureLetter[] = [];
  let left = x;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    let size = 10;
    let base = y;
    if (c === "_" || c === "^") {
      const low = c === "_";
      c = text[++i];
      size = 7;
      base = low ? y + 2 : y - 4;
    }
    if (c === " ") {
      left += 3;
      continue;
    }
    const w = size * 0.6;
    out.push({ c, box: [left, base - size * 0.72, left + w, base], at: [left, base], size, font });
    left += w;
  }
  return out;
}
/** Two structures, a chain on the left and one on the right, with the scheme `paths` and `letters` between them. */
const scheme = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({
  paths: [chain([0, 100]), chain([200, 100]), ...paths],
  letters,
  pictures: [],
});
const read = (f: FigureDrawn): SchemeRead => readScheme(f);
const near = (p: { x: number; y: number }, [x, y]: P, by = 0.8) => Math.hypot(p.x - x, p.y - y) < by;

describe("a reaction scheme's arrows", () => {
  it("reads a line with a filled head as a reaction arrow, from its tail to its point, and leaves the structures as they are", () => {
    const s = read(scheme([stroke([[60, 95], [134, 95]]), head([140, 95], [1, 0])]));
    expect(s.arrows).toHaveLength(1);
    const [a] = s.arrows;
    expect(near(a.tail, [60, 95])).toBe(true);
    expect(near(a.point, [140, 95])).toBe(true);
    expect(a.form).toEqual({});
    expect(a.corners).toEqual([]);
    // (the two chains, four atoms each - the head no wedge, the line no bond)
    expect(s.figure.atoms).toHaveLength(8);
    expect(s.figure.bonds).toHaveLength(6);
  });

  it("reads heads at both ends as two heads, and an arrow drawn as one outline", () => {
    const two = read(scheme([stroke([[66, 95], [134, 95]]), head([140, 95], [1, 0]), head([60, 95], [-1, 0])]));
    expect(two.arrows[0].form).toEqual({ heads: 2 });
    expect(near(two.arrows[0].tail, [60, 95])).toBe(true);
    // (its line 0.6 wide and its head, all in one filled shape)
    const outline = read(scheme([filled([[60, 94.7], [134, 94.7], [134, 92.5], [140, 95], [134, 97.5], [134, 95.3], [60, 95.3]])]));
    expect(outline.arrows).toHaveLength(1);
    expect(near(outline.arrows[0].point, [140, 95])).toBe(true);
    expect(near(outline.arrows[0].tail, [60, 95])).toBe(true);
    expect(outline.figure.atoms).toHaveLength(8);
  });

  it("reads two lines with half heads, pointing opposite ways, as an equilibrium - the way its upper line goes - and with whole heads as one with full heads", () => {
    // (the upper line to the right, its half head on its outer side; the lower back to the left)
    const half = read(scheme([stroke([[60, 93], [134, 93]]), head([140, 93], [1, 0], -1), stroke([[146, 97], [72, 97]]), head([66, 97], [-1, 0], -1)]));
    expect(half.arrows).toHaveLength(1);
    expect(half.arrows[0].form).toEqual({ kind: "equilibrium" });
    expect(near(half.arrows[0].tail, [60, 95], 1.5)).toBe(true);
    expect(near(half.arrows[0].point, [146, 95], 1.5)).toBe(true);
    // (the upper to the left, as an equilibrium printed the other way round: it goes left)
    const back = read(scheme([stroke([[134, 93], [60, 93]]), head([54, 93], [-1, 0], 1), stroke([[60, 97], [134, 97]]), head([140, 97], [1, 0], 1)]));
    expect(back.arrows[0].point.x).toBeLessThan(back.arrows[0].tail.x);
    const full = read(scheme([stroke([[60, 92], [134, 92]]), head([140, 92], [1, 0]), stroke([[146, 98], [72, 98]]), head([66, 98], [-1, 0])]));
    expect(full.arrows[0].form).toEqual({ kind: "equilibrium", full: true });
  });

  it("reads two lines ending within an open head as a retrosynthesis's arrow", () => {
    const s = read(scheme([stroke([[60, 93.5], [136, 93.5]]), stroke([[60, 96.5], [136, 96.5]]), stroke([[134, 89], [141, 95], [134, 101]])]));
    expect(s.arrows).toHaveLength(1);
    expect(s.arrows[0].form).toEqual({ kind: "retrosynthetic" });
    expect(near(s.arrows[0].point, [141, 95])).toBe(true);
    expect(near(s.arrows[0].tail, [60, 95])).toBe(true);
    expect(s.figure.atoms).toHaveLength(8);
  });

  it("reads a line with an open head of two strokes as a reaction arrow", () => {
    const s = read(scheme([stroke([[60, 95], [140, 95]]), stroke([[134, 91], [140, 95], [134, 99]])]));
    expect(s.arrows).toHaveLength(1);
    expect(s.arrows[0].form).toEqual({});
    expect(near(s.arrows[0].point, [140, 95])).toBe(true);
  });

  it("reads dashes in a row, or a line stroked dashed, as a dashed arrow", () => {
    const dashes = Array.from({ length: 13 }, (_, i) => stroke([[60 + i * 6, 95], [63 + i * 6, 95]]));
    const pieces = read(scheme([...dashes, head([140, 95], [1, 0])]));
    expect(pieces.arrows).toHaveLength(1);
    expect(pieces.arrows[0].form).toEqual({ dash: true });
    expect(pieces.figure.atoms).toHaveLength(8);
    const stroked = read(scheme([stroke([[60, 95], [134, 95]], 0.6, { dash: true }), head([140, 95], [1, 0])]));
    expect(stroked.arrows[0].form).toEqual({ dash: true });
  });

  it("reads a cross on an arrow's middle - two strokes, or a letter x - as a reaction that does not go", () => {
    const strokes = read(scheme([stroke([[60, 95], [134, 95]]), head([140, 95], [1, 0]), stroke([[97, 92], [103, 98]]), stroke([[97, 98], [103, 92]])]));
    expect(strokes.arrows[0].form).toEqual({ kind: "noReaction" });
    expect(strokes.figure.atoms).toHaveLength(8);
    const letter = read(scheme([stroke([[60, 95], [134, 95]]), head([140, 95], [1, 0])], word("×", [97, 98])));
    expect(letter.arrows[0].form).toEqual({ kind: "noReaction" });
    expect(letter.words).toEqual([]);
  });

  it("reads an arrow that turns, with its corner, and its weight and colour", () => {
    const bent = read(scheme([stroke([[60, 95], [100, 115], [134.6, 97.7]]), head([140, 95], [0.894, -0.447])]));
    expect(bent.arrows).toHaveLength(1);
    expect(bent.arrows[0].corners).toHaveLength(1);
    expect(near(bent.arrows[0].corners[0], [100, 115])).toBe(true);
    const thick = read(scheme([stroke([[60, 95], [134, 95]], 1.6, { stroke: "#c44848ff" }), head([140, 95], [1, 0], 0, "#c44848ff")]));
    expect(thick.arrows[0].form).toEqual({ weight: "thick" });
    expect(thick.arrows[0].color).toBe("#c44848");
    const thin = read(scheme([stroke([[60, 95], [134, 95]], 0.3), head([140, 95], [1, 0])]));
    expect(thin.arrows[0].form).toEqual({ weight: "thin" });
  });

  it("reads arrows drawn alone, with no structure by them, each from its tail to its point", () => {
    // (three as long, one of them thick and coloured: no bond to measure them by but themselves)
    const s = readScheme({
      paths: [stroke([[0, 0], [44, 0]]), head([50, 0], [1, 0]), stroke([[0, 30], [44, 30]]), head([50, 30], [1, 0]), stroke([[0, 60], [43, 60]], 1.4, { stroke: "#c44848ff" }), head([50, 60], [1, 0], 0, "#c44848ff")],
      letters: [],
      pictures: [],
    });
    expect(s.arrows).toHaveLength(3);
    expect(s.figure.atoms).toEqual([]);
    expect(s.arrows.find((a) => a.color)).toMatchObject({ form: { weight: "thick" }, color: "#c44848" });
  });

  it("reads no arrow in a structure alone: a wedge is no head", () => {
    // (a chain with a wedge at its end, along it)
    const s = read({
      paths: [chain([0, 100]), filled([[3 * L * 0.866, 100 - L / 2], [4 * L * 0.866, 100 - L / 2 - 2], [4 * L * 0.866, 100 - L / 2 + 2]])],
      letters: [],
      pictures: [],
    });
    expect(s.arrows).toEqual([]);
    expect(s.figure.bonds.some((b) => b.stereo === "up")).toBe(true);
  });
});

describe("a reaction scheme's signs and words", () => {
  it("reads a + set alone, or drawn as two crossing strokes, as a sign", () => {
    const letter = read(scheme([stroke([[80, 95], [134, 95]]), head([140, 95], [1, 0])], word("+", [62, 98])));
    expect(letter.pluses).toHaveLength(1);
    expect(letter.words).toEqual([]);
    const strokes = read(scheme([stroke([[80, 95], [134, 95]]), head([140, 95], [1, 0]), stroke([[60, 95], [70, 95]]), stroke([[65, 90], [65, 100]])]));
    expect(strokes.pluses).toHaveLength(1);
    expect(near(strokes.pluses[0], [65, 95])).toBe(true);
    expect(strokes.figure.atoms).toHaveLength(8);
  });

  it("spaces words by how their letters are set, where the figure says: a 1's ink stands well inside its room", () => {
    // (each letter's loose box from where it starts to where the next would; the 1's ink narrow inside it)
    const set = (c: string, x: number, w: number, ink: [number, number]): FigureLetter => ({ c, box: [x + ink[0], 81, x + ink[1], 88], loose: [x, 79, x + w, 90], at: [x, 88], size: 10 });
    const letters = [set("1", 70, 5.6, [1.2, 3.6]), set(".", 75.6, 2.8, [0.9, 1.9]), set("L", 81.2, 5.6, [0.7, 5]), set("D", 86.8, 7.2, [0.8, 6.6]), set("A", 94, 6.7, [0, 6.7])];
    const s = read(scheme([stroke([[60, 95], [134, 95]]), head([140, 95], [1, 0])], letters));
    expect(s.words.map((w) => w.text)).toEqual(["1. LDA"]);
  });

  it("reads the words over and under an arrow as its, written as Meno writes them, and a compound's number in bold where it stands", () => {
    const s = read(
      scheme(
        [stroke([[60, 95], [134, 95]]), head([140, 95], [1, 0])],
        [...word("NaH, THF", [70, 89]), ...word("-78 ^oC, 1-2 h", [66, 108]), ...word("1", [20, 125], "Helvetica-Bold"), ...word("K_2CO_3", [70, 77])],
      ),
    );
    const over = s.words.filter((w) => w.arrow === 0).map((w) => w.text);
    expect(over).toContain("K2CO3\nNaH, THF");
    expect(over).toContain("−78 °C, 1–2 h");
    const number = s.words.find((w) => w.text === "1")!;
    expect(number.arrow).toBeUndefined();
    expect(number.marks).toEqual([{ from: 0, to: 1, bold: true }]);
    // (a formula's counts set low are no marks: Meno sets them low itself)
    expect(s.words.find((w) => w.text.includes("K2CO3"))!.marks).toEqual([]);
  });
});
