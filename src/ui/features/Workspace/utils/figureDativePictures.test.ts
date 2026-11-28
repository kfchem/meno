/**
 * Read as structure on pictures (lib/figure/tracedRead `readTracedPicture`): drawings painted at 300 dpi from their paths, their letters
 * given as a PDF's over a picture are. A dative bond's arrow - a short line with a filled head, traced as one piece - is read as a
 * dative bond from its tail (lib/figure/trace `arrowOf`); nothing else short is: a wedge, a hash, a short bond, a minus sign, a scheme's
 * arrow. Ph3PAuCl is Meno's own drawing (lib/figure/fixtures); the others are drawn here as Meno draws them: bonds 14.4 long, lines
 * 0.6, a dative arrow's head a quarter of a bond long.
 */
import { describe, expect, it } from "vitest";
import type { Box, FigureDrawn, FigureLetter, FigurePath, PathStep } from "../../../../lib/figure/drawn";
import { DATIVE_UNREAD, type FigureRead } from "../../../../lib/figure/read";
import { readDrawnLabel } from "../../../../lib/figure/structure";
import { readTracedPicture } from "../../../../lib/figure/tracedRead";
import { figureLabels } from "./figures";
import { measured } from "../../../../testing/timeouts";
import { painted } from "../../../../testing/paintedFigure";
import goldPhosphine from "../../../../lib/figure/fixtures/ph3paucl-nature.json";

const read = (f: FigureDrawn): FigureRead => {
  const { pixels, at } = painted(f);
  const r = readTracedPicture(pixels, at, [], (l) => readDrawnLabel(l, figureLabels).read, f.letters);
  if ("none" in r) throw new Error(r.none);
  return r;
};

const L = 14.4;
type P = [number, number];
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
const filled = (...pts: P[]): FigurePath => ({ fill: "#000000ff", stroke: null, width: 0, d: [...pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]), ["Z"]] });
const unit = (p: P, q: P): P => {
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
  return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
};
/** A dative bond's arrow from `from` to `to`: its line, and a filled head a quarter of a bond long and 0.15 of one wide. */
const arrow = (from: P, to: P): FigurePath[] => {
  const [ux, uy] = unit(from, to);
  const base: P = [to[0] - ux * 0.25 * L, to[1] - uy * 0.25 * L];
  const w = 0.075 * L;
  return [stroke(from, base), filled(to, [base[0] - uy * w, base[1] + ux * w], [base[0] + uy * w, base[1] - ux * w])];
};
/** A wedge bond, narrow at `from`, 0.2 of a bond wide at `to`. */
const wedge = (from: P, to: P): FigurePath => {
  const [ux, uy] = unit(from, to);
  const w = 0.1 * L;
  return filled(from, [to[0] - uy * w, to[1] + ux * w], [to[0] + uy * w, to[1] - ux * w]);
};
/** A hashed bond, narrow at `from`: seven bars widening to 0.2 of a bond. */
const hashed = (from: P, to: P): FigurePath[] => {
  const [ux, uy] = unit(from, to);
  return Array.from({ length: 7 }, (_, k) => {
    const t = (k + 0.5) / 7;
    const [cx, cy, w] = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, 0.02 * L + 0.08 * L * t];
    return stroke([cx - uy * w, cy + ux * w], [cx + uy * w, cy - ux * w]);
  });
};
/** Letters set from a point, the first's middle there; `_3` a subscript. */
function word(text: string, [x, y]: P): FigureLetter[] {
  const out: FigureLetter[] = [];
  let left = x - 3.4;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    let [size, base] = [10, y + 3.6];
    if (c === "_") [c, size, base] = [text[++i], 7, y + 6];
    const w = size * 0.68;
    out.push({ c, box: [left, base - size * 0.72, left + w, base] as Box, at: [left, base], size } as FigureLetter);
    left += w;
  }
  return out;
}
const ring = (c: P, n = 6): P[] => Array.from({ length: n }, (_, k) => [c[0] + (L / (2 * Math.sin(Math.PI / n))) * Math.cos((2 * Math.PI * k) / n + Math.PI / 2), c[1] + (L / (2 * Math.sin(Math.PI / n))) * Math.sin((2 * Math.PI * k) / n + Math.PI / 2)]);
const closed = (pts: P[]) => pts.map((p, k) => stroke(p, pts[(k + 1) % pts.length]));
const figure = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({ paths, letters, pictures: [] });
const label = (r: FigureRead, i: number) => r.atoms[i].label ?? r.atoms[i].el ?? "C";
const datives = (r: FigureRead) => r.bonds.filter((b) => b.dative).map((b) => `${label(r, b.a)}>${label(r, b.b)}`);

