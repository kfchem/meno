import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../lib/chem/acs";
import type { Layout } from "../../../lib/chem/layout2d";
import { layoutByStructure, structureLayouts } from "../../../lib/chem/layoutStructures";
import { centreOf, magnifiedTo } from "../../../lib/chem/magnified2d";
import { ACS_1996 } from "../../../lib/chem/style";
import { editorLayoutOptions, layoutAtomOf, layoutBonds } from "./layoutOptions";
import type { Atom, Bond } from "./store/types";

/** Butan-2-ol's stereocentre drawn with two hashed bonds - to its methyl and to its OH - and a wedge to its H, a chain on. */
const atoms: Atom[] = [
  { id: 1, el: "C", x: 0, y: 0, r: 0.9 },
  { id: 2, el: "C", x: 0.866 * L, y: 0.5 * L, r: 0.9 },
  { id: 3, el: "C", x: 1.732 * L, y: 0, r: 0.9 },
  { id: 4, el: "C", x: 2.598 * L, y: 0.5 * L, r: 0.9 },
  { id: 5, el: "OH", x: 0.866 * L, y: 1.5 * L, r: 0.9 },
  { id: 6, el: "C", x: -0.866 * L, y: 0.5 * L, r: 0.9 },
  { id: 7, el: "H", x: 0.2 * L, y: -0.9 * L, r: 0.9 },
] as Atom[];
const bonds: Bond[] = [
  { id: 11, a: 1, b: 2, order: 1 },
  { id: 12, a: 2, b: 3, order: 1 },
  { id: 13, a: 3, b: 4, order: 1 },
  { id: 14, a: 2, b: 5, order: 1, stereo: "down" },
  { id: 15, a: 1, b: 6, order: 1, stereo: "down" },
  { id: 16, a: 1, b: 7, order: 1, stereo: "up" },
] as Bond[];

function laidOut(as: Atom[], zoom: number): Layout {
  const index = new Map(as.map((a, i) => [a.id, i]));
  // (at a canvas's zoom, and zoomed far out, where lines are drawn at their least on the screen)
  return layoutByStructure(as.map((a) => layoutAtomOf(a)), layoutBonds(bonds, index), editorLayoutOptions(ACS_1996), zoom, structureLayouts());
}

describe("a structure shown magnified, as it is laid out", () => {
  it.each([40, 2])("is its layout at its true size, K times as large about its centre: every line and its width, wedge, hash, label and its size (zoom %d)", (zoom) => {
    const K = 2;
    const c = centreOf(atoms);
    const one = laidOut(atoms, zoom);
    const two = laidOut(magnifiedTo(atoms, bonds, new Set([1]), K), zoom);
    const at = (x: number, y: number) => ({ x: c.x + (x - c.x) * K, y: c.y + (y - c.y) * K });
    // (lines: the bonds, each hash of a hashed bond - as many, each K times as far apart and as wide)
    expect(two.lines.length).toBe(one.lines.length);
    expect(one.lines.length).toBeGreaterThanOrEqual(3);
    one.lines.forEach((l, i) => {
      const m = two.lines[i];
      const a = at(l.x1, l.y1);
      const b = at(l.x2, l.y2);
      expect(m.x1).toBeCloseTo(a.x, 6);
      expect(m.y1).toBeCloseTo(a.y, 6);
      expect(m.x2).toBeCloseTo(b.x, 6);
      expect(m.y2).toBeCloseTo(b.y, 6);
      expect(m.widthPx).toBeCloseTo(K * l.widthPx, 6);
    });
    // (the wedge: its corners)
    expect(two.polys.length).toBe(one.polys.length);
    // (the wedge and each hash of the two hashed bonds: as many, each K times as far apart and as large)
    expect(one.polys.length).toBeGreaterThan(6);
    one.polys.forEach((p, i) =>
      p.points.forEach((q, j) => {
        const w = at(q.x, q.y);
        expect(two.polys[i].points[j].x).toBeCloseTo(w.x, 6);
        expect(two.polys[i].points[j].y).toBeCloseTo(w.y, 6);
      }),
    );
    // (the labels: where, and how large)
    expect(two.texts.map((t) => t.text)).toEqual(one.texts.map((t) => t.text));
    expect(one.texts.some((t) => t.text.includes("O"))).toBe(true);
    one.texts.forEach((t, i) => {
      const w = at(t.x, t.y);
      expect(two.texts[i].x).toBeCloseTo(w.x, 6);
      expect(two.texts[i].y).toBeCloseTo(w.y, 6);
      expect(two.texts[i].fontPx).toBeCloseTo(K * t.fontPx, 6);
    });
  });
});
