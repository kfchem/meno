import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import aldol from "../../../../lib/figure/fixtures/aldol-rdkitrxn.json";
import camphor from "../../../../lib/figure/fixtures/camphor-rdkitacs.json";
import acetate from "../../../../lib/figure/fixtures/sodium-acetate-rdkit.json";
import { schemeDrawn } from "./figures";
import { figuresOf } from "../../../../lib/pdf/figures";
import { centreWithin, figureOn, pageStructuresOf, structureAt, structuresOf, type PageStructure } from "./pageStructures";

const read = (s: PageStructure) => {
  if ("none" in s.read) throw new Error(s.read.none);
  return s.read.model;
};
const formula = (s: PageStructure) => {
  const count = new Map<string, number>();
  for (const a of read(s).atoms) count.set(a.el, (count.get(a.el) ?? 0) + 1);
  return [...count].sort(([p], [q]) => p.localeCompare(q)).map(([el, n]) => `${el}${n}`).join(" ");
};
const middle = ([a, b]: [{ x: number; y: number }, { x: number; y: number }]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

describe("the structures of a figure, each taken whole", () => {
  // (an aldol addition as RDKit draws a reaction: two acetaldehydes, "+", the arrow, the aldol)
  const scheme = aldol as unknown as FigureDrawn;

  it("splits a scheme into its structures - never its arrow, its + or its words - each read on its own", () => {
    const found = structuresOf(scheme, 2, "pdf", 4, []);
    expect(found.map((s) => s.key)).toEqual(["2:0", "2:1", "2:2"]);
    expect(found.map(formula).sort()).toEqual(["C2 O1", "C2 O1", "C4 O2"]);
  });

  it("ties each atom of what it reads to where it lies on the page", () => {
    const [s] = structuresOf(scheme, 0, "pdf", 4, []);
    for (const [k, a] of read(s).atoms.entries()) expect(a.seen).toMatchObject({ sha256: "pdf", page: 4, x: s.atoms[k].x, y: s.atoms[k].y });
  });

  it("takes a lone ion with the structure it lies by: sodium acetate is one structure", () => {
    const found = structuresOf(acetate as unknown as FigureDrawn, 0, "pdf", 0, []);
    expect(found).toHaveLength(1);
    expect(formula(found[0])).toContain("Na1");
  });

  describe("a lone ion by a structure", () => {
    const L = 14.4;
    type P = [number, number];
    const stroke = (...pts: P[]) => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i) => [i ? "L" : "M", x, y]) }) as FigureDrawn["paths"][number];
    const step = (p: P, deg: number): P => [p[0] + L * Math.cos((deg * Math.PI) / 180), p[1] - L * Math.sin((deg * Math.PI) / 180)];
    const towards = (p: P, q: P, share = 0.6): P => [p[0] + (q[0] - p[0]) * share, p[1] + (q[1] - p[1]) * share];
    const letters = (text: string, [x, y]: P) => [...text].map((c, i) => ({ c, box: [x - 3.4 + 6.8 * i, y - 3.6, x + 3.4 + 6.8 * i, y + 3.6] as [number, number, number, number], at: [x - 3.4 + 6.8 * i, y + 3.6] as [number, number], size: 10 }));
    /** A two-carbon chain ending in a label at `[100, 200]` and on: acetaldehyde's C-C=O, or ethylammonium's C-C-NH3+. */
    const chain = (label: string, double: boolean): FigureDrawn => {
      const a: P = [100, 200];
      const b = step(a, 30);
      const x = step(b, -30);
      const end = towards(b, x);
      const off: [P, P] = [
        [b[0] + 1.8 * Math.sin(-Math.PI / 6), b[1] + 1.8 * Math.cos(-Math.PI / 6)],
        [end[0] + 1.8 * Math.sin(-Math.PI / 6), end[1] + 1.8 * Math.cos(-Math.PI / 6)],
      ];
      return { paths: [stroke(a, b), stroke(b, end), ...(double ? [stroke(...off)] : [])], letters: letters(label, x), pictures: [] };
    };
    /** `drawn` with an ion's label set 1.1 bonds below its middle carbon - and a "+" between them, where asked. */
    const withIon = (drawn: FigureDrawn, ion: string, plus = false): FigureDrawn => {
      const b = step([100, 200], 30);
      const at: P = [b[0], b[1] + 1.1 * L];
      return { ...drawn, letters: [...drawn.letters, ...letters(ion, at), ...(plus ? letters("+", [b[0], b[1] + 0.55 * L]) : [])] };
    };
    const charge = (s: PageStructure) => read(s).atoms.reduce((t, a) => t + (a.charge ?? 0), 0);

    it("leaves a Cl- by a neutral molecule its own: acetaldehyde is C2 O, and the Cl- apart", () => {
      const found = structuresOf(withIon(chain("O", true), "Cl−"), 0, "pdf", 0, []);
      expect(found.map((s) => [formula(s), charge(s)]).sort()).toEqual([["C2 O1", 0], ["Cl1", -1]]);
    });

    it("takes a Cl- with the ammonium it lies by: the two neutral, one structure", () => {
      const found = structuresOf(withIon(chain("NH3+", false), "Cl−"), 0, "pdf", 0, []);
      expect(found.map((s) => [formula(s), charge(s)])).toEqual([["C2 Cl1 N1", 0]]);
    });

    it("leaves a \"Na+\" of a caption below the figure, two bonds off - past 1.6 bonds and the box of its bonds - a word: no structure of its own", () => {
      const drawn = chain("O", true);
      const found = structuresOf({ ...drawn, letters: [...drawn.letters, ...letters("Na+", [100, 200 + 2 * L])] }, 0, "pdf", 0, []);
      expect(found.map(formula)).toEqual(["C2 O1"]);
    });

    it("never takes an ion across a \"+\": the ammonium and the Cl- each their own", () => {
      const found = structuresOf(withIon(chain("NH3+", false), "Cl−", true), 0, "pdf", 0, []);
      expect(found.map((s) => [formula(s), charge(s)]).sort()).toEqual([["C2 N1", 1], ["Cl1", -1]]);
    });
  });

  describe("a salt drawn with its counter-ion in a row beside it, more than 1.6 bonds off", () => {
    const L = 14.4;
    type P = [number, number];
    const stroke = (...pts: P[]) => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i) => [i ? "L" : "M", x, y]) }) as FigureDrawn["paths"][number];
    const step = (p: P, deg: number): P => [p[0] + L * Math.cos((deg * Math.PI) / 180), p[1] - L * Math.sin((deg * Math.PI) / 180)];
    const towards = (p: P, q: P, share = 0.6): P => [p[0] + (q[0] - p[0]) * share, p[1] + (q[1] - p[1]) * share];
    const letters = (text: string, [x, y]: P) => [...text].map((c, i) => ({ c, box: [x - 3.4 + 6.8 * i, y - 3.6, x + 3.4 + 6.8 * i, y + 3.6] as [number, number, number, number], at: [x - 3.4 + 6.8 * i, y + 3.6] as [number, number], size: 10 }));
    /** A bond from `p` to `q`, short of a label at either end. */
    const bond = (p: P, q: P, labelled: [boolean, boolean] = [false, false]) => stroke(labelled[0] ? towards(q, p) : p, labelled[1] ? towards(p, q) : q);
    /** A second line beside a bond, `by` to its left: a double bond's. */
    const beside = (p: P, q: P, by = 1.8) => {
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const [nx, ny] = [(-(q[1] - p[1]) / l) * by, ((q[0] - p[0]) / l) * by];
      return stroke([p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny]);
    };
    /** A six-membered ring about `c`, its first atom at the right. */
    const ring = (c: P): P[] => [0, 1, 2, 3, 4, 5].map((k): P => [c[0] + L * Math.cos((k * Math.PI) / 3), c[1] - L * Math.sin((k * Math.PI) / 3)]);
    const one = (drawn: FigureDrawn) => structuresOf(drawn, 0, "pdf", 0, []).map((s) => [formula(s), read(s).atoms.reduce((t, a) => t + (a.charge ?? 0), 0)]);
    /** An ion's label 2.4 bonds to the right of `p`, level with it. */
    const right = (p: P, ion: string) => letters(ion, [p[0] + 2.4 * L, p[1]]);

    it("takes the Br- of tetramethylammonium bromide with it: NMe4+ Br- one structure, neutral", () => {
      const n: P = [150, 200];
      const ends = [step(n, 0), step(n, 90), step(n, 180), step(n, 270)];
      const drawn: FigureDrawn = { paths: ends.map((e) => bond(e, n, [false, true])), letters: [...letters("N+", n), ...right(ends[0], "Br−")], pictures: [] };
      expect(one(drawn)).toEqual([["Br1 C4 N1", 0]]);
    });

    it("takes the Cl- of pyridinium chloride with it", () => {
      const r = ring([150, 200]);
      const paths = r.map((p, k) => bond(p, r[(k + 1) % 6], [k === 0, k === 5]));
      const drawn: FigureDrawn = { paths: [...paths, beside(r[1], r[2], -1.8), beside(r[3], r[4], -1.8)], letters: [...letters("N+", r[0]), ...right(r[0], "Cl−")], pictures: [] };
      expect(one(drawn)).toEqual([["C5 Cl1 N1", 0]]);
    });

    it("takes the Na+ of sodium benzoate with it", () => {
      const r = ring([120, 200]);
      const c = step(r[0], 0);
      const o1 = step(c, 60);
      const o2 = step(c, -60);
      const paths = [...r.map((p, k) => bond(p, r[(k + 1) % 6])), bond(r[0], c), bond(c, o1, [false, true]), beside(c, towards(c, o1), 1.8), bond(c, o2, [false, true])];
      const drawn: FigureDrawn = { paths, letters: [...letters("O", o1), ...letters("O−", o2), ...right(o2, "Na+")], pictures: [] };
      expect(one(drawn)).toEqual([["C7 Na1 O2", 0]]);
    });

    it("takes the K+ of a potassium enolate with it", () => {
      const a: P = [100, 200];
      const b = step(a, 30);
      const o = step(b, -30);
      const drawn: FigureDrawn = { paths: [bond(a, b), beside(a, b, -1.8), bond(b, o, [false, true])], letters: [...letters("O−", o), ...right(o, "K+")], pictures: [] };
      expect(one(drawn)).toEqual([["C2 K1 O1", 0]]);
    });

    it("but leaves a counter-ion as far off not level with the structure a word, and one by a neutral molecule its own", () => {
      const a: P = [100, 200];
      const b = step(a, 30);
      const o = step(b, -30);
      const enolate = [bond(a, b), beside(a, b, -1.8), bond(b, o, [false, true])];
      const below: FigureDrawn = { paths: enolate, letters: [...letters("O−", o), ...letters("K+", [o[0] + 2 * L, o[1] + 1.4 * L])], pictures: [] };
      expect(one(below)).toEqual([["C2 O1", -1]]);
      const neutral: FigureDrawn = { paths: enolate, letters: [...letters("OH", o), ...right(o, "Br−")], pictures: [] };
      expect(one(neutral).sort()).toEqual([["Br1", -1], ["C2 O1", 0]]);
    });
  });

  it("finds none in one line with no label - a chart's tick, a table's rule - nor in a lone word: they are no structures", () => {
    const line: FigureDrawn = { paths: [{ fill: null, stroke: "#000000ff", width: 0.6, d: [["M", 100, 100], ["L", 120, 100]] }], letters: [], pictures: [] };
    expect(structuresOf(line, 0, "pdf", 0, [])).toEqual([]);
    const lone: FigureDrawn = { paths: [], letters: [{ c: "H", box: [100, 100, 106, 108], at: [100, 108], size: 9 }], pictures: [] };
    expect(structuresOf(lone, 0, "pdf", 0, [])).toEqual([]);
  });

  it("finds none in a figure with no lines: a picture", () => {
    expect(structuresOf({ paths: [], letters: [], pictures: [[0, 0, 100, 100]] }, 0, "pdf", 0, [])).toEqual([]);
  });

  it("refuses a structure with letters inside it that no atom took, saying so - never read in part", () => {
    const drawn = camphor as unknown as FigureDrawn;
    const [whole] = structuresOf(drawn, 0, "pdf", 0, []);
    // (in the middle of it, among its bonds, where no label goes)
    const at = { x: (whole.box[0] + whole.box[2]) / 2, y: (whole.box[1] + whole.box[3]) / 2 };
    const stray = { c: "§", box: [at.x - 1.5, at.y - 2, at.x + 1.5, at.y + 2] as [number, number, number, number], at: [at.x - 1.5, at.y + 2] as [number, number], size: 6 };
    const [s] = structuresOf({ ...drawn, letters: [...drawn.letters, stray] }, 0, "pdf", 0, []);
    expect(s.read).toEqual({ none: 'Part of this structure could not be read ("§"), so none of it is taken.' });
  });
});

