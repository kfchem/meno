import { describe, expect, it } from "vitest";
import { labelBox, labelSetOf, layoutMolecule, segmentMeetsBox } from "../../../../lib/chem/layout2d";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { createWorkspaceDocument } from "../document";
import { editorLayoutOptions } from "../layoutOptions";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { seenPlaces } from "./chair";
import { haworthDrawing } from "./haworth";
import { HAWORTH_UP_LEAST, haworthLabelsStepped } from "./haworthLabels";

// A labelled group up from a Haworth ring's front atom whose label, beside another inside the ring, has no clear way where it stands
// steps down its vertical until it is clear (docs/EDITOR-2D.md, the Haworth ring): every combination of two front atoms' labels, and
// the step taken as the label is typed.

const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
const set = labelSetOf(opts);
type Label = "OH" | "H" | "CH2OH" | "HOH2C" | null;

/** A ring from the tool with labels up from its front atoms C-2 and C-3 (atoms 2 and 3), at their places; the group ids 50 and 51. */
function ringWith(size: 5 | 6, c2: Label, c3: Label) {
  const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 1 });
  const atoms = [...d.atoms];
  const bonds = [...d.bonds];
  ([[2, c2, 50], [3, c3, 51]] as const).forEach(([k, el, id]) => {
    if (!el) return;
    const p = seenPlaces(d, k).find((q) => q.free.kind === "up")!;
    atoms.push({ id, x: p.place.x, y: p.place.y, r: 0.9, el } as Model["atoms"][number]);
    bonds.push({ id: 200 + id, a: d.atoms[k].id, b: id, order: 1 } as Model["bonds"][number]);
  });
  return { d, model: { atoms, bonds } as Model };
}

/** Whether every label up from the front atoms - all its letters - is off every ring bond not at its atom and off every other label. */
function clear(d: ReturnType<typeof ringWith>["d"], model: Model): boolean {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const lay = layoutMolecule(model.atoms as never, model.bonds.map((b) => ({ a1: index.get(b.a)!, a2: index.get(b.b)!, order: b.order })) as never, opts, 40);
  const boxOf = (id: number) => {
    const boxes = lay.texts
      .filter((t) => (t as { atom?: number }).atom === index.get(id))
      .map((t) => {
        const b = labelBox(t, t.fontPx, set);
        return { minX: t.x - b.left, maxX: t.x + b.right, minY: t.y - b.bottom, maxY: t.y + b.top };
      });
    return boxes.length ? boxes.reduce((u, b) => ({ minX: Math.min(u.minX, b.minX), maxX: Math.max(u.maxX, b.maxX), minY: Math.min(u.minY, b.minY), maxY: Math.max(u.maxY, b.maxY) })) : null;
  };
  const at = (id: number) => model.atoms.find((a) => a.id === id)!;
  const groups = [50, 51].filter((id) => index.has(id));
  return groups.every((id) => {
    const box = boxOf(id)!;
    const own = model.bonds.find((b) => b.b === id)!.a;
    const offBonds = d.bonds.every((b) => b.a === own || b.b === own || !segmentMeetsBox(at(b.a), at(b.b), box));
    const offLabels = groups.every((o) => {
      if (o === id) return true;
      const q = boxOf(o)!;
      return !(q.minX < box.maxX && box.minX < q.maxX && q.minY < box.maxY && box.minY < q.maxY);
    });
    return offBonds && offLabels;
  });
}

describe("labels up from a Haworth ring's front atoms, side by side", () => {
  it("each stays at its stem where its label is clear - alone, whatever it says; else steps down by the least that clears it, never below 0.40", () => {
    // ([C-2's label, C-3's label, C-2's length, C-3's length], in level bonds: MEASURED)
    const six: [Label, Label, number | null, number | null][] = [
      ["CH2OH", null, 0.51, null],
      ["HOH2C", null, 0.51, null],
      [null, "CH2OH", null, 0.51],
      ["OH", "OH", 0.51, 0.51],
      ["OH", "H", 0.51, 0.51],
      ["H", "H", 0.51, 0.51],
      ["CH2OH", "OH", 0.45, 0.51],
      ["CH2OH", "H", 0.45, 0.51],
      ["OH", "CH2OH", 0.45, 0.44],
      ["H", "CH2OH", 0.45, 0.44],
      ["CH2OH", "CH2OH", 0.44, 0.44],
      ["HOH2C", "HOH2C", 0.44, 0.44],
    ];
    for (const [c2, c3, l2, l3] of six) {
      const { d, model } = ringWith(6, c2, c3);
      const steps = haworthLabelsStepped(model, opts);
      const after = { ...model, atoms: model.atoms.map((a) => ({ ...a, ...(steps.find((s) => s.id === a.id) ?? {}) })) };
      const length = (id: number, k: number) => Number(((after.atoms.find((a) => a.id === id)!.y - d.atoms[k].y) / d.scale).toFixed(2));
      const name = `six: ${c2 ?? "-"} | ${c3 ?? "-"}`;
      if (l2 != null) expect(length(50, 2), name).toBe(l2);
      if (l3 != null) expect(length(51, 3), name).toBe(l3);
      expect(clear(d, after), name).toBe(true);
      for (const s of steps) expect((s.y - d.atoms[s.id === 50 ? 2 : 3].y) / d.scale, name).toBeGreaterThanOrEqual(HAWORTH_UP_LEAST - 1e-9);
      // (moved straight down, nothing else)
      for (const s of steps) expect(s.x).toBe(model.atoms.find((a) => a.id === s.id)!.x);
    }
    // (the five-ring's front edge is wider for its row: every pair clear at the stem, none stepped)
    for (const c2 of ["OH", "H", "CH2OH", "HOH2C"] as const) {
      for (const c3 of ["OH", "H", "CH2OH", "HOH2C"] as const) {
        const { d, model } = ringWith(5, c2, c3);
        expect(haworthLabelsStepped(model, opts), `five: ${c2} | ${c3}`).toEqual([]);
        expect(clear(d, model), `five: ${c2} | ${c3}`).toBe(true);
      }
    }
  });

  it("steps as the label is typed, in the same undo step: an OH up from C-3, then a CH2OH up from C-2 beside it", () => {
    // (the two groups led out as carbons, then named)
    const { d, model: withGroups } = ringWith(6, "OH", "OH");
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model: { atoms: withGroups.atoms.map((a) => (a.id >= 50 ? { ...a, el: "C" } : a)), bonds: withGroups.bonds }, nextId: 1000 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const type = (id: number, text: string) => {
      st().beginLabelEdit(id, "");
      st().setLabelEditValue(text);
      st().commitLabelEdit(text);
    };
    const length = (id: number, k: number) => Number(((st().model.atoms.find((a) => a.id === id)!.y - d.atoms[k].y) / d.scale).toFixed(2));
    type(51, "OH");
    expect(length(51, 3)).toBe(0.51);
    type(50, "CH2OH");
    expect(length(50, 2)).toBe(0.45);
    expect(length(51, 3)).toBe(0.51);
    // (one undo: the label and the step together)
    doc.undo();
    expect(st().model.atoms.find((a) => a.id === 50)!.el).toBe("C");
    expect(length(50, 2)).toBe(0.51);
  });
});
