import { describe, expect, it } from "vitest";
import { labelBox, labelSetOf, layoutMolecule, segmentMeetsBox } from "../../../../lib/chem/layout2d";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { createWorkspaceDocument } from "../document";
import { editorLayoutOptions } from "../layoutOptions";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { seenPlaces } from "./chair";
import { haworthDrawing } from "./haworth";
import { HAWORTH_DOWN_LEAST, HAWORTH_UP_BEFORE, haworthLabelsStepped } from "./haworthLabels";
import { layoutBonds } from "../layoutOptions";

// Labels inside a Haworth ring (docs/EDITOR-2D.md, the Haworth ring): every pair of labels up from the two front atoms, read against the
// ring's bonds as drawn and each other, never worse than at main's 0.40; and a back atom's down label over a front atom's up label giving
// way as it is typed.

const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
const set = labelSetOf(opts);
/** A label as typing leaves it: an OH typed is an O, its H written beside it; a CH2OH is a name. */
type Label = "O" | "H" | "CH2OH" | "HOH2C" | null;

/** A ring from the tool with labels up from its front atoms C-2 and C-3 (atoms 2 and 3) and down from its back atom C-5 (atom 5), at
 *  their places; the group ids 50, 51 and 52. */
function ringWith(size: 5 | 6, c2: Label, c3: Label, c5: Label = null) {
  const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 1 });
  const atoms = [...d.atoms];
  const bonds = [...d.bonds];
  ([[2, c2, 50, "up"], [3, c3, 51, "up"], [5, c5, 52, "down"]] as const).forEach(([k, el, id, kind]) => {
    if (!el) return;
    const p = seenPlaces(d, k).find((q) => q.free.kind === kind)!;
    atoms.push({ id, x: p.place.x, y: p.place.y, r: 0.9, el } as Model["atoms"][number]);
    bonds.push({ id: 200 + id, a: d.atoms[k].id, b: id, order: 1 } as Model["bonds"][number]);
  });
  return { d, model: { atoms, bonds } as Model };
}

type Box = { minX: number; maxX: number; minY: number; maxY: number };
type Pt = { x: number; y: number };

/**
 * Which labels meet something, measured on its own here (not through `haworthLabels`): the whole drawing laid out as the page lays it
 * out; each label's box, shrunk by 0.1 so that a graze is no meeting, against every line but the label's own bond, every filled shape
 * (the near edge's bold and wedge shapes), and every other label's box. By label atom id.
 */
function meetings(model: Model): Set<number> {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const lay = layoutMolecule(model.atoms as never, layoutBonds(model.bonds, index) as never, opts, 40);
  const labelled = model.atoms.filter((a) => a.id >= 50);
  const boxOf = (id: number): Box =>
    lay.texts
      .filter((t) => (t as { atom?: number }).atom === index.get(id))
      .map((t) => {
        const b = labelBox(t, t.fontPx, set);
        return { minX: t.x - b.left, maxX: t.x + b.right, minY: t.y - b.bottom, maxY: t.y + b.top };
      })
      .reduce((u, b) => ({ minX: Math.min(u.minX, b.minX), maxX: Math.max(u.maxX, b.maxX), minY: Math.min(u.minY, b.minY), maxY: Math.max(u.maxY, b.maxY) }));
  const shrunk = (b: Box): Box => ({ minX: b.minX + 0.1, maxX: b.maxX - 0.1, minY: b.minY + 0.1, maxY: b.maxY - 0.1 });
  const inBox = (b: Box, p: Pt) => p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY;
  const inPoly = (pts: Pt[], p: Pt) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (pts[i].y > p.y !== pts[j].y > p.y && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) inside = !inside;
    }
    return inside;
  };
  const out = new Set<number>();
  for (const g of labelled) {
    const box = shrunk(boxOf(g.id));
    const ringAtom = model.atoms.find((a) => model.bonds.some((b) => (b.a === g.id && b.b === a.id) || (b.b === g.id && b.a === a.id)))!;
    const own = (l: { x1: number; y1: number; x2: number; y2: number }) =>
      Math.abs(l.x1 - ringAtom.x) < 1e-6 && Math.abs(l.x2 - ringAtom.x) < 1e-6 && Math.min(l.y1, l.y2) >= Math.min(ringAtom.y, g.y) - 1e-6 && Math.max(l.y1, l.y2) <= Math.max(ringAtom.y, g.y) + 1e-6;
    const corners = [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }];
    const onLine = lay.lines.some((l) => !own(l) && segmentMeetsBox({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }, box));
    const onShape = lay.polys.some((q) => q.points.some((p) => inBox(box, p)) || corners.some((c) => inPoly(q.points, c)) || q.points.some((p, i) => segmentMeetsBox(p, q.points[(i + 1) % q.points.length], box)));
    const onLabel = labelled.some((o) => {
      if (o.id === g.id) return false;
      const q = shrunk(boxOf(o.id));
      return q.minX < box.maxX && box.minX < q.maxX && q.minY < box.maxY && box.minY < q.maxY;
    });
    if (onLine || onShape || onLabel) out.add(g.id);
  }
  return out;
}