describe("the structure under the pointer", () => {
  const scheme = aldol as unknown as FigureDrawn;
  const found = structuresOf(scheme, 0, "pdf", 0, []);

  it("is the one whose bond the pointer is on", () => {
    for (const s of found) {
      const p = middle(s.bonds[0]);
      expect(structureAt(found, p.x, p.y)?.key).toBe(s.key);
    }
  });

  it("is the one whose label the pointer is on: its labels are its own, not words", () => {
    const s = found.find((x) => x.labels.length)!;
    const [x0, y0, x1, y1] = s.labels[0];
    expect(structureAt(found, (x0 + x1) / 2, (y0 + y1) / 2)?.key).toBe(s.key);
  });

  it("is none on the arrow, none on the + between two structures, and none in the space beside them", () => {
    const { read } = schemeDrawn(scheme);
    const { marks } = figureOn(scheme, 0, "pdf", 0, []);
    const arrow = read.arrows[0];
    expect(structureAt(found, (arrow.tail.x + arrow.point.x) / 2, (arrow.tail.y + arrow.point.y) / 2, marks)).toBeNull();
    const plus = read.pluses[0];
    expect(structureAt(found, plus.x, plus.y, marks)).toBeNull();
    const [a] = [...found].sort((p, q) => p.box[0] - q.box[0]);
    expect(structureAt(found, a.box[0] - 2 * a.reach, (a.box[1] + a.box[3]) / 2, marks)).toBeNull();
  });

  it("is the nearer of two, never both: half a bond from each, the pointer goes to the nearer", () => {
    const [a] = found;
    const p = middle(a.bonds[0]);
    // (a copy of it a bond and a quarter to the right: the point is the first's)
    const moved: PageStructure = { ...a, key: "copy", bonds: a.bonds.map(([u, v]) => [{ x: u.x + 2.5 * a.reach, y: u.y }, { x: v.x + 2.5 * a.reach, y: v.y }]), atoms: a.atoms.map((u) => ({ x: u.x + 2.5 * a.reach, y: u.y })), labels: [], box: [a.box[0] + 2.5 * a.reach, a.box[1], a.box[2] + 2.5 * a.reach, a.box[3]] };
    expect(structureAt([moved, a], p.x, p.y)?.key).toBe(a.key);
  });
});

