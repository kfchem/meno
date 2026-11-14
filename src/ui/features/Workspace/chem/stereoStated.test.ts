import { describe, expect, it } from "vitest";
import { readStereo, sameConfiguration, straightEnds, type DrawnAtom, type DrawnBond } from "../../../../lib/layout/drawn";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { editorModelOf } from "../utils/io";
import { cleanUp } from "./cleanUp";
import { drawingOf } from "./drawing";

// Drawings that state a configuration and drawings that do not, by IUPAC 2006
// (Brecher, Pure Appl. Chem. 78, 1897): two of a centre's three bonds in line
// - a T (ST-1.2.12) - or on top of each other, and a double bond's group
// straight on from it (ST-4.4), "linear" being within 10 degrees of it
// (ST-0.1). Each drawing is a molfile, read as a file is. Where one states a
// configuration, the answer is the one read by hand from the regular drawing -
// (R)-bromochlorofluoromethane: Br, Cl and F clockwise with the H behind its
// wedge - and RDKit's (2026.03) reading of each drawing, the same.

const L = 1.5;
const toward = (deg: number): [number, number] => [L * Math.cos((deg * Math.PI) / 180), L * Math.sin((deg * Math.PI) / 180)];

function molfile(atoms: [string, number, number][], bonds: [number, number, number, number][]): string {
  const row = (n: number, w: number) => n.toFixed(4).padStart(w);
  return [
    "",
    "  synthetic",
    "",
    `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...atoms.map(([el, x, y]) => `${row(x, 10)}${row(y, 10)}${row(0, 10)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...bonds.map((b) => b.map((n) => String(n).padStart(3)).join("")),
    "M  END",
    "",
  ].join("\n");
}

/** CHFClBr, its H left out, its bonds to F, Cl and Br at these angles, a wedge to Br. */
const centre = (f: number, cl: number, br: number) =>
  molfile(
    [["C", 0, 0], ["F", ...toward(f)], ["Cl", ...toward(cl)], ["Br", ...toward(br)]],
    [[1, 2, 1, 0], [1, 3, 1, 0], [1, 4, 1, 1]],
  );

/** F-CH=CH-Cl, trans, each group at this angle to the double bond. */
const double = (onF: number, onCl: number) =>
  molfile(
    [
      ["C", 0, 0],
      ["C", L, 0],
      ["F", L * Math.cos(((180 - onF) * Math.PI) / 180) * -1, L * Math.sin(((180 - onF) * Math.PI) / 180)],
      ["Cl", L + L * Math.cos(((180 - onCl) * Math.PI) / 180), -L * Math.sin(((180 - onCl) * Math.PI) / 180)],
    ],
    [[1, 2, 2, 0], [1, 3, 1, 0], [2, 4, 1, 0]],
  );

const modelOf = (text: string): Model => editorModelOf(moleculesToEditorModel(readMoleculesFromText(text, "mol")).model);
function stereoOf(text: string) {
  const d = drawingOf(modelOf(text));
  return readStereo(d.atoms, d.bonds);
}

function canvas(m: Model) {
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model: m, nextId: 2000 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return store;
}

describe("a configuration the drawing does not state", () => {
  const regular = stereoOf(centre(90, 210, 330)).tetra.get(0)!;

  it("is read from a centre drawn regular, or with its bonds clear of one line and of each other", () => {
    expect(regular.volume).not.toBe(0);
    // (Cl and Br 168 degrees apart: not a T; Br and Cl 14 apart: not on top of each other - R, as the regular one)
    for (const text of [centre(90, 168, 0), centre(90, 210, 224)]) {
      const t = stereoOf(text).tetra.get(0);
      expect(t).toEqual(regular);
    }
  });

  it("is not read from a centre with two of its three bonds plain and in line, a T, or two on top of each other", () => {
    // (F and Cl plain, 180 - 5 degrees apart, the wedged Br between them: a T, ST-1.2.12; Cl and Br 6 degrees apart)
    expect(stereoOf(centre(0, 175, 90)).tetra.has(0)).toBe(false);
    expect(stereoOf(centre(90, 210, 216)).tetra.has(0)).toBe(false);
  });

  it("is read from a centre with its wedge on one of two bonds in line, as the same centre drawn with its bonds apart (ST-1.2.3, ST-1.2.4)", () => {
    // (Cl and the wedged Br 180 - 5 degrees apart, F to one side: the H in the widest gap, opposite the wedge; the Br anywhere in that gap the same)
    const inLine = stereoOf(centre(90, 175, 0)).tetra.get(0);
    const apart = stereoOf(centre(90, 175, 300)).tetra.get(0);
    expect(inLine).toBeDefined();
    expect(sameConfiguration(inLine!, apart!)).toBe(true);
  });

  it("is read from a double bond whose groups are clear of its line, and not from one with a group straight on", () => {
    for (const text of [double(120, 120), double(165, 120)]) {
      const [ct] = [...stereoOf(text).cisTrans.values()];
      expect(ct).toEqual({ refs: [2, 3], cis: false });
    }
    // (F 5 degrees off straight on: RDKit reads E, by its own tolerance)
    expect(stereoOf(double(175, 120)).cisTrans.size).toBe(0);
  });

  it("stops Clean-up at a centre, which it would draw one way, moving nothing", async () => {
    const t = canvas(modelOf(centre(0, 175, 90)));
    const tBefore = t.getState().model;
    await expect(cleanUp(t)).rejects.toThrow(/two of its bonds in line or on top of each other/);
    expect(t.getState().model).toBe(tBefore);
  });

  // (the angle at an atom between two of its neighbours, by atom index in the model, in degrees)
  const angleAt = (m: Model, at: number, p: number, q: number) => {
    const [o, u, v] = [m.atoms[at], m.atoms[p], m.atoms[q]];
    const d = Math.abs(Math.atan2(u.y - o.y, u.x - o.x) - Math.atan2(v.y - o.y, v.x - o.x)) * (180 / Math.PI);
    return d > 180 ? 360 - d : d;
  };

  it("finds the ends a double bond is drawn straight at, its configuration unsaid", () => {
    const ends = (text: string) => {
      const d = drawingOf(modelOf(text));
      return [...straightEnds(d.atoms, d.bonds)];
    };
    expect(ends(double(175, 120))).toEqual([0]);
    expect(ends(double(178, 176)).sort()).toEqual([0, 1]);
    expect(ends(double(120, 120))).toEqual([]);
    expect(ends(double(165, 120))).toEqual([]);
  });

  it("finds none in a ring of seven atoms or fewer, nor beside a wavy bond", () => {
    // (a C=C, 0=1, its ring neighbour at 0 straight on from it, the rest of the ring round above it; n atoms in the ring)
    const ring = (n: number): DrawnBond[] => [{ a: 0, b: 1, order: 2 }, ...Array.from({ length: n - 1 }, (_, i) => ({ a: i + 1, b: (i + 2) % n, order: 1 }))];
    const placed = (n: number): DrawnAtom[] => [
      { x: 0, y: 0, hs: 1 },
      { x: L, y: 0, hs: 1 },
      ...Array.from({ length: n - 3 }, (_, i) => ({ x: L - (i * 2 * L) / Math.max(1, n - 4), y: L * (1 + (i % 2) * 0.2), hs: 2 })),
      { x: -L, y: 0, hs: 2 },
    ];
    expect([...straightEnds(placed(6), ring(6))]).toEqual([]);
    expect([...straightEnds(placed(9), ring(9))]).toEqual([0]);
    // (F-CH=CH-Cl, the F straight on, the Cl's bond wavy: the double bond said to be either)
    const atoms: DrawnAtom[] = [
      { x: 0, y: 0, hs: 1 },
      { x: L, y: 0, hs: 1 },
      { x: -L, y: 0.02, el: "F", hs: 0 },
      { x: L + toward(-60)[0], y: toward(-60)[1], el: "Cl", hs: 0 },
    ];
    const bonds = (either: boolean): DrawnBond[] => [
      { a: 0, b: 1, order: 2 },
      { a: 0, b: 2, order: 1 },
      { a: 1, b: 3, order: 1, ...(either ? { either: true } : {}) },
    ];
    expect([...straightEnds(atoms, bonds(true))]).toEqual([]);
    expect([...straightEnds(atoms, bonds(false))]).toEqual([0]);
  });

  it("is kept unsaid by Clean-up, which keeps the straight end straight and lays out the rest (ST-4.4)", async () => {
    for (const [onF, onCl, straight] of [
      [175, 120, [0]],
      [178, 176, [0, 1]],
    ] as const) {
      const d = canvas(modelOf(double(onF, onCl)));
      await cleanUp(d);
      const m = d.getState().model;
      const r = drawingOf(m);
      expect(readStereo(r.atoms, r.bonds).cisTrans.size, `${onF}/${onCl}`).toBe(0);
      // (C1's group F straight on from the C=C, C2's Cl too where it was)
      if ((straight as readonly number[]).includes(0)) expect(angleAt(m, 0, 1, 2)).toBeGreaterThan(170);
      if ((straight as readonly number[]).includes(1)) expect(angleAt(m, 1, 0, 3)).toBeGreaterThan(170);
    }
  });

  it("is kept unsaid at an end with two groups beside a straight one, and in a larger structure", async () => {
    // (F-CH=C(CH3)Cl, the F straight on: the other end's two groups say nothing without one on this end)
    const branched = molfile(
      [["C", 0, 0], ["C", L, 0], ["F", -L, 0.02], ["Cl", ...([L + toward(-60)[0], toward(-60)[1]] as [number, number])], ["C", ...([L + toward(60)[0], toward(60)[1]] as [number, number])]],
      [[1, 2, 2, 0], [1, 3, 1, 0], [2, 4, 1, 0], [2, 5, 1, 0]],
    );
    // (a phenyl on the far end of a C=C whose methyl end is drawn straight)
    const ph = [0, 1, 2, 3, 4, 5].map((k) => [2 * L + L * Math.cos((k * Math.PI) / 3), L * Math.sin((k * Math.PI) / 3)] as [number, number]);
    const styrene = molfile(
      [["C", 0, 0], ["C", L, 0], ["C", -L, 0], ...ph.map((p) => ["C", p[0] + L, p[1]] as [string, number, number])],
      [[1, 2, 2, 0], [1, 3, 1, 0], [2, 4, 1, 0], [4, 5, 2, 0], [5, 6, 1, 0], [6, 7, 2, 0], [7, 8, 1, 0], [8, 9, 2, 0], [9, 4, 1, 0]],
    );
    for (const text of [branched, styrene]) {
      expect(stereoOf(text).cisTrans.size).toBe(0);
      const d = canvas(modelOf(text));
      await cleanUp(d);
      const m = d.getState().model;
      const r = drawingOf(m);
      expect(readStereo(r.atoms, r.bonds).cisTrans.size).toBe(0);
      expect(angleAt(m, 0, 1, 2)).toBeGreaterThan(170);
    }
  });

  it("leaves Clean-up of a drawing that states its configuration as it was", async () => {
    for (const text of [centre(90, 168, 0), double(165, 120)]) {
      const store = canvas(modelOf(text));
      await cleanUp(store);
      const d = drawingOf(store.getState().model);
      const s = readStereo(d.atoms, d.bonds);
      expect(s.tetra.size + s.cisTrans.size).toBe(1);
    }
  });
});
