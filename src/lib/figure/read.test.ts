import { describe, expect, it } from "vitest";
import type { Box, FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { narrowestBox, shapesOf } from "./drawn";
import { bondLength, labelText, readFigure, wordsOf } from "./read";
import camphor from "./fixtures/camphor-rdkitacs.json";
import aflatoxin from "./fixtures/aflatoxin-rdkitacs.json";
import butene from "./fixtures/butene-rdkitacscg.json";
import deoxycytidine from "./fixtures/deoxycytidine-acs1996.json";
import monensin from "./fixtures/monensin-rsc.json";
import sodiumAcetate from "./fixtures/sodium-acetate-rdkit.json";
import ribose from "./fixtures/ribose-rdkit.json";
import sparteine from "./fixtures/sparteine-rdkitacscg.json";
import tempo from "./fixtures/tempo-rdkit.json";
import junction from "./fixtures/monensin-nature-junction.json";
import fructose from "./fixtures/fructose-nature.json";
import glucose from "./fixtures/glucose-rdkit.json";
import tetrodotoxinMeno from "./fixtures/tetrodotoxin-meno.json";
import tetrodotoxinNature from "./fixtures/tetrodotoxin-nature.json";
import tetrodotoxin from "./fixtures/tetrodotoxin-rsc.json";
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

  it("joins a ring's C=O whose two lines run a little past its carbon", () => {
    // (camphor as the RSC style exports it: the C=O's two lines, side by side, ending 3 points into the ring from its carbon)
    const s = read(
      figure(
        [
          stroke([90.8, 79.6], [101.8, 88], [108.7, 100], [122.1, 103.6], [115.1, 115.6], [101.8, 112], [88.4, 115.6], [95.3, 103.6], [100.7, 102.2]),
          stroke([102.8, 101.6], [108.7, 100]),
          stroke([101.8, 112], [101.8, 88], [107.1, 75.2]),
          stroke([101.8, 112], [94.8, 124]),
          stroke([91.5, 114.8], [80.9, 122.9]),
          stroke([90, 112.8], [79.4, 120.9]),
        ],
        word("O", [77.3, 124.3]),
      ),
    );
    const o = s.atoms.findIndex((a) => a.el === "O");
    const co = s.bonds.find((b) => b.a === o || b.b === o)!;
    const c = co.a === o ? co.b : co.a;
    expect(co.order).toBe(2);
    expect(s.bonds.filter((b) => b.a === c || b.b === c)).toHaveLength(3);
  });

  it("reads a triple bond from three lines", () => {
    const a: P = [20, 40];
    const b = step(a, 0);
    const s = read(figure([stroke(step(a, 180), a), stroke(a, b), stroke([a[0], a[1] - 2.6], [b[0], b[1] - 2.6]), stroke([a[0], a[1] + 2.6], [b[0], b[1] + 2.6]), stroke(b, step(b, 0))]));
    expect(bondsOf(s)).toEqual(["C#C", "C-C", "C-C"]);
  });

  it("reads a wedge with its tip rounded and its wide end cut slanting for a sixth of its length", () => {
    // (a sugar's C5 to its CH2OH as the Meno style exports it: the tip round at the ring's carbon, the wide end cut along the next bond)
    const c: P = [109.62, 101.82];
    const s = read(
      figure([
        stroke(step(c, -150), c, step(c, -30)),
        filled([111.26, 85.65], [108.18, 88.23], [109.3, 101.84], [109.32, 101.95], [109.39, 102.04], [109.49, 102.1], [109.59, 102.12], [109.64, 102.12], [109.75, 102.1], [109.84, 102.04], [109.91, 101.95], [109.94, 101.84]),
        stroke([109.72, 86.94], step([109.72, 86.94], 30)),
      ]),
    );
    expect(s.bonds.filter((b) => b.stereo === "up")).toHaveLength(1);
    expect(s.bonds).toHaveLength(4);
  });

  it("reads a wedge cut flat at its narrow end and slanting at its wide end, along the bond in front of it", () => {
    // (codeine's C13 to C15 as the Nature style draws it: a line's width at C13, its wide end cut along the C15-C16 bond)
    const s = read(
      figure([
        stroke([104.2, 97.3], [112.9, 102.5], [113.2, 112.9]),
        filled([122.4, 103.6], [126.7, 101.1], [112.9, 102.2], [112.9, 102.8]),
        stroke([132.7, 97.3], [123.7, 102.5]),
        stroke([132.7, 97.3], [132.7, 87.1]),
      ]),
    );
    expect(s.bonds.filter((b) => b.stereo === "up")).toHaveLength(1);
    expect(s.atoms).toHaveLength(6);
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

  it("reads no hash from the dots of a C=O's joints and a sliver by them, there being no line among them", () => {
    // (deoxycytidine as the round trip prints it in the ACS 1996 style and Meno's PDF reader reads it: at its cytosine's C2
    // the joints of the C=O and the ring's bonds are drawn as dots, a sliver of nothing among them)
    const r = readFigure(deoxycytidine as unknown as FigureDrawn);
    const c2 = (i: number) => Math.hypot(r.atoms[i].x - 141, r.atoms[i].y - 120) < 3;
    expect(r.bonds.some((b) => b.stereo && (c2(b.a) || c2(b.b)))).toBe(false);
    // (its three wedges and hashes, as drawn)
    expect(r.bonds.filter((b) => b.stereo)).toHaveLength(3);
  });

  it("reads two hashes meeting at an atom, joined through its joints' dots, as two: each its lines one way", () => {
    // (monensin as the round trip prints it in the RSC style and Meno's PDF reader reads it: between two of its rings a hash
    // of upright lines, and from the left ring's carbon a hash of level lines up to an H, its first line a joint's dot)
    const r = readFigure(monensin as unknown as FigureDrawn);
    const at = (x: number, y: number) => r.atoms.findIndex((a) => Math.hypot(a.x - x, a.y - y) < 2);
    const [left, right, h] = [at(148.9, 126.6), at(161.4, 126.5), r.atoms.findIndex((a) => a.label === "H" && Math.hypot(a.x - 152.1, a.y - 115.1) < 2)];
    const between = (i: number, j: number) => r.bonds.find((b) => (b.a === i && b.b === j) || (b.a === j && b.b === i));
    expect(between(left, right)?.stereo).toBe("down");
    expect(between(left, h)?.stereo).toBe("down");
  });

  it("reads a hash of two lines, its first a dot the other hash at its atom took", () => {
    // (monensin's ring junction as the Nature style prints it, cut out: the hash up to the H has two lines left)
    const r = readFigure(junction as unknown as FigureDrawn);
    const c = r.atoms.findIndex((a) => Math.hypot(a.x - 140.3, a.y - 120.6) < 2);
    const h = r.atoms.findIndex((a) => a.label === "H" && Math.hypot(a.x - 143, a.y - 110.5) < 3);
    expect(r.bonds.find((b) => (b.a === c && b.b === h) || (b.a === h && b.b === c))?.stereo).toBe("down");
  });

  it("carries a hash's narrow end on to its atom where it stops short, the figure's bonds short to its labels", () => {
    // (D-fructose as the Nature style prints it: the hash from the anomeric carbon to its CH2OH stops 2.9 points short of the
    // carbon, four tenths of a bond as its many bonds to OH labels make a bond)
    const r = readFigure(fructose as unknown as FigureDrawn);
    const at = (x: number, y: number) => r.atoms.findIndex((a) => Math.hypot(a.x - x, a.y - y) < 1.5);
    const [c2, c1] = [at(116.8, 86), at(127.1, 90.2)];
    expect(r.bonds.find((b) => (b.a === c2 && b.b === c1) || (b.a === c1 && b.b === c2))?.stereo).toBe("down");
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

  it("gives an NH2 no more bonds than its hydrogens leave it: a methyl's end pointing at it is a carbon", () => {
    // (a guanidine's NH2, its bond from the left; under it a methyl standing up off a chain, its end 2 points short of the N)
    const n: P = [100, 60];
    const c = step(n, 180, 0.95);
    const methyl: P = [n[0], n[1] + 6.2];
    const s = read(
      figure(
        [stroke(along(c, n, 0.6), c, step(c, 120)), stroke(methyl, step(methyl, -90), step(step(methyl, -90), -30))],
        word("NH_2", n),
      ),
    );
    const at = s.atoms.findIndex((a) => a.el === "N");
    expect(s.bonds.filter((b) => b.a === at || b.b === at)).toHaveLength(1);
    expect(s.atoms.filter((a) => a.el === "C")).toHaveLength(5);
  });

  it("joins a double bond broken where a bridge passes in front, its pieces no hash's lines", () => {
    // (gibberellic acid's ring double bond as the ACS 1996 style exports it, cut out: both its lines broken round the bridge
    // crossing them, the short pieces by a hash whose joints are drawn as dots)
    const paths: FigurePath[] = [
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",155.8,102.8],["L",155.95,103.06],["L",155.59,103.27],["L",155.51,102.87],["L",155.8,102.8],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",155.8,102.8],["L",156.1,102.74],["L",156.1,102.74],["L",155.8,102.8],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",155.8,102.8],["L",155.51,102.87],["L",155.46,102.65],["L",155.65,102.54],["L",155.8,102.8],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",158.8,116.91],["L",158.95,117.17],["L",159.14,117.06],["L",159.09,116.85],["L",158.8,116.91],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",158.8,116.91],["L",158.51,116.97],["L",158.46,116.76],["L",158.65,116.65],["L",158.8,116.91],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",146.31,124.12],["L",146.16,123.86],["L",146.35,123.75],["L",146.51,123.9],["L",146.31,124.12],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",146.31,124.12],["L",146.11,124.35],["L",146.27,124.49],["L",146.46,124.38],["L",146.31,124.12],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",132.59,100.36],["L",132.74,100.62],["L",132.55,100.73],["L",132.39,100.59],["L",132.59,100.36],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",132.59,100.36],["L",132.79,100.14],["L",132.96,100.29],["L",132.87,100.49],["L",132.59,100.36],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",132.59,100.36],["L",132.32,100.24],["L",132.36,100.15],["L",132.44,100.1],["L",132.59,100.36],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",143.31,110.02],["L",143.59,110.14],["L",143.55,110.23],["L",143.46,110.28],["L",143.31,110.02],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",143.31,110.02],["L",143.16,109.76],["L",143.35,109.65],["L",143.51,109.79],["L",143.31,110.02],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",143.31,110.02],["L",143.11,110.24],["L",142.95,110.09],["L",143.04,109.89],["L",143.31,110.02],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",137.44,123.19],["L",137.17,123.07],["L",137.26,122.87],["L",137.48,122.89],["L",137.44,123.19],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",137.44,123.19],["L",137.41,123.49],["L",137.63,123.51],["L",137.72,123.31],["L",137.44,123.19],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",123.1,121.68],["L",123.39,121.74],["L",123.34,122.01],["L",123.07,121.98],["L",123.1,121.68],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",123.1,121.68],["L",123.13,121.39],["L",123.35,121.41],["L",123.39,121.62],["L",123.1,121.68],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",123.1,121.68],["L",122.81,121.75],["L",122.79,121.69],["L",122.81,121.63],["L",123.1,121.68],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",120.1,107.58],["L",120.39,107.51],["L",120.44,107.73],["L",120.25,107.84],["L",120.1,107.58],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",133.41,102.75],["L",133.59,103.32],["L",132.88,103.47],["L",132.82,102.87],["L",133.41,102.75],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",134.27,105.46],["L",134.46,106.03],["L",133.19,106.3],["L",133.13,105.7],["L",134.27,105.46],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",135.14,108.17],["L",135.32,108.74],["L",133.5,109.13],["L",133.44,108.53],["L",135.14,108.17],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",136.01,110.88],["L",136.19,111.45],["L",133.81,111.96],["L",133.75,111.36],["L",136.01,110.88],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",136.87,113.59],["L",137.06,114.16],["L",134.12,114.78],["L",134.06,114.19],["L",136.87,113.59],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",138.95,125.21],["L",139.31,125.7],["L",138.68,126.06],["L",138.43,125.51],["L",138.95,125.21],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",143.67,107.52],["L",143.7,106.91],["L",144.52,107.13],["L",144.25,107.68],["L",143.67,107.52],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",143.81,104.9],["L",143.85,104.29],["L",145.71,104.79],["L",145.43,105.34],["L",143.81,104.9],["Z"]] },
      { fill: "#000000ff", stroke: null, width: 1, d: [["M",143.96,102.28],["L",143.99,101.67],["L",146.89,102.45],["L",146.62,102.99],["L",143.96,102.28],["Z"]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",155.8,102.8],["L",158.8,116.91]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",158.8,116.91],["L",146.31,124.12]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",146.31,124.12],["L",140.8,119.16]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",138.57,117.16],["L",135.59,114.47]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",146.64,120.94],["L",142.53,117.24]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",140.31,115.23],["L",137.95,113.11]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",132.59,100.36],["L",143.31,110.02]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",143.31,110.02],["L",137.44,123.19]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",137.44,123.19],["L",123.1,121.68]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",123.1,121.68],["L",120.1,107.58]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",143.31,110.02],["L",155.8,102.8]] },
      { fill: null, stroke: "#000000ff", width: 0.6, d: [["M",120.1,107.58],["L",132.59,100.36]] },
    ];
    const r = readFigure(figure(paths, word("O", [100, 140])));
    const near = (i: number, x: number, y: number) => Math.hypot(r.atoms[i].x - x, r.atoms[i].y - y) < 1.5;
    expect(r.bonds.some((b) => b.order === 2 && ((near(b.a, 146.3, 124.1) && near(b.b, 135.6, 114.5)) || (near(b.b, 146.3, 124.1) && near(b.a, 135.6, 114.5))))).toBe(true);
  });

  it("reads a lone H with a short hash to it - one line across the way from its carbon - as bonded behind", () => {
    // (a stereocentre's H as the ACS 1996 style draws it close: of its hash only one line shows, the rest hidden by the joint
    // at the carbon and by the H)
    const c: P = [60, 60];
    const h = step(c, 60, 0.67);
    const m = along(c, h, 0.45);
    const [ux, uy] = unit(c, h);
    const s = read(
      figure(
        [stroke(step(c, 180), c, step(c, -60)), stroke(c, step(c, 240)), stroke([m[0] - uy * 1.5, m[1] + ux * 1.5], [m[0] + uy * 1.5, m[1] - ux * 1.5])],
        word("H", h),
      ),
    );
    const hAtom = s.atoms.findIndex((a) => a.el === "H");
    const b = s.bonds.find((x) => x.a === hAtom || x.b === hAtom);
    expect(b?.stereo).toBe("down");
    expect(s.atoms[b!.a === hAtom ? b!.b : b!.a].el).toBe("C");
  });

  it("reads an NH with its H stacked over the N, a short bond from above cut back at the H, as the N's", () => {
    // (tetrodotoxin as the RSC style prints it: its guanidine's NH set between two bonds, its H over its N, the bond from the
    // cage above cut short at the H)
    const r = readFigure(tetrodotoxin as unknown as FigureDrawn);
    const nh = r.atoms.findIndex((a) => a.label === "NH" && Math.hypot(a.x - 116.2, a.y - 131.3) < 2);
    expect(r.bonds.filter((b) => b.a === nh || b.b === nh)).toHaveLength(2);
  });

  it("reads a short line from a joint of bonds to an NH stacked tall, cut back at its H, as the N's bond", () => {
    // (tetrodotoxin as Meno's own style prints it: the bond from the cage above shows only a little short of the H)
    const r = readFigure(tetrodotoxinMeno as unknown as FigureDrawn);
    const nh = r.atoms.findIndex((a) => a.label === "NH");
    expect(r.bonds.filter((b) => b.a === nh || b.b === nh)).toHaveLength(2);
  });

  it("joins a bond broken round one in front where most bonds are drawn cut short of labels", () => {
    // (tetrodotoxin as the Nature style prints it: its many labels cut more bonds short than are drawn whole, so bonds read
    // shorter than they are, and a back bond's gap is two fifths of that)
    const r = readFigure(tetrodotoxinNature as unknown as FigureDrawn);
    expect(r.atoms.filter((a) => !a.label && Math.abs(a.x - 101.5) < 0.5 && a.y > 96 && a.y < 105)).toHaveLength(0);
    expect(r.atoms).toHaveLength(22);
  });

  it("lets a lone H take one bond: its wedge's, not a bond passing near it", () => {
    const c: P = [60, 60];
    const h = step(c, 90);
    const s = read(figure([stroke(step(c, 210), c, step(c, -30)), wedge(c, along(c, h, 0.6)), stroke(step(h, 0, 0.45), step(step(h, 0, 0.45), -60))], word("H", h)));
    const hAtom = s.atoms.findIndex((a) => a.el === "H");
    expect(s.bonds.filter((b) => b.a === hAtom || b.b === hAtom)).toHaveLength(1);
  });
});

