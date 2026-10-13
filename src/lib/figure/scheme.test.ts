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

  it("reads an arrow drawn as one outline as one head, though the box round it leans", () => {
    // (as PDFium gives one back: its points a hair off level, so the narrowest box round it leans a degree or two)
    const s = read(scheme([filled([[115, 138.70001], [179, 138.70001], [179, 136.5], [185, 139], [179, 141.5], [179, 139.29999], [115, 139.29999], [115, 138.70001]])]));
    expect(s.arrows).toHaveLength(1);
    expect(s.arrows[0].form).toEqual({});
    expect(near(s.arrows[0].point, [185, 139])).toBe(true);
    expect(near(s.arrows[0].tail, [115, 139])).toBe(true);
  });

  it("takes a head filled and stroked as well - its path's edges drawn too - as the head alone, no bonds of its edges", () => {
    const s = read(scheme([stroke([[60, 95], [134, 95]]), { ...head([140, 95], [1, 0]), stroke: "#000000ff", width: 0.6 }]));
    expect(s.arrows).toHaveLength(1);
    expect(s.figure.atoms).toHaveLength(8);
    expect(s.figure.bonds).toHaveLength(6);
  });

  it("takes an x as a cross only on the arrow's line and alone: one in the words over it is a word's", () => {
    const s = read(scheme([stroke([[60, 95], [134, 95]]), head([140, 95], [1, 0])], word("3 x 10 min", [75, 89])));
    expect(s.arrows[0].form).toEqual({});
    expect(s.words.map((w) => w.text)).toEqual(["3 x 10 min"]);
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

  it("reads no arrow where a stereo wedge goes off a ring's atom, its wide end behind the bond ending there", () => {
    // (cholesterol's C13 as Meno exports it, printed: three bonds meeting, and the methyl's wedge drawn in perspective,
    // one side square - read as a half head on the bond from C17 before)
    const s = read({
      paths: [
        stroke([[213.68, 91.61], [232.46, 87.62]], 0.8),
        stroke([[213.68, 91.61], [207.74, 109.87]], 0.8),
        stroke([[207.74, 109.87], [219.03, 125.4]], 0.8),
        stroke([[189.48, 135.0], [189.48, 115.8]], 0.8),
        stroke([[189.48, 115.8], [172.86, 106.2]], 0.8),
        stroke([[189.48, 115.8], [207.74, 109.87]], 0.8),
        filled([[193.48, 96.92], [189.5, 96.5], [189.04, 116.16], [189.84, 116.24]]),
      ],
      letters: [],
      pictures: [],
    });
    expect(s.arrows).toEqual([]);
    expect(s.figure.bonds).toHaveLength(7);
    expect(s.figure.bonds.filter((b) => b.stereo === "up")).toHaveLength(1);
  });

  it("takes no stereo wedge for an arrow's head: one going off its stereocentre straight at the arrow's tail is the structure's", () => {
    // (a stereocentre's three bonds - its wedge drawn in perspective, one side square, its wide end
    // 5.6 points short of the arrow's tail - read as a head at the tail before)
    const s = read(
      scheme([
        stroke([[40, 95], [32.8, 82.5]]),
        stroke([[40, 95], [32.8, 107.5]]),
        filled([[40, 94.8], [40, 95.2], [54.4, 99.5], [54.4, 95]]),
        stroke([[60, 95], [134, 95]]),
        head([140, 95], [1, 0]),
      ]),
    );
    expect(s.arrows).toHaveLength(1);
    expect(s.arrows[0].form).toEqual({});
    expect(near(s.arrows[0].tail, [60, 95])).toBe(true);
    expect(s.figure.bonds.filter((b) => b.stereo === "up")).toHaveLength(1);
    // (a head is still one where it is stroked as well as filled - 8 long and 6 wide, a wedge's shape: its own edges ending at its point are no stereocentre's bonds)
    const stroked = read(scheme([stroke([[60, 95], [132, 95]]), { ...filled([[140, 95], [132, 92], [132, 98]]), stroke: "#000000ff", width: 0.6 }]));
    expect(stroked.arrows).toHaveLength(1);
    expect(stroked.figure.atoms).toHaveLength(8);
    expect(stroked.figure.bonds.filter((b) => b.stereo)).toEqual([]);
  });

  it("reads a retrosynthesis's arrow whose lines are set close, each ending within the head as near its point as a head's own line may", () => {
    // (2.6 points apart under a head 8 long: either line alone, its end 1.3 off the head's point, was read as an arrow of its own)
    const s = read(scheme([stroke([[60, 93.7], [136, 93.7]]), stroke([[60, 96.3], [136, 96.3]]), stroke([[132, 91], [140, 95], [132, 99]])]));
    expect(s.arrows).toHaveLength(1);
    expect(s.arrows[0].form).toEqual({ kind: "retrosynthetic" });
    expect(near(s.arrows[0].point, [140, 95])).toBe(true);
    expect(s.figure.atoms).toHaveLength(8);
  });

  it("reads a cross as long as Meno draws one on an arrow with a wide head as a reaction that does not go, not as a + sign", () => {
    // (Meno's cross is 3.6 head widths across: 11 points on a head 6 wide, past 0.7 of a bond)
    const s = read(scheme([stroke([[60, 95], [134, 95]]), head([140, 95], [1, 0]), stroke([[96.1, 91.1], [103.9, 98.9]]), stroke([[96.1, 98.9], [103.9, 91.1]])]));
    expect(s.arrows[0].form).toEqual({ kind: "noReaction" });
    expect(s.pluses).toEqual([]);
    expect(s.figure.atoms).toHaveLength(8);
  });

  it("reads a long, thick arrow drawn as one outline with a half head", () => {
    // (its line 2 thick, 84 long; its half head 9 long, standing 2.5 out from the line at its back only - between the rows it was looked at by)
    const s = read(scheme([filled([[60, 94.01], [143.74, 94.01], [134.83, 98.5], [134.83, 95.99], [60, 95.99]])]));
    expect(s.arrows).toHaveLength(1);
    expect(s.arrows[0].form).toEqual({ weight: "thick" });
    expect(near(s.arrows[0].point, [143.74, 94.01])).toBe(true);
  });

  // Structures alone as Meno exports them in a journal's style and prints them (the round-trip audit's figures, cut down to the
  // lines by the arrow once read in them): no arrow in any.
  it("reads no arrow in a cage drawn in perspective: a piece of a back bond, broken where a front one passes, is no barb", () => {
    // (cubane, RSC: its bonds meet at 30 degrees; the piece from a corner to the gap was read as a half head on the bond ending there)
    const s = read({
      paths: [
        stroke([[82.27, 78.82], [90.98, 81.15]], 0.45),
        stroke([[93.16, 81.74], [95.66, 82.41]], 0.45),
        stroke([[95.66, 82.41], [92.88, 87.22]], 0.45),
        stroke([[91.75, 89.17], [88.73, 94.41]], 0.45),
        stroke([[88.73, 94.41], [75.34, 90.82]], 0.45),
        stroke([[75.34, 90.82], [88.73, 87.23]], 0.45),
        stroke([[88.73, 87.23], [95.66, 75.23]], 0.45),
        stroke([[95.66, 75.23], [109.04, 78.82]], 0.45),
        stroke([[109.04, 78.82], [102.11, 90.82]], 0.45),
        stroke([[75.34, 90.82], [82.27, 78.82]], 0.45),
        stroke([[95.66, 75.23], [82.27, 78.82]], 0.45),
        stroke([[109.04, 78.82], [95.66, 82.41]], 0.45),
        stroke([[102.11, 90.82], [88.73, 94.41]], 0.45),
        stroke([[102.11, 90.82], [88.73, 87.23]], 0.45),
      ],
      letters: [],
      pictures: [],
    });
    expect(s.arrows).toEqual([]);
  });

  it("reads no arrow where a bond cut short of a label meets another at an atom: an arrow's point touches nothing but its head", () => {
    // (quinine, ACS 1996: the bond to N, cut short, read as a barb on the bond to the atom it starts at - the vertical bond ending there too)
    const s = read({
      paths: [
        stroke([[119.83, 131.49], [119.83, 116.82]]),
        stroke([[119.83, 116.82], [127.17, 104.11]]),
        stroke([[141.34, 100.32], [135.45, 101.89]]),
        stroke([[132.56, 102.67], [127.17, 104.11]]),
        stroke([[134, 108.54], [134, 98.35]]),
        stroke([[128.86, 114.4], [119.83, 116.82]]),
      ],
      letters: [{ c: "N", box: [131.15, 109.86, 136.79, 117.02], at: [130.39, 117.02], size: 10, font: "ArialMT" }],
      pictures: [],
    });
    expect(s.arrows).toEqual([]);
  });

  it("reads no arrow where a piece of a bond broken behind an atom lies across a double bond's end: a barb ends in the open", () => {
    // (picrotoxinin, Wiley: the piece's ends meet an atom and the gap the bond is broken at, and it lay across the end of the C=O's line)
    const s = read({
      paths: [
        stroke([[158.01, 106.17], [142.01, 96.93]], 0.74),
        stroke([[142.01, 96.93], [126.01, 106.17]], 0.74),
        stroke([[126.01, 106.17], [126.01, 124.65]], 0.74),
        stroke([[126.01, 124.65], [142.01, 133.89]], 0.74),
        stroke([[142.01, 133.89], [158.01, 124.65]], 0.74),
        stroke([[158.01, 124.65], [148.77, 108.65]], 0.74),
        stroke([[149.54, 109.98], [138.16, 115.46]], 0.74),
        stroke([[150.97, 105.89], [136.83, 112.7]], 0.74),
        stroke([[148.77, 108.65], [151.88, 104.74]], 0.74),
        stroke([[154.18, 101.86], [156, 99.56]], 0.74),
        stroke([[158.01, 124.65], [158.01, 106.17]], 0.74),
        stroke([[142.01, 96.93], [154.15, 95.11]], 0.74),
      ],
      letters: [
        { c: "O", box: [128.03, 112.72, 136.25, 121.6], at: [127.46, 121.47], size: 12, font: "ArialMT" },
        { c: "O", box: [156.19, 90.24, 164.41, 99.12], at: [155.61, 98.99], size: 12, font: "ArialMT" },
        { c: "H", box: [122.63, 83.9, 129.38, 92.49], at: [121.67, 92.49], size: 12, font: "ArialMT" },
        { c: "H", box: [172.48, 125.64, 179.23, 134.23], at: [171.52, 134.23], size: 12, font: "ArialMT" },
      ],
      pictures: [],
    });
    expect(s.arrows).toEqual([]);
  });

  it("reads no open head made of two bonds of an atom other bonds end at", () => {
    // (aconitine, ACS 1996: two bonds of a ring atom with four read as an open head at the end of a hash's stroke)
    const o = (x: number, y: number): FigureLetter => ({ c: "O", box: [x, y, x + 6.85, y + 7.4], at: [x - 0.48, y + 7.29], size: 10, font: "ArialMT" });
    const s = read({
      paths: [
        filled([[171.64, 129.54], [171.53, 128.95], [172.83, 128.85], [172.81, 129.46]]),
        filled([[171.18, 127.06], [171.07, 126.46], [172.94, 126.33], [172.91, 126.93]]),
        filled([[170.73, 124.57], [170.62, 123.98], [173.04, 123.81], [173.02, 124.41]]),
        filled([[170.27, 122.09], [170.16, 121.5], [173.15, 121.29], [173.12, 121.89]]),
        stroke([[157.34, 141.65], [149.52, 128.68]]),
        stroke([[149.52, 128.68], [162.2, 118.68]]),
        stroke([[162.2, 118.68], [176.82, 127.38]]),
        stroke([[176.82, 127.38], [172.58, 134.49]]),
        stroke([[169.33, 111.42], [165.34, 102.48]]),
        stroke([[176.82, 127.38], [180.26, 138.97]]),
        stroke([[180.26, 138.97], [189.77, 139.49]]),
        stroke([[176.82, 127.38], [184.25, 122.29]]),
        stroke([[149.77, 114.52], [154.35, 105.88]]),
        stroke([[172.58, 134.49], [157.34, 141.65]]),
      ],
      letters: [o(167.84, 112.42), o(191.32, 136.47), o(185.37, 115.91), o(144.15, 115.4)],
      pictures: [],
    });
    expect(s.arrows).toEqual([]);
  });

  it("reads a short harpoon drawn as one outline with its tail on its line, the half head out of the fit", () => {
    // (16 points long, its line 0.6 wide, its half head 6 long and 2.5 high: over a quarter of its length)
    const s = read(scheme([filled([[60, 94.7], [70, 94.7], [70, 92.2], [76, 95.3], [60, 95.3]])]));
    expect(s.arrows).toHaveLength(1);
    expect(Math.abs(s.arrows[0].tail.y - 95)).toBeLessThan(0.15);
  });

  it("reads a short arrow drawn as one outline, its head wide for its length", () => {
    // (26 points long, its head 7 wide: under four head widths long)
    const s = read(scheme([filled([[60, 94.7], [79, 94.7], [79, 91.5], [86, 95], [79, 98.5], [79, 95.3], [60, 95.3]])]));
    expect(s.arrows).toHaveLength(1);
    expect(near(s.arrows[0].point, [86, 95])).toBe(true);
    expect(near(s.arrows[0].tail, [60, 95])).toBe(true);
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

  it("keeps the words on either side of an arrow apart, however close to its line they are set", () => {
    // (over and under, each 2 points from the line: a line's height apart, read as one block across the arrow before)
    const s = read(scheme([stroke([[60, 95], [134, 95]]), head([140, 95], [1, 0])], [...word("NaH, THF", [70, 93]), ...word("rt, 2 h", [74, 104.2])]));
    expect(s.words.map((w) => [w.text, w.arrow]).sort()).toEqual([
      ["NaH, THF", 0],
      ["rt, 2 h", 0],
    ]);
    // (beside an arrow standing upright, level with each other: read as one line across it before)
    const up = read(scheme([stroke([[100, 60], [100, 134]]), head([100, 140], [0, 1])], [...word("rt, 3 d", [60, 104]), ...word("BuLi", [104, 104])]));
    expect(up.words.map((w) => [w.text, w.arrow]).sort()).toEqual([
      ["BuLi", 0],
      ["rt, 3 d", 0],
    ]);
  });

  it("takes no word set wholly before an arrow's tail for the arrow's: a compound's number under it, the arrow going on below", () => {
    // (a long arrow standing upright, its tail at y 60; the number 10 points to its right, its foot 5 points short of the tail)
    const s = read(scheme([stroke([[100, 60], [100, 194]]), head([100, 200], [0, 1])], [...word("2", [110, 55], "Helvetica-Bold"), ...word("NaH", [104, 132])]));
    expect(s.words.find((w) => w.text === "2")!.arrow).toBeUndefined();
    expect(s.words.find((w) => w.text === "NaH")!.arrow).toBe(0);
  });

  it("reads no + set small, a charge's size, as a sign, however few other words there are", () => {
    // (two charges by a ring's carbons, 7 points to the labels' 10, and no other words left once the labels are read)
    const ring: P[] = [0, 60, 120, 180, 240, 300].map((deg) => [200 + L * Math.cos(((deg + 30) * Math.PI) / 180), 100 - L * Math.sin(((deg + 30) * Math.PI) / 180)]);
    const charge = (p: P): FigureLetter[] => [{ c: "+", box: [p[0] + 3, p[1] - 9, p[0] + 7, p[1] - 5], at: [p[0] + 3, p[1] - 5], size: 7 }];
    const s = read({
      // (a chain ending in an OH, its bond cut short of the label)
      paths: [chain([0, 100]), stroke([[37.4, 92.8], [44.9, 97.1]]), stroke([...ring, ring[0]]), stroke([[70, 95], [134, 95]]), head([140, 95], [1, 0])],
      letters: [...word("OH", [46.9, 103.6]), ...charge(ring[0]), ...charge(ring[3])],
      pictures: [],
    });
    expect(s.figure.atoms.some((a) => a.label === "OH")).toBe(true);
    expect(s.pluses).toEqual([]);
  });
});
