/**
 * A dative bond drawn as an arrow from its donor to its acceptor - a short line, a small filled head, and in some styles a dot at the
 * line's tail - read as one dative bond, never as bonds and a wedge, nor as a scheme's arrow; an arrow with no atom at one end is no
 * bond, and the atom at its other end says so (docs/PDF.md, *A dative bond*).
 */
import { describe, expect, it } from "vitest";
import type { Box, FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { shapesOf } from "./drawn";
import { DATIVE_UNREAD, dativeArrows, readFigure } from "./read";
import { readScheme } from "./scheme";
import { readDrawnLabel, structureOf, type LabelReader } from "./structure";

// (a figure drawn as a drawing program draws one, in points from the page's top left, y down: bonds 14.4 long, lines 0.6 thick,
//  labels in 10-point letters)
const L = 14.4;
type P = [number, number];
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
const filled = (...pts: P[]): FigurePath => ({ fill: "#000000ff", stroke: null, width: 0, d: [...pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]), ["Z"]] });
const unit = (p: P, q: P): P => {
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
  return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
};
/** A filled triangle from its point to its base, `wide` across the base. */
const triangle = (tip: P, base: P, wide: number): FigurePath => {
  const [ux, uy] = unit(tip, base);
  return filled(tip, [base[0] - (uy * wide) / 2, base[1] + (ux * wide) / 2], [base[0] + (uy * wide) / 2, base[1] - (ux * wide) / 2]);
};
/** A dative bond's arrow from `from` to `to`: its line, and a head 0.25 of a bond long and 0.15 of one wide at its point. */
const arrow = (from: P, to: P): FigurePath[] => {
  const [ux, uy] = unit(from, to);
  const base: P = [to[0] - ux * 0.25 * L, to[1] - uy * 0.25 * L];
  return [stroke(from, base), triangle(to, base, 0.15 * L)];
};
/** Letters set from a point, the first's middle there; `_3` a subscript. */
function word(text: string, [x, y]: P): FigureLetter[] {
  const out: FigureLetter[] = [];
  let left = x - 3.4;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    let size = 10;
    let base = y + 3.6;
    if (c === "_") {
      c = text[++i];
      size = 7;
      base = y + 6;
    }
    const w = size * 0.68;
    const box: Box = [left, base - size * 0.72, left + w, base];
    out.push({ c, box, at: [left, base], size });
    left += w;
  }
  return out;
}
const figure = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({ paths, letters, pictures: [] });
const reads: LabelReader = (label) => {
  const m = /^([A-Z][a-z]?)(H\d*)?$/.exec(label);
  return m && ["N", "Pt", "Cl", "P", "B"].includes(m[1]) ? { el: m[1], charge: 0 } : null;
};
const labelled = (f: FigureDrawn) => readFigure(f, (l) => readDrawnLabel(l, reads).read);

// (a Pt at 100,100 with a chain of two bonds off to its right, and an NH3 below it: the arrow from the NH3's label up to the Pt's)
const pt: P = [100, 100];
const chain = [stroke([108, 100], [100 + L, 100]), stroke([100 + L, 100], [100 + L + L * 0.866, 100 - L / 2])];
const amminePt = (paths: FigurePath[] = arrow([100, 100 + 1.2 * L - 5], [100, 105])) => figure([...chain, ...paths], [...word("Pt", pt), ...word("NH_3", [100, 100 + 1.2 * L])]);

