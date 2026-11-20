/**
 * Held beside read.test.ts: the edges of the two new rules the tests leave open - a row of dashes (each longer than 0.3 bond, not drawn
 * dashed, within 0.05 bond of its line, restarting after a break, an atom said once, only within 0.35 bond of its end) and a curved arrow
 * (a dart's cut-in corner within the curve's width and a sixth of the dart's length of its end, four corners, a blob round or a ring's
 * circle no curve). (Found in review.)
 */
import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { shapesOf } from "./drawn";
import { DASHED_ROW, readFigure } from "./read";

const L = 14.4;
type P = [number, number];
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
const filled = (...pts: P[]): FigurePath => ({ fill: "#000000ff", stroke: null, width: 0, d: [...pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]), ["Z"]] });
const step = (p: P, deg: number, n = 1): P => [p[0] + n * L * Math.cos((deg * Math.PI) / 180), p[1] - n * L * Math.sin((deg * Math.PI) / 180)];
const figure = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({ paths, letters, pictures: [] });
// (a ring's circle, drawn with curved steps and closed)
const circle = ([cx, cy]: P, r: number): FigurePath => ({
  fill: null, stroke: "#000000ff", width: 0.6,
  d: [["M", cx + r, cy], ...Array.from({ length: 24 }, (_, k): PathStep => ["C", cx + r * Math.cos(((k + 1) * Math.PI) / 12), cy + r * Math.sin(((k + 1) * Math.PI) / 12)]), ["Z"]] as PathStep[],
});

describe("a row of dashes, at its edges", () => {
  // (a chain of two bonds ending at `end`)
  const left: P[] = [[40, 60], step([40, 60], 30), step(step([40, 60], 30), -30)];
  const end = left[2];
  const chain = [stroke(left[0], left[1]), stroke(left[1], left[2])];
  /** Short lines level to the right from `from`: (start, length) in bonds, each, 0.6 thick, up `off` bonds - in the list `off` for each. */
  const bars = (from: P, spans: [number, number, number?][], dir: P = [1, 0]): FigurePath[] =>
    spans.map(([a, l, off = 0]) => {
      const [ux, uy] = dir;
      const p: P = [from[0] + ux * a * L - uy * off * L, from[1] + uy * a * L + ux * off * L];
      return stroke(p, [p[0] + ux * l * L, p[1] + uy * l * L]);
    });
  const said = (paths: FigurePath[], base = chain) => readFigure(figure([...base, ...paths])).atoms.some((a) => a.unsure?.includes(DASHED_ROW));

  it("dashes longer than 0.3 of a bond - up to 0.4 - are a row too, no bond of any: three of 0.35, 0.1 apart", () => {
    const f = readFigure(figure([...chain, ...bars([end[0] + 0.12 * L, end[1]], [[0, 0.35], [0.45, 0.35], [0.9, 0.35]])]));
    expect(f.atoms.some((a) => a.unsure?.includes(DASHED_ROW))).toBe(true);
    expect(f.bonds).toHaveLength(2);
    expect(f.atoms).toHaveLength(3);
  });

  it("is not three dashes drawn dashed themselves: they are as they were", () => {
    const dashed = bars([end[0] + 0.12 * L, end[1]], [[0, 0.2], [0.3, 0.2], [0.6, 0.2]]).map((p) => ({ ...p, dash: true }) as FigurePath);
    expect(said(dashed)).toBe(false);
    expect(said(bars([end[0] + 0.12 * L, end[1]], [[0, 0.2], [0.3, 0.2], [0.6, 0.2]]))).toBe(true);
  });

  it("is not three dashes zigzagging 0.15 of a bond off one line: they lie on it within a twentieth", () => {
    expect(said(bars([end[0] + 0.12 * L, end[1]], [[0, 0.2, 0], [0.3, 0.2, 0.15], [0.6, 0.2, 0]]))).toBe(false);
    expect(said(bars([end[0] + 0.12 * L, end[1]], [[0, 0.2, 0], [0.3, 0.2, 0.03], [0.6, 0.2, 0]]))).toBe(true);
  });

  it("is found after two dashes and a break: two, a gap longer than a dash, then four are a row of four - its far end said", () => {
    // (a second chain begins a tenth of a bond past the row's far end)
    const far: P = [end[0] + 0.12 * L + 2.15 * L, end[1]];
    const chain2 = [stroke(far, step(far, 30)), stroke(step(far, 30), step(step(far, 30), -30))];
    const dashes = bars([end[0] + 0.12 * L, end[1]], [[0, 0.2], [0.3, 0.2], [0.95, 0.2], [1.25, 0.2], [1.55, 0.2], [1.85, 0.2]]);
    const f = readFigure(figure([...chain, ...chain2, ...dashes]));
    const marked = f.atoms.filter((a) => a.unsure?.includes(DASHED_ROW));
    expect(marked.map((a) => Math.round(a.x))).toContain(Math.round(far[0]));
  });

  it("says the atom at an end only within a third of a bond of it: a row beginning 0.5 of a bond from the atom says none, 0.3 says it", () => {
    expect(said(bars([end[0] + 0.5 * L, end[1]], [[0, 0.2], [0.3, 0.2], [0.6, 0.2]]))).toBe(false);
    expect(said(bars([end[0] + 0.3 * L, end[1]], [[0, 0.2], [0.3, 0.2], [0.6, 0.2]]))).toBe(true);
  });

  it("says an atom once, though two rows end at it", () => {
    const f = readFigure(figure([...chain, ...bars([end[0] + 0.12 * L, end[1]], [[0, 0.2], [0.3, 0.2], [0.6, 0.2]]), ...bars([end[0], end[1] + 0.12 * L], [[0, 0.2], [0.3, 0.2], [0.6, 0.2]], [0, 1])]));
    const marked = f.atoms.filter((a) => a.unsure?.includes(DASHED_ROW));
    expect(marked.length).toBeGreaterThan(0);
    for (const a of marked) expect(a.unsure!.filter((u) => u === DASHED_ROW)).toHaveLength(1);
  });
});