describe("a figure drawn by another program", () => {
  it("reads joints drawn again as short pieces along the bonds meeting there as those bonds' own, however many", () => {
    // (a ring as RDKit draws one: at each corner a short piece along each of its two bonds, drawn over them - twelve pieces,
    // more than the ring has bonds)
    const c: P = [80, 60];
    const ring = [0, 60, 120, 180, 240, 300].map((deg): P => [c[0] + L * Math.cos((deg * Math.PI) / 180), c[1] - L * Math.sin((deg * Math.PI) / 180)]);
    const pieces = ring.flatMap((p, k) => [stroke(p, along(p, ring[(k + 1) % 6], 0.05)), stroke(p, along(p, ring[(k + 5) % 6], 0.05))]);
    const s = read(figure([stroke(...ring, ring[0]), ...pieces]));
    expect(s.atoms).toHaveLength(6);
    expect(s.bonds).toHaveLength(6);
  });

  it("reads a joint's pieces a few widths long as the bonds' own, though their ends written to a hundredth turn them", () => {
    // ((E)-but-2-ene as RDKit's ACS 1996 mode draws it from CoordGen's coordinates: each joint drawn again as two pieces half a
    // point long, their way 4 degrees off their bonds')
    const r = readFigure(butene as unknown as FigureDrawn);
    expect(r.atoms).toHaveLength(4);
    expect(r.bonds.map((b) => b.order).sort()).toEqual([1, 1, 2]);
  });
});

