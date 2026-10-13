import { describe, expect, it } from "vitest";
import sampleSdf from "../../../../samples/cholesterol.sdf?raw";
import {
  layoutMolecule,
  ringCircles,
  sameAtZooms,
  type Atom as LAtom,
  type Bond as LBond,
  type Layout,
} from "../../../../lib/chem/layout2d";
import { chemistry } from "../../../../lib/chem/molecule";
import { ACS_1996, MENO } from "../../../../lib/chem/style";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { editorModelOf } from "../utils/io";
import { editorLayoutOptions, layoutBonds, startingZoom } from "../layoutOptions";

/** A file's structures as the canvas lays them out: its atoms and bonds as DrawnLayout hands them on. */
function drawn(text: string): { atoms: LAtom[]; bonds: LBond[] } {
  const model = editorModelOf(moleculesToEditorModel(readMoleculesFromText(text, "sdf")).model);
  const index = new Map<number, number>();
  const atoms = model.atoms.map((a, i) => {
    index.set(a.id, i);
    return { id: a.id, x: a.x, y: a.y, el: a.el, ...chemistry(a) };
  });
  return { atoms, bonds: layoutBonds(model.bonds, index) };
}

/** Cholesterol's record, and a file of `n` of them. */
const record = sampleSdf.slice(0, sampleSdf.indexOf("$$$$") + 4) + "\n";
const cholesterol = drawn(record);

/** Two layouts the same, but for rounding: a line's width compared in world units. */
function sameDrawing(a: Layout, b: Layout) {
  const strip = (l: Layout) =>
    JSON.parse(
      JSON.stringify({ ...l, zoom: 0, lines: l.lines.map((s) => ({ ...s, widthPx: s.widthPx / l.zoom })) }),
      (_, v) => (typeof v === "number" ? Number(v.toPrecision(12)) : v),
    );
  expect(strip(a)).toEqual(strip(b));
}

