import { describe, expect, it } from "vitest";
import { labelBox, labelSetOf, layoutMolecule, segmentMeetsBox } from "../../../../lib/chem/layout2d";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { createWorkspaceDocument, relayout } from "../document";
import { editorLayoutOptions } from "../layoutOptions";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { seenPlaces } from "./chair";
import { haworthDrawing } from "./haworth";
import { HAWORTH_DOWN_LEAST, HAWORTH_UP_BEFORE, haworthLabelsStepped, meetsInk } from "./haworthLabels";
import { layoutAtomOf, layoutBond, layoutBonds } from "../layoutOptions";
import { layoutByStructure, structureLayouts } from "../../../../lib/chem/layoutStructures";
import { drawingLayout } from "../fileActions";

// Labels inside a Haworth ring (docs/EDITOR-2D.md, the Haworth ring): every pair of labels up from the two front atoms, read against the
// ring's bonds as drawn and each other, never worse than at main's 0.40; a back atom's down label over a front atom's up label giving
// way as it is typed; and a label read the way that clears it - HO, HOH2C, or OH, CH2OH - where the other way meets the drawing.

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
  return {
    ...model,
    atoms: model.atoms.map((a) => {
      const st = steps.get(a.id);
      if (!st) return a;
      const { reads: _r, ...rest } = a;
      return { ...rest, x: st.x, y: st.y, ...(st.reads ? { reads: st.reads } : {}) };
    }),
  };
}

/** A ring from the tool with labels at any of its atoms' free places, up or down, the group ids 50 on, in order. */
function ringAt(size: 5 | 6, put: readonly (readonly [number, "up" | "down", Label])[]) {
  const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 1 });
  const atoms = [...d.atoms];
  const bonds = [...d.bonds];
  put.forEach(([k, kind, el], n) => {
    const p = seenPlaces(d, k).find((q) => q.free.kind === kind)!;
    atoms.push({ id: 50 + n, x: p.place.x, y: p.place.y, r: 0.9, el } as Model["atoms"][number]);
    bonds.push({ id: 250 + n, a: d.atoms[k].id, b: 50 + n, order: 1 } as Model["bonds"][number]);
  });
  return { d, model: { atoms, bonds } as Model };
}

