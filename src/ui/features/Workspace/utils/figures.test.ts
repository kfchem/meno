import { readFileSync } from "node:fs";
import { parse } from "opentype.js/dist/opentype.mjs";
import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "../../../../lib/figure/drawn";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Model } from "../store/types";
import { readDrawn } from "./copyPaste";
import { structureFileText } from "../fileActions";
import esterification from "../../../../lib/figure/fixtures/esterification-rdkitrxn.json";
import { WRITTEN_AS_WORDS } from "../../../../lib/figure/scheme";
import { glyphShape, LETTERS, type GlyphShape } from "../../../../lib/figure/glyphs";
import { plusMeasures, plusOutline } from "../../../../lib/chem/reactionScheme";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { atomAs, atomAtSpot, bondAs, figureFrom, lettersAsShapes, placedBeside, readMarks, regionOf, wholeLabel, type FigureResult, type Unread } from "./figures";
import { measured } from "../../../../testing/timeouts";
import { readMolfile } from "../../../../lib/chem/ctfile";
import { identityOfDrawn } from "../chem/identityOf";
import { partFormula } from "../chem/cleanUp";

/** What a figure as drawn reads as: its structure, or why there is none. */
const structureFrom = (drawn: FigureDrawn, sha: string, page: number): Model | Unread => {
  const r = figureFrom(drawn, sha, page);
  return "none" in r ? r : r.model;
};

const SHA = "a".repeat(64);
const L = 14.4;
type P = [number, number];
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
const wedge = (tip: P, base: P): FigurePath => {
  const l = Math.hypot(base[0] - tip[0], base[1] - tip[1]);
  const [ux, uy] = [(base[0] - tip[0]) / l, (base[1] - tip[1]) / l];
  return { fill: "#000000ff", stroke: null, width: 0, d: [["M", ...tip], ["L", base[0] - uy * 2, base[1] + ux * 2], ["L", base[0] + uy * 2, base[1] - ux * 2], ["Z"]] };
};
const step = (p: P, deg: number): P => [p[0] + L * Math.cos((deg * Math.PI) / 180), p[1] - L * Math.sin((deg * Math.PI) / 180)];
const letters = (text: string, [x, y]: P): FigureLetter[] =>
  [...text].map((c, i) => ({ c, box: [x - 3.4 + 6.8 * i, y - 3.6, x + 3.4 + 6.8 * i, y + 3.6], at: [x - 3.4 + 6.8 * i, y + 3.6], size: 10 }));

/** A branched chain with an OH at its end and a wedge, as drawn on page 2 of a PDF. */
function drawn(label = "OH"): FigureDrawn {
  const a: P = [100, 200];
  const b = step(a, 30);
  const c = step(b, -30);
  const o = step(c, 30);
  return {
    paths: [stroke(a, b, c), stroke(c, [c[0] + (o[0] - c[0]) * 0.55, c[1] + (o[1] - c[1]) * 0.55]), wedge(b, step(b, 90))],
    letters: letters(label, o),
    pictures: [],
  };
}

describe("a figure read as a structure for the page", () => {
  it("ties each atom to where it was drawn, a bond as long as Meno draws one", () => {
    const m = structureFrom(drawn(), SHA, 2) as Model;
    expect(m.atoms).toHaveLength(5);
    expect(m.atoms.every((a) => a.seen?.sha256 === SHA && a.seen.page === 2 && Math.abs(a.seen.bond - L) < 0.5)).toBe(true);
    const o = m.atoms.find((a) => a.el === "O")!;
    // (the O where its letter was drawn)
    expect(o.seen!.x).toBeCloseTo(100 + 3 * L * Math.cos(Math.PI / 6), 0);
    const [p, q] = [m.atoms[0], m.atoms[1]];
    const bond = m.bonds.find((x) => (x.a === p.id && x.b === q.id) || (x.a === q.id && x.b === p.id));
    if (bond) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(NOMINAL_BOND_LENGTH, 1);
    // (the wedge narrow at its stereocentre, the end the figure has it narrow at)
    const w = m.bonds.find((x) => x.stereo === "up")!;
    expect(m.bonds.filter((x) => x.a === w.a || x.b === w.a)).toHaveLength(3);
    expect(w.narrow).toBe(w.a);
  });

  it("reads a mass number set high before an element as its isotope, and a count set low before it as no one's", () => {
    // (the end of a chain: 18F, its 18 smaller and set high; then H3N with its H cut off by the box - a 3 set low before the N)
    const label = (digits: string, high: boolean, el: string, [x, y]: P): FigureLetter[] => [
      ...[...digits].map((c, i): FigureLetter => {
        const left = x - 3.4 - 4.2 * (digits.length - i);
        const base = high ? y - 1 : y + 6;
        return { c, box: [left, base - 5, left + 3.8, base], at: [left, base], size: 7 };
      }),
      ...letters(el, [x, y]),
    ];
    const a: P = [100, 200];
    const b = step(a, 30);
    const f = step(b, -30);
    const iso = structureFrom({ paths: [stroke(a, b, [b[0] + (f[0] - b[0]) * 0.45, b[1] + (f[1] - b[1]) * 0.45])], letters: label("18", true, "F", f), pictures: [] }, SHA, 1) as Model;
    expect(iso.atoms.find((x) => x.el === "F")?.isotope).toBe(18);
    const cut = structureFrom({ paths: [stroke(a, b, [b[0] + (f[0] - b[0]) * 0.45, b[1] + (f[1] - b[1]) * 0.45])], letters: label("3", false, "N", f), pictures: [] }, SHA, 1) as Model;
    expect(cut.atoms.find((x) => x.el === "N")?.isotope).toBeUndefined();
  });

  it("reads a metal whose every bond is drawn short between labels, shorter than its letters are tall", () => {
    // (a square-planar Pt, two N and two Cl round it, each bond under a third of its length between the labels)
    const pt: P = [120, 200];
    const ends = [0, 90, 180, 270].map((deg): P => [pt[0] + 1.4 * L * Math.cos((deg * Math.PI) / 180), pt[1] - 1.4 * L * Math.sin((deg * Math.PI) / 180)]);
    const part = (p: P, q: P, t: number): P => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const m = structureFrom(
      {
        paths: ends.map((e) => stroke(part(pt, e, 0.36), part(pt, e, 0.64))),
        letters: [...letters("Pt", pt), ...ends.flatMap((e, i) => letters(i % 2 ? "Cl" : "N", e))],
        pictures: [],
      },
      SHA,
      1,
    ) as Model;
    expect(m.atoms.map((a) => a.el).sort()).toEqual(["Cl", "Cl", "N", "N", "Pt"]);
    expect(m.bonds).toHaveLength(4);
  });

  it("reads a radical's dot by an atom as its unpaired electron, and a line's round end as none", () => {
    // (a nitroxide's N-O: the O's dot at its upper right, twice as wide as a line; a round end drawn at the chain's other end)
    const disc = ([cx, cy]: P, r: number): FigurePath => {
      const k = 0.5523 * r;
      return {
        fill: "#000000ff",
        stroke: null,
        width: 0,
        d: [["M", cx + r, cy], ["C", cx + r, cy + k], ["C", cx + k, cy + r], ["C", cx, cy + r], ["C", cx - k, cy + r], ["C", cx - r, cy + k], ["C", cx - r, cy], ["C", cx - r, cy - k], ["C", cx - k, cy - r], ["C", cx, cy - r], ["C", cx + k, cy - r], ["C", cx + r, cy - k], ["C", cx + r, cy], ["Z"]],
      };
    };
    const a: P = [100, 200];
    const b = step(a, 30);
    const o = step(b, -30);
    const m = structureFrom({ paths: [stroke(a, b, [b[0] + (o[0] - b[0]) * 0.6, b[1] + (o[1] - b[1]) * 0.6]), disc([o[0] + 5, o[1] - 3.5], 0.75), disc(a, 0.3)], letters: letters("O", o), pictures: [] }, SHA, 1) as Model;
    expect(m.atoms.find((x) => x.el === "O")?.radical).toBe("doublet");
    expect(m.atoms.filter((x) => x.radical)).toHaveLength(1);
  });

  it("says why there is nothing to read: no lines, or a picture", () => {
    expect(structureFrom({ paths: [], letters: [], pictures: [] }, SHA, 0)).toEqual({ none: "No structure is drawn there." });
    expect("none" in (structureFrom({ paths: [], letters: [], pictures: [[0, 0, 10, 10]] }, SHA, 0) as object)).toBe(true);
  });

  it("marks what was unsure while it is as it was read, and not once it is put right", () => {
    const m = structureFrom(drawn("Qz"), SHA, 0) as Model;
    const q = m.atoms.find((a) => a.el === "Qz")!;
    expect(readMarks(m).atoms.get(q.id)).toMatch(/not read/);
    // (made an oxygen: put right)
    const fixed = { ...m, atoms: m.atoms.map((a) => (a.id === q.id ? { ...a, el: "O" } : a)) };
    expect(readMarks(fixed).atoms.size).toBe(0);
    // (moved only: still as read)
    const moved = { ...m, atoms: m.atoms.map((a) => ({ ...a, x: a.x + 3 })) };
    expect(readMarks(moved).atoms.get(q.id)).toBeDefined();
  });

  it("knows a part by its chemistry: element, charge and bonds; order and stereo", () => {
    const bonds = [{ id: 3, a: 1, b: 2, order: 1 as const, stereo: "up" as const }];
    expect(atomAs({ id: 1, el: "C" }, bonds)).not.toBe(atomAs({ id: 2, el: "C" }, bonds));
    expect(bondAs({ a: 1, b: 2, order: 1, stereo: "up" })).not.toBe(bondAs({ a: 1, b: 2, order: 1, stereo: "down" }));
  });

  it("finds the atom drawn near a point of its page, and none further than a third of a bond", () => {
    const m = structureFrom(drawn(), SHA, 2) as Model;
    const o = m.atoms.find((a) => a.el === "O")!;
    expect(atomAtSpot(m, SHA, 2, o.seen!.x + 1, o.seen!.y - 1)).toBe(o.id);
    expect(atomAtSpot(m, SHA, 2, o.seen!.x + 6, o.seen!.y)).toBe(null);
    expect(atomAtSpot(m, SHA, 1, o.seen!.x, o.seen!.y)).toBe(null);
  });
});

