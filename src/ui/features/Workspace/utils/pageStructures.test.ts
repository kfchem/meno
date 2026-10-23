import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import aldol from "../../../../lib/figure/fixtures/aldol-rdkitrxn.json";
import camphor from "../../../../lib/figure/fixtures/camphor-rdkitacs.json";
import acetate from "../../../../lib/figure/fixtures/sodium-acetate-rdkit.json";
import { schemeDrawn } from "./figures";
import { figureOn, structureAt, structuresOf, type PageStructure } from "./pageStructures";

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
    const found = structuresOf(scheme, 2, "pdf", 4);
    expect(found.map((s) => s.key)).toEqual(["2:0", "2:1", "2:2"]);
    expect(found.map(formula).sort()).toEqual(["C2 O1", "C2 O1", "C4 O2"]);
  });

  it("ties each atom of what it reads to where it lies on the page", () => {
    const [s] = structuresOf(scheme, 0, "pdf", 4);
    for (const [k, a] of read(s).atoms.entries()) expect(a.seen).toMatchObject({ sha256: "pdf", page: 4, x: s.atoms[k].x, y: s.atoms[k].y });
  });

  it("takes a lone ion with the structure it lies by: sodium acetate is one structure", () => {
    const found = structuresOf(acetate as unknown as FigureDrawn, 0, "pdf", 0);
    expect(found).toHaveLength(1);
    expect(formula(found[0])).toContain("Na1");
  });

  it("finds none in a figure with no lines: a picture", () => {
    expect(structuresOf({ paths: [], letters: [], pictures: [[0, 0, 100, 100]] }, 0, "pdf", 0)).toEqual([]);
  });

  it("refuses a structure with letters inside it that no atom took, saying so - never read in part", () => {
    const drawn = camphor as unknown as FigureDrawn;
    const [whole] = structuresOf(drawn, 0, "pdf", 0);
    // (in the middle of it, among its bonds, where no label goes)
    const at = { x: (whole.box[0] + whole.box[2]) / 2, y: (whole.box[1] + whole.box[3]) / 2 };
    const stray = { c: "§", box: [at.x - 1.5, at.y - 2, at.x + 1.5, at.y + 2] as [number, number, number, number], at: [at.x - 1.5, at.y + 2] as [number, number], size: 6 };
    const [s] = structuresOf({ ...drawn, letters: [...drawn.letters, stray] }, 0, "pdf", 0);
    expect(s.read).toEqual({ none: 'Part of this structure could not be read ("§"), so none of it is taken.' });
  });
});

describe("the structure under the pointer", () => {
  const scheme = aldol as unknown as FigureDrawn;
  const found = structuresOf(scheme, 0, "pdf", 0);

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
    const { marks } = figureOn(scheme, 0, "pdf", 0);
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