/** The label's text as the page draws it. */
function textOf(model: Model, id: number): string {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const lay = layoutMolecule(model.atoms as never, layoutBonds(model.bonds, index) as never, opts, 40);
  return lay.texts
    .filter((t) => (t as { atom?: number }).atom === index.get(id))
    .map((t) => t.text)
    .join("");
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
    expect(Number(((after.atoms.find((a) => a.id === 50)!.y - d.atoms[2].y) / d.scale).toFixed(2))).toBe(0.46);
  });

  it("draws as main does where no step clears: a six-ring's CH2OH up from C-2 beside an OH up from C-3 - read either way it meets a bond or the OH", () => {
    const { d, model } = ringWith(6, "CH2OH", "O");
    expect(meetings(model).has(50)).toBe(true);
    const after = stepped(model);
    const length = (id: number, k: number) => Number(((after.atoms.find((a) => a.id === id)!.y - d.atoms[k].y) / d.scale).toFixed(2));
    expect([length(50, 2), length(51, 3)]).toEqual([HAWORTH_UP_BEFORE, HAWORTH_UP_BEFORE]);
    expect(meetings(after)).toEqual(meetings(asMain(d, model)));
  });

  it("gives way first with a back atom's down label over a front atom's up label where they meet: C-5's CH2OH shortens, C-3's OH keeps its stem", () => {
    const d = haworthDrawing({ at: { x: 0, y: 0 }, size: 6, firstId: 1, firstBondId: 1 });
    const model: Model = { atoms: [...d.atoms], bonds: [...d.bonds] };
    ([[3, "up", "O", 50], [5, "down", "CH2OH", 51]] as const).forEach(([k, kind, el, id]) => {
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
    // (an OH and an H, each on the figures' stem, meet nothing: neither moves)
    expect(haworthLabelsStepped({ ...model, atoms: model.atoms.map((a) => (a.id === 51 ? { ...a, el: "H" } : a)) }, opts)).toEqual([]);
    expect(h.x).toBe(model.atoms.find((a) => a.id === 51)!.x);
    // (a drawn-out carbon there - a CH2OH's C of an L-sugar, with its OH beyond - is never moved, labelled or not beyond it)
    const drawnOut: Model = { atoms: model.atoms.map((a) => (a.id === 51 ? { ...a, el: "C" } : a)), bonds: model.bonds };
    expect(haworthLabelsStepped(drawnOut, opts)).toEqual([]);
  });

  it("steps as the label is typed, in the same undo step: an OH up from C-3, then a CH2OH down from C-5 above it", () => {
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
    type(51, "CH2OH");
    expect(downOf()).toBeLessThan(0.39);
    expect(downOf()).toBeGreaterThanOrEqual(0.3);
    // (one undo: the label and the step together)
    doc.undo();
    expect(st().model.atoms.find((a) => a.id === 51)!.el).toBe("C");
    expect(downOf()).toBe(0.39);
  });

  it("are read the way that clears them, each on its full stem, where the other way meets a bond", () => {
    // (ring, atom, up or down, label; the way it reads after; its text as drawn)
    const cases = [
      [6, 2, "up", "O", "left", "HO"],
      [5, 2, "up", "O", "left", "HO"],
      [5, 2, "up", "CH2OH", "left", "HOH2C"],
      [5, 3, "up", "CH2OH", "right", "CH2OH"],
      [5, 4, "down", "O", "left", "HO"],
    ] as const;
    for (const [size, k, kind, el, way, text] of cases) {
      const { d, model } = ringAt(size, [[k, kind, el]]);
      const name = `${size}: C-${k} ${kind} ${el}`;
      expect(meetings(model).has(50), name).toBe(true);
      const after = stepped(model);
      const g = after.atoms.find((a) => a.id === 50)!;
      expect(g.reads, name).toBe(way);
      expect(textOf(after, 50), name).toBe(text);
      expect(meetings(after).has(50), name).toBe(false);
      // (the stem as the ring's proportions set it: C-2's OH no longer drawn at main's short stub)
      expect(Math.abs(g.y - model.atoms.find((a) => a.id === 50)!.y), name).toBeLessThan(1e-9);
      expect(Math.abs(g.y - d.atoms[k].y) / d.scale, name).toBeGreaterThan(0.46);
    }
  });

  it("leaves a label that meets nothing as it reads: an OH up from C-3, a CH2OH down from C-5", () => {
    expect(haworthLabelsStepped(ringAt(6, [[3, "up", "O"]]).model, opts)).toEqual([]);
    expect(haworthLabelsStepped(ringAt(6, [[5, "down", "CH2OH"]]).model, opts)).toEqual([]);
  });

  it("meet nothing they do not meet where main draws them - any one or two labels at any free place of either ring, read as they read there", { timeout: 60000 }, () => {
    for (const size of [6, 5] as const) {
      const places = Array.from({ length: size - 1 }, (_, i) => i + 1).flatMap((k) => (["up", "down"] as const).map((kind) => [k, kind] as const));
      const labels = ["O", "H", "CH2OH"] as const;
      const sets = [
        ...places.flatMap(([k, kind]) => labels.map((l) => [[k, kind, l] as const])),
        ...places.flatMap((p, i) => places.slice(i + 1).flatMap((q) => labels.flatMap((a) => labels.map((b) => [[...p, a] as const, [...q, b] as const])))),
      ];
      for (const put of sets) {
        const { d, model } = ringAt(size, put);
        const name = `${size}: ${put.map(([k, kind, l]) => `${k}${kind}${l}`).join(" ")}`;
        const now = meetings(stepped(model));
        const was = meetings(asMain(d, model));
        for (const id of now) expect(was.has(id), `${name}: ${id}`).toBe(true);
      }
    }
  });

  it("keeps the way a label reads in the same undo step as it is typed, and Clean-up's layout lets it go", () => {
    const d = haworthDrawing({ at: { x: 0, y: 0 }, size: 6, firstId: 1, firstBondId: 1 });
    const model: Model = { atoms: [...d.atoms], bonds: [...d.bonds] };
    const p = seenPlaces(d, 2).find((q) => q.free.kind === "up")!;
    model.atoms.push({ id: 50, x: p.place.x, y: p.place.y, r: 0.9, el: "C" } as Model["atoms"][number]);
    model.bonds.push({ id: 250, a: d.atoms[2].id, b: 50, order: 1 } as Model["bonds"][number]);
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model, nextId: 1000 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    st().beginLabelEdit(50, "");
    st().setLabelEditValue("OH");
    st().commitLabelEdit("OH");
    const g = () => st().model.atoms.find((a) => a.id === 50)!;
    expect([g().el, g().reads]).toEqual(["O", "left"]);
    expect(textOf(st().model, 50)).toBe("HO");
    // (one undo: the label and the way it reads together)
    doc.undo();
    expect([g().el, g().reads]).toEqual(["C", undefined]);
    doc.redo();
    expect(g().reads).toBe("left");
    // (laid out anew, it reads as its bonds decide)
    const laid = relayout(doc.getState(), { atoms: [{ id: 50, x: g().x + 0.5, y: g().y }], bonds: [] });
    expect(laid.model.atoms.find((a) => a.id === 50)!.reads).toBeUndefined();
  });

  it("are drawn on the page and in a picture the way they read, on a stem led out of a ring the tool put down, however it was led out", () => {
    // (the ring put down by the tool at a page point - a ring of five by choosing it again there - and the stem led out of ring atom `k`
    //  at its free place as the ring's drawing gives it: the ring atom's place plus the place's offset from that atom in the drawing,
    //  which is where a double-click's bond (the next free place) and a drag's bond (the place nearest the pointer) both end; then the
    //  label typed on the stem's end, as typing over it and the atom's Edit label both keep it)
    const drawn = (size: 5 | 6, put: readonly (readonly [number, "up" | "down", string])[]) => {
      const doc = createWorkspaceDocument();
      const store = createEditorStore(doc);
      connectStoreToDocument(store, doc);
      const st = () => store.getState();
      const at = { x: 12.3, y: -4.7 };
      st().putHaworth(at);
      if (size === 5) st().putHaworth(at);
      const ring = st().model.atoms.filter((a) => a.z != null);
      const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 1 });
      const mid = (ps: readonly { x: number; y: number }[]) => ({ x: ps.reduce((t, q) => t + q.x, 0) / size, y: ps.reduce((t, q) => t + q.y, 0) / size });
      const [dm, mm] = [mid(d.atoms), mid(ring)];
      const ringAtom = (k: number) => ring.find((a) => Math.hypot(a.x - mm.x - (d.atoms[k].x - dm.x), a.y - mm.y - (d.atoms[k].y - dm.y)) < 1e-6)!;
      const ids = put.map(([k, kind, text]) => {
        const r = ringAtom(k);
        const p = seenPlaces(d, k).find((q) => q.free.kind === kind)!;
        const id = st().addAtomBonded(r.id, r.x + p.place.x - d.atoms[k].x, r.y + p.place.y - d.atoms[k].y, "C", 1)!;
        st().beginLabelEdit(id, "");
        st().setLabelEditValue(text);
        st().commitLabelEdit(text);
        return id;
      });
      const model = st().model;
      const index = new Map(model.atoms.map((a, i) => [a.id, i]));
      // (the page: each structure laid out from the atoms as the canvas takes them)
      const page = layoutByStructure(model.atoms.map((a) => layoutAtomOf(a)), model.bonds.map((b) => layoutBond(b, index.get(b.a)!, index.get(b.b)!)), opts, 40, structureLayouts());
      // (a picture of it: Copy as picture, Export)
      const picture = drawingLayout(model, { aromaticEnabled: false, aromaticRings: {} }, styleOf(DEFAULT_STYLE_CHOICE)).layout;
      const textIn = (lay: { texts: readonly { text: string }[] }, id: number) =>
        lay.texts
          .filter((t) => (t as { atom?: number }).atom === index.get(id))
          .map((t) => t.text)
          .join("");
      return ids.map((id) => [textIn(page, id), textIn(picture, id)].join(" | "));
    };
    // (ring, the labels typed in order - atom, up or down, text - and each label as the page and a picture draw it)
    const cases = [
      // (the OH up from the six-ring's right-hand front atom C-2: its H would lie on the bold edge to C-1 - HO, toward the ring's middle)
      [6, [[2, "up", "OH"]], ["HO | HO"]],
      // (the five-ring's, as the ring reads them alone: away from the steeply rising bond beside each)
      [5, [[2, "up", "CH2OH"]], ["HOH2C | HOH2C"]],
      [5, [[3, "up", "CH2OH"]], ["CH2OH | CH2OH"]],
      [5, [[4, "down", "OH"]], ["HO | HO"]],
      // (an OH up from C-3 meets nothing as it reads: left as it is)
      [6, [[3, "up", "OH"]], ["OH | OH"]],
      // (a CH2OH up from C-3 beside C-2's HO: read CH2OH it would run into the HO on the one row; HOH2C is the way that meets less,
      //  and the HO stays HO)
      [6, [[2, "up", "OH"], [3, "up", "CH2OH"]], ["HO | HO", "HOH2C | HOH2C"]],
      // (the swap - C-2's CH2OH, then C-3's OH: no reading takes a meeting away, so each reads as its bonds decide)
      [6, [[2, "up", "CH2OH"], [3, "up", "OH"]], ["CH2OH | CH2OH", "OH | OH"]],
    ] as const;
    for (const [size, put, want] of cases) expect(drawn(size, put), `${size}: ${JSON.stringify(put)}`).toEqual(want);
  });
});