describe("a bond's open end drawn short", () => {
  it("marks its atom unsure - a letter there not read, an I set alone, or a wavy line across it - never a methyl, sure; a chain's full-length end it leaves", () => {
    const a: P = [100, 200];
    const b = step(a, 30);
    const c = step(b, -30);
    const d = step(c, 30);
    const short: P = [c[0] + (d[0] - c[0]) * 0.6, c[1] + (d[1] - c[1]) * 0.6];
    const m = structureFrom({ paths: [stroke(a, b, c, short)], letters: [], pictures: [] }, SHA, 1) as Model;
    const said = m.atoms.map((x) => x.unsure?.said ?? []);
    expect(said.filter((w) => w.includes("Its bond is drawn short, as one to a label is, but no label is read at its end."))).toHaveLength(1);
    const full = structureFrom({ paths: [stroke(a, b, c, d)], letters: [], pictures: [] }, SHA, 1) as Model;
    expect(full.atoms.filter((x) => x.unsure)).toEqual([]);
  });
});

/** What is said of a read that puts five bonds on one carbon. */
const WHY_CARBON = "As read, more bonds meet at a carbon than it takes: none of it is taken.";

describe("a structure read whose atoms have more bonds than they take", () => {
  const disc = ([cx, cy]: P, r: number): FigurePath => {
    const k = 0.5523 * r;
    return {
      fill: "#000000ff",
      stroke: null,
      width: 0,
      d: [["M", cx + r, cy], ["C", cx + r, cy + k], ["C", cx + k, cy + r], ["C", cx, cy + r], ["C", cx - k, cy + r], ["C", cx - r, cy + k], ["C", cx - r, cy], ["C", cx - r, cy - k], ["C", cx - k, cy - r], ["C", cx, cy - r], ["C", cx + k, cy - r], ["C", cx + r, cy - k], ["C", cx + r, cy], ["Z"]],
    };
  };
  /** A line from `p` towards `q`, stopping `short` of it (a share of the way): where a label stands at `q`. */
  const towards = (p: P, q: P, share = 0.6): P => [p[0] + (q[0] - p[0]) * share, p[1] + (q[1] - p[1]) * share];
  /** A line beside another, `by` points to its left. */
  const beside = (p: P, q: P, by: number): [P, P] => {
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const [nx, ny] = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
    return [[p[0] + nx * by, p[1] + ny * by], [q[0] + nx * by, q[1] + ny * by]];
  };
  const bondsAt = (m: Model, id: number) => m.bonds.filter((b) => b.a === id || b.b === id).reduce((t, b) => t + b.order, 0);

  it("reads no radical from a dot by a carbon its four bonds fill: the dot is said, and the carbon is unsure", () => {
    const c: P = [150, 200];
    const ends: P[] = [step(c, 0), step(c, 90), step(c, 180), step(c, 270)];
    const m = structureFrom({ paths: [...ends.map((e) => stroke(c, e)), disc([c[0] + 4, c[1] - 4], 0.75)], letters: [], pictures: [] }, SHA, 1) as Model;
    const centre = m.atoms.find((a) => bondsAt(m, a.id) === 4)!;
    expect(m.atoms.filter((a) => a.radical)).toEqual([]);
    expect(centre.unsure?.said).toEqual(["A dot by it, but its bonds leave it no unpaired electron: no radical is read."]);
  });

  it("refuses a read that puts more bonds on a carbon than it takes - a line with a dashed line in two pieces beside it, read as three lines, its two other bonds besides - and says why", () => {
    const c: P = [150, 200];
    const end = step(c, 0);
    const [p, q] = beside(c, end, 1.8);
    const piece = (from: number, to: number): FigurePath => stroke([p[0] + (q[0] - p[0]) * from, p[1] + (q[1] - p[1]) * from], [p[0] + (q[0] - p[0]) * to, p[1] + (q[1] - p[1]) * to]);
    const others = [stroke(c, step(c, 150)), stroke(c, step(c, 210))];
    const m = structureFrom({ paths: [...others, stroke(c, end), piece(0, 0.3), piece(0.7, 1)], letters: [], pictures: [] }, SHA, 1) as Model;
    // (as many bonds as a carbon takes, or refused: never more put down)
    if ("none" in m) expect(m.none).toBe(WHY_CARBON);
    else expect(m.atoms.every((a) => bondsAt(m, a.id) <= 4)).toBe(true);
    const [x, y] = beside(c, end, -1.8);
    const three = structureFrom({ paths: [...others, stroke(c, end), stroke(p, q), stroke(x, y)], letters: [], pictures: [] }, SHA, 1);
    expect(three).toEqual({ none: WHY_CARBON });
  });

  it("leaves out only the structure that breaks valence where a figure holds others: each is its own, and the rest is read and said", () => {
    // (a carbon with five bonds, and a chain of three beside it)
    const c: P = [150, 200];
    const five = [0, 72, 144, 216, 288].map((d) => stroke(c, step(c, d)));
    const a: P = [300, 200];
    const chain = stroke(a, step(a, 30), step(step(a, 30), -30));
    const mixed = figureFrom({ paths: [...five, chain], letters: [], pictures: [] }, SHA, 1);
    expect("model" in mixed && mixed.model.atoms).toHaveLength(3);
    expect("model" in mixed && mixed.left).toBe("A structure of this figure was left out: as read, an atom has more bonds than it takes.");
    expect("model" in mixed && mixed.model.atoms.map((x) => x.id)).toEqual([1, 2, 3]);
    // (nothing to leave: the reason)
    expect(figureFrom({ paths: five, letters: [], pictures: [] }, SHA, 1)).toEqual({ none: WHY_CARBON });
  });

  it("keeps no more bonds to an oxygen's label than it takes, drawn with three, and marks it unsure", () => {
    const o: P = [150, 200];
    const ends = [step(o, 0), step(o, 120), step(o, 240)];
    const m = structureFrom({ paths: ends.map((e) => stroke(e, towards(e, o))), letters: letters("O", o), pictures: [] }, SHA, 1) as Model;
    const ox = m.atoms.find((x) => x.el === "O")!;
    // (as many as it takes kept, those nearest its letter, and said)
    expect([bondsAt(m, ox.id), !!ox.unsure]).toEqual([2, true]);
  });

  it("refuses a group's label with more bonds than its atom takes past the group's own: OMe with a double bond", () => {
    const a: P = [100, 200];
    const b = step(a, 30);
    const o = step(b, -30);
    const end = towards(b, o, 0.55);
    const m = structureFrom({ paths: [stroke(a, b), stroke(b, end), stroke(...beside(b, end, 1.8))], letters: letters("OMe", o), pictures: [] }, SHA, 1);
    expect(m).toEqual({ none: 'As read, more bonds meet at "OMe" than it takes: none of it is taken.' });
  });

  it("refuses an H drawn with a double bond to it, checked as a file has the structure", () => {
    const a: P = [100, 200];
    const b = step(a, 30);
    const h = step(b, -30);
    const end = towards(b, h, 0.55);
    const m = structureFrom({ paths: [stroke(a, b), stroke(b, end), stroke(...beside(b, end, 1.8))], letters: letters("H", h), pictures: [] }, SHA, 1);
    expect(m).toEqual({ none: "As read, more bonds meet at hydrogen than it takes: none of it is taken." });
  });

  it("marks a label read with a charge no atom carries unsure - a page's \"S188−\" taken for a sulfur", () => {
    const a: P = [100, 200];
    const b = step(a, 30);
    const s = step(b, -30);
    const m = structureFrom({ paths: [stroke(a, b), stroke(b, towards(b, s, 0.55))], letters: letters("S18−", s), pictures: [] }, SHA, 1) as Model;
    const sulfur = m.atoms.find((x) => x.el === "S");
    expect([sulfur?.charge, sulfur?.unsure?.said]).toEqual([-18, ["A charge of 18− is more than sulfur carries."]]);
  });

  it("leaves sure a group's label drawn with the bond its atom has left: =NOAc, an oxime's ester", () => {
    const a: P = [100, 200];
    const b = step(a, 30);
    const n = step(b, -30);
    const end = towards(b, n, 0.55);
    const m = structureFrom({ paths: [stroke(a, b), stroke(b, end), stroke(...beside(b, end, 1.8))], letters: letters("NOAc", n), pictures: [] }, SHA, 1) as Model;
    expect(m.atoms.find((x) => x.el === "NOAc")?.unsure).toBeUndefined();
  });

  it("leaves sure what has no more bonds than it takes: a sulfone's sulfur, an ammonium's nitrogen, a quaternary carbon", () => {
    const s: P = [150, 200];
    const left = step(s, 180);
    const right = step(s, 0);
    const up = step(s, 90);
    const down = step(s, 270);
    const sulfone = structureFrom(
      {
        paths: [stroke(left, towards(left, s)), stroke(right, towards(right, s)), ...[up, down].flatMap((o) => [stroke(towards(s, o, 0.35), towards(s, o, 0.65)), stroke(...beside(towards(s, o, 0.35), towards(s, o, 0.65), 1.8))])],
        letters: [...letters("S", s), ...letters("O", up), ...letters("O", down)],
        pictures: [],
      },
      SHA,
      1,
    ) as Model;
    const sulfur = sulfone.atoms.find((x) => x.el === "S")!;
    expect([bondsAt(sulfone, sulfur.id), sulfur.unsure]).toEqual([6, undefined]);
    const n = structureFrom({ paths: [left, right, up, down].map((e) => stroke(e, towards(e, s))), letters: letters("N+", s), pictures: [] }, SHA, 1) as Model;
    const nitrogen = n.atoms.find((x) => x.el === "N")!;
    expect([nitrogen.charge, bondsAt(n, nitrogen.id), nitrogen.unsure]).toEqual([1, 4, undefined]);
    const c = structureFrom({ paths: [left, right, up, down].map((e) => stroke(s, e)), letters: [], pictures: [] }, SHA, 1) as Model;
    expect(c.atoms.filter((x) => x.unsure)).toEqual([]);
  });
});