describe("a curved arrow's head, at its edges", () => {
  // (the curve and its dart as the tests have them: an arc of 0.35 bond's radius, its dart at the end, notch there, tip 5 on, base 6 back)
  const c: P = [80 + 0.5 * L, 80 - 0.9 * L];
  const r = 0.35 * L;
  const on = (rad: number, deg: number): P => [c[0] + rad * Math.cos((deg * Math.PI) / 180), c[1] - rad * Math.sin((deg * Math.PI) / 180)];
  const degs = Array.from({ length: 13 }, (_, k) => 200 - 10 * k);
  const end = on(r, 80);
  const way: P = [Math.sin((80 * Math.PI) / 180), Math.cos((80 * Math.PI) / 180)];
  const curve: FigurePath = { fill: null, stroke: "#000000ff", width: 0.6, d: degs.map((d, k): PathStep => [k ? "C" : "M", ...on(r, d)]) };
  /** The dart with its notch `d` points on from the curve's end along its way, `cut` of its length cut in (0.17 as the tests have it). */
  const dart = (d: number, long = 5, cut = 1 / 6, wide = 2): FigurePath => {
    const notch: P = [end[0] + d * way[0], end[1] + d * way[1]];
    const tip: P = [notch[0] + long * way[0], notch[1] + long * way[1]];
    const total = long / (1 - cut);
    const back: P = [tip[0] - total * way[0], tip[1] - total * way[1]];
    return filled([back[0] - wide * way[1], back[1] + wide * way[0]], notch, [back[0] + wide * way[1], back[1] - wide * way[0]], tip);
  };
  const ring: P[] = Array.from({ length: 6 }, (_, i) => step([80, 80], 60 * i));
  const lines = ring.map((p, i) => stroke(p, ring[(i + 1) % 6]));
  const shapes = (...extra: FigurePath[]) => shapesOf(figure([...lines, ...extra]));

  it("takes the dart whose notch is within the curve's width and a sixth of the dart's length of its end - 1.2 points - and not 2.4", () => {
    const near = shapes(curve, dart(1.2));
    expect(near.wedges).toHaveLength(0);
    expect(near.curves).toHaveLength(0);
    const far = shapes(curve, dart(2.4));
    expect(far.wedges).toHaveLength(1);
    expect(far.curves).toHaveLength(1);
  });

  it("holds a small dart to half a point and the width: a dart 2 points long, its notch 1.0 from the curve's end, goes with it", () => {
    const small = shapes(curve, dart(1.0, 1.7, 1 / 6, 0.8));
    expect(small.wedges).toHaveLength(0);
  });

  it("is a dart whose corners are four however the program repeats the first: a closing point 0.0005 off the first", () => {
    const d = dart(0);
    const again: FigurePath = { ...d, d: [...d.d.slice(0, -1), ["L", (d.d[0][1] as number) + 0.0005, d.d[0][2] as number], ["Z"]] as PathStep[] };
    expect(shapes(curve, again).wedges).toHaveLength(0);
  });

  it("is no curve, a closed one: a ring's circle at a dart's notch leaves the dart a wedge", () => {
    const d = dart(0);
    expect(shapes(circle([end[0] + 3, end[1]], 3), d).wedges).toHaveLength(1);
  });

  it("is no curve, a filled round blob drawn with curved steps: a dot at a dart's notch leaves the dart a wedge", () => {
    const dot: FigurePath = { fill: "#000000ff", stroke: null, width: 0, d: [["M", end[0] + 0.7, end[1]], ...Array.from({ length: 24 }, (_, k): PathStep => ["C", end[0] + 0.7 * Math.cos(((k + 1) * Math.PI) / 12), end[1] + 0.7 * Math.sin(((k + 1) * Math.PI) / 12)]), ["Z"]] as PathStep[] };
    expect(shapes(dot, dart(0)).wedges).toHaveLength(1);
  });
});