/**
 * A sugar drawn as a chemist draws one: a ring from the tool, a group led out as a carbon to each free place given - [ring atom, up or down,
 * what is typed] - and each named by typing over it, as the page does (ids 50 on, in order). The model as typing leaves it.
 */
function typedSugar(size: 5 | 6, groups: readonly (readonly [number, "up" | "down", string])[]) {
  const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 1 });
  const model: Model = { atoms: [...d.atoms], bonds: [...d.bonds] };
  groups.forEach(([k, kind], n) => {
    const p = seenPlaces(d, k).find((q) => q.free.kind === kind)!;
    model.atoms.push({ id: 50 + n, x: p.place.x, y: p.place.y, r: 0.9, el: "C" } as Model["atoms"][number]);
    model.bonds.push({ id: 250 + n, a: d.atoms[k].id, b: 50 + n, order: 1 } as Model["bonds"][number]);
  });
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model, nextId: 1000 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  groups.forEach(([, , text], n) => {
    store.getState().beginLabelEdit(50 + n, "");
    store.getState().setLabelEditValue(text);
    store.getState().commitLabelEdit(text);
  });
  return { d, model: store.getState().model };
}

/** Each group's visible stem - the drawn line along its vertical between its ring atom and it - as a share of the level bond, by group id. */
function stems(d: { scale: number; atoms: readonly { id: number }[] }, model: Model, groups: readonly (readonly [number, ...unknown[]])[]): number[] {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const lay = layoutMolecule(model.atoms as never, layoutBonds(model.bonds, index) as never, opts, 40);
  return groups.map(([k], n) => {
    const r = model.atoms.find((a) => a.id === d.atoms[k].id)!;
    const g = model.atoms.find((a) => a.id === 50 + n)!;
    const [lo, hi] = [Math.min(r.y, g.y), Math.max(r.y, g.y)];
    const along = lay.lines.filter((l) => Math.abs(l.x1 - r.x) < 1e-6 && Math.abs(l.x2 - r.x) < 1e-6 && Math.min(l.y1, l.y2) >= lo - 1e-6 && Math.max(l.y1, l.y2) <= hi + 1e-6);
    return along.reduce((t, l) => t + Math.abs(l.y2 - l.y1), 0) / d.scale;
  });
}

