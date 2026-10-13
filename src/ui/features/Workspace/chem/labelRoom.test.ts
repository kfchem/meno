import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { STYLE_PRESETS, styleOf } from "../../../../lib/chem/style";
import { createWorkspaceDocument } from "../document";
import { drawingLayout, drawnOf } from "../fileActions";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { cleanUp } from "./cleanUp";

const L = NOMINAL_BOND_LENGTH;
const C30 = Math.cos(Math.PI / 6);
const atom = (id: number, x: number, y: number, el: string, more: object = {}) => ({ id, x, y, r: 0.9, el, ...more });
const bond = (id: number, a: number, b: number) => ({ id, a, b, order: 1 as const });

/** Methylmagnesium bromide as a chemist draws it, each bond a bond's length: its Br a terminal label beside Mg's. */
const grignard = (): Model => ({
  atoms: [atom(1, 0, 0, "C"), atom(2, L * C30, L / 2, "Mg"), atom(3, 2 * L * C30, 0, "Br")],
  bonds: [bond(4, 1, 2), bond(5, 2, 3)],
});
/** Tritiated water, each 3H a terminal label beside the O's. */
const water = (): Model => ({
  atoms: [atom(1, 0, 0, "O"), atom(2, -L * C30, -L / 2, "H", { isotope: 3 }), atom(3, L * C30, -L / 2, "H", { isotope: 3 })],
  bonds: [bond(4, 1, 2), bond(5, 1, 3)],
});

/** A canvas holding `m`, drawn in a style of its own: `preset`'s. */
function canvas(m: Model, preset: string) {
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model: m, nextId: 100 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().setDocumentStyle({ preset, changes: {} });
  return store;
}
/** The bonds the labels of `model` crowd, as the canvas draws it in `preset`. */
const crowded = (model: Model, preset: string) =>
  drawingLayout(drawnOf({ model, arrows: [], pluses: [], captions: [] }), { aromaticEnabled: false, aromaticRings: {} }, styleOf({ preset, changes: {} })).layout.crowded ?? [];
const at = (m: Model, id: number) => m.atoms.find((a) => a.id === id)!;
const length = (m: Model, a: number, b: number) => Math.hypot(at(m, a).x - at(m, b).x, at(m, a).y - at(m, b).y);
/** `m` with its terminal atom `end` moved in along its bond from `from` by a share of the bond. */
function shortened(m: Model, from: number, end: number, by: number): Model {
  const f = at(m, from);
  const e = at(m, end);
  return { ...m, atoms: m.atoms.map((a) => (a.id === end ? { ...a, x: f.x + (e.x - f.x) * (1 - by), y: f.y + (e.y - f.y) * (1 - by) } : a)) };
}

const CASES: { name: string; draw: () => Model; ends: [number, number][] }[] = [
  { name: "Mg-Br", draw: grignard, ends: [[2, 3]] },
  { name: "tritiated water's O-3H", draw: water, ends: [[1, 2], [1, 3]] },
];
describe("a bond from a label to a label at a terminal atom", () => {
  it("is too short for its labels at a bond's length, in every preset - and a drawing is left as it is drawn", () => {
    for (const p of STYLE_PRESETS) {
      for (const c of CASES) {
        const store = canvas(c.draw(), p.id);
        expect(crowded(store.getState().model, p.id).length, `${c.name}, ${p.name}`).toBeGreaterThan(0);
        // (nothing but Clean-up lengthens a bond)
        for (const [a, b] of c.ends) expect(length(store.getState().model, a, b)).toBeCloseTo(L, 9);
      }
    }
  });

  for (const p of STYLE_PRESETS) {
    it(`is drawn just long enough for them by Clean-up in ${p.name}`, async () => {
      for (const c of CASES) {
        const store = canvas(c.draw(), p.id);
        await cleanUp(store);
        const { model } = store.getState();
        // (the labels fit, each its margin kept)
        expect(crowded(model, p.id), `${c.name}, ${p.name}`).toEqual([]);
        // (water's other O-3H, its 3 away from the O, was never crowded: left at a bond's length)
        const longer = c.ends.filter(([from, end]) => length(model, from, end) > L * 1.001);
        expect(longer.length, `${c.name}, ${p.name}`).toBeGreaterThan(0);
        // (and no longer than that: a little shorter, and they crowd it again)
        for (const [from, end] of longer) expect(crowded(shortened(model, from, end, 0.03), p.id).length, `${c.name}, ${p.name}`).toBeGreaterThan(0);
      }
    });
  }
});