describe("a structure the page's figures may have cut in two", () => {
  // (camphor, a structure whole in its figure; what lies beside it outside its figure placed by its bond as drawn)
  const drawn = camphor as unknown as FigureDrawn;
  const [whole] = structuresOf(drawn, 0, "pdf", 0, []);
  const bond = whole.reach * 3;
  const right = Math.max(...whole.atoms.map((a) => a.x));
  const atRight = whole.atoms.find((a) => a.x === right)!;
  const label = (gap: number, width: number) => ({ box: [right + gap, atRight.y - 4, right + gap + width, atRight.y + 4] as [number, number, number, number], text: "OSiPh2tBu" });

  it("is refused where a wide label outside its figure lies right by it - a 60 point label, its other half beyond - naming the words", () => {
    const [s] = structuresOf(drawn, 0, "pdf", 0, [label(0.2 * bond, 60)]);
    expect(s.read).toEqual({ none: 'Part of this structure could not be read ("OSiPh2tBu" lies beside it), so none of it is taken.' });
  });

  it("is refused where a label lies most of a bond off: 30 points wide, 12 off a 14 point bond", () => {
    const [s] = structuresOf(drawn, 0, "pdf", 0, [label((12 / 14) * bond, (30 / 14) * bond)]);
    expect("none" in s.read).toBe(true);
  });

  it("is refused where lines outside its figure lie by it", () => {
    const [s] = structuresOf(drawn, 0, "pdf", 0, [{ box: [right + 0.5 * bond, atRight.y - 1, right + 2 * bond, atRight.y + 1] }]);
    expect(s.read).toEqual({ none: "Part of this structure could not be read (lines drawn beside it lie outside its figure), so none of it is taken." });
  });

  it("is read whole where what lies outside its figure is more than a bond off", () => {
    const [s] = structuresOf(drawn, 0, "pdf", 0, [label(1.5 * bond, 60)]);
    expect("model" in s.read).toBe(true);
  });

  it("keeps a compound's number under it, in its own figure, as text: the structure whole, and the number no part of it", () => {
    const low = Math.max(...whole.atoms.map((a) => a.y), ...whole.labels.map((l) => l[3]));
    const mid = (whole.box[0] + whole.box[2]) / 2;
    const number = [{ c: "1", box: [mid - 2, low + 0.8 * bond, mid + 2, low + 0.8 * bond + 7] as [number, number, number, number], at: [mid - 2, low + 0.8 * bond + 7] as [number, number], size: 9 }, { c: "a", box: [mid + 2.5, low + 0.8 * bond + 2, mid + 6.5, low + 0.8 * bond + 7] as [number, number, number, number], at: [mid + 2.5, low + 0.8 * bond + 7] as [number, number], size: 9 }];
    const { structures, marks } = figureOn({ ...drawn, letters: [...drawn.letters, ...number] }, 0, "pdf", 0, []);
    expect(structures).toHaveLength(1);
    expect(formula(structures[0])).toBe(formula(whole));
    expect(structureAt(structures, mid, low + 0.8 * bond + 4, marks)).toBeNull();
  });
});