/** Labels whose ink touches anything - with no graze let pass: every line but its own bond (its width counted), every filled shape, every other label. */
function touching(model: Model): number[] {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const lay = layoutMolecule(model.atoms as never, layoutBonds(model.bonds, index) as never, opts, 40);
  const boxOf = (id: number): Box =>
    lay.texts
      .filter((t) => (t as { atom?: number }).atom === index.get(id))
      .map((t) => {
        const b = labelBox(t, t.fontPx, set);
        return { minX: t.x - b.left, maxX: t.x + b.right, minY: t.y - b.bottom, maxY: t.y + b.top };
      })
      .reduce((u, b) => ({ minX: Math.min(u.minX, b.minX), maxX: Math.max(u.maxX, b.maxX), minY: Math.min(u.minY, b.minY), maxY: Math.max(u.maxY, b.maxY) }));
  const labelled = model.atoms.filter((a) => a.id >= 50);
  return labelled
    .filter((g) => {
      const box = boxOf(g.id);
      const bond = model.bonds.find((b) => b.a === g.id || b.b === g.id)!;
      const r = model.atoms.find((a) => a.id === (bond.a === g.id ? bond.b : bond.a))!;
      const own = (l: { x1: number; y1: number; x2: number; y2: number }) =>
        Math.abs(l.x1 - r.x) < 1e-6 && Math.abs(l.x2 - r.x) < 1e-6 && Math.min(l.y1, l.y2) >= Math.min(r.y, g.y) - 1e-6 && Math.max(l.y1, l.y2) <= Math.max(r.y, g.y) + 1e-6;
      const ink = { lines: lay.lines.filter((l) => !own(l)).map((l) => ({ p: { x: l.x1, y: l.y1 }, q: { x: l.x2, y: l.y2 }, half: l.widthPx / 40 / 2 })), polys: lay.polys.map((q) => q.points) };
      const onLabel = labelled.some((o) => {
        if (o.id === g.id) return false;
        const q = boxOf(o.id);
        return q.minX < box.maxX && box.minX < q.maxX && q.minY < box.maxY && box.minY < q.maxY;
      });
      return meetsInk(box, ink) || onLabel;
    })
    .map((g) => g.id);
}