/** The ring with its labels where main draws them: every group inside the ring's picture at 0.40 of the level bond. */
function asMain(d: ReturnType<typeof ringWith>["d"], model: Model): Model {
  const ringAtomOf = (id: number) => model.atoms.find((a) => model.bonds.some((b) => (b.a === id && b.b === a.id) || (b.b === id && b.a === a.id)))!;
  return { ...model, atoms: model.atoms.map((a) => (a.id >= 50 ? { ...a, y: ringAtomOf(a.id).y + Math.sign(a.y - ringAtomOf(a.id).y) * HAWORTH_UP_BEFORE * d.scale } : a)) };
}

/** As the editor leaves it once the labels are typed: the step taken. */
function stepped(model: Model): Model {
  const steps = new Map(haworthLabelsStepped(model, opts).map((s) => [s.id, s]));
  return { ...model, atoms: model.atoms.map((a) => ({ ...a, ...(steps.get(a.id) ?? {}) })) };
}

describe("labels inside a Haworth ring", () => {
  const all: Label[] = [null, "O", "H", "CH2OH"];
  const pairs = all.flatMap((c2) => all.filter((c3) => c2 || c3).map((c3) => [c2, c3] as const));

  it("meet nothing they do not meet where main draws them - every pair up from the two front atoms, in either ring, and in the six-ring with each down from the back atom - by the whole drawing's ink", () => {
    for (const size of [6, 5] as const) {
      for (const [c2, c3] of pairs) {
        for (const c5 of size === 6 ? all : [null]) {
          const { d, model } = ringWith(size, c2, c3, c5);
          const name = `${size}: ${c2 ?? "-"} | ${c3 ?? "-"} | ${c5 ?? "-"}`;
          const now = meetings(stepped(model));
          const was = meetings(asMain(d, model));
          for (const id of now) expect(was.has(id), `${name}: ${id}`).toBe(true);
        }
      }
    }
  });

  it("puts the maintainer's case clear on its full stem: a CH2OH alone up from the right-hand front atom, read HOH2C", () => {
    const { d, model } = ringWith(6, "CH2OH", null);
    const after = stepped(model);
    expect(meetings(after).has(50)).toBe(false);
    expect(Number(((after.atoms.find((a) => a.id === 50)!.y - d.atoms[2].y) / d.scale).toFixed(2))).toBe(0.51);
  });

  it("draws as main does where no step clears: a six-ring's CH2OH up from C-2 beside an OH up from C-3 - read either way it meets a bond or the OH", () => {
    const { d, model } = ringWith(6, "CH2OH", "O");
    expect(meetings(model).has(50)).toBe(true);
    const after = stepped(model);
    const length = (id: number, k: number) => Number(((after.atoms.find((a) => a.id === id)!.y - d.atoms[k].y) / d.scale).toFixed(2));
    expect([length(50, 2), length(51, 3)]).toEqual([HAWORTH_UP_BEFORE, HAWORTH_UP_BEFORE]);
    expect(meetings(after)).toEqual(meetings(asMain(d, model)));
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
