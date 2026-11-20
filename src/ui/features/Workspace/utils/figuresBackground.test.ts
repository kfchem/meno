/**
 * A figure with a picture under it - a graphical abstract's background, a panel placed as an image - read as without it: the rule for
 * marks drawn over a picture (lib/figure/scheme `marksOver`) takes nothing where the picture is the whole figure's background, and no
 * structure where it covers part of a figure (found in review; the chemistry check's ruling).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import { figureFrom, type FigureResult, type Unread } from "./figures";
import { measured } from "../../../../testing/timeouts";

const SHA = "a".repeat(64);
const DIR = resolve(__dirname, "../../../../lib/figure/fixtures");
const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== "schemes.json")
  .map((f) => [f, JSON.parse(readFileSync(resolve(DIR, f), "utf8")) as FigureDrawn] as const);

/** The box round all a figure draws: its paths' points and its letters' boxes. */
function boxOf(d: FigureDrawn): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of d.paths)
    for (const st of p.d)
      if (st[0] !== "Z")
        for (let i = 1; i + 1 < st.length; i += 2) {
          xs.push(st[i] as number);
          ys.push(st[i + 1] as number);
        }
  for (const l of d.letters) {
    xs.push(l.box[0], l.box[2]);
    ys.push(l.box[1], l.box[3]);
  }
  return [Math.min(...xs) - 5, Math.min(...ys) - 5, Math.max(...xs) + 5, Math.max(...ys) + 5];
}
/** What a figure reads as: its atoms' labels, in order, and its bonds - or why none. */
const read = (d: FigureDrawn) => {
  const r = figureFrom(d, SHA, 0) as FigureResult | Unread;
  return "none" in r ? r.none : { labels: r.model.atoms.map((a) => a.el), bonds: r.model.bonds.length, left: r.left ?? null };
};

describe("a figure with a picture under it", () => {
  it(
    "reads as without it where the picture lies under the whole figure - every fixture",
    () => {
      for (const [name, d] of fixtures) expect(read({ ...d, pictures: [...d.pictures, boxOf(d)] }), name).toEqual(read(d));
    },
    measured(60_000),
  );

  it("keeps the molecules a picture over half a scheme covers: the aldol's and the Diels-Alder's atoms all read", () => {
    for (const name of ["aldol-rdkitrxn.json", "diels-alder-rdkitrxn.json"]) {
      const d = fixtures.find(([f]) => f === name)![1];
      const b = boxOf(d);
      const half: [number, number, number, number] = [b[0], b[1], (b[0] + b[2]) / 2, b[3]];
      expect(read({ ...d, pictures: [...d.pictures, half] }), name).toEqual(read(d));
    }
  });
});