describe("stems inside a Haworth ring as long as the figures under ST-1.9 draw them, every group written", () => {
  it("a hexopyranose, beta-D-glucopyranose: OH up from C-3 and H up from C-2 on 0.29, H down from C-5 on 0.25; no label touches", () => {
    // (ring atom C-k is atom k, the ring O atom 0; each free place written: its up and down)
    const groups = [
      [1, "up", "OH"], [1, "down", "H"],
      [2, "up", "H"], [2, "down", "OH"],
      [3, "up", "OH"], [3, "down", "H"],
      [4, "up", "H"], [4, "down", "OH"],
      [5, "up", "CH2OH"], [5, "down", "H"],
    ] as const;
    const { d, model } = typedSugar(6, groups);
    const s = stems(d, model, groups);
    // (the two former shortfalls met: C-5's H down, beside C-3's OH up below it, on the figures' 0.25 - MEASURED 0.254 - and C-3's OH on 0.29)
    expect(s[9]).toBeGreaterThanOrEqual(0.25);
    expect(s[4]).toBeGreaterThanOrEqual(0.29);
    expect(s[2]).toBeGreaterThanOrEqual(0.29);
    // (each inside label's bond stops close to it; none outside)
    const close = new Set(model.bonds.filter((b) => b.close).map((b) => b.id));
    expect([...close].sort()).toEqual([252, 254, 259]);
    // (the groups out of the ring's picture keep the stems they had, their bonds stopping as any does: MEASURED 0.43 to 0.65)
    for (const n of [0, 1, 3, 5, 6, 7, 8]) expect(s[n], `group ${n}`).toBeGreaterThan(0.4);
    expect(touching(model)).toEqual([]);
  });

  it("a pentofuranose, beta-D-xylofuranose: OH up from C-3 and H up from C-2 on the figures' 0.33; no label touches", () => {
    const groups = [
      [1, "up", "OH"], [1, "down", "H"],
      [2, "up", "H"], [2, "down", "OH"],
      [3, "up", "OH"], [3, "down", "H"],
      [4, "up", "CH2OH"], [4, "down", "H"],
    ] as const;
    const { d, model } = typedSugar(5, groups);
    const s = stems(d, model, groups);
    // (the former shortfall met: a front atom's up label on 0.33 - MEASURED 0.337 for the OH, 0.341 for the H)
    expect(s[4]).toBeGreaterThanOrEqual(0.33);
    expect(s[2]).toBeGreaterThanOrEqual(0.33);
    expect(model.bonds.filter((b) => b.close).map((b) => b.id).sort()).toEqual([252, 254]);
    // (out of the ring's picture, as any bond: MEASURED 0.44 to 0.50)
    for (const n of [0, 1, 3, 5, 6, 7]) expect(s[n], `group ${n}`).toBeGreaterThan(0.4);
    expect(touching(model)).toEqual([]);
  });
});