describe("a figure set sideways", () => {
  /** The figure turned a quarter as the page shows it: its words reading down the page - each point turned, each letter's line reading down. */
  const sideways = (f: FigureDrawn): FigureDrawn => {
    const t = (x: number, y: number): [number, number] => [800 - y, x];
    return {
      paths: f.paths.map((p) => ({ ...p, d: p.d.map((st): PathStep => (st[0] === "Z" ? st : [st[0], ...t(st[1], st[2])])) })),
      letters: f.letters.map((l): FigureLetter => {
        const [a, b] = [t(l.box[0], l.box[1]), t(l.box[2], l.box[3])];
        return { ...l, box: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], at: l.at ? t(l.at[0], l.at[1]) : null, dir: Math.PI / 2 };
      }),
      pictures: [],
    };
  };

  it("is read turned upright, its labels whole, each atom tied to where it lies on the page", () => {
    const upright = (figureFrom(drawn(), SHA, 2) as FigureResult).model;
    const turned = (figureFrom(sideways(drawn()), SHA, 2) as FigureResult).model;
    // (the same structure: the OH read as one label, not an O and a lone H)
    expect(turned.atoms.map((a) => a.el).sort()).toEqual(upright.atoms.map((a) => a.el).sort());
    expect(turned.bonds).toHaveLength(upright.bonds.length);
    // (drawn upright, as it was drawn before it was set sideways)
    for (let i = 0; i < upright.atoms.length; i++) {
      expect(turned.atoms[i].x).toBeCloseTo(upright.atoms[i].x, 6);
      expect(turned.atoms[i].y).toBeCloseTo(upright.atoms[i].y, 6);
    }
    // (each tied to where it lies on the page as it is shown)
    const o = turned.atoms.find((a) => a.el === "O")!.seen!;
    const o0 = upright.atoms.find((a) => a.el === "O")!.seen!;
    expect(o.x).toBeCloseTo(800 - o0.y, 6);
    expect(o.y).toBeCloseTo(o0.x, 6);
  });
});

