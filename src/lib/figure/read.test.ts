import { describe, expect, it } from "vitest";
import type { Box, FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { narrowestBox, shapesOf } from "./drawn";
import { bondLength, labelText, readFigure, wordsOf } from "./read";
import { readScheme } from "./scheme";
import { readDrawnLabel, structureOf, type LabelReader } from "./structure";

// A figure drawn as a drawing program draws one, in points from the page's
// top left (y down): bonds 14.4 points long, lines 0.6 thick, labels in
// 10-point letters about 6 wide.
const L = 14.4;
type P = [number, number];

const stroke = (...pts: P[]): FigurePath => ({
  fill: null,
  stroke: "#000000ff",
  width: 0.6,
  d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]),
});
const filled = (...pts: P[]): FigurePath => ({
  fill: "#000000ff",
  stroke: null,
  width: 0,
  d: [...pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]), ["Z"]],
});
/** A wedge from its narrow end to its wide one, 4 points wide there. */
const wedge = (tip: P, base: P, wide = 4): FigurePath => {
  const [ux, uy] = unit(tip, base);
  return filled(tip, [base[0] - (uy * wide) / 2, base[1] + (ux * wide) / 2], [base[0] + (uy * wide) / 2, base[1] - (ux * wide) / 2]);
};
/** Hashes from the narrow end to the wide one: strokes across, growing - or all as wide, `even`. */
const hashes = (from: P, to: P, even = false): FigurePath[] => {
  const [ux, uy] = unit(from, to);
  const n = 6;
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n;
    const c: P = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    const h = even ? 1.4 : Math.max(0.3, 2 * t);
    return stroke([c[0] - uy * h, c[1] + ux * h], [c[0] + uy * h, c[1] - ux * h]);
  });
};
/** A circle stroked, as a drawing program writes one: four curves. */
const circle = ([cx, cy]: P, r: number): FigurePath => {
  const k = 0.5523 * r;
  return {
    fill: null,
    stroke: "#000000ff",
    width: 0.6,
    d: [
      ["M", cx + r, cy],
      ["C", cx + r, cy + k], ["C", cx + k, cy + r], ["C", cx, cy + r],
      ["C", cx - k, cy + r], ["C", cx - r, cy + k], ["C", cx - r, cy],
      ["C", cx - r, cy - k], ["C", cx - k, cy - r], ["C", cx, cy - r],
      ["C", cx + k, cy - r], ["C", cx + r, cy - k], ["C", cx + r, cy],
      ["Z"],
    ],
  };
};
/** Letters set from a point - the first's middle there - each about as wide as Helvetica's; `_2` a subscript, `^+` a superscript. */
function word(text: string, [x, y]: P): FigureLetter[] {
  const out: FigureLetter[] = [];
  let left = x - 3.4;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    let size = 10;
    let base = y + 3.6;
    if (c === "_" || c === "^") {
      const sub = c === "_";
      c = text[++i];
      size = 7;
      base = sub ? y + 6 : y - 1;
    }
    const w = size * 0.68;
    const box: Box = [left, base - size * 0.72, left + w, base];
    out.push({ c, box, at: [left, base], size });
    left += w;
  }
  return out;
}
function unit(p: P, q: P): P {
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
  return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
}
/** A point `n` bonds from `p` at `deg` degrees, anticlockwise as seen (y down). */
const step = (p: P, deg: number, n = 1): P => [p[0] + n * L * Math.cos((deg * Math.PI) / 180), p[1] - n * L * Math.sin((deg * Math.PI) / 180)];
/** A point part of the way from `p` to `q`. */
const along = (p: P, q: P, t: number): P => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const figure = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({ paths, letters, pictures: [] });