describe("a line of words, its signs read as bonds", () => {
  type P = [number, number];
  const stroke = (...pts: P[]) => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i) => [i ? "L" : "M", x, y]) }) as FigureDrawn["paths"][number];
  const word = (text: string, x: number, y = 300) => [...text].map((c, i) => ({ c, box: [x + i * 6, y - 3.6, x + 5.5 + i * 6, y + 3.6] as [number, number, number, number], at: [x + i * 6, y + 3.6] as [number, number], size: 10 }));
  // (a chain beside, so that the figure has a bond's length to go by)
  const chain = [stroke([100, 360], [112.5, 352.8], [125, 360], [137.5, 352.8])];
  const reads = (paths: FigureDrawn["paths"], letters: FigureDrawn["letters"]) => structuresOf({ paths: [...chain, ...paths], letters, pictures: [] }, 0, "pdf", 0, []).map((st) => ("none" in st.read ? st.read.none : "whole"));

  it("refuses \"R2 = SPh\" - its = read as a double bond between two labels on one line - saying it is a line of words", () => {
    const out = reads([stroke([114, 298.6], [124, 298.6]), stroke([114, 301.4], [124, 301.4])], [...word("R2", 100), ...word("SPh", 126)]);
    expect(out).toContain('It is a line of words ("R2", "SPh"), not a structure drawn, so none of it is taken.');
  });

  it("refuses a line whose sign joins a label that reads as nothing - an italic t read as f before a hyphen", () => {
    const out = reads([stroke([106, 300], [113, 300])], [...word("f", 100), ...word("BuNH2", 115)]);
    expect(out.some((o) => o.startsWith("It is a line of words"))).toBe(true);
  });

  it("refuses \"PG = Boc\", \"LG = SEt\", \"Ar = Ph\" and \"n = 1\": a name of a kind of group, or a legend's term, at an end of the =", () => {
    for (const [l, r] of [["PG", "Boc"], ["LG", "SEt"], ["Ar", "Ph"]]) {
      const out = reads([stroke([114, 298.6], [124, 298.6]), stroke([114, 301.4], [124, 301.4])], [...word(l, 100), ...word(r, 126)]);
      expect(out).toContain(`It is a line of words ("${l}", "${r}"), not a structure drawn, so none of it is taken.`);
    }
    // ("n = 1": its 1 taken for a compound's number, its = for a double bond from the n to nothing - a legend all the same)
    const n = reads([stroke([108, 298.6], [118, 298.6]), stroke([108, 301.4], [118, 301.4])], [...word("n", 100), ...word("1", 120)]);
    expect(n).toContain('It is a line of words ("n"), not a structure drawn, so none of it is taken.');
  });

  /** A molecule written on one line: its labels, each with the bonds after it - single, double, triple - as strokes beside each other. */
  const written = (parts: [string, number][]) => {
    const paths: FigureDrawn["paths"] = [];
    const letters: FigureDrawn["letters"] = [];
    let x = 100;
    for (const [label, order] of parts) {
      letters.push(...word(label, x));
      x += label.length * 6 + 2;
      if (order) {
        for (let k = 0; k < order; k++) paths.push(stroke([x, 300 + (k - (order - 1) / 2) * 2.4], [x + 10, 300 + (k - (order - 1) / 2) * 2.4]));
        x += 12;
      }
    }
    return reads(paths, letters);
  };

  it("but reads molecules written on one line, their labels all elements or groups - O=C=O, S=C=S, MeC≡CMe, Me3SiC≡CSiMe3, PhN=NPh, N≡N, MeC≡N, HC≡CH, Cl-Hg-Cl", () => {
    const molecules: [string, number][][] = [
      [["O", 2], ["C", 2], ["O", 0]],
      [["S", 2], ["C", 2], ["S", 0]],
      [["H3C", 1], ["C", 3], ["C", 1], ["CH3", 0]],
      [["Me3Si", 1], ["C", 3], ["C", 1], ["SiMe3", 0]],
      [["Ph", 1], ["N", 2], ["N", 1], ["Ph", 0]],
      [["N", 3], ["N", 0]],
      [["CH3", 1], ["C", 3], ["N", 0]],
      [["HC", 3], ["CH", 0]],
      [["Cl", 1], ["Hg", 1], ["Cl", 0]],
    ];
    for (const m of molecules) expect([m.map((p) => p[0]).join(""), written(m)]).toEqual([m.map((p) => p[0]).join(""), ["whole", "whole"]]);
  });
});

