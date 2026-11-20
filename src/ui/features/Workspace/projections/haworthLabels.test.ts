import { describe, expect, it } from "vitest";
import { labelBox, labelSetOf, layoutMolecule } from "../../../../lib/chem/layout2d";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { createWorkspaceDocument } from "../document";
import { editorLayoutOptions } from "../layoutOptions";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { seenPlaces } from "./chair";
import { haworthDrawing } from "./haworth";
import { HAWORTH_DOWN_LEAST, HAWORTH_UP_BEFORE, haworthLabelsStepped, meetsInk, ringInk } from "./haworthLabels";

// Labels inside a Haworth ring (docs/EDITOR-2D.md, the Haworth ring): every pair of labels up from the two front atoms, read against the
// ring's bonds as drawn and each other, never worse than at main's 0.40; and a back atom's down label over a front atom's up label giving
// way as it is typed.

const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
const set = labelSetOf(opts);
/** A label as typing leaves it: an OH typed is an O, its H written beside it; a CH2OH is a name. */
type Label = "O" | "H" | "CH2OH" | "HOH2C" | null;

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

/** At each front atom's label, whether it meets the ring's ink (every ring bond as drawn, at its own atom too) or another label: by C-2, C-3. */
function faults(d: ReturnType<typeof ringWith>["d"], model: Model): Record<number, boolean> {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const lay = layoutMolecule(model.atoms as never, model.bonds.map((b) => ({ a1: index.get(b.a)!, a2: index.get(b.b)!, order: b.order })) as never, opts, 40);
  const boxOf = (id: number) =>
    lay.texts
      .filter((t) => (t as { atom?: number }).atom === index.get(id))
      .map((t) => {
        const b = labelBox(t, t.fontPx, set);
        return { minX: t.x - b.left, maxX: t.x + b.right, minY: t.y - b.bottom, maxY: t.y + b.top };
      })
      .reduce((u, b) => ({ minX: Math.min(u.minX, b.minX), maxX: Math.max(u.maxX, b.maxX), minY: Math.min(u.minY, b.minY), maxY: Math.max(u.maxY, b.maxY) }));
  const ink = ringInk(model, d.ring, opts);
  const groups = [50, 51].filter((id) => index.has(id));
  const out: Record<number, boolean> = {};
  for (const id of groups) {
    const box = boxOf(id);
    const meetsLabel = groups.some((o) => {
      if (o === id) return false;
      const q = boxOf(o);
      return q.minX < box.maxX && box.minX < q.maxX && q.minY < box.maxY && box.minY < q.maxY;
    });
    out[id === 50 ? 2 : 3] = meetsInk(box, ink) || meetsLabel;
  }
  return out;
}

/** The same ring with each label at `length` of the level bond straight up from its atom: main's 0.40, before the stems were set by ink. */
function at(size: 5 | 6, c2: Label, c3: Label, length: number) {
  const { d, model } = ringWith(size, c2, c3);
  const ringAt = (id: number) => d.atoms[id === 50 ? 2 : 3];
  return { d, model: { ...model, atoms: model.atoms.map((a) => (a.id >= 50 ? { ...a, y: ringAt(a.id).y + length * d.scale } : a)) } };
}