/** Labels read as the tests have them: elements, with their H and charge, and two groups. */
const reads: LabelReader = (label) => {
  const m = /^([A-Z][a-z]?)(H\d*)?([+-]?)$/.exec(label);
  if (m && ["C", "H", "N", "O", "S", "Cl", "I"].includes(m[1])) return { el: m[1], charge: m[3] === "+" ? 1 : m[3] === "-" ? -1 : 0 };
  return ["OTBS", "CO2Me", "NHBoc"].includes(label) ? { el: label } : null;
};
const read = (f: FigureDrawn) => structureOf(readFigure(f, (l) => readDrawnLabel(l, reads).read), reads);
/** The bonds read, as pairs of the atoms' elements and their orders, in order. */
const bondsOf = (s: ReturnType<typeof read>) => s.bonds.map((b) => `${s.atoms[b.a].el}${"-=#"[b.order - 1]}${s.atoms[b.b].el}${b.stereo ? ` ${b.stereo}` : ""}`).sort();

describe("a figure's shapes", () => {
  it("reads a thin filled box as a line, and a filled triangle as a wedge narrow at its tip", () => {
    const s = shapesOf(figure([filled([0, -0.3], [14, -0.3], [14, 0.3], [0, 0.3]), wedge([0, 20], [14, 20])]));
    expect(s.strokes).toHaveLength(1);
    expect(s.strokes[0].w).toBeCloseTo(0.6, 2);
    expect(s.wedges).toHaveLength(1);
    expect(s.wedges[0].tip.x).toBeCloseTo(0, 1);
    expect(s.wedges[0].base.x).toBeCloseTo(14, 1);
  });

  it("finds a wedge's wide end in the middle of its cut, where it is cut slanting along the bond it meets", () => {
    // (a wedge as a drawing's export cuts it along the next bond: its wide end's corners 2.4 points apart along it)
    const s = shapesOf(figure([filled([111.23, 113.06], [111.82, 112.52], [98.87, 95.54], [97.41, 100.02])]));
    expect(s.wedges).toHaveLength(1);
    expect(s.wedges[0].base.x).toBeCloseTo(98.14, 1);
    expect(s.wedges[0].base.y).toBeCloseTo(97.78, 1);
    // (and the bond going on from there starts at the same atom)
    const r = read(figure([filled([111.23, 113.06], [111.82, 112.52], [98.87, 95.54], [97.41, 100.02]), stroke([98.41, 98.23], [102.0, 87.18]), stroke([111.5, 112.8], [123.6, 111.2])]));
    expect(r.atoms).toHaveLength(4);
  });

  it("leaves out what is drawn in paper's colour", () => {
    const white = { ...filled([0, 0], [10, 0], [10, 10], [0, 10]), fill: "#ffffffff" };
    expect(shapesOf(figure([white])).blobs).toHaveLength(0);
  });

  it("finds the narrowest box round points turned at an angle", () => {
    const b = narrowestBox([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10.5, y: 9.5 }, { x: 0.5, y: -0.5 }]);
    expect(b.long).toBeCloseTo(Math.hypot(10, 10), 1);
    expect(b.short).toBeCloseTo(Math.hypot(0.5, 0.5), 1);
  });
});

describe("how long a figure's bonds are", () => {
  it("is the length most share, the longer of two as common", () => {
    expect(bondLength([14.4, 14.4, 14.3, 10, 10, 10, 3, 2])).toBeCloseTo(14.4, 1);
    expect(bondLength([])).toBe(0);
  });
});

