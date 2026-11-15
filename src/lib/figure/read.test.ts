import { describe, expect, it } from "vitest";
import type { Box, FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { narrowestBox, shapesOf } from "./drawn";
import { bondLength, figureBond, labelText, readFigure, repeatBrackets, repeatsRead, REPEAT_REFUSED, REPEAT_UNREAD, wordsOf, type ReadAtom, type ReadBond } from "./read";
import camphor from "./fixtures/camphor-rdkitacs.json";
import aflatoxin from "./fixtures/aflatoxin-rdkitacs.json";
import atp from "./fixtures/atp-rdkit.json";
import butene from "./fixtures/butene-rdkitacscg.json";
import cisplatin from "./fixtures/cisplatin-rdkit.json";
import cisplatinAcscg from "./fixtures/cisplatin-rdkitacscg.json";
import cocaine from "./fixtures/cocaine-rdkitacs.json";
import cortisol from "./fixtures/cortisol-rdkitacs.json";
import deoxycytidine from "./fixtures/deoxycytidine-acs1996.json";
import monensin from "./fixtures/monensin-rsc.json";
import pyridinium from "./fixtures/pyridinium-rdkitacscg.json";
import sodiumAcetate from "./fixtures/sodium-acetate-rdkit.json";
import sodiumAcetateAcs from "./fixtures/sodium-acetate-rdkitacs.json";
import ribose from "./fixtures/ribose-rdkit.json";
import sparteine from "./fixtures/sparteine-rdkitacscg.json";
import strychnine from "./fixtures/strychnine-acs1996serif.json";
import tempo from "./fixtures/tempo-rdkit.json";
import junction from "./fixtures/monensin-nature-junction.json";
import fdg from "./fixtures/fdg-rdkitacscg.json";
import fructose from "./fixtures/fructose-nature.json";
import ibogaine from "./fixtures/ibogaine-menoserif.json";
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
/** A disc filled, as a drawing program writes one: four curves - a line's round end. */
const disc = (c: P, r: number): FigurePath => ({ ...circle(c, r), fill: "#000000ff", stroke: null, width: 0 });
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
  // (a chain of two bonds, and beside it what a spectrum or a chart is drawn with)
  const chain = stroke([0, 0], [L * 0.87, -L / 2], [2 * L * 0.87, 0]);
  const path = (parts: P[][]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.3, d: parts.flatMap((pts) => pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y])) });

  it("leaves a plot's trace out: a path of many short lines, or of many lines one way, or one long open line", () => {
    // (a spectrum's peaks drawn as sticks up from its baseline, each a part of its own - a few points long, all upright)
    const sticks = path(Array.from({ length: 1200 }, (_, k): P[] => [[100 + k * 0.2, 200], [100 + k * 0.2, 200 - 2 - (k % 7)]]));
    // (a trace drawn a step at a time, each step a part: short steps)
    const steps = path(Array.from({ length: 400 }, (_, k): P[] => [[100 + k * 0.2, 300 + 0.5 * Math.sin(k / 5)], [100 + (k + 1) * 0.2, 300 + 0.5 * Math.sin((k + 1) / 5)]]));
    // (one long open line of fine steps)
    const line = path([Array.from({ length: 150 }, (_, k): P => [100 + k * 0.5, 400 + Math.cos(k / 3)])]);
    const s = shapesOf(figure([chain, sticks, steps, line]));
    expect(s.strokes).toHaveLength(2);
  });

  it("keeps a structure's own lines however they are drawn: a ring's circle of many short lines, hashes in one path", () => {
    const ring = path([Array.from({ length: 128 }, (_, k): P => [50 + 5 * Math.cos((2 * Math.PI * k) / 128), 50 + 5 * Math.sin((2 * Math.PI * k) / 128)])]);
    const round: FigurePath = { ...ring, d: [...ring.d, ["Z"]] };
    const hashPath = path(Array.from({ length: 8 }, (_, k): P[] => [[200 + k * 1.6, 100 - k * 0.3], [200 + k * 1.6, 100 + k * 0.3]]));
    const s = shapesOf(figure([chain, round, hashPath]));
    // (the chain's two, the hashes' eight, and the circle's lines, every one)
    expect(s.strokes.length).toBeGreaterThanOrEqual(2 + 8 + 127);
  });

  it("drops a short line drawn over a longer one among many lines, as among a few", () => {
    const many = Array.from({ length: 120 }, (_, k) => stroke([k * 20, 500], [k * 20 + 12, 507]));
    const s = shapesOf(figure([...many, stroke([0, 600], [L, 600]), stroke([2, 600], [5, 600])]));
    expect(s.strokes).toHaveLength(121);
  });

  it("reads a filled triangle wider than it is long, two sides from its tip as long, as a wedge narrow at that tip", () => {
    // (a wedge cut back to an H set close, as RDKit's ACS 1996 mode draws one: 1.4 long, 1.85 wide)
    const s = shapesOf(figure([filled([103.2, 93.9], [101.7, 93.22], [103.28, 92.25])]));
    expect(s.wedges).toHaveLength(1);
    expect(s.wedges[0].tip).toEqual({ x: 103.2, y: 93.9 });
    expect(s.wedges[0].base.x).toBeCloseTo(102.49, 2);
    expect(s.wedges[0].base.y).toBeCloseTo(92.735, 2);
  });

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

  it("takes a line drawn down a wedge, within it, for the wedge's own: no bond beside it", () => {
    // (a ring carbon's three bonds, and a wedge up to its H - a line drawn down the wedge's middle as well, under its fill)
    const c: P = [50, 50];
    const h = step(c, 90, 0.8);
    const paths = [stroke(step(c, 210), c), stroke(c, step(c, -30)), stroke(c, step(c, -90)), wedge(c, along(c, h, 0.75)), stroke(along(c, h, 0.75), c)];
    const s = read(figure(paths, word("H", h)));
    expect(s.atoms).toHaveLength(5);
    expect(bondsOf(s)).toEqual(["C-C", "C-C", "C-C", "C-H up"]);
    // (and one reaching a little past where the wedge's tip is taken to be - the middle of its narrow end's points - to the atom, as a
    // line drawn down a wedge capped with a point does)
    const past = [stroke(step(c, 210), c), stroke(c, step(c, -30)), stroke(c, step(c, -90)), wedge(along(c, h, 0.05), along(c, h, 0.75)), { ...stroke(along(c, h, 0.75), c), width: 0.12 }];
    expect(bondsOf(read(figure(past, word("H", h))))).toEqual(["C-C", "C-C", "C-C", "C-H up"]);
    // (and the line alone, no wedge over it, still a bond)
    expect(read(figure([stroke(step(c, 210), c), stroke(c, step(c, -30)), stroke(c, step(c, 90))])).atoms).toHaveLength(4);
  });

  it("reads a wedge whose narrow end is capped with a short point as a wedge narrow at that point", () => {
    // (2 wide at its wide end, its sides 0.9 apart where they are cut in to the point, 0.6 short of it)
    const s = shapesOf(figure([filled([10, 0], [12, 0], [11.45, 5.6], [11, 6.2], [10.55, 5.6])]));
    expect(s.wedges).toHaveLength(1);
    expect(s.wedges[0].tip.y).toBeGreaterThan(5.5);
    expect(s.wedges[0].base.y).toBeCloseTo(0, 1);
    // (and one slanting, its point shorter: 0.3 from where its sides are cut in)
    const slant = shapesOf(figure([filled([20, 7], [18.3, 6.1], [22, 0.25], [22.5, 0], [22.85, 0.35])]));
    expect(slant.wedges).toHaveLength(1);
    expect(slant.wedges[0].tip.y).toBeLessThan(0.5);
    // (and one a bond long, its sides run in to near half its wide end: filling most of three quarters of its box)
    const long = shapesOf(figure([filled([0, 0], [2.2, 0], [1.6, 13.8], [1.1, 14.4], [0.6, 13.8])]));
    expect(long.wedges).toHaveLength(1);
    expect(long.wedges[0].tip.y).toBeGreaterThan(13.5);
    // (a bar still a line)
    expect(shapesOf(figure([filled([0, 0], [1.2, 0], [1.2, 14.4], [0, 14.4])])).strokes).toHaveLength(1);
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

describe("a table beside a structure", () => {
  // (a ring of six, and a table of three rows and three columns, its cells a bond high, a dash in one)
  const ring: P[] = Array.from({ length: 6 }, (_, i) => [30 + L * Math.cos((Math.PI / 3) * i + Math.PI / 6), 30 + L * Math.sin((Math.PI / 3) * i + Math.PI / 6)]);
  const hexagon = ring.map((p, i) => stroke(p, ring[(i + 1) % 6]));
  const grid: FigurePath[] = [];
  for (let r = 0; r <= 3; r++) for (let c = 0; c < 3; c++) grid.push(stroke([100 + c * 2 * L, 10 + r * L], [100 + (c + 1) * 2 * L, 10 + r * L]));
  for (let c = 0; c <= 3; c++) for (let r = 0; r < 3; r++) grid.push(stroke([100 + c * 2 * L, 10 + r * L], [100 + c * 2 * L, 10 + (r + 1) * L]));
  const dash = stroke([100 + 0.8 * L, 10 + 1.5 * L], [100 + 1.2 * L, 10 + 1.5 * L]);

  it("reads the structure and not the table: its lines are no bonds", () => {
    const s = read(figure([...hexagon, ...grid, dash]));
    expect(s.atoms).toHaveLength(6);
    expect(s.bonds).toHaveLength(6);
  });

  it("still reads a cross of lines with no cells", () => {
    // (a chain drawn upright, a line across it at each of two atoms - as a Fischer projection is drawn)
    const cross = [stroke([50, 0], [50, L]), stroke([50, L], [50, 2 * L]), stroke([50, 2 * L], [50, 3 * L]), stroke([50 - L, L], [50, L]), stroke([50, L], [50 + L, L]), stroke([50 - L, 2 * L], [50, 2 * L]), stroke([50, 2 * L], [50 + L, 2 * L])];
    expect(read(figure(cross)).atoms).toHaveLength(8);
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

  it("reads a double bond drawn short, its second line a quarter of a bond, as a double bond", () => {
    // (huperzine A's ethylidene C=C as RDKit's ACS 1996 mode draws it from CoordGen's coordinates: 0.6 of a bond, squeezed in)
    const c: P = [60, 60];
    const d: P = [60 + 0.6 * L, 60];
    const s = read(figure([stroke(step(c, 150), c, step(c, 210)), stroke(c, d), stroke(step(d, 30), d, step(d, -30)), stroke([c[0] + 2.2, 62.4], [c[0] + 2.2 + 0.25 * L, 62.4])]));
    expect(bondsOf(s).filter((b) => b === "C=C")).toHaveLength(1);
    expect(s.atoms).toHaveLength(6);
  });

  it("keeps a double bond's end inside a label's box at the label, not carried to a bond's end by it", () => {
    // (ATP as RDKit draws it by default: a P=O's middle end inside its P's box, a P-OH bond's end 0.23 of a bond off it)
    const r = readFigure(atp as unknown as FigureDrawn, (l) => readDrawnLabel(l, reads).read);
    expect(r.atoms.filter((a) => !a.label)).toHaveLength(10);
  });

  it("reads a short hash to an H set close as the H's bond, not its widest stroke as a bond between the H and a label by it", () => {
    // (strychnine as the round trip prints it in the ACS 1996 style, in Times: an H's hash of two lines and the dots at its
    // narrow end, its widest line by the H and pointing past it to the N above)
    const r = readFigure(strychnine as unknown as FigureDrawn, (l) => readDrawnLabel(l, reads).read);
    const h = r.atoms.findIndex((a) => a.label === "H" && a.x < 112);
    const toH = r.bonds.filter((b) => b.a === h || b.b === h);
    expect(toH).toHaveLength(1);
    expect(toH[0].stereo).toBe("down");
    expect(r.atoms[toH[0].a].label).toBeUndefined();
  });

  it("gives a bond's end to the label it points at, not to a nearer one by it it points away from", () => {
    // (ibogaine in Meno's style printed in Times: the indole's C-N bond cut back under its NH, its end by the corner of the
    // room round the H set under the NH - a stereocentre's - nearer than the NH but pointing away from it)
    const r = readFigure(ibogaine as unknown as FigureDrawn, (l) => readDrawnLabel(l, reads).read);
    const nh = r.atoms.findIndex((a) => a.label === "NH");
    expect(r.bonds.filter((b) => b.a === nh || b.b === nh)).toHaveLength(2);
    expect(r.atoms).toHaveLength(24);
  });

  it("ends a C=O at its carbon where one of its lines alone runs on past it, to nothing", () => {
    // (bilobalide's lactone C=O as RDKit draws it from CoordGen's coordinates: the two lines end together at the O, and one runs on
    // a third of a bond past the carbon)
    const c: P = [60, 60];
    const o = step(c, 90);
    const [ux, uy] = unit(c, o);
    const side = (p: P, d: number): P => [p[0] - uy * d, p[1] + ux * d];
    const s = read(figure([stroke(step(c, 210), c, step(c, -30)), stroke(side(along(c, o, 0.05), 1.3), side(along(c, o, 0.75), 1.3)), stroke(side(along(c, o, -0.33), -1.3), side(along(c, o, 0.75), -1.3))], word("O", o)));
    expect(bondsOf(s)).toEqual(["C-C", "C-C", "C=O"]);
    expect(s.atoms).toHaveLength(4);
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

  it("reads hashes drawn as lines with round ends, the first next to nothing long: a dot", () => {
    // (as Meno's own style draws them: each line cut square, a filled disc on each end; the
    // first, at the narrow end, 0.06 points long - 0.57 more each next one)
    const c: P = [40, 40];
    const to = step(c, -30);
    const [ux, uy] = unit(c, to);
    const lines = Array.from({ length: 5 }, (_, k) => {
      const m = along(c, to, 0.196 * (k + 1));
      const h = (0.06 + 0.57 * k) / 2;
      return [[m[0] - uy * h, m[1] + ux * h], [m[0] + uy * h, m[1] - ux * h]] as [P, P];
    });
    const ends = [c, step(c, 150), step(c, 90), ...lines.flat()].map((p) => disc(p, 0.3));
    const s = read(figure([stroke(step(c, 150), c), stroke(c, step(c, 90)), ...lines.map(([p, q]) => stroke(p, q)), ...ends]));
    const down = s.bonds.find((b) => b.stereo === "down")!;
    expect(s.atoms).toHaveLength(4);
    expect(s.bonds.filter((b) => b.a === down.a || b.b === down.a)).toHaveLength(3);
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

  it("reads a line under three tenths of a bond, from a joint into a label, as the label's bond", () => {
    // (as RDKit draws a crowded OH by default - ouabain's - its bond cut back at the label to 0.3 of a bond; and in its ACS 1996
    // mode an amide's C-N into its HN, 0.18 of a bond - microcystin-LR's)
    const c: P = [60, 60];
    const o = step(c, -90, 0.6);
    for (const t of [0.47, 0.3]) {
      const s = read(figure([stroke(step(c, 150), c, step(c, 30)), stroke(c, along(c, o, t))], word("OH", o)));
      expect(bondsOf(s), String(t)).toEqual(["C-C", "C-C", "C-O"]);
    }
  });

  it("reads a short line running straight out of a label to nothing as a bond to a methyl", () => {
    // (cocaine as RDKit's ACS 1996 mode draws it: its bridge's N-methyl squeezed to half a bond, cut back at the N - a quarter
    // of a bond shows)
    const r = readFigure(cocaine as unknown as FigureDrawn);
    const n = r.atoms.findIndex((a) => a.label === "N");
    expect(r.bonds.filter((b) => b.a === n || b.b === n)).toHaveLength(3);
    expect(r.atoms.filter((a) => !a.label)).toHaveLength(17);
  });

  it("reads a hash shorter than bonds' ends lie apart where they meet, from an atom to an H set close, as the H's bond", () => {
    // (cortisol as RDKit's ACS 1996 mode draws it: its C9 and C14 H's each a hash of three lines a seventh of a bond long, its
    // wide end as near the stereocentre's other bonds' ends as they meet)
    const r = readFigure(cortisol as unknown as FigureDrawn);
    const hs = r.atoms.map((a, i) => ({ a, i })).filter(({ a }) => a.label === "H");
    expect(hs).toHaveLength(3);
    for (const { i } of hs) expect(r.bonds.filter((b) => b.a === i || b.b === i).map((b) => !!b.stereo)).toEqual([true]);
  });

  it("reads a wedge cut back to a triangle of near equal sides, stroked round, as a wedge narrow at the corner a line ends at", () => {
    // (ibogaine's wedge to an H as RDKit's ACS 1996 mode draws it: three sides of 1.75 points, filled and its outline stroked)
    const c: P = [60, 60];
    const h = step(c, 120, 0.45);
    const [ux, uy] = unit(c, h);
    const base = along(c, h, (1.75 * 0.866) / (0.45 * L));
    const corners: P[] = [c, [base[0] - uy * 0.875, base[1] + ux * 0.875], [base[0] + uy * 0.875, base[1] - ux * 0.875]];
    const s = read(figure([stroke(step(c, 0), c, step(c, 240)), stroke(c, step(c, -60)), filled(...corners), { ...stroke(...corners, corners[0]), width: 0.2 }], word("H", h)));
    expect(bondsOf(s)).toContain("C-H up");
  });

  it("reads a wedge to an H set close, cut back so far it is wider than long, as the H's bond from its stereocentre", () => {
    const c: P = [60, 60];
    const h = step(c, 120, 0.55);
    const [ux, uy] = [(h[0] - c[0]) / Math.hypot(h[0] - c[0], h[1] - c[1]), (h[1] - c[1]) / Math.hypot(h[0] - c[0], h[1] - c[1])];
    // (1.6 long, 2.4 wide: its tip's two sides 2 long)
    const base = along(c, h, 0.2);
    const s = read(
      figure([stroke(step(c, 0), c, step(c, 240)), stroke(c, step(c, -60)), filled(c, [base[0] - uy * 1.2, base[1] + ux * 1.2], [base[0] + uy * 1.2, base[1] - ux * 1.2])], word("H", h)),
    );
    expect(bondsOf(s)).toContain("C-H up");
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
    // (the methyl's end plainly further off than the C=O's: no guess, nothing said)
    expect(r.atoms[o].unsure).toBeUndefined();
  });

  it("says so where an O alone has more bonds coming to it than it takes, one let go all but as near as those kept", () => {
    // (three bonds' ends a little off an O, from three sides, near as far from it as each other - azithromycin's ring O and a
    // methyl's hash in RDKit's ACS 1996 mode)
    const o: P = [60, 60];
    const ends = [90, 210, 330].map((deg, i) => step(o, deg, 0.42 + 0.02 * i));
    const s = readFigure(figure(ends.map((e, i) => stroke(step(e, [90, 210, 330][i]), e)), word("O", o)));
    const at = s.atoms.findIndex((a) => a.label === "O");
    expect(s.atoms[at].unsure).toEqual(["More bonds come to it than it takes: those nearest its letter kept."]);
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

  it("reads two bonds drawn short of one label from two sides as that label's, however near their ends lie", () => {
    // (cisplatin as RDKit draws it by default: its Pt's bonds to NH2 and Cl above it end a fifth of a bond apart, short of
    // the Pt - where two bonds' ends meet, a carbon, but for both pointing into the Pt)
    const r = readFigure(cisplatin as unknown as FigureDrawn);
    expect(r.atoms.filter((a) => !a.label)).toHaveLength(0);
    const pt = r.atoms.findIndex((a) => a.label === "Pt");
    expect(r.bonds.filter((b) => b.a === pt || b.b === pt)).toHaveLength(4);
  });

  it("reads no bond between labels from a line whose ends both come to one word", () => {
    // (FDG as RDKit's ACS 1996 mode draws it from CoordGen's coordinates: its 18F set beside its carbon, the C-F bond under it)
    const r = readFigure(fdg as unknown as FigureDrawn, (l) => readDrawnLabel(l, reads).read);
    const f = r.atoms.findIndex((a) => a.label === "18F");
    expect(r.bonds.filter((b) => b.a === f || b.b === f)).toHaveLength(1);
    expect(r.atoms.filter((a) => !a.label)).toHaveLength(6);
  });

  it("gives a bond so short it lies within its label's box to that label, at the end nearer its element", () => {
    // (cisplatin as RDKit's ACS 1996 mode draws it from CoordGen's coordinates: its Pt-N a quarter of a bond, both ends in the H2N's
    // box)
    const r = readFigure(cisplatinAcscg as unknown as FigureDrawn);
    expect(r.atoms.filter((a) => !a.label)).toHaveLength(0);
    const pt = r.atoms.findIndex((a) => a.label === "Pt");
    expect(r.bonds.filter((b) => b.a === pt || b.b === pt)).toHaveLength(4);
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

  it("reads two labels set touching, the first ending in its charge, as two", () => {
    // (pyridinium chloride as RDKit's ACS 1996 mode draws it from CoordGen's coordinates: its Cl- set against the ring's HN+)
    const r = readFigure(pyridinium as unknown as FigureDrawn, (l) => readDrawnLabel(l, reads).read);
    expect(r.atoms.flatMap((a) => (a.label ? [a.label] : [])).sort()).toEqual(["Cl-", "HN+"]);
  });

  it("reads an element's ion set right by an atom's label as an ion still, not as that label's", () => {
    // (sodium acetate as RDKit's ACS 1996 mode draws it: its Na+ set just over the C=O's O)
    const r = readFigure(sodiumAcetateAcs as unknown as FigureDrawn);
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

  it("joins a line's two colours once: an sp carbon's single bond going straight on into its two-colour triple bond stays a bond of its own", () => {
    // (a nitrile as RDKit draws one by default - ferricyanide's - its C-C black, drawn from the C out, its C#N's lines drawn from
    // the N, blue to their middles and black on)
    const [a, c, n]: P[] = [[40, 60], [40 + L, 60], [40 + 2 * L, 60]];
    const blue = (...pts: P[]): FigurePath => ({ ...stroke(...pts), stroke: "#0000ffff" });
    const tripleLine = (dy: number): FigurePath[] => [blue([n[0] - 4, n[1] + dy], [c[0] + L / 2, c[1] + dy]), stroke([c[0] + L / 2, c[1] + dy], [c[0], c[1] + dy])];
    const s = read(figure([...tripleLine(0), ...tripleLine(-2.2), ...tripleLine(2.2), stroke(c, a)], word("N", n)));
    expect(bondsOf(s)).toEqual(["C-C", "N#C"]);
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
    expect(ws.map((w) => labelText(w)).sort()).toEqual(["CO2Me", "OH"]);
  });

  it("reads two letters as large set over each other, their rooms well into each other, as two words", () => {
    // (two H's of stereocentres side by side as RDKit's ACS 1996 mode draws estradiol: on one line, a fifth of a letter over each other)
    const at = (c: string, box: Box, loose: Box): FigureLetter => ({ c, box, loose, at: [box[0], box[3]], size: 7.5 });
    const ws = wordsOf([at("H", [109.87, 74.87, 114.14, 80.25], [109.28, 74.47, 114.69, 81.97]), at("H", [113.92, 75.17, 118.18, 80.55], [113.33, 74.77, 118.74, 82.27])]);
    expect(ws.map((w) => labelText(w))).toEqual(["H", "H"]);
  });

  it("starts a word where a letter as large as the word's own stands off their line, however the word ends", () => {
    // (as RDKit's ACS 1996 mode sets them: oxytocin's carbonyl O against NH2's 2, five points lower; vancomycin's two H's side by
    // side, a quarter of a letter apart in height)
    const at = (c: string, x: number, base: number, size = 7.5): FigureLetter => ({ c, box: [x, base - 0.72 * size, x + 0.6 * size, base], at: [x, base], size });
    expect(wordsOf([at("N", 100, 102.7), at("H", 104.6, 102.7), at("2", 109.2, 104.4, 4.5), at("O", 112, 107.6)]).map((w) => labelText(w))).toEqual(["NH2", "O"]);
    expect(wordsOf([at("H", 208, 138.4), at("H", 214.3, 140.1)]).map((w) => labelText(w))).toEqual(["H", "H"]);
  });

  it("joins letters set side by side as the PDF sets them, however far apart their ink: a 1's ink well inside its room", () => {
    // (18F as RDKit's ACS 1996 mode writes it: the 1 and the 8 small, their ink 1.4 apart, their rooms 0.35)
    const at = (c: string, box: Box, loose: Box, size: number): FigureLetter => ({ c, box, loose, at: [box[0], box[3]], size });
    const ws = wordsOf([
      at("1", [123.13, 91.89, 124.29, 95.03], [122.7, 91.56, 125.2, 96.06], 4.5),
      at("8", [125.69, 91.87, 127.86, 95.11], [125.55, 91.56, 128.05, 96.06], 4.5),
      at("F", [129.04, 92.65, 132.77, 98.03], [128.4, 92.25, 132.98, 99.75], 7.5),
    ]);
    expect(ws.map((w) => labelText(w))).toEqual(["18F"]);
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

describe("a stereocentre whose configuration the figure does not show", () => {
  const NOT_DRAWN = "A stereocentre whose configuration is not drawn: none is read.";
  /** CH(OH)(Cl)CH3, its centre at (100, 100): the OH up, the Cl down right, the methyl down left - its bond to the Cl a wedge, or not. */
  const drawn = (wedged: boolean, cl = "Cl") => {
    const c: P = [100, 100];
    const [o, x, me] = [step(c, 90), step(c, -30), step(c, 210)];
    return figure([stroke(c, along(c, o, 0.7)), wedged ? wedge(c, along(c, x, 0.7)) : stroke(c, along(c, x, 0.7)), stroke(c, me)], [...word("OH", [o[0] + 3.4, o[1]]), ...word(cl, [x[0] + 3.4, x[1]])]);
  };
  const marked = (f: FigureDrawn) => read(f).atoms.filter((a) => a.unsure?.includes(NOT_DRAWN)).length;

  it("is marked where no wedge or hash is drawn at it - none read, none guessed", () => {
    expect(marked(drawn(false))).toBe(1);
  });

  it("is not marked where a wedge narrow at it shows it, nor where two of its groups are alike", () => {
    expect(marked(drawn(true))).toBe(0);
    // (CH(OH)(CH3)2: its two methyls alike, no stereocentre)
    const c: P = [100, 100];
    expect(marked(figure([stroke(c, along(c, step(c, 90), 0.7)), stroke(c, step(c, -30)), stroke(c, step(c, 210))], word("OH", [step(c, 90)[0] + 3.4, step(c, 90)[1]])))).toBe(0);
  });

  it("is not marked where a wavy bond meets it - either configuration, drawn so - and is where only a wedge's wide end does", () => {
    const c: P = [100, 100];
    const [o, x, me] = [step(c, 90), step(c, -30), step(c, 210)];
    const to = along(c, x, 0.7);
    const [ux, uy] = unit(c, to);
    const wavy: FigurePath = {
      fill: null,
      stroke: "#000000ff",
      width: 0.6,
      d: Array.from({ length: 25 }, (_, k): PathStep => {
        const t = k / 24;
        const off = 1.5 * Math.sin(t * 8 * Math.PI);
        return [k ? "C" : "M", c[0] + (to[0] - c[0]) * t - uy * off, c[1] + (to[1] - c[1]) * t + ux * off];
      }),
    };
    const labels = [...word("OH", [o[0] + 3.4, o[1]]), ...word("Cl", [x[0] + 3.4, x[1]])];
    expect(marked(figure([stroke(c, along(c, o, 0.7)), wavy, stroke(c, me)], labels))).toBe(0);
    // (a wedge narrow at the Cl, its wide end at the centre: it says nothing of the centre)
    expect(marked(figure([stroke(c, along(c, o, 0.7)), wedge(to, c), stroke(c, me)], labels))).toBe(1);
  });

  it("is marked at an S of four groups with its double bonds - an S(=O)(=NH) - as Meno takes a stereocentre, and never at a metal", () => {
    const s: P = [100, 100];
    const [o, n, me, et] = [step(s, 90), step(s, -90), step(s, 180), step(s, 0)];
    const twice = (p: P, q: P): FigurePath[] => {
      const [ux, uy] = unit(p, q);
      return [-1, 1].map((k) => stroke([p[0] - uy * k + ux * 5, p[1] + ux * k + uy * 5], [q[0] - uy * k - ux * 5, q[1] + ux * k - uy * 5]));
    };
    const sulfur = figure(
      [...twice(s, o), ...twice(s, n), stroke(along(s, me, 0.35), me), stroke(along(s, et, 0.35), et, step(et, 30))],
      [...word("S", s), ...word("O", o), ...word("NH", [n[0] + 3.4, n[1]])],
    );
    expect(marked(sulfur)).toBe(1);
    // (a platinum with four ligands each other than the rest: no stereocentre's mark)
    const pt: P = [100, 100];
    const ends = [step(pt, 90), step(pt, 0), step(pt, -90), step(pt, 180)];
    const metal = figure(
      ends.map((e) => stroke(along(pt, e, 0.35), along(pt, e, 0.7))),
      [...word("Pt", [pt[0] + 3.4, pt[1]]), ...word("Cl", [ends[0][0] + 3.4, ends[0][1]]), ...word("I", ends[1]), ...word("OH", [ends[2][0] + 3.4, ends[2][1]]), ...word("NH3", [ends[3][0] - 6.8, ends[3][1]])],
    );
    expect(marked(metal)).toBe(0);
  });
});

describe("lines that are no bonds", () => {
  /** A ring of six whole bonds from a point, to give the figure its bond length. */
  const ring = (from: P): FigurePath[] => {
    const pts: P[] = [from];
    for (let k = 1; k < 6; k++) pts.push(step(pts[k - 1], 60 * k));
    return pts.map((p, k) => stroke(p, pts[(k + 1) % 6]));
  };
  const bar = (x0: number, x1: number, y: number) => filled([x0, y - 0.3], [x1, y - 0.3], [x1, y + 0.3], [x0, y + 0.3]);
  const labelledBonds = (r: ReturnType<typeof readFigure>) => r.bonds.filter((b) => r.atoms[b.a].label || r.atoms[b.b].label).length;

  it("reads the = of a line of text - a caption's 3aa, R = H, 73% - as no bond between its words, its bars long or short", () => {
    // (its words a space apart, as a caption sets them)
    const caption = (y: number) => [...word("3aa,", [57, y]), ...word("R", [90, y]), ...word("H,", [104, y]), ...word("73%,", [124, y])];
    const f = figure(
      [...ring([60, 60]), bar(94.5, 99.5, 148.5), bar(94.5, 99.5, 151.5), bar(95.5, 98.5, 168.5), bar(95.5, 98.5, 171.5)],
      [...caption(150), ...caption(170)],
    );
    const r = readFigure(f, (l) => readDrawnLabel(l, reads).read);
    expect(r.bonds).toHaveLength(6);
    expect(labelledBonds(r)).toBe(0);
  });

  it("keeps the bonds of a row of labels set on one line - HO-S-O-S-OH - a chain, not a line of text", () => {
    const y = 150;
    const f = figure(
      [...ring([60, 60]), stroke([61.2, y], [67.6, y]), stroke([76.4, y], [83.6, y]), stroke([92.4, y], [99.6, y]), stroke([108.4, y], [117.6, y])],
      [...word("HO", [50, y]), ...word("S", [72, y]), ...word("O", [88, y]), ...word("S", [104, y]), ...word("OH", [122, y])],
    );
    expect(labelledBonds(readFigure(f, (l) => readDrawnLabel(l, reads).read))).toBe(4);
  });

  it("reads a line more than six bonds long - a table's rule, a graph's axis - as no bond", () => {
    const r = readFigure(figure([...ring([60, 60]), stroke([20, 150], [20 + 10 * L, 150])]));
    expect(r.atoms).toHaveLength(6);
    expect(r.bonds).toHaveLength(6);
  });
});

describe("a group's name stacked over an atom's label", () => {
  /** A five-membered ring, its N at the top labelled, its bonds cut back at the N; and words over the N, a size apart from it. */
  const ring = (over: string, nBonds = 2): FigureDrawn => {
    const c: P = [100, 120];
    const r = L / (2 * Math.sin(Math.PI / 5));
    const v = Array.from({ length: 5 }, (_, k): P => [c[0] + r * Math.cos(-Math.PI / 2 + (2 * Math.PI * k) / 5), c[1] + r * Math.sin(-Math.PI / 2 + (2 * Math.PI * k) / 5)]);
    const cut = (p: P, q: P): P => along(p, q, 5 / Math.hypot(q[0] - p[0], q[1] - p[1]));
    const extra = nBonds > 2 ? [stroke(cut(v[0], step(v[0], 0)), step(v[0], 0))] : [];
    return figure([stroke(cut(v[0], v[1]), v[1], v[2], v[3], v[4], cut(v[0], v[4])), ...extra], [...word("N", v[0]), ...word(over, [v[0][0] - ((over.length - 1) * 6.8) / 2, v[0][1] - 10])]);
  };
  const readsToo = (l: string) => l === "MOM" || l === "Me" || readDrawnLabel(l, reads).read;
  const bondedTo = (f: FigureDrawn, label: string) => {
    const r = readFigure(f, readsToo);
    const k = r.atoms.findIndex((a) => a.label === label);
    return k < 0 ? null : r.bonds.filter((b) => b.a === k || b.b === k).map((b) => r.atoms[b.a === k ? b.b : b.a].label ?? "C");
  };

  it("bonds a group's name set right over a heteroatom's label, no bond drawn to it, to that atom: MOM over its N", () => {
    expect(bondedTo(ring("MOM"), "MOM")).toEqual(["N"]);
    expect(bondedTo(ring("Me"), "Me")).toEqual(["N"]);
  });

  it("bonds none to an atom with no bond to spare, and no element's symbol alone so", () => {
    expect(bondedTo(ring("MOM", 3), "MOM")).toBeNull();
    expect(bondedTo(ring("Cl"), "Cl")).toBeNull();
  });

  it("bonds no group's name that is one of its line's words: the Me of an R = Me over the N stays the line's", () => {
    const f = ring("Me");
    // (Me set from 6.8 left of the N's middle; R and = before it, a space apart)
    const [n] = f.letters;
    const x = (n.box[0] + n.box[2]) / 2;
    const y = (n.box[1] + n.box[3]) / 2 - 10;
    const lined: FigureDrawn = { ...f, letters: [...f.letters, ...word("R", [x - 25, y]), ...word("=", [x - 14.2, y])] };
    expect(bondedTo(lined, "Me")).toBeNull();
    expect(readFigure(lined, readsToo).left.letters.map((l) => l.c).join("")).toContain("Me");
  });
});

describe("a frame, a graph's axes and a page's rules", () => {
  const frame = (x0: number, y0: number, x1: number, y1: number): FigurePath[] => [stroke([x0, y0], [x1, y0]), stroke([x1, y0], [x1, y1]), stroke([x1, y1], [x0, y1]), stroke([x0, y1], [x0, y0])];
  const hexagon = (from: P): FigurePath[] => {
    const pts: P[] = [from];
    for (let k = 1; k < 6; k++) pts.push(step(pts[k - 1], 60 * k));
    return pts.map((p, k) => stroke(p, pts[(k + 1) % 6]));
  };

  it("reads no structure in a graph: its frame and axes meeting square, its ticks and numbers by them", () => {
    const ticks = [0, 1, 2, 3, 4].map((k) => stroke([60 + 25 * k, 160], [60 + 25 * k, 156]));
    const numbers = [0, 1, 2, 3, 4].flatMap((k) => word(`${k}`, [60 + 25 * k, 168]));
    const r = readFigure(figure([...frame(60, 60, 160, 160), ...ticks], [...numbers, ...word("Yield", [40, 110])]));
    expect(r.atoms).toHaveLength(0);
  });

  it("measures a bond by its labels' letters, not a caption's: a chart's long lines beside a small structure, titled large, are none", () => {
    // (a chain to an OH, and a chart's line of six long steps at angles, its title in 18-point letters)
    const chain = [stroke([40, 120], step([40, 120], 30), step(step([40, 120], 30), -30), along(step(step([40, 120], 30), -30), step(step(step([40, 120], 30), -30), 30), 0.7))];
    const oh = word("OH", step(step(step([40, 120], 30), -30), 30));
    const chart = [stroke([100, 200], [196, 172], [292, 200], [388, 172], [484, 200], [580, 172], [676, 200])];
    const title = Array.from("Conversion over time", (c, k): FigureLetter => ({ c, box: [120 + 12 * k, 100, 132 + 12 * k, 113], at: [120 + 12 * k, 113], size: 18 }));
    const f = figure([...chain, ...chart], [...oh, ...title]);
    expect(figureBond(shapesOf(f), f.letters)).toBeCloseTo(L, 0);
  });

  it("reads a structure drawn in a frame without the frame: its sides meet only each other, square", () => {
    const r = readFigure(figure([...hexagon([100, 120]), ...frame(70, 70, 190, 150)], word("L1", [130, 160])));
    expect(r.atoms).toHaveLength(6);
    expect(r.bonds).toHaveLength(6);
  });
});

describe("a repeat unit in brackets, counted (docs/PDF.md, *A repeat unit in brackets*)", () => {
  /** A curve from `a` to `b` by two control points, stroked. */
  const curve = (a: P, c1: P, c2: P, b: P): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: [["M", ...a], ["C", ...c1], ["C", ...c2], ["C", ...b]] });
  /** HO-C-C-C-C-OH, its two middle carbons' bonds out crossed by brackets - square, or round as curves - the second counted `count` at its foot (none, `null`); `open`: the first bracket drawn. */
  function counted(round: boolean, count: string | null, open = true): FigureDrawn {
    const p0: P = [40, 80];
    const [p1, p2, p3, p4] = [step(p0, -30), step(step(p0, -30), 30), step(step(step(p0, -30), 30), -30), step(step(step(step(p0, -30), 30), -30), 30)];
    const p5 = step(p4, -30);
    const paths = [stroke(along(p0, p1, 0.25), p1, p2, p3, p4, along(p4, p5, 0.75))];
    const [h, t] = [0.55 * L, 0.18 * L];
    const [x1, x2] = [along(p1, p2, 0.5), along(p3, p4, 0.5)];
    const bracket = ([x, y]: P, side: number) =>
      round ? curve([x + side * t, y - h], [x - side * t, y - h / 2], [x - side * t, y + h / 2], [x + side * t, y + h]) : stroke([x + side * t, y - h], [x, y - h], [x, y + h], [x + side * t, y + h]);
    if (open) paths.push(bracket(x1, 1));
    paths.push(bracket(x2, -1));
    return figure(paths, [...word("O", p0), ...word("O", p5), ...(count ? word(count, [x2[0] + 0.25 * L, x2[1] + h]) : [])]);
  }
  const marked = (s: ReturnType<typeof read>, count: string) => s.atoms.filter((a) => a.unsure?.includes(REPEAT_UNREAD(count))).length;
  const refused = (s: ReturnType<typeof read>, count: string, why: string) => s.atoms.filter((a) => a.unsure?.includes(REPEAT_REFUSED(count, why))).length;
  /** Whether an atom says anything of a repeat unit. */
  const saysRepeat = (s: ReturnType<typeof read>) => s.atoms.some((a) => a.unsure?.some((u) => u.startsWith("A repeat unit")));
  /** Each atom's bonds, by atom. */
  const degrees = (s: ReturnType<typeof read>) => s.atoms.map((_, i) => s.bonds.filter((b) => b.a === i || b.b === i).length);

  it("reads a whole count's unit that many times, head to tail - its brackets no bonds, its count no word - kept a multiple group, the first unit its paradigm", () => {
    for (const round of [false, true])
      for (const count of ["_6", "6"]) {
        const f = counted(round, count);
        const s = read(f);
        // (HO-C-(C-C)6-C-OH: two carbons, then the unit's two six times, as one chain)
        expect(s.atoms.map((a) => a.el).sort(), `${round} ${count}`).toEqual([...Array(14).fill("C"), "O", "O"]);
        expect(s.bonds).toHaveLength(15);
        expect(degrees(s).filter((d) => d === 1)).toHaveLength(2);
        expect(degrees(s).every((d) => d <= 2)).toBe(true);
        expect(saysRepeat(s)).toBe(false);
        expect(s.atoms.filter((a) => a.multiple?.n === 6)).toHaveLength(12);
        expect(s.atoms.filter((a) => a.multiple?.paradigm)).toHaveLength(2);
        // (each copy of the figure's atoms it stands for; the rest the figure's own)
        expect(s.atoms.filter((a) => a.of != null)).toHaveLength(10);
        // (each set apart: no two atoms in one place)
        expect(s.atoms.every((a, i) => s.atoms.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > 0.5))).toBe(true);
        expect(readFigure(f).left.letters).toEqual([]);
      }
  });

  it("takes a line across a wedge, hashes or a wavy line for a bracket - none of it a bond, its count no word - and refuses its unit, the bond kept as drawn", () => {
    // (HO-C-[C(C)-C(C)]-C-OH, its unit's bonds out drawn `k1` and `k2` - a wedge or hashes from its narrow end, `R` the other
    //  way, a wavy line, or a line - crossed by brackets, the second counted)
    const p0: P = [40, 80];
    const p1 = step(p0, -30);
    const p2 = step(p1, 30);
    const p3 = step(p2, -30);
    const p4 = step(p3, 30);
    const p5 = step(p4, -30);
    const [h, t] = [0.55 * L, 0.18 * L];
    const [x1, x2] = [along(p1, p2, 0.5), along(p3, p4, 0.5)];
    const bracket = ([x, y]: P, side: number) => stroke([x + side * t, y - h], [x, y - h], [x, y + h], [x + side * t, y + h]);
    const wave = (a: P, b: P): FigurePath => {
      const [ux, uy] = unit(a, b);
      return {
        fill: null,
        stroke: "#000000ff",
        width: 0.6,
        d: Array.from({ length: 25 }, (_, k): PathStep => {
          const f = k / 24;
          const off = 1.5 * Math.sin(f * 8 * Math.PI);
          return [k ? "C" : "M", a[0] + (b[0] - a[0]) * f - uy * off, a[1] + (b[1] - a[1]) * f + ux * off];
        }),
      };
    };
    const drawn = (k: string, a: P, b: P): FigurePath[] =>
      ({ wedge: [wedge(a, b)], wedgeR: [wedge(b, a)], hash: hashes(a, b), hashR: hashes(b, a), wavy: [wave(a, b)], line: [stroke(a, b)] })[k]!;
    const across = (k1: string, k2: string, count: string) =>
      figure(
        [stroke(along(p0, p1, 0.25), p1), ...drawn(k1, p1, p2), stroke(step(p2, 90), p2, p3, step(p3, -90)), ...drawn(k2, p3, p4), stroke(p4, along(p4, p5, 0.75)), bracket(x1, 1), bracket(x2, -1)],
        [...word("O", p0), ...word("O", p5), ...word(count, [x2[0] + 0.25 * L, x2[1] + h])],
      );
    const at = (r: ReturnType<typeof readFigure>, i: number, p: P) => Math.hypot(r.atoms[i].x - p[0], r.atoms[i].y - p[1]) < 0.3 * L;
    const why = "a bracket crosses a wedged, hashed or wavy bond";
    for (const [k1, k2] of [["wedge", "line"], ["line", "wedge"], ["wedge", "wedge"], ["wedgeR", "wedgeR"], ["hash", "line"], ["line", "hash"], ["hash", "hash"], ["hashR", "hashR"], ["wavy", "line"], ["line", "wavy"], ["wavy", "wavy"]]) {
      const f = across(k1, k2, "3");
      const s = read(f);
      // (the figure's eight atoms alone - its brackets no bonds - its count no word, the unit drawn once, saying why)
      expect(s.atoms.map((a) => a.el).sort(), `${k1} ${k2}`).toEqual([...Array(6).fill("C"), "O", "O"]);
      expect(s.bonds, `${k1} ${k2}`).toHaveLength(7);
      const r = readFigure(f);
      expect(r.left.letters, `${k1} ${k2}`).toEqual([]);
      expect(refused(s, "3", why), `${k1} ${k2}`).toBeGreaterThan(0);
      expect(s.atoms.some((a) => a.multiple), `${k1} ${k2}`).toBe(false);
      // (each wedge, hashes or wavy line kept as drawn, its narrow end where it is drawn - and so in the structure)
      for (const [k, a, b] of [[k1, p1, p2], [k2, p3, p4]] as [string, P, P][]) {
        if (k === "line") continue;
        const [narrow, wide] = k.endsWith("R") ? [b, a] : [a, b];
        const kind = k.startsWith("wedge") ? "up" : k.startsWith("hash") ? "down" : "wavy";
        expect(r.bonds.filter((d) => d.stereo === kind && (kind === "wavy" ? (at(r, d.a, narrow) && at(r, d.b, wide)) || (at(r, d.a, wide) && at(r, d.b, narrow)) : at(r, d.a, narrow) && at(r, d.b, wide))), `${k1} ${k2}: ${k}`).toHaveLength(1);
      }
      expect(s.bonds.filter((d) => d.stereo).length, `${k1} ${k2}`).toBe([k1, k2].filter((k) => k !== "line").length);
    }
    // (a letter's count, a polymer's n: drawn once, as before - the bonds as drawn)
    for (const [k1, k2] of [["wedge", "wedge"], ["line", "hash"]]) {
      const s = read(across(k1, k2, "n"));
      expect(s.atoms, `${k1} ${k2}`).toHaveLength(8);
      expect(marked(s, "n"), `${k1} ${k2}`).toBeGreaterThan(0);
      expect(refused(s, "n", why)).toBe(0);
    }
  });

  it("reads a unit in a ring so many times, the ring closing on itself - what lies round it left where it is", () => {
    // (a hexagon, one corner's two bonds across brackets, counted 3: an eight-membered ring)
    const c: P = [100, 100];
    const hex = Array.from({ length: 6 }, (_, k): P => [c[0] + L * Math.cos((Math.PI / 3) * k), c[1] + L * Math.sin((Math.PI / 3) * k)]);
    const h = 0.55 * L;
    const ends = (p: P, q: P): [P, P] => {
      const m = along(p, q, 0.5);
      const [ux, uy] = unit(p, q);
      return [
        [m[0] - uy * h, m[1] + ux * h],
        [m[0] + uy * h, m[1] - ux * h],
      ];
    };
    const [ea, eb] = [ends(hex[5], hex[0]), ends(hex[0], hex[1])];
    const [a, b] = [stroke(...ea), stroke(...eb)];
    // (its count by the second's lower end)
    const foot = eb[0][1] > eb[1][1] ? eb[0] : eb[1];
    const low: P = [foot[0] + 0.25 * L, foot[1]];
    const s = read(figure([stroke(...hex, hex[0]), a, b], word("_3", low)));
    expect(saysRepeat(s)).toBe(false);
    expect(s.atoms).toHaveLength(8);
    expect(s.bonds).toHaveLength(8);
    expect(degrees(s).every((d) => d === 2)).toBe(true);
    // (no bond stretched: the ring closes on the unit's last copy where it stood)
    const lengths = s.bonds.map((x) => Math.hypot(s.atoms[x.a].x - s.atoms[x.b].x, s.atoms[x.a].y - s.atoms[x.b].y));
    expect(Math.max(...lengths)).toBeLessThan(2 * Math.min(...lengths));
    // (the ring's other five as the figure has them: none moved against another)
    const given = read(figure([stroke(...hex, hex[0])]));
    const apart = (ps: { x: number; y: number }[]) => ps.flatMap((p, i) => ps.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.y - q.y))).sort((x, y) => x - y);
    const kept = apart(s.atoms.filter((x) => !x.multiple));
    apart(given.atoms.slice(1)).forEach((d, i) => expect(kept[i]).toBeCloseTo(d, 6));
    // (and where they were against the unit drawn: none moved round it)
    const unitAtom = s.atoms.find((x) => x.multiple?.paradigm)!;
    const from = (ps: { x: number; y: number }[], o: { x: number; y: number }) => ps.map((p) => Math.hypot(p.x - o.x, p.y - o.y)).sort((x, y) => x - y);
    const was = from(given.atoms.slice(1), given.atoms[0]);
    from(s.atoms.filter((x) => !x.multiple), unitAtom).forEach((d, i) => expect(d).toBeCloseTo(was[i], 6));
  });

  it("sets a one-atom unit's copies on back and forth, as a chain is drawn - in a line at most where they meet what lies past them", () => {
    // (HO-C-[C]-C-OH counted 4: its four carbons in brackets each turning the chain back)
    const p0: P = [40, 80];
    const pts = [p0];
    for (let k = 0; k < 4; k++) pts.push(step(pts[k], k % 2 ? 30 : -30));
    const h = 0.55 * L;
    const line = ([x, y]: P) => stroke([x, y - h], [x, y + h]);
    const [x1, x2] = [along(pts[1], pts[2], 0.5), along(pts[2], pts[3], 0.5)];
    const s = read(figure([stroke(...pts), line(x1), line(x2)], [...word("_4", [x2[0] + 0.25 * L, x2[1] + h])]));
    expect(s.atoms).toHaveLength(8);
    // (along the chain, from one end: no three atoms in a line)
    const next = (from: number, not: number) => s.bonds.flatMap((b) => (b.a === from && b.b !== not ? [b.b] : b.b === from && b.a !== not ? [b.a] : []))[0];
    const order = [degrees(s).indexOf(1)];
    for (let prev = -1; order.length < s.atoms.length; ) {
      const n = next(order[order.length - 1], prev);
      prev = order[order.length - 1];
      order.push(n);
    }
    // (an odd number of atoms put in turns what lies past them the other way: one bend there straight, never a mirror image of it)
    const straight = order.slice(1, -1).filter((_, k) => {
      const [a, b, c] = [s.atoms[order[k]], s.atoms[order[k + 1]], s.atoms[order[k + 2]]];
      return Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) < 1e-3;
    });
    expect(straight.length).toBeLessThanOrEqual(1);
  });

  it("is not read where a bracket crosses a line that is no bond, or bonds of a ring drawn with its circle - each said", () => {
    // (repeatsRead as the figure's reading calls it: a chain of four, brackets across its middle bond's neighbours)
    const atoms = (): ReadAtom[] => [0, 1, 2, 3].map((k) => ({ x: k * L, y: 0 }));
    const bonds = (aromatic = false): ReadBond[] => [0, 1, 2].map((k) => ({ a: k, b: k + 1, order: 1, ...(aromatic ? { aromatic: true as const } : {}) }));
    const across = (x: number, y = 0) => ({ a: { x, y: y - 0.1 * L }, b: { x: x + L, y: y + 0.1 * L }, w: 0.6 });
    const pair = (lines: ReturnType<typeof across>[]) => [{ count: "6", brackets: lines.map((l) => ({ ends: [{ x: l.a.x + 0.5 * L, y: -h }, { x: l.a.x + 0.5 * L, y: h }] as [{ x: number; y: number }, { x: number; y: number }], crosses: [l] })) }];
    const h = 0.55 * L;
    const near = (a: ReadAtom, p: { x: number; y: number }) => Math.hypot(a.x - p.x, a.y - p.y);
    // (the second bracket across a line from nowhere to nowhere)
    const loose = atoms();
    repeatsRead(pair([across(0), { a: { x: 10 * L, y: 5 * L }, b: { x: 11 * L, y: 5 * L }, w: 0.6 }]), loose, bonds(), L, near);
    expect(loose.some((a) => a.unsure?.includes(REPEAT_REFUSED("6", "a bracket crosses a line that is no bond")))).toBe(true);
    // (both across bonds of a ring drawn with its circle: their orders the ring's, not drawn)
    const ring = atoms();
    repeatsRead(pair([across(0), across(2 * L)]), ring, bonds(true), L, near);
    expect(ring.some((a) => a.unsure?.includes(REPEAT_REFUSED("6", "the two bonds its brackets cross are not of one order")))).toBe(true);
    // (and the same, plain: read)
    const plain = atoms();
    const ok = bonds();
    repeatsRead(pair([across(0), across(2 * L)]), plain, ok, L, near);
    expect(plain.map((a) => a.repeat?.n)).toEqual([undefined, 6, 6, undefined]);
    expect(ok.map((b) => b.repeat?.group)).toEqual([0, undefined, 0]);
  });

  it("is not read where one unit lies within another, or two units' brackets cross one bond - each said", () => {
    // (repeatsRead as the figure's reading calls it: a chain of six, brackets across the bonds each pair names)
    const chain = (): ReadAtom[] => [0, 1, 2, 3, 4, 5].map((k) => ({ x: k * L, y: 0 }));
    const links = (): ReadBond[] => [0, 1, 2, 3, 4].map((k) => ({ a: k, b: k + 1, order: 1 as const }));
    const h = 0.55 * L;
    // (each bracket upright across bond k's middle, the line it crosses that bond's own)
    const bondLine = (k: number) => ({ a: { x: k * L, y: 0 }, b: { x: (k + 1) * L, y: 0 }, w: 0.6 });
    const pairOf = (count: string, k1: number, k2: number) => ({
      count,
      brackets: [k1, k2].map((k) => ({ ends: [{ x: (k + 0.5) * L, y: -h }, { x: (k + 0.5) * L, y: h }] as [{ x: number; y: number }, { x: number; y: number }], crosses: [bondLine(k)] })),
    });
    const near = (a: ReadAtom, p: { x: number; y: number }) => Math.hypot(a.x - p.x, a.y - p.y);
    const said = (atoms: ReadAtom[], count: string, why: string) => atoms.some((a) => a.unsure?.includes(REPEAT_REFUSED(count, why)));
    // (an outer unit 1-4 holding an inner unit 2-3: neither read)
    const nested = chain();
    const nestedBonds = links();
    repeatsRead([pairOf("3", 0, 4), pairOf("2", 1, 3)], nested, nestedBonds, L, near);
    for (const c of ["3", "2"]) expect(said(nested, c, "it lies within another repeat unit in brackets, or holds one")).toBe(true);
    expect(nested.some((a) => a.repeat) || nestedBonds.some((b) => b.repeat)).toBe(false);
    // (units 1-2 and 3-4 side by side, both across the bond 2-3: neither read)
    const side = chain();
    const sideBonds = links();
    repeatsRead([pairOf("2", 0, 2), pairOf("3", 2, 4)], side, sideBonds, L, near);
    for (const c of ["2", "3"]) expect(said(side, c, "a bond its brackets cross is crossed by another repeat unit's brackets too")).toBe(true);
    expect(side.some((a) => a.repeat) || sideBonds.some((b) => b.repeat)).toBe(false);
    // (and the two apart, each across bonds of its own: both read)
    const apart = chain();
    const apartBonds = links();
    repeatsRead([pairOf("2", 0, 1), pairOf("3", 3, 4)], apart, apartBonds, L, near);
    expect(apart.map((a) => a.repeat?.n)).toEqual([undefined, 2, undefined, undefined, 3, undefined]);
  });

  it("turns its copies first as the bond past it goes, then as the bond into it does - unlike bonds told apart", () => {
    // (a one-atom unit P, its first bracket's bond into it from up-left, its second's out of it straight right; counted 3)
    const A: P = [40, 80];
    const Pp: P = [A[0] + 0.5 * L, A[1] + 0.866 * L];
    const B: P = [Pp[0] + L, Pp[1]];
    const C: P = [B[0] + 0.5 * L, B[1] - 0.866 * L];
    const h = 0.55 * L;
    const across = (p: P, q: P) => {
      const m = along(p, q, 0.5);
      const [ux, uy] = unit(p, q);
      return { a: [m[0] - uy * h, m[1] + ux * h] as P, b: [m[0] + uy * h, m[1] - ux * h] as P };
    };
    const [x1, x2] = [across(A, Pp), across(Pp, B)];
    const foot = x2.a[1] > x2.b[1] ? x2.a : x2.b;
    const s = read(figure([stroke(A, Pp, B, C), stroke(x1.a, x1.b), stroke(x2.a, x2.b)], word("_3", [foot[0] + 0.25 * L, foot[1]])));
    expect(s.atoms).toHaveLength(6);
    const p = s.atoms.findIndex((a) => a.multiple?.paradigm);
    const copies = s.atoms.flatMap((a, i) => (a.multiple && !a.multiple.paradigm ? [i] : []));
    expect(copies).toHaveLength(2);
    const at = (i: number) => s.atoms[i];
    const step = (i: number, j: number) => ({ x: at(j).x - at(i).x, y: at(j).y - at(i).y });
    // (the bond into P from the atom before it, and the one from the last copy to what lay past P)
    const before = s.bonds.find((b) => (b.a === p || b.b === p) && !s.atoms[b.a === p ? b.b : b.a].multiple)!;
    const into = step(before.a === p ? before.b : before.a, p);
    const lastCopy = copies[1];
    const past = s.bonds.find((b) => (b.a === lastCopy || b.b === lastCopy) && !s.atoms[b.a === lastCopy ? b.b : b.a].multiple)!;
    const out = step(lastCopy, past.a === lastCopy ? past.b : past.a);
    // (unlike, so that which goes first shows)
    expect(Math.hypot(into.x - out.x, into.y - out.y)).toBeGreaterThan(0.1);
    const near = (u: { x: number; y: number }, v: { x: number; y: number }) => Math.hypot(u.x - v.x, u.y - v.y) < 1e-6;
    expect(near(step(p, copies[0]), out)).toBe(true);
    expect(near(step(copies[0], copies[1]), into)).toBe(true);
  });

  it("moves what lies past an odd number of atoms put in on, never its mirror image: its wedge and its places against each other as drawn", () => {
    // (HO-C-[C]-C(F)(Cl)-C with a wedge to F, counted 2 and counted 1: what lies past the unit only moved)
    const p0: P = [40, 80];
    const pts = [p0];
    for (let k = 0; k < 4; k++) pts.push(step(pts[k], k % 2 ? 30 : -30));
    const f = step(pts[3], 90);
    const h = 0.55 * L;
    const line = ([x, y]: P) => stroke([x, y - h], [x, y + h]);
    const [x1, x2] = [along(pts[1], pts[2], 0.5), along(pts[2], pts[3], 0.5)];
    const drawn = (count: string) =>
      read(figure([stroke(...pts), wedge(pts[3], f), line(x1), line(x2)], [...word(count, [x2[0] + 0.25 * L, x2[1] + h]), ...word("F", f), ...word("O", p0)]));
    const once = drawn("_1");
    const twice = drawn("_2");
    expect(twice.atoms.length).toBe(once.atoms.length + 1);
    // (the atoms past the unit - the centre the F is on, the F, the centre's end carbon - each placed against the others as before)
    const pastOf = (s: ReturnType<typeof read>) => {
      const around = (i: number) => s.bonds.flatMap((b) => (b.a === i ? [b.b] : b.b === i ? [b.a] : []));
      const fl = s.atoms.findIndex((a) => a.el === "F");
      const centre = around(fl)[0];
      const end = around(centre).find((j) => j !== fl && around(j).length === 1)!;
      return [centre, fl, end];
    };
    const gaps = (s: ReturnType<typeof read>) => {
      const ids = pastOf(s);
      return ids.flatMap((i) => ids.map((j) => [s.atoms[j].x - s.atoms[i].x, s.atoms[j].y - s.atoms[i].y]));
    };
    const [g1, g2] = [gaps(once), gaps(twice)];
    expect(g2).toHaveLength(g1.length);
    g1.forEach(([x, y], k) => {
      expect(g2[k][0]).toBeCloseTo(x, 6);
      expect(g2[k][1]).toBeCloseTo(y, 6);
    });
    // (its wedge as drawn: up, narrow at its centre)
    const wedged = (s: ReturnType<typeof read>) => s.bonds.filter((b) => b.stereo === "up").map((b) => s.atoms[b.a].el + s.atoms[b.b].el);
    expect(wedged(twice)).toEqual(wedged(once));
    expect(wedged(twice)).toEqual(["CF"]);
  });

  it("reads a unit counted 1 once, as drawn, its brackets and count taken", () => {
    const s = read(counted(false, "_1"));
    expect(bondsOf(s)).toEqual(["C-C", "C-C", "C-C", "C-O", "O-C"]);
    expect(saysRepeat(s) || s.atoms.some((a) => a.multiple)).toBe(false);
  });

  it("is not read where its count is a letter - a polymer's n - its unit once, the atoms of each bond a bracket crosses marked, saying so", () => {
    for (const round of [false, true]) {
      const f = counted(round, "_n");
      const s = read(f);
      expect(s.atoms.map((a) => a.el).sort(), `${round}`).toEqual(["C", "C", "C", "C", "O", "O"]);
      expect(bondsOf(s)).toEqual(["C-C", "C-C", "C-C", "C-O", "O-C"]);
      expect(marked(s, "n"), `${round}`).toBe(4);
      expect(s.atoms.some((a) => a.multiple)).toBe(false);
      expect(readFigure(f).left.letters).toEqual([]);
    }
  });

  it("is not read where it is counted 0, saying so", () => {
    const s = read(counted(false, "_0"));
    expect(s.atoms).toHaveLength(6);
    expect(refused(s, "0", "a count of 0 is no unit")).toBe(4);
  });

  it("is told by one bracket counted alone: not read, the atoms of the bonds it crosses marked, saying why", () => {
    const s = read(counted(false, "_6", false));
    expect(bondsOf(s)).toEqual(["C-C", "C-C", "C-C", "C-O", "O-C"]);
    expect(refused(s, "6", "it has one bracket, and no other is found across a bond to close the unit")).toBe(2);
  });

  describe("is not read where its shape breaks a rule, saying which", () => {
    const h = 0.55 * L;
    const line = ([x, y]: P) => stroke([x, y - h], [x, y + h]);
    const zigzag = (n: number) => {
      const pts: P[] = [[40, 80]];
      for (let k = 0; k < n; k++) pts.push(step(pts[k], k % 2 ? 30 : -30));
      return pts;
    };
    const count = (p: P) => word("_6", [p[0] + 0.25 * L, p[1] + h]);

    it("two bonds out of the brackets of two orders", () => {
      // (C=C-C-C: its brackets across the double bond and a single one)
      const pts = zigzag(3);
      const off = (p: P, q: P, t: number): P => [along(p, q, t)[0], along(p, q, t)[1] + 0.18 * L];
      const at = [along(pts[0], pts[1], 0.5), along(pts[2], pts[3], 0.5)];
      const s = read(figure([stroke(...pts), stroke(off(pts[0], pts[1], 0.15), off(pts[0], pts[1], 0.85)), line(at[0]), line(at[1])], count(at[1])));
      expect(bondsOf(s)).toEqual(["C-C", "C-C", "C=C"]);
      expect(refused(s, "6", "the two bonds its brackets cross are not of one order")).toBe(4);
    });

    it("what lies between its brackets joined to the rest another way", () => {
      // (a chain whose bracketed C-C is in a triangle with the next atom: cut by the two bonds, still joined by the third)
      const pts = zigzag(3);
      const apex = step(pts[1], -90);
      const at = [along(pts[0], pts[1], 0.5), along(pts[2], pts[3], 0.5)];
      const s = read(figure([stroke(...pts), stroke(pts[1], apex, pts[3]), line(at[0]), line(at[1])], count(at[1])));
      expect(refused(s, "6", "what lies between its brackets is not cut off from the rest by the two bonds they cross")).toBeGreaterThan(0);
      expect(s.atoms).toHaveLength(5);
    });
  });

  it("reads a double bond a bracket crosses, its two lines, as one bond - the unit's copies joined by it", () => {
    // (C=C-C=C, its brackets across both double bonds, counted 2: hexa-1,3,5-triene)
    const pts: P[] = [[40, 80]];
    for (let k = 0; k < 3; k++) pts.push(step(pts[k], k % 2 ? 30 : -30));
    // (each double bond's second line on the side the chain turns to: above the first, below the third)
    const off = (p: P, q: P, side: number): [P, P] => [
      [along(p, q, 0.15)[0], along(p, q, 0.15)[1] + side * 0.18 * L],
      [along(p, q, 0.85)[0], along(p, q, 0.85)[1] + side * 0.18 * L],
    ];
    const h = 0.55 * L;
    const line = ([x, y]: P) => stroke([x, y - h], [x, y + h]);
    const at = [along(pts[0], pts[1], 0.5), along(pts[2], pts[3], 0.5)];
    const s = read(figure([stroke(...pts), stroke(...off(pts[0], pts[1], -1)), stroke(...off(pts[2], pts[3], 1)), line(at[0]), line(at[1])], word("_2", [at[1][0] + 0.25 * L, at[1][1] + h])));
    expect(saysRepeat(s)).toBe(false);
    expect(bondsOf(s)).toEqual(["C-C", "C-C", "C=C", "C=C", "C=C"]);
  });

  describe("is no bracket where one of its tests fails, each with a count by its lower end", () => {
    // (a bond A-B of a chain - its ends the chain's - and a line across its middle, upright, a bracket's height, its count at its
    // foot: found; each case below changes one thing of it, and is not)
    const A: P = [100, 100];
    const B: P = [100 + L, 100];
    const x = 100 + L / 2;
    const h = 0.55 * L;
    const foot = (end: P) => word("_6", [end[0] + 0.25 * L, end[1]]);
    const bracketed = (paths: FigurePath[], letters: FigureLetter[]) => {
      const f = figure([stroke(step(A, 150), A, B, step(B, 30)), ...paths], letters);
      const r = repeatBrackets(shapesOf(f), wordsOf(f.letters), L);
      return { counts: r.counts.size, lines: r.strokes.size + r.curves.size };
    };
    const upright = (half: number): [P, P] => [[x, 100 - half], [x, 100 + half]];

    it("is one, as drawn: the control", () => {
      const [top, low] = upright(h);
      expect(bracketed([stroke(top, low)], foot(low))).toEqual({ counts: 1, lines: 1 });
    });

    it("is none too short or too long: 0.3 bond, 3 bonds", () => {
      for (const half of [0.15 * L, 1.5 * L]) {
        const [top, low] = upright(half);
        expect(bracketed([stroke(top, low)], foot(low)), `${half / L}`).toEqual({ counts: 0, lines: 0 });
      }
    });

    it("is none across a bond at 30 degrees, nor across it near its end, nor meeting it near its own", () => {
      const r = 1.1 * L * 0.5;
      const [c, s] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
      const low: P = [x + r * c, 100 + r * s];
      expect(bracketed([stroke([x - r * c, 100 - r * s], low)], foot(low))).toEqual({ counts: 0, lines: 0 });
      const near: P = [100 + 0.05 * L, 100 + h];
      expect(bracketed([stroke([100 + 0.05 * L, 100 - h], near)], foot(near))).toEqual({ counts: 0, lines: 0 });
      // (nor one that meets it near its own end, as a T: no line across it)
      const t: P = [x, 100 + 1.05 * L];
      expect(bracketed([stroke([x, 100 - 0.05 * L], t)], foot(t))).toEqual({ counts: 0, lines: 0 });
    });

    it("is none whose end is a wedge's, a label's, or another line's - as a chain's bond, crossed by a bracket, is", () => {
      const [top, low] = upright(h);
      expect(bracketed([stroke(top, low), wedge(top, [top[0] + L, top[1]])], foot(low))).toEqual({ counts: 0, lines: 0 });
      expect(bracketed([stroke(top, low)], [...foot(low), ...word("O", [top[0], top[1] - 0.3 * L])])).toEqual({ counts: 0, lines: 0 });
      expect(bracketed([stroke(top, low), stroke(top, [top[0] + 0.6 * L, top[1]])], foot(low))).toEqual({ counts: 0, lines: 0 });
      // (another line's end a twentieth of a bond from its own, not at it: not free either)
      expect(bracketed([stroke(top, low), stroke([top[0] + 0.05 * L, top[1]], [top[0] + 0.65 * L, top[1]])], foot(low))).toEqual({ counts: 0, lines: 0 });
      // (the chain's bond a bracket crosses: never taken for the bracket - its ends meet the chain's other bonds - the bracket is)
      const f = counted(false, "_6");
      const r = repeatBrackets(shapesOf(f), wordsOf(f.letters), L);
      expect([...r.strokes].filter((t) => Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) > 0.9 * L).every((t) => Math.abs(t.a.x - t.b.x) < 1e-6)).toBe(true);
    });

    it("is none counted with four digits, nor with its count above its foot, nor a bond below it", () => {
      const [top, low] = upright(h);
      expect(bracketed([stroke(top, low)], word("_1_2_3_4", [low[0] + 0.25 * L, low[1]]))).toEqual({ counts: 0, lines: 0 });
      expect(bracketed([stroke(top, low)], word("_6", [low[0] + 0.2 * L, low[1] - 0.7 * L]))).toEqual({ counts: 0, lines: 0 });
      expect(bracketed([stroke(top, low)], word("6", [low[0], low[1] + L]))).toEqual({ counts: 0, lines: 0 });
    });

    it("is none that is a closed curve - a ring's circle across a bond, or a D, a round bracket closed by its chord", () => {
      const low: P = [x + 0.18 * L, 100 + h];
      expect(bracketed([circle([x, 100], h)], foot(low))).toEqual({ counts: 0, lines: 0 });
      const t = 0.18 * L;
      const d: FigurePath = { fill: null, stroke: "#000000ff", width: 0.6, d: [["M", x + t, 100 - h], ["C", x - t, 100 - h / 2], ["C", x - t, 100 + h / 2], ["C", x + t, 100 + h], ["Z"]] };
      expect(bracketed([d], foot(low))).toEqual({ counts: 0, lines: 0 });
      // (the same arc left open: a round bracket, found)
      expect(bracketed([{ ...d, d: d.d.slice(0, -1) }], foot(low))).toEqual({ counts: 1, lines: 1 });
    });
  });

  it("pairs a counted bracket with the nearest one uncounted, never with another counted - each taken, none left a bond", () => {
    // (three across a long chain's bonds: the first and second counted, the third not, the second nearer the first than the third)
    const p0: P = [40, 80];
    const pts = [p0];
    for (let k = 0; k < 7; k++) pts.push(step(pts[k], k % 2 ? 30 : -30));
    const h = 0.55 * L;
    const at = (k: number) => along(pts[k], pts[k + 1], 0.5);
    const line = ([x, y]: P) => stroke([x, y - h], [x, y + h]);
    // (counted with letters, read once each, so that what each pairs with shows in the atoms it marks)
    const f = figure([stroke(...pts), line(at(1)), line(at(2)), line(at(5))], [...word("_m", [at(1)[0] + 0.25 * L, at(1)[1] + h]), ...word("_n", [at(2)[0] + 0.25 * L, at(2)[1] + h])]);
    const s = read(f);
    // (every bracket taken: the chain's seven bonds alone, none of the brackets' lines one)
    expect(s.bonds.length).toBe(7);
    expect(s.atoms.length).toBe(8);
    // (the first's count on its bond's atoms and its partner's - the third's - the second's on its own alone)
    expect([marked(s, "m"), marked(s, "n")]).toEqual([4, 2]);
  });

  it("pairs a counted bracket with the nearer of two uncounted, the farther read as before", () => {
    // (three across a long chain's bonds: the first counted, the second and third not, the second the nearer)
    const p0: P = [40, 80];
    const pts = [p0];
    for (let k = 0; k < 7; k++) pts.push(step(pts[k], k % 2 ? 30 : -30));
    const h = 0.55 * L;
    const at = (k: number) => along(pts[k], pts[k + 1], 0.5);
    const line = ([x, y]: P) => stroke([x, y - h], [x, y + h]);
    const f = figure([stroke(...pts), line(at(1)), line(at(3)), line(at(6))], word("_6", [at(1)[0] + 0.25 * L, at(1)[1] + h]));
    const r = repeatBrackets(shapesOf(f), wordsOf(f.letters), L);
    const taken = (k: number) => [...r.strokes].some((t) => Math.abs(t.a.x - at(k)[0]) < 1e-6 && Math.abs(t.b.x - at(k)[0]) < 1e-6);
    expect([taken(1), taken(3), taken(6)]).toEqual([true, true, false]);
  });

  it("marks the atoms of a bond two brackets cross once each", () => {
    // (a counted bracket and its partner both across one bond of HO-C-C-C-OH)
    const p0: P = [40, 80];
    const pts = [p0];
    for (let k = 0; k < 4; k++) pts.push(step(pts[k], k % 2 ? 30 : -30));
    const h = 0.55 * L;
    const line = ([x, y]: P) => stroke([x, y - h], [x, y + h]);
    const [x1, x2] = [along(pts[2], pts[3], 0.2), along(pts[2], pts[3], 0.8)];
    const s = read(figure([stroke(...pts), line(x1), line(x2)], [...word("O", p0), ...word("O", pts[4]), ...word("_6", [x2[0] + 0.25 * L, x2[1] + h])]));
    expect(bondsOf(s)).toEqual(["C-C", "C-C", "C-O", "O-C"]);
    const same = REPEAT_REFUSED("6", "its two brackets cross the same bond");
    expect(refused(s, "6", "its two brackets cross the same bond")).toBe(2);
    expect(s.atoms.map((a) => (a.unsure ?? []).filter((u) => u === same).length).sort()).toEqual([0, 0, 0, 1, 1]);
  });

  it("gives a count in reach of two brackets' feet to the nearer, the other its partner - neither left a bond", () => {
    // (the same, the brackets closer: the count by the second's foot is in reach of the first's too, the first drawn first)
    const p0: P = [40, 80];
    const pts = [p0];
    for (let k = 0; k < 4; k++) pts.push(step(pts[k], k % 2 ? 30 : -30));
    const h = 0.55 * L;
    const line = ([x, y]: P) => stroke([x, y - h], [x, y + h]);
    const [x1, x2] = [along(pts[2], pts[3], 0.3), along(pts[2], pts[3], 0.7)];
    const s = read(figure([stroke(...pts), line(x1), line(x2)], [...word("O", p0), ...word("O", pts[4]), ...word("_6", [x2[0] + 0.25 * L, x2[1] + h])]));
    expect(bondsOf(s)).toEqual(["C-C", "C-C", "C-O", "O-C"]);
    expect(refused(s, "6", "its two brackets cross the same bond")).toBe(2);
  });

  it("reads a square bracket's ticks as no bonds, however long they are drawn short of half a bond", () => {
    const p0: P = [40, 80];
    const pts = [p0, step(p0, -30), step(step(p0, -30), 30), step(step(step(p0, -30), 30), -30)];
    const [h, t] = [0.55 * L, 0.4 * L];
    const [x, y] = along(pts[1], pts[2], 0.5);
    const f = figure([stroke(...pts), stroke([x + t, y - h], [x, y - h], [x, y + h], [x + t, y + h])], word("_6", [x + 0.25 * L, y + h + 0.2 * L]));
    const s = read(f);
    expect(s.bonds.length).toBe(3);
    expect(s.atoms.length).toBe(4);
  });

  it("is not seen where there is no count - lines across a bond read as before - nor where a number stands by no bracket", () => {
    const uncounted = read(counted(false, null));
    expect(uncounted.atoms.some((a) => a.unsure?.some((u) => u.startsWith("A repeat unit")))).toBe(false);
    expect(uncounted.bonds.length).toBe(7);
    // (a compound's number under it, by no bracket: its own word, left as it was)
    const p0: P = [40, 80];
    const f = figure([stroke(p0, step(p0, -30), step(step(p0, -30), 30))], word("6", [step(p0, -30)[0], step(p0, -30)[1] + 1.5 * L]));
    expect(read(f).atoms.some((a) => a.unsure)).toBe(false);
    expect(readFigure(f).left.letters.map((l) => l.c)).toEqual(["6"]);
  });
});