describe("where a structure read goes", () => {
  const m: Model = {
    atoms: [
      { id: 1, x: -1, y: 0, r: 0.9, el: "C" },
      { id: 2, x: 1, y: 0.5, r: 0.9, el: "C" },
    ],
    bonds: [],
  };
  it("lies beside what it was read from, its top level with it", () => {
    const placed = placedBeside({ model: m }, { x0: 0, y0: 0, x1: 10, y1: 8 }, []).model;
    expect(Math.min(...placed.atoms.map((a) => a.x))).toBeCloseTo(10 + 2 * NOMINAL_BOND_LENGTH);
    expect(Math.max(...placed.atoms.map((a) => a.y))).toBeCloseTo(8);
  });
  it("goes on past what lies there", () => {
    const placed = placedBeside({ model: m }, { x0: 0, y0: 0, x1: 10, y1: 8 }, [{ x0: 12, y0: 0, x1: 30, y1: 10 }]).model;
    expect(Math.min(...placed.atoms.map((a) => a.x))).toBeGreaterThan(30);
  });
  it("carries a scheme's arrows, signs and words with it, as they stood to it", () => {
    const read: FigureResult = { model: m, scheme: { arrows: [{ x: 3, y: 0, angle: 0, length: 2 }], pluses: [{ x: -2, y: 0 }], captions: [{ x: 3, y: 0.8, text: "NaH", arrowAt: 0 }] } };
    const placed = placedBeside(read, { x0: 0, y0: 0, x1: 10, y1: 8 }, []);
    const dx = placed.model.atoms[0].x - m.atoms[0].x;
    const dy = placed.model.atoms[0].y - m.atoms[0].y;
    expect(placed.scheme!.arrows![0]).toMatchObject({ x: 3 + dx, y: dy, angle: 0, length: 2 });
    expect(placed.scheme!.pluses![0]).toEqual({ x: -2 + dx, y: dy });
    expect(placed.scheme!.captions![0]).toMatchObject({ x: 3 + dx, y: 0.8 + dy, arrowAt: 0 });
    // (its left edge two bonds past the region's right: the "+" sign's, leftmost of all)
    expect(-2 + dx).toBeCloseTo(10 + 2 * NOMINAL_BOND_LENGTH);
  });
  it("takes its own words' room as they are set, not as a point", () => {
    const style = styleOf(DEFAULT_STYLE_CHOICE);
    const read: FigureResult = { model: m, scheme: { captions: [{ x: 0, y: 3, text: "a long line of conditions written over it" }] } };
    const plain = regionOf(read)!;
    const set = regionOf(read, style)!;
    expect(set.x1 - set.x0).toBeGreaterThan(plain.x1 - plain.x0 + 4 * NOMINAL_BOND_LENGTH);
    // (and so kept clear of what lies past it: its words' right end, not its middle)
    const taken = [{ x0: set.x1 - set.x0 + 10 + 2 * NOMINAL_BOND_LENGTH - 5, y0: -50, x1: 400, y1: 50 }];
    const placed = placedBeside(read, { x0: 0, y0: 0, x1: 10, y1: 8 }, taken, style);
    expect(Math.min(...placed.model.atoms.map((a) => a.x))).toBeGreaterThan(400);
  });
});