describe("a figure drawn large by another program", () => {
  it("reads a long bond's hash of many lines set close - closer than a twenty-fifth of a bond - as a hash", () => {
    // (as RDKit draws one filling its canvas: bonds 100 points long, the hash 18 lines 2.6 apart, 0.75 thick, the first under a point)
    const B = 100;
    const c: P = [200, 200];
    const end: P = [c[0] + B * Math.cos(Math.PI / 3), c[1] - B * Math.sin(Math.PI / 3)];
    const [ux, uy] = unit(c, end);
    const lines = Array.from({ length: 18 }, (_, k): FigurePath => {
      const t = 0.08 + k * 0.05;
      const m: P = [c[0] + (end[0] - c[0]) * t, c[1] + (end[1] - c[1]) * t];
      const h = 0.25 + k * 0.28;
      return { ...stroke([m[0] - uy * h, m[1] + ux * h], [m[0] + uy * h, m[1] - ux * h]), width: 0.75 };
    });
    const s = read(figure([{ ...stroke([c[0] - B, c[1]], c, [c[0] + B * 0.5, c[1] + B * 0.866]), width: 1.5 }, ...lines]));
    expect(s.bonds.filter((b) => b.stereo === "down")).toHaveLength(1);
  });
});

describe("a figure whose wedges are filled and then stroked round", () => {
  it("reads the strokes round a wedge as its edges, not bonds: its wide end at an OH is the O's", () => {
    // (as RDKit's ACS 1996 mode draws one and a PDF holds it: the wedge filled, then its outline stroked as a path apart)
    const c: P = [60, 60];
    const o = step(c, 45);
    const base = along(c, o, 0.62);
    const [ux, uy] = unit(c, o);
    const corners: P[] = [c, [base[0] - uy * 1.3, base[1] + ux * 1.3], [base[0] + uy * 1.3, base[1] - ux * 1.3]];
    const s = read(figure([stroke(step(c, 180), c, step(c, -90)), filled(...corners), { ...stroke(...corners, corners[0]), width: 0.2 }], word("OH", o)));
    expect(bondsOf(s)).toContain("C-O up");
    expect(s.atoms.filter((a) => a.el === "C")).toHaveLength(3);
  });

  it("reads a short wedge pointing into an H set close, cut back at it, as the H's bond", () => {
    // (aflatoxin B1 as RDKit's ACS 1996 mode draws it: its two stereocentres' H's each a quarter of a bond off, their wedges
    // shorter than that)
    const r = readFigure(aflatoxin as unknown as FigureDrawn);
    const hs = r.atoms.map((a, i) => ({ a, i })).filter(({ a }) => a.label === "H");
    expect(hs).toHaveLength(2);
    for (const { i } of hs) expect(r.bonds.filter((b) => b.a === i || b.b === i).map((b) => b.stereo)).toEqual(["up"]);
  });

  it("gives an O alone no more than two bonds, a double bond's counted twice: a methyl's end set close is a carbon", () => {
    // (camphor as RDKit's ACS 1996 mode draws it: its bridgehead's methyl ends just under the ketone's O)
    const r = readFigure(camphor as unknown as FigureDrawn);
    const o = r.atoms.findIndex((a) => a.label === "O");
    expect(r.bonds.filter((b) => b.a === o || b.b === o).map((b) => b.order)).toEqual([2]);
    expect(r.atoms).toHaveLength(11);
  });

  it("reads two H's drawn over each other, not on one line, as two labels: each its own atom's", () => {
    // (sparteine as RDKit's ACS 1996 mode draws it from CoordGen's coordinates: two stereocentres side by side, each with its
    // H hashed, the two H's half over each other)
    const r = readFigure(sparteine as unknown as FigureDrawn);
    const hs = r.atoms.map((a, i) => ({ a, i })).filter(({ a }) => a.label === "H");
    expect(hs).toHaveLength(4);
    for (const { i } of hs) expect(r.bonds.filter((b) => b.a === i || b.b === i)).toHaveLength(1);
  });
});