describe("every structure on a page", () => {
  const drawn = camphor as unknown as FigureDrawn;
  const [whole] = structuresOf(drawn, 0, "pdf", 0, []);
  const bond = whole.reach * 3;
  const figure = [whole.box[0] - 2, whole.box[1] - 2, whole.box[2] + 2, whole.box[3] + 2] as [number, number, number, number];
  const right = Math.max(...whole.atoms.map((a) => a.x));
  const y = whole.atoms.find((a) => a.x === right)!.y;

  it("reads each figure with all of the page outside it beside it: a label outside its figure refuses it, named", () => {
    const outside = { kind: "text" as const, box: [figure[2] + 0.2 * bond, y - 4, figure[2] + 0.2 * bond + 60, y + 4] as [number, number, number, number] };
    const inside = { kind: "path" as const, box: whole.box };
    const { structures } = pageStructuresOf({ objects: [inside, outside], wordsIn: () => "OSiPh2tBu" }, [figure], () => drawn, "pdf", 0);
    expect(structures.map((s) => s.read)).toEqual([{ none: 'Part of this structure could not be read ("OSiPh2tBu" lies beside it), so none of it is taken.' }]);
  });

  it("reads a structure whole whose own label's box passes its figure's edge a little - a letter's full height - as PDFium boxes one", () => {
    const own = { kind: "text" as const, box: [right - 2, y - 6, figure[2] + 3, y + 6] as [number, number, number, number] };
    const { structures } = pageStructuresOf({ objects: [own], wordsIn: () => "O" }, [figure], () => drawn, "pdf", 0);
    expect("model" in structures[0].read).toBe(true);
  });

  it("refuses a structure whose wide label straddles its figure's edge and the next figure's - reaching into both, most of it outside - naming the words", () => {
    // (60 points of label from 3 points inside its figure, the other half's bonds 2 points past its end)
    const label = { kind: "text" as const, box: [figure[2] - 3, y - 4, figure[2] + 57, y + 4] as [number, number, number, number] };
    const halfB = { kind: "path" as const, box: [figure[2] + 59, y - 8, figure[2] + 59 + 3 * bond, y + 8] as [number, number, number, number] };
    const figureB = [figure[2] + 50, y - 10, figure[2] + 60 + 3 * bond, y + 10] as [number, number, number, number];
    const { structures } = pageStructuresOf({ objects: [label, halfB], wordsIn: () => "OSiPh2tBu" }, [figure, figureB], (k) => (k === 0 ? drawn : null), "pdf", 0);
    expect("none" in structures[0].read).toBe(true);
  });

  it("reads a structure whole on a page with a background behind all of it - three full-page paths, as a browser prints a page", () => {
    const page = { kind: "path" as const, box: [0, 0, 612, 792] as [number, number, number, number] };
    const { structures } = pageStructuresOf({ objects: [page, page, page, { kind: "path", box: whole.box }] }, [figure], () => drawn, "pdf", 0);
    expect("model" in structures[0].read).toBe(true);
  });

  it("reads a structure whole in a frame drawn round it, and two whole on a coloured panel behind both", () => {
    const frame = { kind: "path" as const, box: [figure[0] - 0.5 * bond, figure[1] - 0.5 * bond, figure[2] + 0.5 * bond, figure[3] + 0.5 * bond] as [number, number, number, number] };
    expect("model" in pageStructuresOf({ objects: [frame] }, [figure], () => drawn, "pdf", 0).structures[0].read).toBe(true);
    // (the same structure again, four bonds to the right, in a figure of its own: a panel behind both, its middle between them)
    const shift = (b: [number, number, number, number], dx: number) => [b[0] + dx, b[1], b[2] + dx, b[3]] as [number, number, number, number];
    const dx = figure[2] - figure[0] + 4 * bond;
    const moved: FigureDrawn = { ...drawn, paths: drawn.paths.map((p) => ({ ...p, d: p.d.map((st) => (st[0] === "Z" ? st : ([st[0], st[1] + dx, st[2]] as typeof st))) })), letters: drawn.letters.map((l) => ({ ...l, box: shift(l.box, dx), at: l.at ? ([l.at[0] + dx, l.at[1]] as [number, number]) : l.at })) };
    const panel = { kind: "shading" as const, box: [figure[0] - bond, figure[1] - bond, figure[2] + dx + bond, figure[3] + bond] as [number, number, number, number] };
    const { structures } = pageStructuresOf({ objects: [panel] }, [figure, shift(figure, dx)], (k) => (k === 0 ? drawn : moved), "pdf", 0);
    expect(structures.map((s) => "model" in s.read)).toEqual([true, true]);
  });

  it("still refuses a structure where lines cross into it from outside its figure, though a background lies behind all", () => {
    const page = { kind: "path" as const, box: [0, 0, 612, 792] as [number, number, number, number] };
    const crossing = { kind: "path" as const, box: [figure[2] - 0.5 * bond, y - 2, figure[2] + 3 * bond, y + 2] as [number, number, number, number] };
    const { structures } = pageStructuresOf({ objects: [page, crossing] }, [figure], () => drawn, "pdf", 0);
    expect(structures[0].read).toEqual({ none: "Part of this structure could not be read (lines drawn beside it lie outside its figure), so none of it is taken." });
  });

  it("reads a structure whole where all else on the page lies far from it", () => {
    const far = { kind: "text" as const, box: [figure[2] + 3 * bond, y - 4, figure[2] + 3 * bond + 60, y + 4] as [number, number, number, number] };
    const { structures } = pageStructuresOf({ objects: [far] }, [figure], () => drawn, "pdf", 0);
    expect("model" in structures[0].read).toBe(true);
  });
});