describe("a scheme read for the page", () => {
  it("takes a label alone for a whole molecule where Meno reads it as one, or its H and charge fill its element", () => {
    for (const l of ["H2O", "HCl", "HI", "NaCl", "Br2", "I-", "Na+", "OH-", "NH3"]) expect(wholeLabel(l), l).toBe(true);
    for (const l of ["Me", "Ph", "OH", "OMe", "N", "rt", "1", "THF"]) expect(wholeLabel(l), l).toBe(false);
  });

  it("reads water written as words after a plus sign as a molecule of its own, marked so", () => {
    // (a Fischer esterification as RDKit's reaction drawing draws it: ethyl acetate + H2O)
    const r = figureFrom(esterification as unknown as FigureDrawn, "sha", 0) as FigureResult;
    const water = r.model.atoms.filter((a) => a.unsure?.said.includes(WRITTEN_AS_WORDS));
    expect(water).toHaveLength(1);
    expect(r.model.bonds.some((b) => b.a === water[0].id || b.b === water[0].id)).toBe(false);
  });

  it("keeps the figure's layout: two structures, the arrow between them as an equilibrium, its words over it, a compound's number in bold - one middle and one scale for all", () => {
    const chain = (x: number): FigurePath => stroke([x, 100], [x + L * 0.866, 100 - L / 2], [x + 2 * L * 0.866, 100], [x + 3 * L * 0.866, 100 - L / 2]);
    const half = (tip: P, ux: number, side: number): FigurePath => ({ fill: "#000000ff", stroke: null, width: 0, d: [["M", ...tip], ["L", tip[0] - ux * 6, tip[1] + side * 2.5], ["L", tip[0] - ux * 6, tip[1]], ["Z"]] });
    const drawn: FigureDrawn = {
      paths: [chain(0), chain(200), stroke([60, 93], [134, 93]), half([140, 93], 1, -1), stroke([146, 97], [72, 97]), half([66, 97], -1, 1)],
      letters: [...letters("THF", [90, 84]), ...letters("1", [20, 125]).map((l) => ({ ...l, font: "Helvetica-Bold" }))],
      pictures: [],
    };
    const r = figureFrom(drawn, SHA, 1) as FigureResult;
    expect(r.model.atoms).toHaveLength(8);
    const [arrow] = r.scheme!.arrows!;
    expect(arrow).toMatchObject({ kind: "equilibrium" });
    expect(arrow.angle).toBeCloseTo(0, 2);
    // (as long, in bonds, as drawn: 86 points over 14.4)
    expect(arrow.length / NOMINAL_BOND_LENGTH).toBeCloseTo(86 / L, 1);
    const words = r.scheme!.captions!;
    expect(words.find((c) => c.text === "THF")).toMatchObject({ arrowAt: 0 });
    expect(words.find((c) => c.text === "1")).toMatchObject({ marks: [{ from: 0, to: 1, bold: true }] });
    // (the arrow between the two structures, as drawn: right of the first's atoms, left of the second's)
    const xs = r.model.atoms.map((a) => a.x).sort((p, q) => p - q);
    expect(arrow.x).toBeGreaterThan(xs[3]);
    expect(arrow.x).toBeLessThan(xs[4]);
  });
});

describe("a structure read, carried by the clipboard's record", () => {
  it("keeps where its atoms were read from and what was unsure, and leaves out what does not read", () => {
    const good = { sha256: SHA, page: 1, x: 10, y: 20, bond: 14 };
    const r = readDrawn({
      atoms: [
        { id: 1, x: 0, y: 0, el: "C", seen: good, unsure: { said: ["Its hashes are even."], as: "C|0|" } },
        { id: 2, x: 1, y: 0, el: "C", seen: { ...good, sha256: "nope" }, unsure: { said: "x", as: 3 } },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 1, unsure: { said: ["Drawn twice over."], as: "1|none||" } }],
    })!;
    expect(r.atoms[0].seen).toEqual(good);
    expect(r.atoms[0].unsure?.said).toEqual(["Its hashes are even."]);
    expect(r.atoms[1].seen).toBeUndefined();
    expect(r.atoms[1].unsure).toBeUndefined();
    expect(r.bonds[0].unsure?.as).toBe("1|none||");
  });
});

// A figure whose labels are outlines, as many journals print them: each letter a filled path of its own, or each word one
// path - drawn here from IBM Plex Sans (SIL OFL, src/assets/fonts), and read against the same typeface's letters, as the app
// reads against the system's.
const PLEX = (() => {
  const b = readFileSync(new URL("../../../../assets/fonts/IBMPlexSans-Regular.ttf", import.meta.url));
  return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
})();
type Pt = { x: number; y: number; curve?: boolean };
/** A letter's outline at a baseline point, `size` points large: its parts, its curves followed in steps (each point on one marked). */
function glyphParts(c: string, x: number, y: number, size: number): Pt[][] {
  const parts: Pt[][] = [];
  let last: Pt = { x, y };
  for (const k of PLEX.charToGlyph(c).getPath(x, y, size).commands) {
    if (k.type === "M") parts.push([(last = { x: k.x, y: k.y })]);
    else if (k.type === "L") parts[parts.length - 1].push((last = { x: k.x, y: k.y }));
    else if (k.type === "Q" || k.type === "C") {
      const from = last;
      for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        const u = 1 - t;
        const p =
          k.type === "Q"
            ? { x: u * u * from.x + 2 * u * t * k.x1 + t * t * k.x, y: u * u * from.y + 2 * u * t * k.y1 + t * t * k.y }
            : { x: u ** 3 * from.x + 3 * u * u * t * k.x1 + 3 * u * t * t * k.x2 + t ** 3 * k.x, y: u ** 3 * from.y + 3 * u * u * t * k.y1 + 3 * u * t * t * k.y2 + t ** 3 * k.y };
        parts[parts.length - 1].push({ ...p, curve: true });
      }
      last = { x: k.x, y: k.y };
    }
  }
  return parts.filter((q) => q.length > 2);
}
const CAP = (PLEX.tables.os2?.sCapHeight ?? 700) / PLEX.unitsPerEm;
const KNOWN: GlyphShape[] = [...LETTERS].map((c) => glyphShape(c, glyphParts(c, 0, 0, 1), CAP));
/** A word as outlines, its middle at `at`, 10 points large: a path for each letter, or one for the word. */
function outlinedWord(text: string, at: P, whole = false): FigurePath[] {
  const size = 10;
  const width = [...text].reduce((w, c) => w + ((PLEX.charToGlyph(c).advanceWidth ?? 0) / PLEX.unitsPerEm) * size, 0);
  let x = at[0] - width / 2;
  const each = [...text].map((c) => {
    const parts = glyphParts(c, x, at[1] + (CAP * size) / 2, size);
    x += ((PLEX.charToGlyph(c).advanceWidth ?? 0) / PLEX.unitsPerEm) * size;
    return parts.flatMap((q) => [...q.map((p, i): PathStep => [i ? (p.curve ? "C" : "L") : "M", p.x, p.y]), ["Z"] as PathStep]);
  });
  return whole ? [{ fill: "#000000ff", stroke: null, width: 0, d: each.flat() }] : each.map((d) => ({ fill: "#000000ff", stroke: null, width: 0, d }));
}
/** A bond between two points, cut back where it meets a label. */
const cut = (a: P, b: P, atA: number, atB: number): FigurePath => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [ux, uy] = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  return stroke([a[0] + ux * atA, a[1] + uy * atA], [b[0] - ux * atB, b[1] - uy * atB]);
};
/** Two lines side by side, a double bond, cut back at both ends. */
const doubled = (a: P, b: P, atA: number, atB: number): FigurePath[] => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [nx, ny] = [(-(b[1] - a[1]) / l) * 1.3, ((b[0] - a[0]) / l) * 1.3];
  return [cut([a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], atA, atB), cut([a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], atA, atB)];
};
/** A ring of six carbons from a point, its bonds whole. */
const ring = (from: P, deg: number): FigurePath[] => {
  const pts: P[] = [from];
  for (let k = 1; k < 6; k++) pts.push(step(pts[k - 1], deg + 60 * k));
  return pts.map((p, k) => stroke(p, pts[(k + 1) % 6]));
};
/** Methyl phenyl sulfone, Ph-S(=O)2-Me, its S and O outlines - the S of one curved part, like an arrow's head on its double bonds' lines. */
function sulfone(): FigureDrawn {
  const s: P = [100, 100];
  const up = step(s, 90);
  const down = step(s, -90);
  const ph = step(s, 180);
  return {
    paths: [
      cut(ph, s, 0, 5),
      ...ring(ph, 180 - 60),
      cut(s, step(s, 0), 5, 0),
      ...doubled(s, up, 5.5, 5.5),
      ...doubled(s, down, 5.5, 5.5),
      ...outlinedWord("S", s),
      ...outlinedWord("O", up),
      ...outlinedWord("O", down),
    ],
    letters: [],
    pictures: [],
  };
}
/** Letters as outlines in a row from a baseline point, each a path of its own: each run its text, size, how far raised (up, points) and how far its letters lean (an italic's). */
function outlinedRun(runs: [string, number, number, number][], at: P): FigurePath[] {
  let x = at[0];
  const out: FigurePath[] = [];
  for (const [text, size, up, lean] of runs) {
    for (const c of text) {
      const base = at[1] - up;
      const parts = glyphParts(c, x, base, size).map((q) => q.map((p) => ({ ...p, x: p.x + lean * (base - p.y) })));
      out.push({ fill: "#000000ff", stroke: null, width: 0, d: parts.flatMap((q) => [...q.map((p, i): PathStep => [i ? (p.curve ? "C" : "L") : "M", p.x, p.y]), ["Z"] as PathStep]) });
      x += ((PLEX.charToGlyph(c).advanceWidth ?? 0) / PLEX.unitsPerEm) * size;
    }
  }
  return out;
}
const elementsOf = (r: FigureResult | Unread) => ("none" in r ? [] : r.model.atoms.map((a) => a.el).sort());
const quarterTurned = (f: FigureDrawn): FigureDrawn => ({ ...f, paths: f.paths.map((p) => ({ ...p, d: p.d.map((q): PathStep => (q[0] === "Z" ? q : [q[0], 300 - q[2], q[1]])) })) });

