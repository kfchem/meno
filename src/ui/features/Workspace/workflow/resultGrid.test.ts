import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { addStep } from "./model";
import { laidOut, placeResults, ROW_MOST, rowMost, SET_ASPECT, type RunWith } from "./run";

/** A molecule `w` ångströms wide and `h` tall, as a generator gives one - each a little different. */
const room = (w: number, h: number) => ({ x0: -w / 2, x1: w / 2, y0: -h / 2, y1: h / 2, chip: 0 });
const sizes = (n: number) => Array.from({ length: n }, (_, i) => room(7 + (i % 5), 4 + (i % 3)));

describe("a result set of many molecules", () => {
  it("lays a few out as before: rows no wider than twelve bonds", () => {
    expect(rowMost(sizes(3))).toBe(ROW_MOST);
  });

  it.each([20, 42, 50])("lays %i out as a grid about a window's shape, not a column", (n) => {
    const lay = laidOut(sizes(n));
    const aspect = lay.width / lay.height;
    // (3 : 2 asked; rows broken where a molecule would not fit, so near it)
    expect(aspect).toBeGreaterThan(SET_ASPECT / 1.6);
    expect(aspect).toBeLessThan(SET_ASPECT * 1.6);
    // (several to a row, and none over another)
    const rows = new Set(lay.at.map((p, i) => (p.y + sizes(n)[i].y1).toFixed(6)));
    expect(rows.size).toBeLessThan(n / 3);
    const boxes = sizes(n).map((r, i) => ({ x0: lay.at[i].x + r.x0, x1: lay.at[i].x + r.x1, y0: lay.at[i].y + r.y0, y1: lay.at[i].y + r.y1 }));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        expect(a.x1 <= b.x0 + 1e-9 || b.x1 <= a.x0 + 1e-9 || a.y1 <= b.y0 + 1e-9 || b.y1 <= a.y0 + 1e-9).toBe(true);
      }
  });

  it("is so when a step puts 42 on the page: its set about a window's shape", () => {
    const molecule = (k: number): Omit<Molecule3D, "id" | "at"> => ({
      atoms: [
        { el: "C", x: -4 - (k % 4), y: 0, z: 0 },
        { el: "C", x: 4 + (k % 4), y: 1.5, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
    });
    const extentOf: RunWith["extentOf"] = (m) => ({ x0: m.atoms[0].x, x1: m.atoms[1].x, y0: -2, y1: 2 });
    const doc = addStep(emptyWorkspaceDocument(), "optimise", 0, 0, {}, "xtb");
    const d = placeResults(doc, doc.steps![0], { molecules: Array.from({ length: 42 }, (_, k) => molecule(k)), rest: [], holds: "molecules" }, { extentOf });
    const set = d.sets![0];
    const aspect = (set.x1 - set.x0) / (set.y1 - set.y0);
    expect(aspect).toBeGreaterThan(SET_ASPECT / 1.6);
    expect(aspect).toBeLessThan(SET_ASPECT * 1.6);
  });
});