describe("words at a bond's open end, in the structure's own figure", () => {
  const drawn = camphor as unknown as FigureDrawn;
  const { read, back } = schemeDrawn(drawn);
  const f = read.figure;
  const degree = new Map<number, number>();
  for (const b of f.bonds) for (const e of [b.a, b.b]) degree.set(e, (degree.get(e) ?? 0) + 1);
  const end = f.atoms.find((a, i) => degree.get(i) === 1 && !a.label)!;
  // (letters set as words - 150 points of them, too wide for a label - starting a tenth of a bond past the open end)
  const word = (text: string, x0: number, y0: number) =>
    [...text].map((c, k) => ({ c, box: [x0 + k * 6, y0, x0 + 5 + k * 6, y0 + 7] as [number, number, number, number], at: [x0 + k * 6, y0 + 7] as [number, number], size: 9 }));

  it("refuse a structure with 150 points of words at a bond's end, the rest of it past them in the next figure - neither half read", () => {
    const long = word("OSiPh2tBuprotectedalcohol", end.x + 0.1 * f.bond, end.y - 3.5);
    const withLong = { ...drawn, letters: [...drawn.letters, ...long] };
    const [own] = structuresOf(withLong, 0, "pdf", 0, []);
    const figureA = [own.box[0] - 1, own.box[1] - 1, own.box[2] + 1, own.box[3] + 1] as [number, number, number, number];
    // (the other half: bonds starting 3 points past the words, in a figure of its own)
    const x = Math.max(...long.map((l) => l.box[2])) + 3;
    const halfB = { kind: "path" as const, box: [x, end.y - 6, x + 3 * f.bond, end.y + 6] as [number, number, number, number] };
    const { structures } = pageStructuresOf({ objects: [halfB] }, [figureA], () => withLong, "pdf", 0);
    expect("none" in structures[0].read).toBe(true);
    void back;
  });

  it("never read a structure whole in silence with a 30-point label 6 points off a bond's open end - refused, or its label marked unsure", () => {
    const label = word("OTBDPS", end.x + 6, end.y - 3.5);
    const [s] = structuresOf({ ...drawn, letters: [...drawn.letters, ...label] }, 0, "pdf", 0, []);
    const silent = "model" in s.read && !s.read.model.atoms.some((a) => a.unsure);
    expect(silent).toBe(false);
  });

  it("mark a label they could not read as unsure, where the structure is read: never taken for a known group in silence", () => {
    const long = word("OSiPh2tBuprotectedalcohol", end.x + 0.1 * f.bond, end.y - 3.5);
    const [s] = structuresOf({ ...drawn, letters: [...drawn.letters, ...long] }, 0, "pdf", 0, []);
    if ("none" in s.read) return;
    const odd = s.read.model.atoms.filter((a) => a.el.length > 3);
    expect(odd.every((a) => !!a.unsure)).toBe(true);
  });
});

