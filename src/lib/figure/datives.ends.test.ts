// Held beside datives.test.ts: what is no dative bond's arrow - a line longer than a bond and a fifth, a head turned off the line, a short
// arrow with one atom at both its ends - and an arrow with an atom at its point alone says so as one with an atom at its tail alone does.
import { describe, expect, it } from "vitest";
import type { Box, FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { DATIVE_UNREAD, readFigure } from "./read";
import { readDrawnLabel, type LabelReader } from "./structure";

// (a figure as a drawing program draws one, in points from the page's top left, y down: bonds 14.4 long, lines 0.6 thick, 10-point letters)
const L = 14.4;
type P = [number, number];
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
const filled = (...pts: P[]): FigurePath => ({ fill: "#000000ff", stroke: null, width: 0, d: [...pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]), ["Z"]] });
const unit = (p: P, q: P): P => {
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
  return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
};
const triangle = (tip: P, base: P, wide: number): FigurePath => {
  const [ux, uy] = unit(tip, base);
  return filled(tip, [base[0] - (uy * wide) / 2, base[1] + (ux * wide) / 2], [base[0] + (uy * wide) / 2, base[1] - (ux * wide) / 2]);
};
/** An arrow from `from` to `to`: its line, and a head 0.25 of a bond long and 0.15 of one wide at its point, its axis `turned` radians off the line's. */
const arrow = (from: P, to: P, turned = 0): FigurePath[] => {
  const [ux, uy] = unit(from, to);
  const base: P = [to[0] - ux * 0.25 * L, to[1] - uy * 0.25 * L];
  const [c, s] = [Math.cos(turned), Math.sin(turned)];
  const tip: P = [base[0] + (ux * c - uy * s) * 0.25 * L, base[1] + (ux * s + uy * c) * 0.25 * L];
  return [stroke(from, base), triangle(turned ? tip : to, base, 0.15 * L)];
};
function word(text: string, [x, y]: P): FigureLetter[] {
  const out: FigureLetter[] = [];
  let left = x - 3.4;
  for (const c of text) {
    const box: Box = [left, y + 3.6 - 7.2, left + 6.8, y + 3.6];
    out.push({ c, box, at: [left, y + 3.6], size: 10 });
    left += 6.8;
  }
  return out;
}
const figure = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({ paths, letters, pictures: [] });
const reads: LabelReader = (label) => (["N", "Pt", "Cl", "P"].includes(label) ? { el: label, charge: 0 } : null);
const labelled = (f: FigureDrawn) => readFigure(f, (l) => readDrawnLabel(l, reads).read);

const pt: P = [100, 100];
const chain = [stroke([108, 100], [100 + L, 100]), stroke([100 + L, 100], [100 + L + L * 0.866, 100 - L / 2])];
// (more bonds, so that the drawing's own bond is the 14.4 the arrows are measured by)
const zigzag = [0, 1, 2, 3].map((i): FigurePath => stroke([140 + i * L * 0.866, 100 + (i % 2 ? L / 2 : 0)], [140 + (i + 1) * L * 0.866, 100 + (i % 2 ? 0 : L / 2)]));
const datives = (f: FigureDrawn) => labelled(f).bonds.filter((b) => b.dative);

describe("what is no dative bond's arrow", () => {
  it("is read as one when it is a line a bond and a fifth long at most with a head along it - the control", () => {
    expect(datives(figure([...chain, ...zigzag, ...arrow([100, 100 + 1.1 * L], [100, 105])], [...word("Pt", pt), ...word("N", [100, 100 + 1.2 * L])]))).toHaveLength(1);
  });

  it("a line much longer than a bond and a fifth, between an N and a Pt, is none", () => {
    expect(datives(figure([...chain, ...zigzag, ...arrow([100, 100 + 2.5 * L], [100, 105])], [...word("Pt", pt), ...word("N", [100, 100 + 2.6 * L])]))).toEqual([]);
  });

  it("a head turned well off the line is none", () => {
    expect(datives(figure([...chain, ...zigzag, ...arrow([100, 100 + 1.1 * L], [100, 105], (50 * Math.PI) / 180)], [...word("Pt", pt), ...word("N", [100, 100 + 1.2 * L])]))).toEqual([]);
  });

  it("a short arrow with the one atom at both its ends is no bond to itself, and says nothing of an end without an atom", () => {
    const r = labelled(figure([...chain, ...zigzag, ...arrow([100, 100 + 0.62 * L], [100, 100 + 0.2 * L])], word("Pt", pt)));
    expect(r.bonds.filter((b) => b.a === b.b)).toEqual([]);
    expect(r.bonds.filter((b) => b.dative)).toEqual([]);
    expect(r.atoms.flatMap((a) => a.unsure ?? [])).not.toContain(DATIVE_UNREAD);
  });
});

describe("an arrow with an atom at one end only", () => {
  it("says so on the atom at its point as on the one at its tail: the Pt, with no atom where the arrow starts", () => {
    const r = labelled(figure([...chain, ...zigzag, ...arrow([100, 100 + 1.4 * L], [100, 105])], word("Pt", pt)));
    expect(r.bonds.filter((b) => b.dative)).toEqual([]);
    expect(r.atoms.filter((a) => a.label === "Pt").map((a) => a.unsure)).toEqual([[DATIVE_UNREAD]]);
  });
});
