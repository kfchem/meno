import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import aldol from "../../../../lib/figure/fixtures/aldol-rdkitrxn.json";
import camphor from "../../../../lib/figure/fixtures/camphor-rdkitacs.json";
import acetate from "../../../../lib/figure/fixtures/sodium-acetate-rdkit.json";
import { schemeDrawn } from "./figures";
import { figureOn, pageStructuresOf, structureAt, structuresOf, type PageStructure } from "./pageStructures";

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

  it("mark a label they could not read as unsure, where the structure is read: never taken for a known group in silence", () => {
    const long = word("OSiPh2tBuprotectedalcohol", end.x + 0.1 * f.bond, end.y - 3.5);
    const [s] = structuresOf({ ...drawn, letters: [...drawn.letters, ...long] }, 0, "pdf", 0, []);
    if ("none" in s.read) return;
    const odd = s.read.model.atoms.filter((a) => a.el.length > 3);
    expect(odd.every((a) => !!a.unsure)).toBe(true);
  });
});