describe("a figure read as a structure", () => {
  it("reads a chain as carbons where its lines meet", () => {
    const a: P = [20, 40];
    const b = step(a, 30);
    const c = step(b, -30);
    const d = step(c, 30);
    const s = read(figure([stroke(a, b, c, d)]));
    expect(s.atoms).toHaveLength(4);
    expect(bondsOf(s)).toEqual(["C-C", "C-C", "C-C"]);
    // (as long as Meno draws a bond)
    expect(Math.hypot(s.atoms[0].x - s.atoms[1].x, s.atoms[0].y - s.atoms[1].y)).toBeCloseTo(1.8, 1);
  });

  it("reads a ring's double bond from its two lines, the inner one shorter", () => {
    const ring: P[] = [0, 60, 120, 180, 240, 300].map((deg) => step([60, 60], deg + 30));
    const paths = ring.map((p, i) => stroke(p, ring[(i + 1) % 6]));
    // (the second lines of three of its bonds, inside)
    for (const i of [0, 2, 4]) {
      const p = along(ring[i], [60, 60], 0.18);
      const q = along(ring[(i + 1) % 6], [60, 60], 0.18);
      paths.push(stroke(along(p, q, 0.15), along(p, q, 0.85)));
    }
    const s = read(figure(paths));
    expect(s.atoms).toHaveLength(6);
    expect(bondsOf(s)).toEqual(["C-C", "C-C", "C-C", "C=C", "C=C", "C=C"]);
  });

  it("reads a ring drawn with its circle as one with its double bonds", () => {
    const ring: P[] = [0, 60, 120, 180, 240, 300].map((deg) => step([60, 60], deg + 30));
    const s = read(figure([...ring.map((p, i) => stroke(p, ring[(i + 1) % 6])), circle([60, 60], 0.55 * L)]));
    expect(bondsOf(s)).toEqual(["C-C", "C-C", "C-C", "C=C", "C=C", "C=C"]);
  });

  it("reads a carbonyl's two lines to its oxygen's label", () => {
    const c: P = [40, 60];
    const o = step(c, 90);
    const n: P = [0, 1.3];
    const end = along(c, o, 0.62);
    const s = read(
      figure(
        [stroke(step(c, 210), c), stroke([c[0] - n[1], c[1]], [end[0] - n[1], end[1]]), stroke([c[0] + n[1], c[1]], [end[0] + n[1], end[1]])],
        word("O", o),
      ),
    );
    expect(bondsOf(s)).toEqual(["C-C", "C=O"]);
  });

  it("reads a triple bond from three lines", () => {
    const a: P = [20, 40];
    const b = step(a, 0);
    const s = read(figure([stroke(step(a, 180), a), stroke(a, b), stroke([a[0], a[1] - 2.6], [b[0], b[1] - 2.6]), stroke([a[0], a[1] + 2.6], [b[0], b[1] + 2.6]), stroke(b, step(b, 0))]));
    expect(bondsOf(s)).toEqual(["C#C", "C-C", "C-C"]);
  });

  it("reads a wedge cut flat at its narrow end, a line's width across, as a wedge", () => {
    // (four corners: the narrow end 0.6 across at the stereocentre, the wide end 2.8 across - drawn from a ring's carbon to a CH2)
    const c: P = [100, 81.4];
    const ch2: P = [90.2, 75.7];
    const s = read(
      figure(
        [
          stroke(step(c, -80), c, step(c, 20)),
          filled([100.29, 81.12], [99.99, 81.64], [88.98, 76.38], [91.37, 75.0]),
          stroke(ch2, step(ch2, 150)),
        ],
      ),
    );
    expect(s.bonds.filter((b) => b.stereo === "up")).toHaveLength(1);
    expect(s.bonds).toHaveLength(4);
  });

  it("reads a wedge from its narrow end, and hashes from their narrow end", () => {
    const c: P = [40, 40];
    const s = read(figure([stroke(step(c, 150), c, step(c, 30)), wedge(c, step(c, -90)), ...hashes(step(c, 30), step(step(c, 30), -60))]));
    const up = s.bonds.find((b) => b.stereo === "up")!;
    const down = s.bonds.find((b) => b.stereo === "down")!;
    // (each from the carbon it is the stereocentre of: the one with three bonds)
    const degree = (i: number) => s.bonds.filter((b) => b.a === i || b.b === i).length;
    expect(degree(up.a)).toBe(3);
    expect(degree(down.a)).toBe(2);
    expect(degree(down.b)).toBe(1);
  });

  it("tells a hash's narrow end by its lines, not by the joints drawn as dots at both its ends", () => {
    // (griseofulvin's spiro centre as the RSC style exports it, cut out: the hash from the spiro carbon at 136.8,106 to the enol
    // ether's carbon at 143,116.7, and at each end the joints of the bonds there - small pieces, one at the wide end as thin as nothing)
    const paths: FigurePath[] = [
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",142.98,95.34],["L",143.17,95.45],["L",143.11,95.57],["L",142.98,95.57],["L",142.98,95.34],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",142.98,95.34],["L",142.98,95.12],["L",142.85,95.12],["L",142.78,95.23],["L",142.98,95.34],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",142.98,116.66],["L",143.17,116.78],["L",143.11,116.89],["L",142.98,116.89],["L",142.98,116.66],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",142.98,116.66],["L",142.98,116.44],["L",142.85,116.44],["L",142.78,116.55],["L",142.98,116.66],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",136.82,106.0],["L",137.0,106.13],["L",137.01,106.12],["L",137.02,106.11],["L",136.82,106.0],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",136.82,106.0],["L",136.63,105.89],["L",136.8,105.59],["L",137.0,105.87],["L",136.82,106.0],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",136.82,106.0],["L",136.64,106.13],["L",136.54,106.0],["L",136.64,105.87],["L",136.82,106.0],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",129.59,96.04],["L",129.66,96.26],["L",129.5,96.31],["L",129.4,96.17],["L",129.59,96.04],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",129.59,96.04],["L",129.77,95.91],["L",129.67,95.78],["L",129.52,95.83],["L",129.59,96.04],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",137.89,107.41],["L",138.15,107.77],["L",137.69,108.04],["L",137.5,107.63],["L",137.89,107.41],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",139.06,109.06],["L",139.33,109.43],["L",138.54,109.89],["L",138.35,109.47],["L",139.06,109.06],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",140.24,110.72],["L",140.5,111.09],["L",139.39,111.73],["L",139.2,111.32],["L",140.24,110.72],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",141.41,112.38],["L",141.67,112.75],["L",140.24,113.57],["L",140.05,113.16],["L",141.41,112.38],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",142.58,114.04],["L",142.84,114.41],["L",141.09,115.42],["L",140.9,115.01],["L",142.58,114.04],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",143.76,115.7],["L",144.02,116.06],["L",141.94,117.26],["L",141.75,116.85],["L",143.76,115.7],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",128.15,96.51],["L",128.22,96.72],["L",128.22,96.72],["L",128.15,96.51],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",128.15,96.51],["L",128.08,96.29],["L",128.5,96.16],["L",128.37,96.58],["L",128.15,96.51],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",130.47,97.26],["L",130.65,97.13],["L",130.72,97.22],["L",130.69,97.33],["L",130.47,97.26],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",130.47,97.26],["L",130.26,97.19],["L",130.39,96.77],["L",130.65,97.13],["L",130.47,97.26],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",130.47,97.26],["L",130.29,97.39],["L",130.29,97.39],["L",130.47,97.26],["Z"]] },
      { fill: null, stroke: "#000000ff", width: 0.45, d: [["M",136.82,106.0],["L",129.59,96.04]] },
      { fill: null, stroke: "#000000ff", width: 0.45, d: [["M",136.82,106.0],["L",142.98,95.34]] },
      { fill: null, stroke: "#000000ff", width: 0.45, d: [["M",136.82,106.0],["L",131.61,113.18]] },
    ];
    // (with the furanone's O beside it, as on the page: its letters set how short a line can be a bond)
    const r = readFigure(figure(paths, word("O", [129, 117])));
    const hash = r.bonds.find((b) => b.stereo === "down")!;
    const narrow = r.atoms[hash.a];
    expect(Math.hypot(narrow.x - 136.8, narrow.y - 106)).toBeLessThan(1.5);
  });

  it("puts even hashes' narrow end where a stereocentre can be, and says so where both ends could be", () => {
    const c: P = [40, 40];
    const branch = [stroke(step(c, 150), c, step(c, 30)), stroke(c, step(c, 90))];
    const s = read(figure([...branch, ...hashes(step(c, -90), c, true)]));
    const h = s.bonds.find((b) => b.stereo === "down")!;
    expect(s.bonds.filter((b) => b.a === h.a || b.b === h.a)).toHaveLength(4);
    expect(h.unsure).toBeUndefined();
    // (an ethane's: either carbon could be)
    const e = read(figure([stroke(step(c, 150), c, step(c, 30)), ...hashes(c, step(c, -90), true), stroke(step(c, -90), step(step(c, -90), -30)), stroke(step(c, -90), step(step(c, -90), -150))]));
    expect(e.bonds.find((b) => b.stereo === "down")!.unsure).toHaveLength(1);
  });

  it("reads labels as typed: HO as OH, NH2, a charge set high", () => {
    const c: P = [60, 60];
    const left = step(c, 180);
    const right = step(c, 0);
    const up = step(c, 90);
    const s = read(
      figure(
        [stroke(along(c, left, 0.0), along(c, left, 0.6)), stroke(c, along(c, right, 0.6)), stroke(c, along(c, up, 0.6))],
        [...word("HO", [left[0] - 6.8, left[1]]), ...word("NH_2", right), ...word("N^+", up)],
      ),
    );
    expect(s.atoms.map((a) => a.el).sort()).toEqual(["C", "N", "N", "O"]);
    expect(s.atoms.find((a) => a.charge === 1)?.el).toBe("N");
  });

  it("reads a charge set high by a capital as short as a serif's, little of it level with the letter", () => {
    const c: P = [60, 60];
    const n = step(c, 0);
    // (the N's top 2.5 over its middle, not 3.6; the + from 6.5 over it to 2.3 - level with the N for 0.2 points)
    const nLetter: FigureLetter = { c: "N", box: [n[0] - 3.4, n[1] - 2.5, n[0] + 3.4, n[1] + 3.6], at: [n[0] - 3.4, n[1] + 3.6], size: 10 };
    const plus: FigureLetter = { c: "+", box: [n[0] + 3.6, n[1] - 6.5, n[0] + 7.6, n[1] - 2.3], at: [n[0] + 3.6, n[1] - 2.3], size: 7 };
    const s = read(figure([stroke(c, along(c, n, 0.6))], [nLetter, plus]));
    expect(s.atoms.find((a) => a.el === "N")?.charge).toBe(1);
  });

  it("reads two labels set side by side as one word apart where both read: NH2 by H2N", () => {
    // (a chain's NH2 from the left, and an H2N its bond comes to from the right - its N last - touching it)
    const n: P = [80, 60];
    const lastN = n[0] + 6.8 + 6.8 + 4.76 + 6.8 + 4.76;
    const s = read(
      figure(
        [stroke(step(n, 180, 1.6), step(n, 180, 0.5)), stroke([lastN + 5, n[1]], [lastN + 5 + 0.8 * L, n[1]], [lastN + 5 + 0.8 * L + L * 0.866, n[1] - L / 2])],
        word("NH_2H_2N", n),
      ),
    );
    expect(s.atoms.filter((a) => a.el === "N")).toHaveLength(2);
    expect(s.atoms.some((a) => a.unsure?.some((u) => /not read/.test(u)))).toBe(false);
  });

  it("reads a short bond between two labels to both, its end by the far label's corner", () => {
    // (as a methanol's O-D is drawn small: a carbon's three bonds and its bond to the O; from the O a bond 3.7 long up to a
    // label set high beside it - its end 1 point off the O, 0.9 off the far label's corner)
    const o: FigureLetter = { c: "O", box: [109.3, 100.8, 117.5, 109.7], at: [109.3, 109.7], size: 12 };
    const cl: FigureLetter[] = [
      { c: "C", box: [119, 89.5, 126.4, 101], at: [119, 101], size: 12 },
      { c: "l", box: [127.2, 89.5, 128.6, 101], at: [127, 101], size: 12 },
    ];
    const c: P = [98.6, 96.2];
    const s = read(figure([stroke([93.5, 105.2], c, [103.2, 88.3]), stroke([90.2, 91.4], c, [108.2, 101.8]), stroke([118.5, 101.8], [121.7, 99.9])], [o, ...cl]));
    expect(bondsOf(s)).toContain("O-Cl");
  });

  it("reads a group drawn on its bond's left from the bond out: TBSO as OTBS", () => {
    const c: P = [80, 60];
    const o = step(c, 180);
    const s = read(figure([stroke(along(o, c, 0.5), c), stroke(c, step(c, 0))], word("TBSO", [o[0] - 3 * 6.8, o[1]])));
    expect(s.atoms.map((a) => a.el).sort()).toEqual(["C", "C", "OTBS"]);
    expect(s.atoms.some((a) => a.unsure)).toBe(false);
  });

  it("marks a label nothing reads, and one whose hydrogens its bonds do not leave it", () => {
    const c: P = [60, 60];
    const s = read(
      figure(
        [stroke(c, along(c, step(c, 0), 0.6)), stroke(c, along(c, step(c, 180), 0.6))],
        [...word("Xq", step(c, 0)), ...word("NH_2", [step(c, 180)[0], c[1]])],
      ),
    );
    expect(s.atoms.find((a) => a.el === "Xq")?.unsure?.[0]).toMatch(/not read/);
    // (an NH2 at the end of a bond: right; nothing amiss there)
    expect(s.atoms.find((a) => a.el === "N")?.unsure).toBeUndefined();
    const t = read(figure([stroke(c, along(c, step(c, 0), 0.6)), stroke(c, step(c, 120)), stroke(c, step(c, 240))], word("OH_2", step(c, 0))));
    expect(t.atoms.find((a) => a.el === "O")?.unsure?.[0]).toMatch(/one hydrogen/);
  });

  it("reads a dash between two labels as a bond, two side by side as a double one", () => {
    const s0: P = [60, 60];
    const o: P = [s0[0], s0[1] - 11.5];
    const dash = (dx: number) => filled([s0[0] + dx - 0.3, s0[1] - 6.6], [s0[0] + dx + 0.3, s0[1] - 6.6], [s0[0] + dx + 0.3, s0[1] - 5], [s0[0] + dx - 0.3, s0[1] - 5]);
    const s = read(figure([dash(-1.2), dash(1.2), stroke([s0[0] + 5, s0[1]], step(s0, 0)), stroke(step(s0, 0), step(step(s0, 0), 30))], [...word("S", s0), ...word("O", o)]));
    expect(bondsOf(s)).toContain("O=S");
  });

  it("reads three short lines side by side between two labels as a triple bond, not a hash: N≡N", () => {
    // (a diazonium's N≡N as drawn: the terminal N, three lines 3 long and 2.6 apart to the other N, and that N's bond on to a chain)
    const n1: P = [77.8, 111.8];
    const n2: P = [90.2, 104.5];
    const s = read(
      figure(
        [
          stroke([81.2, 106.4], [83.8, 104.9]),
          stroke([82.5, 108.6], [85.1, 107.1]),
          stroke([83.8, 110.9], [86.3, 109.4]),
          stroke([95, 101.4], [102.7, 96.9], [102.7, 82.5], [115.2, 75.3]),
        ],
        [...word("N", n1), ...word("N", n2)],
      ),
    );
    expect(bondsOf(s)).toContain("N#N");
    expect(s.bonds.some((b) => b.stereo)).toBe(false);
  });

  it("keeps an ion by the structure as an atom alone", () => {
    const a: P = [40, 60];
    const s = read(figure([stroke(a, step(a, 30), step(step(a, 30), -30))], word("I^-", [a[0], a[1] - 18])));
    expect(s.atoms.find((x) => x.el === "I")?.charge).toBe(-1);
  });

  it("reads a compound's number set close under a bond's free end as no label", () => {
    // a chain, its last bond pointing down, the number's top a third of a bond under its end
    const a: P = [100, 100];
    const c = step(step(a, -30), 30);
    const d: P = [c[0], c[1] + L];
    for (const n of ["1", "2a", "3'", "(4)"]) {
      const f = readFigure(figure([stroke(a, step(a, -30), c), stroke(c, d)], word(n, [d[0], d[1] + 0.3 * L + 3.6])), (l) => readDrawnLabel(l, reads).read);
      expect(f.atoms.map((x) => x.label ?? "C")).toEqual(["C", "C", "C", "C"]);
      expect(f.left.letters.map((l) => l.c).join("")).toBe(n);
    }
    // (an isotope's label is one: 13C, its capital)
    const f = readFigure(figure([stroke(a, step(a, -30), c), stroke(c, d)], word("13C", [d[0], d[1] + 0.3 * L + 3.6])), (l) => readDrawnLabel(l, reads).read);
    expect(f.atoms.some((x) => x.label === "13C")).toBe(true);
  });

  it("joins a bond broken where another passes in front of it", () => {
    const a: P = [40, 40];
    const b: P = [40 + 2 * L, 40];
    const gap = 2.6;
    const m: P = [40 + L, 40];
    const s = read(
      figure([
        stroke(step(a, 150), a),
        stroke(a, [m[0] - gap, 40]),
        stroke([m[0] + gap, 40], b),
        stroke(b, step(b, 30)),
        // (the bond in front, crossing the gap)
        stroke([m[0], 40 - 0.6 * L], [m[0], 40 + 0.6 * L]),
      ]),
    );
    expect(s.bonds).toHaveLength(4);
    expect(s.atoms).toHaveLength(6);
  });

  it("reads a word that reads as nothing and has no capital, with bonds to either side of it, as one label", () => {
    // (as a turned page's letters may be read: lower case, or smaller than the word)
    const w: P = [80, 60];
    const s = read(figure([stroke(step(w, 180, 1.4), step(w, 180, 0.6)), stroke(step(w, 0, 0.75), step(w, 0, 1.55))], word("xq", [w[0] - 3.4, w[1]])));
    expect(s.atoms.filter((a) => a.el === "xq")).toHaveLength(1);
  });

  it("reads a cube drawn in perspective: back edges broken where front ones pass, one piece short, and parallel edges no double bonds", () => {
    // (cubane as exported: two back edges broken round the front edges crossing them - one piece of each under a third of a bond)
    const s = read(
      figure([
        stroke([83.6, 79.5], [93.8, 82.3]),
        stroke([96.6, 83], [99.4, 83.8]),
        stroke([99.4, 83.8], [96.2, 89.3]),
        stroke([94.7, 91.9], [91.3, 97.9]),
        stroke([91.3, 97.9], [75.5, 93.7], [91.3, 89.5], [99.4, 75.3], [115.2, 79.5], [107.1, 93.7]),
        stroke([75.5, 93.7], [83.6, 79.5], [99.4, 75.3]),
        stroke([115.2, 79.5], [99.4, 83.8]),
        stroke([107.1, 93.7], [91.3, 97.9]),
        stroke([107.1, 93.7], [91.3, 89.5]),
      ]),
    );
    expect(s.atoms).toHaveLength(8);
    expect(s.bonds).toHaveLength(12);
    expect(s.bonds.every((b) => b.order === 1)).toBe(true);
  });

  it("gives a label's element its bond, not a methyl's end set close by its H", () => {
    // (an HO on its bond's left, its bond coming to the O from the right; an isopropyl's methyl ending 1.5 points under and left of the H)
    const ho: P = [100, 60];
    const c = step([ho[0] + 6.8, ho[1]], 0, 0.9);
    const methyl: P = [ho[0] - 4.9, ho[1] + 5.1];
    const s = read(
      figure(
        [stroke([ho[0] + 11, ho[1]], c, step(c, -60)), stroke(methyl, step(methyl, 210), step(step(methyl, 210), -90))],
        word("HO", ho),
      ),
    );
    const o = s.atoms.findIndex((a) => a.el === "O");
    expect(s.bonds.filter((b) => b.a === o || b.b === o)).toHaveLength(1);
    expect(s.atoms.filter((a) => a.el === "C")).toHaveLength(5);
  });

  it("lets a lone H take one bond: its wedge's, not a bond passing near it", () => {
    const c: P = [60, 60];
    const h = step(c, 90);
    const s = read(figure([stroke(step(c, 210), c, step(c, -30)), wedge(c, along(c, h, 0.6)), stroke(step(h, 0, 0.45), step(step(h, 0, 0.45), -60))], word("H", h)));
    const hAtom = s.atoms.findIndex((a) => a.el === "H");
    expect(s.bonds.filter((b) => b.a === hAtom || b.b === hAtom)).toHaveLength(1);
  });
});