describe("a figure whose labels are outlines", () => {
  it("reads an S drawn as an outline as the S, not as an arrow's head on its double bond", () => {
    const r = figureFrom(sulfone(), SHA, 0, KNOWN);
    expect(elementsOf(r)).toEqual(["C", "C", "C", "C", "C", "C", "C", "O", "O", "S"]);
    expect("none" in r ? null : (r.scheme?.arrows ?? []).length).toBe(0);
  });

  it.each([true, false])("reads a label drawn as one path of all its letters (or not: %s), its c a small c by its capitals: Boc-N=N-Boc", (whole) => {
    const top: P = [100, 100];
    const bottom: P = [100, 100 + L];
    const f: FigureDrawn = {
      paths: [
        ...doubled(top, bottom, 5, 5),
        cut(top, [78, 93], 5, 0),
        cut(bottom, [122, 107], 5, 0),
        ...ring([160, 100], 0),
        ...outlinedWord("N", top),
        ...outlinedWord("N", bottom),
        ...outlinedWord("Boc", [70, 90], whole),
        ...outlinedWord("Boc", [130, 110], whole),
      ],
      letters: [],
      pictures: [],
    };
    expect(elementsOf(figureFrom(f, SHA, 0, KNOWN))).toEqual(["Boc", "Boc", "C", "C", "C", "C", "C", "C", "N", "N"]);
  }, measured(300));

  it("reads one whose page is turned a quarter, no letter written to tell which way, the way its outlines read as letters", () => {
    expect(elementsOf(figureFrom(quarterTurned(sulfone()), SHA, 0, KNOWN))).toEqual(["C", "C", "C", "C", "C", "C", "C", "O", "O", "S"]);
  });

  it("reads Meno's own scheme the same with the system's letters as without: its + of twelve corners a sign, its arrow an arrow", () => {
    // (Meno's + is a filled outline of many corners, so a scheme of Meno's is taken to draw letters as shapes)
    const plus = plusOutline({ x: 70, y: 100 }, plusMeasures(styleOf(DEFAULT_STYLE_CHOICE), L));
    const f: FigureDrawn = {
      paths: [
        stroke([30, 100], step([30, 100], 30), step(step([30, 100], 30), -30)),
        { fill: "#000000ff", stroke: null, width: 0, d: [...plus.map((p, i): PathStep => [i ? "L" : "M", p.x, p.y]), ["Z"]] },
        stroke([84, 100], step([84, 100], 30), step(step([84, 100], 30), -30)),
        stroke([120, 100], [150, 100]),
        { fill: "#000000ff", stroke: null, width: 0, d: [["M", 156, 100], ["L", 149, 97], ["L", 149, 103], ["Z"]] },
        stroke([164, 100], step([164, 100], 30), step(step([164, 100], 30), -30), step(step(step([164, 100], 30), -30), 30)),
      ],
      letters: [...letters("OH", [step(step([84, 100], 30), -30)[0] + 6, 100])],
      pictures: [],
    };
    expect(lettersAsShapes(f)).toBe(true);
    const shown = (r: FigureResult | Unread) => ("none" in r ? r : { els: elementsOf(r), pluses: r.scheme?.pluses?.length, arrows: r.scheme?.arrows?.length });
    expect(shown(figureFrom(f, SHA, 0, KNOWN))).toEqual(shown(figureFrom(f, SHA, 0, [])));
    expect(shown(figureFrom(f, SHA, 0, KNOWN))).toMatchObject({ pluses: 1, arrows: 1 });
  });

  it("keeps an arrow's filled head an arrow's, and an outlined label beside it a label", () => {
    const n: P = [116, 100];
    const f: FigureDrawn = {
      paths: [
        ...ring([20, 100], 0),
        stroke([60, 100], [100, 100]),
        { fill: "#000000ff", stroke: null, width: 0, d: [["M", 108, 100], ["L", 100, 96.5], ["L", 100, 103.5], ["Z"]] },
        ...outlinedWord("N", n),
        cut(n, step(n, 30), 5, 0),
        cut(n, step(n, -30), 5, 0),
        stroke(step(n, 30), step(step(n, 30), -30), step(n, -30)),
      ],
      letters: [],
      pictures: [],
    };
    const r = figureFrom(f, SHA, 0, KNOWN);
    expect("none" in r ? null : r.scheme?.arrows?.length).toBe(1);
    expect(elementsOf(r).filter((e) => e === "N")).toEqual(["N"]);
  });

  it("reads a label with its i set small and italic, its stem thin and leaning, as one: C(O)NiPr2", () => {
    const at: P = step([100, 100], 0);
    const f: FigureDrawn = {
      paths: [...ring([100, 100], 120), cut([100, 100], at, 0, 2), ...outlinedRun([["C(O)N", 10, 0, 0], ["i", 7, 4, 0.2], ["Pr", 10, 0, 0], ["2", 7, -2, 0]], [at[0] + 1, at[1] + 3.6])],
      letters: [],
      pictures: [],
    };
    expect(elementsOf(figureFrom(f, SHA, 0, KNOWN))).toContain("C(O)NiPr2");
  });

  it("reads counter-ions by a complex as ions: a - set high after a subscript, PF6-; ions counted in parentheses, (Cl-)2", () => {
    const f: FigureDrawn = {
      paths: [
        ...ring([100, 100], 120),
        ...outlinedRun([["PF", 10, 0, 0], ["6", 7, -2, 0], ["-", 7, 4, 0]], [128, 112]),
        ...outlinedRun([["(Cl", 10, 0, 0], ["-", 7, 4, 0], [")", 10, 0, 0], ["2", 7, -2, 0]], [128, 128]),
      ],
      letters: [],
      pictures: [],
    };
    const els = elementsOf(figureFrom(f, SHA, 0, KNOWN));
    expect(els).toContain("PF6-");
    expect(els).toContain("(Cl-)2");
  });

  it("takes outlines of straight lines alone - an N - for letters to read, and a filled wedge for none", () => {
    expect(lettersAsShapes({ paths: outlinedWord("N", [100, 100]), letters: [], pictures: [] })).toBe(true);
    expect(lettersAsShapes({ paths: [stroke([0, 0], [14.4, 0]), wedge([0, 0], [10, 10])], letters: [], pictures: [] })).toBe(false);
  });
});