describe("a figure drawn in colour by another program", () => {
  it("reads a wedge drawn in two colours, black to its middle and its atom's colour on, as one wedge", () => {
    // (D-ribose as RDKit draws it by default: the wedge to an OH black from the ring to its middle, its wide half red - filled,
    // and stroked round as a path apart)
    const r = readFigure(ribose as unknown as FigureDrawn);
    expect(r.atoms).toHaveLength(10);
    const oh = r.atoms.findIndex((a) => a.label === "OH" && a.x > 360 && a.y < 130);
    expect(r.bonds.filter((b) => b.a === oh || b.b === oh).map((b) => b.stereo)).toEqual(["up"]);
  });

  it("reads a radical's dot drawn as a polygon of many corners, small beside the bonds, as its unpaired electron", () => {
    // (TEMPO as RDKit draws it by default: the O's dot a filled polygon of 76 points, 3 points across - a twenty-eighth of its
    // bonds, twice its lines' width)
    const r = readFigure(tempo as unknown as FigureDrawn);
    expect(r.atoms.find((a) => a.label === "O")?.dots).toBe(1);
  });

  it("reads a charge the PDF gives no character for - a control code, drawn flat - as a minus", () => {
    // (sodium acetate as RDKit draws it by default, printed by WebKit: the O's "-" comes out of the PDF as \x02)
    const r = readFigure(sodiumAcetate as unknown as FigureDrawn);
    expect(r.atoms.map((a) => a.label).sort()).toEqual(["Na+", "O", "O-", undefined, undefined].sort());
  });

  it("reads a long wedge in two colours as one, its coloured half near as wide at both ends as a filled line", () => {
    // (D-glucose as RDKit draws it by default: the wedge to an HO long, its red half read alone as a filled line)
    const r = readFigure(glucose as unknown as FigureDrawn);
    expect(r.atoms).toHaveLength(12);
    const ho = r.atoms.findIndex((a) => a.label === "HO" && a.x < 130 && a.y > 200);
    expect(r.bonds.filter((b) => b.a === ho || b.b === ho).map((b) => b.stereo)).toEqual(["up"]);
  });

  it("reads a bond drawn in two colours, black to its middle and its atom's colour on, as one bond", () => {
    // (an ethanol as RDKit draws one by default: the C-O bond black, then red from its middle to the O)
    const c: P = [60, 60];
    const c2 = step(c, 30);
    const o = step(c2, -30);
    const red = (...pts: P[]): FigurePath => ({ ...stroke(...pts), stroke: "#ff0000ff" });
    const s = read(figure([stroke(c, c2, along(c2, o, 0.5)), red(along(c2, o, 0.5), along(c2, o, 0.85))], word("O", o)));
    expect(bondsOf(s)).toEqual(["C-C", "C-O"]);
  });

  it("reads a double bond whose two lines change colour side by side, closer than two of their widths, as one double bond", () => {
    // (a C=O as RDKit draws one by default on a large molecule: each line black to its middle and red on, 1.5 thick, the lines
    // 2.6 apart - each line's colour changes by the other's)
    const c: P = [60, 60];
    const c2 = step(c, 30);
    const o = step(c2, -30);
    const [nx, ny] = [Math.cos((60 * Math.PI) / 180) * 2.6, -Math.sin((60 * Math.PI) / 180) * 2.6];
    const off = (p: P): P => [p[0] + nx, p[1] + ny];
    const thick = (colour: string, ...pts: P[]): FigurePath => ({ ...stroke(...pts), width: 1.5, stroke: colour });
    const s = read(
      figure(
        [
          thick("#000000ff", c, c2),
          thick("#000000ff", c2, along(c2, o, 0.5)),
          thick("#ff0000ff", along(c2, o, 0.5), along(c2, o, 0.85)),
          thick("#000000ff", off(along(c2, o, 0.1)), off(along(c2, o, 0.5))),
          thick("#ff0000ff", off(along(c2, o, 0.5)), off(along(c2, o, 0.85))),
        ],
        word("O", o),
      ),
    );
    expect(bondsOf(s)).toEqual(["C-C", "C=O"]);
  });
});

describe("a figure's words", () => {
  it("joins letters side by side, a subscript with them, and writes them as a label is typed", () => {
    const ws = wordsOf([...word("CO_2Me", [20, 20]), ...word("OH", [80, 20])]);
    expect(ws.map(labelText).sort()).toEqual(["CO2Me", "OH"]);
  });

  it("reads a drawn label turned round, and HN before a group as NH", () => {
    // (its charge written last stays last: H3N+ as NH3+)
    expect(readDrawnLabel("H3N+", reads)).toEqual({ el: "N", charge: 1, read: true });
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