describe("a dative bond's arrow in a picture at 300 dpi", () => {
  it("Ph3PAuCl, Meno's drawing: the phosphine bonded to the gold by a dative bond from the P", () => {
    const r = read(goldPhosphine as unknown as FigureDrawn);
    expect(datives(r)).toEqual(["P>Au"]);
  }, measured(1500));

  it("H3N -> BH3, beside a ring: one dative bond from the N to the B, nothing said of either", () => {
    const r = read(figure([...closed(ring([60, 100])), ...arrow([101, 100], [114, 100])], [...word("H_3N", [80, 100]), ...word("BH_3", [118.5, 100])]));
    expect(datives(r)).toEqual(["H3N>BH3"]);
    expect(r.atoms.filter((a) => a.unsure?.includes(DATIVE_UNREAD))).toEqual([]);
  }, measured(1500));

  it("an arrow with an atom at one end only is no bond, and that atom says so", () => {
    const r = read(figure([...closed(ring([60, 100])), ...arrow([101, 100], [114, 100])], word("H_3N", [80, 100])));
    expect(datives(r)).toEqual([]);
    expect(r.atoms.filter((a) => a.unsure?.includes(DATIVE_UNREAD)).map((a) => a.label)).toEqual(["H3N"]);
  }, measured(1500));

  it("MUST NOT: a wedge, a hash, a short bond to a label, a small ring and a minus sign are read as they are, never as an arrow", () => {
    const six = ring([60, 100]);
    const three = ring([140, 100], 3);
    const [w0, h0] = [six[1], six[4]];
    const paths = [
      ...closed(six),
      wedge(w0, [w0[0] - L * 0.866, w0[1] + L / 2]),
      ...hashed(h0, [h0[0] + L * 0.866, h0[1] - L / 2]),
      // (a short bond to a label: the ring's top carbon to an OH, cut back at the label)
      stroke(six[3], [six[3][0], six[3][1] - L + 5]),
      ...closed(three),
      // (a carboxylate's O with its minus sign set by it)
      stroke(six[0], [six[0][0], six[0][1] + L - 5]),
      stroke([six[0][0] + 5, six[0][1] + L - 4], [six[0][0] + 8, six[0][1] + L - 4]),
    ];
    const r = read(figure(paths, [...word("OH", [six[3][0], six[3][1] - L]), ...word("O", [six[0][0], six[0][1] + L])]));
    expect(datives(r)).toEqual([]);
    expect(r.bonds.filter((b) => b.stereo === "up").length).toBe(1);
    expect(r.bonds.filter((b) => b.stereo === "down").length).toBe(1);
    expect(r.atoms.some((a) => a.label === "OH")).toBe(true);
    // (the three-membered ring's three bonds, each as it is drawn)
    const inThree = (i: number) => three.some((p) => Math.hypot(r.atoms[i].x - p[0], r.atoms[i].y - p[1]) < 1);
    expect(r.bonds.filter((b) => inThree(b.a) && inThree(b.b)).length).toBe(3);
  }, measured(1500));

  it("MUST NOT: a scheme's arrow, three bonds long between two structures, bonds neither", () => {
    const head = (to: P): FigurePath => filled(to, [to[0] - 0.4 * L, to[1] - 0.12 * L], [to[0] - 0.4 * L, to[1] + 0.12 * L]);
    const r = read(figure([...closed(ring([60, 100])), stroke([85, 100], [85 + 3 * L, 100]), head([85 + 3 * L + 3, 100]), ...closed(ring([85 + 3 * L + 28, 100]))]));
    expect(datives(r)).toEqual([]);
    const left = (i: number) => r.atoms[i].x < 85;
    expect(r.bonds.filter((b) => left(b.a) !== left(b.b))).toEqual([]);
  }, measured(1500));
});