describe("a ring atom's label with a group on it", () => {
  it("reads BocN in a ring as the N with its Boc, both ring bonds to the N: N-Boc-pyrrolidine whole", () => {
    // (a pyrrolidine, its N at the left, labelled BocN as drawn on its bonds' left)
    const c: P = [120, 200];
    const r = L / (2 * Math.sin(Math.PI / 5));
    const v = Array.from({ length: 5 }, (_, k): P => [c[0] + r * Math.cos(Math.PI + (2 * Math.PI * k) / 5), c[1] + r * Math.sin(Math.PI + (2 * Math.PI * k) / 5)]);
    const towards = (p: P, q: P, d: number): P => {
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return [p[0] + ((q[0] - p[0]) * d) / l, p[1] + ((q[1] - p[1]) * d) / l];
    };
    const f: FigureDrawn = {
      paths: [stroke(towards(v[0], v[1], 5), v[1], v[2], v[3], v[4], towards(v[0], v[4], 5))],
      letters: letters("BocN", [v[0][0] - 3 * 6.8, v[0][1]]),
      pictures: [],
    };
    const m = structureFrom(f, SHA, 0) as Model;
    expect(m.atoms.find((a) => a.el === "NBoc")).toBeTruthy();
    // (written out: the N with its two ring bonds and the Boc's C5O2 - C9 N O2 in all)
    const mol = structureFileText({ atoms: m.atoms, bonds: m.bonds }, "x.mol").split("\n");
    const n = Number(mol[3].slice(0, 3));
    const els = mol.slice(4, 4 + n).map((l) => l.slice(31, 34).trim()).sort().join("");
    expect(els).toBe("CCCCCCCCCNOO");
    const toN = mol.slice(4 + n).filter((l) => /^\s*\d+\s+\d+\s+\d/.test(l)).filter((l) => [Number(l.slice(0, 3)), Number(l.slice(3, 6))].some((i) => mol[3 + i]?.slice(31, 34).trim() === "N"));
    expect(toN).toHaveLength(3);
  });
});