describe("a figure's words", () => {
  it("joins letters side by side, a subscript with them, and writes them as a label is typed", () => {
    const ws = wordsOf([...word("CO_2Me", [20, 20]), ...word("OH", [80, 20])]);
    expect(ws.map(labelText).sort()).toEqual(["CO2Me", "OH"]);
  });

  it("reads a drawn label turned round, and HN before a group as NH", () => {
    expect(readDrawnLabel("MeO2C", reads)).toEqual({ el: "CO2Me", read: true });
    expect(readDrawnLabel("BocHN", reads)).toEqual({ el: "NHBoc", read: true });
    expect(readDrawnLabel("Zz", reads).read).toBe(false);
  });
});

describe("a figure's charges drawn in rings", () => {
  /** A charge as Meno draws one: a ring of 40 small filled pieces, `r` across from its middle, a "+" or a "-" in it - or a "-" upright, its page turned. */
  const charge = ([cx, cy]: P, sign: "+" | "-" | "|", r = 2.5): FigurePath[] => {
    const pieces = Array.from({ length: 40 }, (_, k) => {
      const t = (k / 40) * 2 * Math.PI;
      const [x, y] = [cx + r * Math.cos(t), cy + r * Math.sin(t)];
      return filled([x - 0.25, y - 0.25], [x + 0.25, y - 0.25], [x + 0.25, y + 0.25], [x - 0.25, y + 0.25]);
    });
    const level = stroke([cx - 1.5, cy], [cx + 1.5, cy]);
    const upright = stroke([cx, cy - 1.5], [cx, cy + 1.5]);
    return [...pieces, ...(sign === "+" ? [level, upright] : sign === "-" ? [level] : [upright])];
  };
  /** A nitro group's N and its O single-bonded, each with its charge drawn by its label. */
  const nitro = (minus: "-" | "|") => {
    const c: P = [60, 60];
    const n = step(c, 0);
    const o = step(n, -60);
    return figure(
      [stroke(c, along(c, n, 0.7)), stroke(along(n, o, 0.3), along(n, o, 0.7)), ...charge([n[0] + 3, n[1] - 7], "+"), ...charge([o[0] + 7.5, o[1] - 3], minus)],
      [...word("N", n), ...word("O", o)],
    );
  };

  it("reads a + and a - in rings by labels as theirs, and no bond", () => {
    const s = read(nitro("-"));
    expect(bondsOf(s)).toEqual(["C-N", "N-O"]);
    expect(s.atoms.find((a) => a.el === "N")?.charge).toBe(1);
    expect(s.atoms.find((a) => a.el === "O")?.charge).toBe(-1);
  });

  it("reads a - in a ring however its page is turned", () => {
    const s = read(nitro("|"));
    expect(bondsOf(s)).toEqual(["C-N", "N-O"]);
    expect(s.atoms.find((a) => a.el === "O")?.charge).toBe(-1);
  });

  it("reads a word by the structure with a charge in a ring beside it as an ion, and a row of them each by the one before", () => {
    // (an ammonium: a chain to an N, its + in a ring at its corner, a methyl's bond by it; two chlorides in a row to its right,
    // past where an ion written Cl- is looked for)
    const c: P = [40, 60];
    const n = step(step(c, 30), -30);
    const cl1: P = [n[0] + 1.8 * L, n[1]];
    const cl2: P = [cl1[0] + 1.9 * L, n[1]];
    const s = read(
      figure(
        [
          stroke(c, step(c, 30), along(step(c, 30), n, 0.65)),
          stroke(along(n, step(n, 30), 0.35), step(n, 30)),
          ...charge([n[0] + 5.5, n[1] + 6.5], "+"),
          ...charge([cl1[0] + 13.5, cl1[1] - 6], "-"),
          ...charge([cl2[0] + 13.5, cl2[1] - 6], "-"),
        ],
        [...word("N", n), ...word("Cl", cl1), ...word("Cl", cl2)],
      ),
    );
    expect(s.atoms.filter((a) => a.el === "Cl").map((a) => a.charge)).toEqual([-1, -1]);
    expect(s.atoms.find((a) => a.el === "N")?.charge).toBe(1);
    expect(bondsOf(s)).toEqual(["C-C", "C-N", "N-C"]);
  });

  it("reads a + in a ring as no scheme's + sign", () => {
    const s = readScheme(nitro("-"));
    expect(s.pluses).toHaveLength(0);
    expect(s.arrows).toHaveLength(0);
  });
});
