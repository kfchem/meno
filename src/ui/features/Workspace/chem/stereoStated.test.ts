import { describe, expect, it } from "vitest";
import { readStereo } from "../../../../lib/layout/drawn";
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

  it("is not read from a centre with two of its three bonds in line, a T, or on top of each other", () => {
    // (Cl and Br 180 - 5 degrees apart; Cl and Br 6 degrees apart: RDKit reads R from both, by its own tolerance)
    expect(stereoOf(centre(90, 175, 0)).tetra.has(0)).toBe(false);
    expect(stereoOf(centre(90, 210, 216)).tetra.has(0)).toBe(false);
  });

  it("is read from a double bond whose groups are clear of its line, and not from one with a group straight on", () => {
    for (const text of [double(120, 120), double(165, 120)]) {
      const [ct] = [...stereoOf(text).cisTrans.values()];
      expect(ct).toEqual({ refs: [2, 3], cis: false });
    }
    // (F 5 degrees off straight on: RDKit reads E, by its own tolerance)
    expect(stereoOf(double(175, 120)).cisTrans.size).toBe(0);
  });

  it("stops Clean-up, which would draw it one way, moving nothing", async () => {
    const t = canvas(modelOf(centre(90, 175, 0)));
    const tBefore = t.getState().model;
    await expect(cleanUp(t)).rejects.toThrow(/two of its bonds in line or on top of each other/);
    expect(t.getState().model).toBe(tBefore);
    const d = canvas(modelOf(double(175, 120)));
    const dBefore = d.getState().model;
    await expect(cleanUp(d)).rejects.toThrow(/a configuration its drawing does not state/);
    expect(d.getState().model).toBe(dBefore);
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