describe("what of a page is a figure's own", () => {
  it("is what has its middle within it: a label passing its edge by a letter's height is its own, one mostly outside is not", () => {
    expect(centreWithin([90, 10, 102, 22], [0, 0, 100, 100])).toBe(true);
    expect(centreWithin([97, 10, 157, 18], [0, 0, 100, 100])).toBe(false);
    expect(centreWithin([120, 10, 130, 20], [0, 0, 100, 100])).toBe(false);
  });
});

describe("a structure cut in two at a wide label reaching into both its halves' figures", () => {
  const drawn = camphor as unknown as FigureDrawn;
  const [one] = structuresOf(drawn, 0, "pdf", 0, []);
  const shifted = (d: FigureDrawn, dx: number): FigureDrawn => ({
    ...d,
    paths: d.paths.map((p) => ({ ...p, d: p.d.map((st) => (st[0] === "Z" ? st : ([st[0], st[1] + dx, st[2]] as typeof st))) })),
    letters: d.letters.map((l) => ({ ...l, box: [l.box[0] + dx, l.box[1], l.box[2] + dx, l.box[3]] as typeof l.box, at: l.at ? ([l.at[0] + dx, l.at[1]] as [number, number]) : l.at })),
  });
  const y = (one.box[1] + one.box[3]) / 2;
  for (const overlap of [2, 5]) {
    it(`refuses both halves, naming the label: 130 points of it reaching ${overlap} points into each`, () => {
      const figA = [one.box[0] - 1, one.box[1] - 1, one.box[2] + 1, one.box[3] + 1] as [number, number, number, number];
      const label = { kind: "text" as const, box: [figA[2] - overlap, y - 4, figA[2] - overlap + 130, y + 4] as [number, number, number, number] };
      const dx = label.box[2] - overlap - figA[0];
      const figB = [figA[0] + dx, figA[1], figA[2] + dx, figA[3]] as [number, number, number, number];
      const pathsA = { kind: "path" as const, box: one.box };
      const pathsB = { kind: "path" as const, box: [one.box[0] + dx, one.box[1], one.box[2] + dx, one.box[3]] as [number, number, number, number] };
      const { structures } = pageStructuresOf({ objects: [pathsA, label, pathsB], wordsIn: () => "OSiPh2tBuOTBDPSlongname" }, [figA, figB], (k) => (k === 0 ? drawn : shifted(drawn, dx)), "pdf", 0);
      expect(structures.map((s) => ("none" in s.read ? s.read.none : "whole"))).toEqual([0, 1].map(() => 'Part of this structure could not be read ("OSiPh2tBuOTBDPSlongname" lies beside it), so none of it is taken.'));
    });
  }
});