describe("a repeat unit in brackets, counted, read that many times (docs/PDF.md, *A repeat unit in brackets*)", () => {
  /** HO-C-[C]-C-OH zigzag, its middle carbon in brackets counted `count` - or the same chain with `n` carbons drawn out. */
  function chain(carbons: number, count?: string): FigureDrawn {
    const pts: P[] = [[100, 200]];
    for (let k = 0; k <= carbons; k++) pts.push(step(pts[k], k % 2 ? 30 : -30));
    const short = (p: P, q: P): P => [p[0] + (q[0] - p[0]) * 0.55, p[1] + (q[1] - p[1]) * 0.55];
    const paths = [stroke(short(pts[1], pts[0]), ...pts.slice(1, -1), short(pts[pts.length - 2], pts[pts.length - 1]))];
    const words = [...letters("HO", [pts[0][0] - 6.8, pts[0][1]]), ...letters("OH", pts[pts.length - 1])];
    if (count) {
      const h = 0.55 * L;
      const line = ([x, y]: P) => stroke([x, y - h], [x, y + h]);
      const [x1, x2] = [[(pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2] as P, [(pts[2][0] + pts[3][0]) / 2, (pts[2][1] + pts[3][1]) / 2] as P];
      paths.push(line(x1), line(x2));
      words.push({ c: count, box: [x2[0] + 0.2 * L, x2[1] + h + 1, x2[0] + 0.2 * L + 4.8, x2[1] + h + 6], at: [x2[0] + 0.2 * L, x2[1] + h + 6], size: 7 });
    }
    return { paths, letters: words, pictures: [] };
  }

  it("is the molecule drawn out in full: its identity and its formula", () => {
    // (HO-CH2-[CH2]6-CH2-OH: octane-1,8-diol, as its eight carbons drawn out are)
    const read = structureFrom(chain(3, "6"), SHA, 0) as Model;
    const whole = structureFrom(chain(8), SHA, 0) as Model;
    expect(read.atoms.filter((a) => a.el === "C")).toHaveLength(8);
    expect(identityOfDrawn(read).text).toBe(identityOfDrawn(whole).text);
    expect(partFormula(read)).toBe(partFormula(whole));
    expect(partFormula(read)).toBe("C8H18O2");
  });

  it("is written to a file as a multiple group of its count, its first unit the paradigm - and read back so", () => {
    const m = structureFrom(chain(3, "6"), SHA, 0) as Model;
    const groups = m.atoms.flatMap((a) => a.sgroups ?? []);
    expect(groups).toHaveLength(6);
    expect(groups.every((g) => g.type === "MUL" && g.multiplier === 6 && g.id === groups[0].id)).toBe(true);
    expect(groups.filter((g) => g.paradigm)).toHaveLength(1);
    // (its id none of an atom's or a bond's)
    expect([...m.atoms, ...m.bonds].some((x) => x.id === groups[0].id)).toBe(false);
    const back = readMolfile(structureFileText({ atoms: m.atoms, bonds: m.bonds }, "x.mol"))!;
    const mul = back.sgroups.filter((g) => g.type === "MUL");
    expect(mul).toHaveLength(1);
    expect(mul[0].multiplier).toBe(6);
    expect(mul[0].atoms).toHaveLength(6);
    expect(mul[0].patoms).toHaveLength(1);
  });

  it("ties each copy to where the figure draws the unit it copies", () => {
    const m = structureFrom(chain(3, "6"), SHA, 0) as Model;
    const unit = m.atoms.filter((a) => a.sgroups?.length);
    const paradigm = unit.find((a) => a.sgroups![0].paradigm)!;
    expect(unit.every((a) => a.seen && a.seen.x === paradigm.seen!.x && a.seen.y === paradigm.seen!.y)).toBe(true);
  });
});

describe("a picture in a frame - a journal's cover thumbnail - is no structure", () => {
  const frame = (x0: number, y0: number, x1: number, y1: number): FigurePath => stroke([x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]);

  it("is none where the lines drawn are a rectangle round the picture: no square of its frame", () => {
    const thumbnail: FigureDrawn = { paths: [frame(100, 100, 190, 190)], letters: [], pictures: [[101, 101, 189, 189]] };
    expect(figureFrom(thumbnail, SHA, 1)).toEqual({ none: "This figure is a picture in a frame, not a drawing: there are no lines to read." });
    // (its four sides drawn each alone, as some programs do)
    const sides: FigureDrawn = { ...thumbnail, paths: [stroke([100, 100], [190, 100]), stroke([190, 100], [190, 190]), stroke([190, 190], [100, 190]), stroke([100, 190], [100, 100])] };
    expect("none" in figureFrom(sides, SHA, 1)).toBe(true);
  });

  it("is still read where a structure's bonds are drawn by a picture: slanting lines are no frame", () => {
    const a: P = [100, 200];
    const b = step(a, 30);
    const c = step(b, -30);
    const withPicture: FigureDrawn = { paths: [stroke(a, b, c)], letters: [], pictures: [[200, 150, 260, 210]] };
    const read = figureFrom(withPicture, SHA, 1);
    expect("model" in read && read.model.atoms.length).toBe(3);
  });
});

describe("a protecting group's label on the left of its bond", () => {
  it.each([true, false])("reads PMBO as OPMB, as it reads OPMB on the right, its letters drawn as outlines (whole path: %s)", (whole) => {
    const side = (word: string, right: boolean) => {
      const a: P = right ? [100, 100] : [200, 100];
      const b = right ? step(a, 30) : step(a, 150);
      const c = right ? step(b, -30) : step(b, -150);
      const f: FigureDrawn = { paths: [stroke(a, b), cut(b, c, 0, 0), ...outlinedWord(word, [c[0] + (right ? 17 : -17), c[1]], whole)], letters: [], pictures: [] };
      return elementsOf(figureFrom(f, SHA, 0, KNOWN));
    };
    expect(side("PMBO", false)).toEqual(["C", "C", "OPMB"]);
    expect(side("OPMB", true)).toEqual(["C", "C", "OPMB"]);
  }, measured(300));
});

describe("a label's hashed bond drawn as three round-capped marks", () => {
  const rad = (d: number) => (d * Math.PI) / 180;
  /** A round-capped mark - a stadium, filled - `length` long and `width` across, its middle at `mid`, along `ang` degrees (screen, y down). */
  const stadium = (mid: P, ang: number, length: number, width: number): FigurePath => {
    const [ux, uy] = [Math.cos(rad(ang)), Math.sin(rad(ang))];
    const [h, r] = [length / 2, width / 2];
    const k = 0.5523 * r;
    const pt = (a: number, b: number): [number, number] => [mid[0] + ux * a - uy * b, mid[1] + uy * a + ux * b];
    const d: PathStep[] = [
      ["M", ...pt(-h + r, -r)], ["L", ...pt(h - r, -r)],
      ["C", ...pt(h - r + k, -r)], ["C", ...pt(h, -k)], ["C", ...pt(h, 0)],
      ["C", ...pt(h, k)], ["C", ...pt(h - r + k, r)], ["C", ...pt(h - r, r)],
      ["L", ...pt(-h + r, r)],
      ["C", ...pt(-h + r - k, r)], ["C", ...pt(-h, k)], ["C", ...pt(-h, 0)],
      ["C", ...pt(-h, -k)], ["C", ...pt(-h + r - k, -r)], ["C", ...pt(-h + r, -r)], ["Z"],
    ];
    return { fill: "#000000ff", stroke: null, width: 0, d };
  };

  // (measured on a real page, at bond length 1: the label PMBO as outlines, its O at the right; from 0.04 right of the O's edge a hashed bond runs
  //  down to the right, 29 degrees below level - three marks 0.073 wide, set across it: 0.28 and 0.22 long, then a dot - their middles 0.19 apart, the
  //  longest by the label, so that the narrow end is at the ring atom just past the dot, 0.65 from the O's edge, with two plain bonds leaving it)
  it.each([false, true])("reads PMBO as OPMB with its bond hashed, narrow at the ring atom (whole path: %s), as five bars set so would read", (whole) => {
    const word = "PMBO";
    const width = [...word].reduce((w, c) => w + ((PLEX.charToGlyph(c).advanceWidth ?? 0) / PLEX.unitsPerEm) * 10, 0);
    const label = outlinedWord(word, [100 - width / 2, 100], whole);
    const ang = 29;
    const along = (t: number): P => [100 + 0.04 * L + Math.cos(rad(ang)) * t, 100 + Math.sin(rad(ang)) * t];
    const marks = [stadium(along(0.14 * L), ang + 90, 0.28 * L, 0.073 * L), stadium(along(0.33 * L), ang + 90, 0.22 * L, 0.073 * L), stadium(along(0.52 * L), ang + 90, 0.14 * L, 0.11 * L)];
    const ringAtom = along(0.65 * L);
    const bonds = [60, -60].map((d) => stroke(ringAtom, [ringAtom[0] + Math.cos(rad(ang + d)) * L, ringAtom[1] + Math.sin(rad(ang + d)) * L]));
    const read = figureFrom({ paths: [...label, ...marks, ...bonds], letters: [], pictures: [] }, SHA, 0, KNOWN) as FigureResult & { model: Model };
    const m = read.model;
    expect(m.atoms.map((a) => a.el).sort()).toEqual(["C", "C", "C", "OPMB"]);
    const o = m.atoms.find((a) => a.el === "OPMB")!;
    const hashed = m.bonds.filter((b) => b.stereo === "down");
    expect(hashed).toHaveLength(1);
    // (to the label, its narrow end at the ring atom - the one with two other bonds)
    expect(hashed[0].b === o.id || hashed[0].a === o.id).toBe(true);
    const narrow = m.atoms.find((a) => a.id === hashed[0].narrow)!;
    expect(m.bonds.filter((b) => b.a === narrow.id || b.b === narrow.id)).toHaveLength(3);
  }, measured(300));
});