describe("a drawing laid out for the canvas", () => {
  it("lays out a thousand overlapping records in well under the seconds it once took, each as it is alone", () => {
    const one = layoutMolecule(cholesterol.atoms, cholesterol.bonds, editorLayoutOptions(ACS_1996), startingZoom(ACS_1996));
    const timed = (n: number) => {
      const page = drawn(record.repeat(n));
      const started = performance.now();
      const laid = layoutMolecule(page.atoms, page.bonds, editorLayoutOptions(ACS_1996), startingZoom(ACS_1996));
      return { page, laid, ms: performance.now() - started };
    };
    const tenth = timed(100);
    const { page, laid: all, ms } = timed(1000);
    expect(page.atoms).toHaveLength(28_000);
    // (ten times the records in about ten times the time, where each record
    // reaching into the others' drawing took a hundred times - 19 s once:
    // timed against a tenth of the page, so that a machine busy with other
    // work slows both alike, as it would a time set in seconds)
    expect(ms).toBeLessThan(25 * tenth.ms + 100);
    // (records do not reach into each other's drawing: the page is the
    // first record's drawing a thousand times over, bond by bond and label
    // by label, and as much as the record makes alone)
    const n = one.lines.length;
    const first = all.lines.slice(0, n);
    expect(all.lines).toEqual(Array.from({ length: 1000 }, () => first).flat());
    const labels = all.texts.slice(0, one.texts.length).map((t) => [t.text, t.x, t.y]);
    expect(all.texts.map((t) => [t.text, t.x, t.y])).toEqual(Array.from({ length: 1000 }, () => labels).flat());
    expect(all.polys).toHaveLength(one.polys.length * 1000);
    expect(all.fills).toHaveLength(one.fills.length * 1000);
  }, 60_000);

  it("is the same drawing at any zoom where its lines are drawn wider than the least", () => {
    for (const style of [ACS_1996, MENO]) {
      const opts = editorLayoutOptions(style);
      const z = startingZoom(style);
      const least = Math.max(0.5, opts.minLinePx ?? 1) / opts.lineWidthPx;
      for (const other of [z * 0.7, z * 3, least * 1.001]) {
        expect(sameAtZooms(opts, cholesterol.bonds, z, other)).toBe(true);
        sameDrawing(
          layoutMolecule(cholesterol.atoms, cholesterol.bonds, opts, z),
          layoutMolecule(cholesterol.atoms, cholesterol.bonds, opts, other),
        );
      }
      // not where the lines would be drawn thinner than that: they are kept
      // at the least, and so drawn wider than the layout made at `z` has them
      expect(sameAtZooms(opts, cholesterol.bonds, z, least * 0.9)).toBe(false);
    }
  });

  it("is laid out again where a wavy bond's turns are drawn in more steps, or where it is in pixels", () => {
    const opts = editorLayoutOptions(ACS_1996);
    const z = startingZoom(ACS_1996);
    const wavy = cholesterol.bonds.map((b, i) => (i === 0 ? { ...b, stereo: "wavy" as const } : b));
    const at = (zoom: number) => layoutMolecule(cholesterol.atoms, wavy, opts, zoom);
    // in as many steps: the same
    expect(sameAtZooms(opts, wavy, z, z * 1.5)).toBe(true);
    sameDrawing(at(z), at(z * 1.5));
    // close in, its turns rounder: not
    expect(sameAtZooms(opts, wavy, z, z * 40)).toBe(false);
    expect(at(z * 40).lines.length).toBeGreaterThan(at(z).lines.length);
    expect(sameAtZooms({ ...opts, units: "px" }, cholesterol.bonds, z, z * 2)).toBe(false);
  });

  it("finds the circles its rings would have without laying it out", () => {
    // a benzene ring and a naphthalene, as a drawing of their own
    const ring = (cx: number, n: number, first: number) =>
      Array.from({ length: n }, (_, k) => ({
        id: first + k,
        x: cx + Math.cos((Math.PI / 3) * k),
        y: Math.sin((Math.PI / 3) * k),
        el: "C",
      }));
    const atoms: LAtom[] = [...ring(0, 6, 1), ...ring(4, 6, 7)];
    const bonds: LBond[] = [];
    for (const start of [0, 6]) {
      for (let k = 0; k < 6; k++) {
        bonds.push({ a1: start + k, a2: start + ((k + 1) % 6), order: k % 2 ? 1 : 2, stereo: "none" });
      }
    }
    for (const aromaticCircle of [true, false, { enabled: new Set(["7-8-9-10-11-12"]) }]) {
      const opts = editorLayoutOptions(ACS_1996, { aromaticCircle });
      expect(ringCircles(atoms, bonds, opts).circles).toEqual(layoutMolecule(atoms, bonds, opts, startingZoom(ACS_1996)).circles);
    }
    expect(ringCircles(atoms, bonds, editorLayoutOptions(ACS_1996, { aromaticCircle: true })).circles).toHaveLength(2);
  });

  it("gives a thousand rings' circles their rings' colours at little more than the drawing's own cost", () => {
    // (a thousand benzene rings, every other one's bonds coloured, and one
    // with a bond of another colour among them, whose circle has none)
    const atoms: LAtom[] = [];
    const bonds: LBond[] = [];
    for (let r = 0; r < 1000; r++) {
      for (let k = 0; k < 6; k++) atoms.push({ id: r * 6 + k + 1, x: (r % 40) * 4 + Math.cos((Math.PI / 3) * k), y: Math.floor(r / 40) * 4 + Math.sin((Math.PI / 3) * k), el: "C" });
      for (let k = 0; k < 6; k++) {
        const color = r === 1 && k === 0 ? "#0072b2" : r % 2 ? "#d55e00" : undefined;
        bonds.push({ a1: r * 6 + k, a2: r * 6 + ((k + 1) % 6), order: k % 2 ? 1 : 2, stereo: "none", ...(color ? { color } : {}) });
      }
    }
    const timed = (aromaticCircle: boolean) => {
      const opts = editorLayoutOptions(ACS_1996, { aromaticCircle });
      // (once first, so that neither is timed starting cold)
      layoutMolecule(atoms, bonds, opts, startingZoom(ACS_1996));
      const started = performance.now();
      const laid = layoutMolecule(atoms, bonds, opts, startingZoom(ACS_1996));
      return { laid, ms: performance.now() - started };
    };
    const plain = timed(false);
    const { laid, ms } = timed(true);
    expect(laid.circles).toHaveLength(1000);
    expect(laid.circles!.filter((c) => c.color === "#d55e00")).toHaveLength(499);
    expect(laid.circles!.filter((c) => c.color)).toHaveLength(499);
    // (where every bond was tried again for every circle, the circles took
    // four times the drawing's own time: timed beside the same drawing
    // without them, so that a machine busy with other work slows both alike)
    expect(ms).toBeLessThan(2 * plain.ms + 50);
  });
});