describe("labels up from a Haworth ring's front atoms, side by side", () => {
  const all: Label[] = [null, "O", "H", "CH2OH"];
  const pairs = all.flatMap((c2) => all.filter((c3) => c2 || c3).map((c3) => [c2, c3] as const));

  it("never meet the ring's ink or each other where they did not at main's 0.40 - in every pair, in either ring - and the maintainer's lone HOH2C is clear", () => {
    for (const size of [6, 5] as const) {
      for (const [c2, c3] of pairs) {
        const { d, model } = ringWith(size, c2, c3);
        const steps = haworthLabelsStepped(model, opts);
        const after = { ...model, atoms: model.atoms.map((a) => ({ ...a, ...(steps.find((s) => s.id === a.id) ?? {}) })) };
        const now = faults(d, after);
        const was = faults(at(size, c2, c3, HAWORTH_UP_BEFORE).d, at(size, c2, c3, HAWORTH_UP_BEFORE).model);
        for (const k of [2, 3]) if (now[k]) expect(was[k], `${size}: ${c2 ?? "-"} | ${c3 ?? "-"}, C-${k}`).toBe(true);
        // (a front atom's up group is never moved: at a shorter stem it would clear nothing more)
        expect(steps, `${size}: ${c2 ?? "-"} | ${c3 ?? "-"}`).toEqual([]);
      }
    }
    // (the maintainer's: a six-ring's CH2OH up from its right-hand front atom, alone inside it - read HOH2C, into the ring - meets the
    //  bold bond at main's 0.40 and stands clear at 0.51)
    expect(faults(at(6, "CH2OH", null, HAWORTH_UP_BEFORE).d, at(6, "CH2OH", null, HAWORTH_UP_BEFORE).model)[2]).toBe(true);
    const lone = ringWith(6, "CH2OH", null);
    expect(haworthLabelsStepped(lone.model, opts)).toEqual([]);
    expect(faults(lone.d, lone.model)[2]).toBe(false);
  });

  it("leaves the labels where they stand where no step clears them: a six-ring's CH2OH up from C-2 beside an OH up from C-3 - read either way it meets a bond or the OH", () => {
    const { d, model } = ringWith(6, "CH2OH", "O");
    expect(haworthLabelsStepped(model, opts)).toEqual([]);
    expect(faults(d, model)[2]).toBe(true);
  });

  it("gives way first with a back atom's down label over a front atom's up label: C-5's H shortens, C-3's OH keeps its stem", () => {
    const d = haworthDrawing({ at: { x: 0, y: 0 }, size: 6, firstId: 1, firstBondId: 1 });
    const model: Model = { atoms: [...d.atoms], bonds: [...d.bonds] };
    ([[3, "up", "O", 50], [5, "down", "H", 51]] as const).forEach(([k, kind, el, id]) => {
      const p = seenPlaces(d, k).find((q) => q.free.kind === kind)!;
      model.atoms.push({ id, x: p.place.x, y: p.place.y, r: 0.9, el } as Model["atoms"][number]);
      model.bonds.push({ id: 200 + id, a: d.atoms[k].id, b: id, order: 1 } as Model["bonds"][number]);
    });
    const steps = haworthLabelsStepped(model, opts);
    expect(steps.map((s) => s.id)).toEqual([51]);
    const h = steps[0];
    const length = Number(((d.atoms[5].y - h.y) / d.scale).toFixed(2));
    expect(length).toBeLessThan(0.39);
    expect(length).toBeGreaterThanOrEqual(HAWORTH_DOWN_LEAST);
    expect(h.x).toBe(model.atoms.find((a) => a.id === 51)!.x);
    // (a drawn-out carbon there - a CH2OH's C of an L-sugar, with its OH beyond - is never moved, labelled or not beyond it)
    const drawnOut: Model = { atoms: model.atoms.map((a) => (a.id === 51 ? { ...a, el: "C" } : a)), bonds: model.bonds };
    expect(haworthLabelsStepped(drawnOut, opts)).toEqual([]);
  });

  it("steps as the label is typed, in the same undo step: an OH up from C-3, then an H down from C-5 above it", () => {
    // (the two groups led out as carbons, then named)
    const d = haworthDrawing({ at: { x: 0, y: 0 }, size: 6, firstId: 1, firstBondId: 1 });
    const model: Model = { atoms: [...d.atoms], bonds: [...d.bonds] };
    ([[3, "up", 50], [5, "down", 51]] as const).forEach(([k, kind, id]) => {
      const p = seenPlaces(d, k).find((q) => q.free.kind === kind)!;
      model.atoms.push({ id, x: p.place.x, y: p.place.y, r: 0.9, el: "C" } as Model["atoms"][number]);
      model.bonds.push({ id: 200 + id, a: d.atoms[k].id, b: id, order: 1 } as Model["bonds"][number]);
    });
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model, nextId: 1000 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const type = (id: number, text: string) => {
      st().beginLabelEdit(id, "");
      st().setLabelEditValue(text);
      st().commitLabelEdit(text);
    };
    const downOf = () => Number(((d.atoms[5].y - st().model.atoms.find((a) => a.id === 51)!.y) / d.scale).toFixed(2));
    type(50, "OH");
    expect(st().model.atoms.find((a) => a.id === 50)!.el).toBe("O");
    expect(downOf()).toBe(0.39);
    type(51, "H");
    expect(downOf()).toBeLessThan(0.39);
    expect(downOf()).toBeGreaterThanOrEqual(0.3);
    // (one undo: the label and the step together)
    doc.undo();
    expect(st().model.atoms.find((a) => a.id === 51)!.el).toBe("C");
    expect(downOf()).toBe(0.39);
  });
});