describe("a label between a structure's two halves, as the page's objects have it (the review desk's probe)", () => {
  const drawn = camphor as unknown as FigureDrawn;
  const [one] = structuresOf(drawn, 0, "p", 0, []);
  const shift = (d: FigureDrawn, dx: number): FigureDrawn => ({
    ...d,
    paths: d.paths.map((p) => ({ ...p, d: p.d.map((st) => (st.length === 3 ? ([st[0], st[1] + dx, st[2]] as typeof st) : st)) })),
    letters: d.letters.map((l) => ({ ...l, box: [l.box[0] + dx, l.box[1], l.box[2] + dx, l.box[3]] as typeof l.box, at: l.at ? ([l.at[0] + dx, l.at[1]] as [number, number]) : l.at, ...(l.loose ? { loose: [l.loose[0] + dx, l.loose[1], l.loose[2] + dx, l.loose[3]] as typeof l.box } : {}) })),
  });
  const bondBoxes = (dx: number) => one.bonds.map(([a, b]) => ({ kind: "path" as const, box: [Math.min(a.x, b.x) + dx, Math.min(a.y, b.y), Math.max(a.x, b.x) + dx, Math.max(a.y, b.y)] as [number, number, number, number] }));
  const y = (one.box[1] + one.box[3]) / 2;
  const read = (label: number, gap: number) => {
    const x0 = one.box[2] + gap;
    const dxB = x0 + label + gap - one.box[0];
    const objects = [...bondBoxes(0), { kind: "text" as const, box: [x0, y - 4, x0 + label, y + 4] as [number, number, number, number] }, ...bondBoxes(dxB)];
    const figs = figuresOf(objects);
    const r = pageStructuresOf({ objects, wordsIn: () => "OSiPh2tBu" }, figs, (k) => (figs[k][0] < one.box[2] + 1 ? drawn : shift(drawn, dxB)), "p", 0);
    return { figures: figs.length, kinds: r.structures.map((st) => ("none" in st.read ? "refused" : "read")) };
  };

  it("reads a whole structure whole where a word lies 6 points off one of its ring atoms - no open end there, as a compound's name beside it", () => {
    expect(read(30, 6).kinds[0]).toBe("read");
  });

  it("refuses a structure where a 30-point word of its own figure, none of its labels, lies 6 points past one of its open ends - a label its drawing did not hold", () => {
    const end = one.ends[0];
    const word = { kind: "text" as const, box: [end.x - 15, end.y + 6, end.x + 15, end.y + 14] as [number, number, number, number] };
    const fig = [one.box[0] - 1, one.box[1] - 1, one.box[2] + 1, end.y + 15] as [number, number, number, number];
    const r = pageStructuresOf({ objects: [...bondBoxes(0), word], wordsIn: () => "OSiPh2tBu" }, [fig], () => drawn, "p", 0);
    expect(r.structures[0].read).toEqual({ none: 'Part of this structure could not be read ("OSiPh2tBu" lies beside it), so none of it is taken.' });
  });

  for (const overlap of [2, 5]) {
    it(`refuses both halves where a 130-point label reaches ${overlap} points into each`, () => {
      const r = read(130, -overlap);
      expect(r.kinds.every((k) => k === "refused")).toBe(true);
    });
  }
});