describe("a dative bond's arrow", () => {
  it("is one dative bond, from the atom at its tail to the atom at its point: no bond and wedge, no carbon of its own", () => {
    const r = labelled(amminePt());
    const at = (label: string) => r.atoms.findIndex((a) => a.label === label);
    expect(r.atoms.map((a) => a.label ?? "C").sort()).toEqual(["C", "C", "NH3", "Pt"]);
    expect(r.bonds.filter((b) => b.dative)).toEqual([{ a: at("NH3"), b: at("Pt"), order: 1, dative: true }]);
    expect(r.bonds.filter((b) => !b.dative).length).toBe(2);
  });

  it("is read so with a dot at its tail too, as some styles draw one", () => {
    // (a disc filled, as a drawing program writes one: four curves, each its two handles and its end)
    const dot = ([cx, cy]: P, r: number): FigurePath => {
      const k = 0.5523 * r;
      return {
        fill: "#000000ff",
        stroke: null,
        width: 0,
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
    const r = labelled(amminePt([...arrow([100, 100 + 1.2 * L - 5], [100, 105]), dot([100, 100 + 1.2 * L - 5], 0.3)]));
    expect(r.bonds.filter((b) => b.dative).length).toBe(1);
    expect(r.atoms.length).toBe(4);
  });

  it("leaves its donor its own hydrogens, and says nothing of its atoms: an NH3 by a platinum keeps its three", () => {
    const s = structureOf(labelled(amminePt()), reads);
    const n = s.atoms.findIndex((a) => a.el === "N");
    expect(s.bonds.filter((b) => b.dative).map((b) => [s.atoms[b.a].el, s.atoms[b.b].el])).toEqual([["N", "Pt"]]);
    expect(s.atoms[n].unsure).toBeUndefined();
    // (an amine's N lending its pair to a borane's B: each keeps its three hydrogens, and neither has more bonds than it takes)
    const borane = figure([...arrow([100, 100 + 1.2 * L - 5], [100, 105])], [...word("BH_3", pt), ...word("NH_3", [100, 100 + 1.2 * L])]);
    const b = structureOf(labelled(borane), reads);
    expect(b.atoms.filter((a) => a.unsure)).toEqual([]);
    expect(b.bonds.filter((x) => x.dative).length).toBe(1);
  });

  it("with no atom at its point is no bond, and the atom at its tail says so - never left out unsaid", () => {
    const r = labelled(figure(arrow([100, 100 + 1.2 * L - 5], [100, 100 + 0.2 * L]), word("NH_3", [100, 100 + 1.2 * L])));
    expect(r.bonds).toEqual([]);
    expect(r.atoms.map((a) => [a.label, a.unsure])).toEqual([["NH3", [DATIVE_UNREAD]]]);
    // (an arrow beside a bond already drawn between its two atoms is no second bond, and says nothing untrue of an end without one)
    const twice = labelled(amminePt([stroke([97, 100 + 1.2 * L - 5], [97, 105]), ...arrow([102, 100 + 1.2 * L - 5], [102, 105])]));
    expect(twice.bonds.filter((b) => b.dative)).toEqual([]);
    expect(twice.atoms.flatMap((a) => a.unsure ?? [])).toEqual([]);
  });

  it("is no scheme's arrow where an atom is at each end; a scheme's arrow, three bonds long between two structures, still is", () => {
    const s = readScheme(amminePt(), (l) => readDrawnLabel(l, reads).read);
    expect(s.arrows).toEqual([]);
    expect(s.figure.bonds.filter((b) => b.dative).length).toBe(1);
    // (two chains of three, an arrow three bonds long between them, its head as a scheme's is: a scheme)
    const chain = (x: number) => [stroke([x, 100], [x + L * 0.866, 100 - L / 2]), stroke([x + L * 0.866, 100 - L / 2], [x + 2 * L * 0.866, 100])];
    const reaction = figure([...chain(40), stroke([80, 100], [80 + 3 * L - 4, 100]), triangle([80 + 3 * L, 100], [80 + 3 * L - 4, 100], 3), ...chain(140)]);
    expect(readScheme(reaction).arrows.length).toBe(1);
  });

  it("is no wedge bond's: a wedge is long for its width, a head short", () => {
    // (a wedge a bond long, 4 wide at its base, a line on from its base along it: a wedge and a bond, no arrow)
    const s = shapesOf(figure([stroke([100, 100], [100 + L, 100]), triangle([100 + 2 * L, 100], [100 + L, 100], 4)]));
    expect(dativeArrows(s, L)).toEqual([]);
    // (nor a short wedge thin for its length - under half a bond, but over three times as long as it is wide: a wedge cut back at a label)
    const thin = shapesOf(figure([stroke([100, 100], [100 + L, 100]), triangle([100 + L + 6.5, 100], [100 + L, 100], 1.3)]));
    expect(dativeArrows(thin, L)).toEqual([]);
    // (the same, its head a quarter of a bond long: an arrow)
    const a = shapesOf(figure([stroke([100, 100], [100 + L, 100]), triangle([100 + 1.25 * L, 100], [100 + L, 100], 0.15 * L)]));
    expect(dativeArrows(a, L).map((d) => [Math.round(d.from.x), Math.round(d.to.x)])).toEqual([[100, Math.round(100 + 1.25 * L)]]);
  });
});
