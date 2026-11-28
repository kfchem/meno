import { describe, expect, it } from "vitest";
import { HAWORTH_GROUP } from "../../../../lib/chem/perception/projection/views";
import { haworthLabelsStepped, haworthStemsClose, LABELS_APART } from "./haworthLabels";
import { labelBox, labelSetOf, layoutMolecule } from "../../../../lib/chem/layout2d";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { editorLayoutOptions } from "../layoutOptions";
import { measured } from "../../../../testing/timeouts";
import type { Atom, Bond, Model } from "../store/types";
import { seenPlaces, snapTo } from "./chair";
import { chairExtension } from "./extend";
import { haworthDrawing, haworthOf, haworthsIn } from "./haworth";
import { chairDrawing } from "./chair";
import { projectionsIn } from "./rings";
import { isProjection } from "./projection";
import { identityOfDrawn } from "../chem/identityOf";
import { identityText } from "../../../../lib/chem/identity";
import { fromSmiles } from "../../../../lib/layout/testdata/fromSmiles";
import { cleanUp } from "../chem/cleanUp";
import { blocksOf } from "../chem/make3d";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { editorModelOf } from "../utils/io";

type Group = { at: number; face: 1 | -1; el: string; then?: string };

/** A Haworth ring with the groups given: each at its atom's free position of that face - a `then` atom beyond it, straight up the page. */
function ring(size: 5 | 6, groups: Group[]): Model {
  const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 100 });
  const atoms: Atom[] = [...d.atoms];
  const bonds: Bond[] = [...d.bonds];
  groups.forEach((g, i) => {
    const free = d.solid.free.find((f) => f.at === g.at && f.face === g.face)!;
    const place = seenPlaces(d, g.at).find((p) => p.free === free)!;
    const id = 50 + 2 * i;
    atoms.push({ id, el: g.el, r: 0.9, x: place.place.x, y: place.place.y });
    bonds.push({ id: 200 + 2 * i, a: d.ring[g.at], b: id, order: 1 });
    if (g.then) {
      atoms.push({ id: id + 1, el: g.then, r: 0.9, x: place.place.x + 0.5, y: place.place.y + (g.face === 1 ? 0.5 : -0.5) });
      bonds.push({ id: 201 + 2 * i, a: id, b: id + 1, order: 1 });
    }
  });
  return { atoms, bonds };
}

const all = (m: Model) => new Set(m.atoms.map((a) => a.id));

/** D-glucopyranose as the Haworth tool draws it: ring O, C-1 to C-5; the CH2OH up at C-5, the OH at C-1 up (beta) or down (alpha), C-2 down, C-3 up, C-4 down. */
const glucopyranose = (beta: boolean) =>
  ring(6, [
    { at: 5, face: 1, el: "C", then: "O" },
    { at: 1, face: beta ? 1 : -1, el: "O" },
    { at: 2, face: -1, el: "O" },
    { at: 3, face: 1, el: "O" },
    { at: 4, face: -1, el: "O" },
  ]);
const betaGlucose = () => glucopyranose(true);
describe("the Haworth tool's drawing", () => {
  it("is a pyranose of six - the ring O at the back right, C-1 at the right, the front edge lower and bold - or a furanose of five, O at the back", () => {
    const six = haworthDrawing({ at: { x: 0, y: 0 }, size: 6, firstId: 1, firstBondId: 1 });
    expect(six.atoms.map((a) => a.el)).toEqual(["O", "C", "C", "C", "C", "C"]);
    const [o, c1, c2, c3, c4, c5] = six.atoms;
    expect(o.x).toBeGreaterThan(0);
    expect(o.y).toBeGreaterThan(c2.y);
    expect(c1.x).toBeGreaterThan(o.x);
    expect(c4.x).toBeLessThan(0);
    // (the nearer edge, C-2 to C-3, lower than the farther, O to C-5)
    expect(c2.y).toBeLessThan(o.y);
    expect(c3.y).toBeLessThan(c5.y);
    expect(six.bonds.filter((b) => b.display === "bold").map((b) => [b.a, b.b])).toEqual([[3, 4]]);
    // (and the two ring bonds that run to it wedge-shaped, broad at its ends - C-1 to C-2 and C-3 to C-4 - narrow at C-1 and C-4: ST-1.9's
    // preferred Haworth form; the other bonds plain)
    for (const ring of [six, haworthDrawing({ at: { x: 0, y: 0 }, size: 5, firstId: 1, firstBondId: 1 })]) {
      const bold = ring.bonds.filter((b) => b.display === "bold");
      const wedges = ring.bonds.filter((b) => b.display === "wedge");
      expect(bold).toHaveLength(1);
      expect(wedges).toHaveLength(2);
      for (const w of wedges) {
        const broad = w.narrow === w.a ? w.b : w.a;
        expect([bold[0].a, bold[0].b]).toContain(broad);
        expect([bold[0].a, bold[0].b]).not.toContain(w.narrow);
      }
      expect(ring.bonds.filter((b) => b.display == null)).toHaveLength(ring.bonds.length - 3);
    }
    const five = haworthDrawing({ at: { x: 0, y: 0 }, size: 5, firstId: 1, firstBondId: 1 });
    expect(five.atoms).toHaveLength(5);
    expect(five.atoms[0].el).toBe("O");
    expect(Math.abs(five.atoms[0].x)).toBeLessThan(1e-9);
    // (every bond as long as a bond at its longest, the longest the style's)
    expect(Math.max(...six.bonds.map((b) => Math.hypot(six.atoms[b.a - 1].x - six.atoms[b.b - 1].x, six.atoms[b.a - 1].y - six.atoms[b.b - 1].y)))).toBeCloseTo(six.scale * 1, 6);
  });

  it("offers up and down at every ring atom, vertical on the page, up above and down below", () => {
    for (const size of [5, 6] as const) {
      const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 1 });
      for (let k = 0; k < size; k++) {
        const [up, down] = [seenPlaces(d, k).find((p) => p.free.kind === "up")!, seenPlaces(d, k).find((p) => p.free.kind === "down")!];
        expect(Math.abs(up.place.x - d.atoms[k].x)).toBeLessThan(1e-9);
        expect(up.place.y).toBeGreaterThan(d.atoms[k].y);
        expect(down.place.y).toBeLessThan(d.atoms[k].y);
        expect(snapTo(d, k, { x: d.atoms[k].x + 0.3, y: d.atoms[k].y + 5 })?.free.kind).toBe("up");
      }
    }
  });

  it("is found as the tool's, a pyranose and a furanose, whatever the ring O is made, and no chair", () => {
    for (const size of [5, 6] as const) {
      const m = ring(size, []);
      expect(haworthOf(m, m.atoms.slice(0, size).map((a) => a.id))?.size).toBe(size);
      expect(haworthsIn(m, all(m))).toHaveLength(1);
      const changed = { atoms: m.atoms.map((a) => (a.id === 1 ? { ...a, el: "N" } : a)), bonds: m.bonds };
      expect(haworthsIn(changed, all(changed))).toHaveLength(1);
    }
    const chair = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 });
    expect(haworthsIn({ atoms: chair.atoms, bonds: chair.bonds }, new Set(chair.atoms.map((a) => a.id)))).toEqual([]);
    expect(isProjection(ring(6, []), all(ring(6, [])))).toBe(true);
  });

  it("leads a bond out of a ring atom to up or down, and holds the one a group stands at", () => {
    const m = ring(6, []);
    const at = m.atoms[2];
    expect(chairExtension(m, 3, { x: at.x, y: at.y + 9 })?.name).toBe("up");
    expect(chairExtension(m, 3, { x: at.x, y: at.y - 9 })?.name).toBe("down");
    const held = ring(6, [{ at: 2, face: 1, el: "O" }]);
    expect(chairExtension(held, 3, { x: at.x, y: at.y + 9 })?.name).toBe("down");
  });
});

// (Known answers: D-glucopyranose drawn by the tool, read as Meno reads a ring drawn in perspective - by its depth - against its SMILES,
// against the 4C1 chair the chair tool draws, laid flat by Draw flat, and written for 3D.)
describe("what the Haworth tool draws, read as Meno reads a drawing (known answers)", () => {
  it("makes beta-D-glucopyranose: one identity with its SMILES, the alpha anomer another", () => {
    const BETA = "C([C@@H]1[C@H]([C@@H]([C@H]([C@@H](O1)O)O)O)O)O";
    const ALPHA = "C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O)O)O)O)O";
    const [beta, alpha] = [identityOfDrawn(glucopyranose(true)), identityOfDrawn(glucopyranose(false))];
    expect([beta.complete, alpha.complete]).toEqual([true, true]);
    expect(beta.text).toBe(identityText(fromSmiles(BETA)));
    expect(alpha.text).toBe(identityText(fromSmiles(ALPHA)));
    expect(beta.text).not.toBe(alpha.text);
  });
  it("is laid out flat by Draw flat with the same identity, and is the same compound as the 4C1 chair built with the chair tool", async () => {
    const drawn = betaGlucose();
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().pasteModel(drawn);
    const was = identityOfDrawn(doc.getState().model).text;
    await cleanUp(store, null, true);
    const flat = doc.getState().model;
    expect(flat.atoms.every((a) => a.z == null)).toBe(true);
    // (the near edge's look - its bold bond and the two wedge-shaped bonds beside it - goes with the depth it drew: laid flat, a ring bond
    //  wedge-shaped would read as a configuration)
    expect(drawn.bonds.filter((b) => b.display === "bold" || b.display === "wedge")).toHaveLength(3);
    expect(flat.bonds.filter((b) => b.display === "bold" || b.display === "wedge")).toEqual([]);
    expect(identityOfDrawn(flat).text).toBe(was);
    // (the 4C1 chair, form 1: C-1 the right-hand end, pointing down; C-4 the left-hand end; the ring O at the back right - every group
    //  equatorial, as beta-D-glucopyranose's are)
    const d = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100 });
    const [o, c1, c2, c3, c4, c5] = [4, 3, 2, 1, 0, 5];
    const atoms: Atom[] = d.atoms.map((a, k) => (k === o ? { ...a, el: "O" } : a));
    const bonds: Bond[] = [...d.bonds];
    [c1, c2, c3, c4, c5].forEach((k, i) => {
      const free = d.solid.free.find((f) => f.at === k && f.kind === "equatorial")!;
      const place = seenPlaces(d, k).find((p) => p.free === free)!;
      atoms.push({ id: 50 + 2 * i, el: k === c5 ? "C" : "O", r: 0.9, x: place.place.x, y: place.place.y });
      bonds.push({ id: 200 + 2 * i, a: d.ring[k], b: 50 + 2 * i, order: 1 });
      if (k === c5) {
        atoms.push({ id: 51 + 2 * i, el: "O", r: 0.9, x: place.place.x - 0.5, y: place.place.y + 0.5 });
        bonds.push({ id: 201 + 2 * i, a: 50 + 2 * i, b: 51 + 2 * i, order: 1 });
      }
    });
    expect(identityOfDrawn({ atoms, bonds }).text).toBe(was);
  }, measured(400));

  it("keeps its near edge through Clean-up, the ring's depth with it; only Draw flat draws it plain, and a look given to a flat bond stays", async () => {
    const looks = (m: Model) => m.bonds.filter((b) => b.display === "bold" || b.display === "wedge").length;
    const page = (m: Model) => {
      const doc = createWorkspaceDocument();
      const store = createEditorStore(doc);
      connectStoreToDocument(store, doc);
      store.getState().pasteModel(m);
      return { doc, store };
    };
    const kept = page(betaGlucose());
    await cleanUp(kept.store, null);
    const after = kept.doc.getState().model;
    expect(looks(after)).toBe(3);
    expect(after.atoms.filter((a) => a.z != null)).toHaveLength(6);
    // (a bold bond the chemist gave a flat drawing beside it: Draw flat leaves it bold)
    const sugar = betaGlucose();
    const flatPart: Model = {
      atoms: [...sugar.atoms, { id: 900, el: "C", r: 0.9, x: 20, y: 0 }, { id: 901, el: "C", r: 0.9, x: 21.4, y: 0 }],
      bonds: [...sugar.bonds, { id: 950, a: 900, b: 901, order: 1, display: "bold" }],
    };
    const flat = page(flatPart);
    await cleanUp(flat.store, null, true);
    const laid = flat.doc.getState().model;
    expect(looks(laid)).toBe(1);
    // (and it is the lone bond's, the two atoms bonded to nothing else - pasted on new ids)
    const bold = laid.bonds.find((b) => b.display === "bold")!;
    const degree = (id: number) => laid.bonds.filter((b) => b.a === id || b.b === id).length;
    expect([degree(bold.a), degree(bold.b)]).toEqual([1, 1]);
  }, measured(400));

  it("is found once for each drawing: every frame of a stroke asks again of the same drawing", () => {
    const m = betaGlucose();
    const first = projectionsIn(m);
    expect(first).toHaveLength(1);
    expect(projectionsIn({ atoms: m.atoms, bonds: m.bonds })).toBe(first);
    // (a drawing changed - its atoms another array - is looked at again)
    expect(projectionsIn({ atoms: [...m.atoms], bonds: m.bonds })).not.toBe(first);
  });

  it("is asked about for 3D as a flat MOL whose wedges read as the configuration the ring drew", () => {
    const drawn = betaGlucose();
    const block = blocksOf(drawn, [drawn.atoms[0].id])[0].molblock;
    const back = editorModelOf(moleculesToEditorModel(readMoleculesFromText(block, "mol")).model);
    expect(identityOfDrawn(back).text).toBe(identityOfDrawn(drawn).text);
    expect(identityOfDrawn(back).text).toBe(identityText(fromSmiles("C([C@@H]1[C@H]([C@@H]([C@H]([C@@H](O1)O)O)O)O)O")));
  });
});


describe("a Haworth ring put down from Quick Add", () => {
  it("is where Quick Add was opened, its depth and the drawing's own configuration kept, R and S asked for", async () => {
    const { createWorkspaceDocument } = await import("../document");
    const { connectStoreToDocument, createEditorStore } = await import("../store");
    const { centredAt } = await import("../utils/copyPaste");
    const at = { x: 12, y: -7 };
    for (const size of [5, 6] as const) {
      const doc = createWorkspaceDocument();
      const store = createEditorStore(doc);
      connectStoreToDocument(store, doc);
      store.getState().pasteModel(centredAt(haworthDrawing({ at, size, firstId: 1, firstBondId: 1 }), at));
      const m = doc.getState().model;
      expect(m.atoms).toHaveLength(size);
      expect(m.atoms.map((a) => a.el)).toEqual(["O", ...Array(size - 1).fill("C")]);
      expect(m.atoms.every((a) => typeof a.z === "number" && a.stereoCentre === true && a.stereoShown === true)).toBe(true);
      // (centred as anything put down is: the middle of its box where Quick Add was opened)
      const xs = m.atoms.map((a) => a.x);
      const ys = m.atoms.map((a) => a.y);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(at.x, 6);
      expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(at.y, 6);
      expect(m.bonds.filter((b) => b.display === "bold")).toHaveLength(1);
      // (pasted, the wedge shapes kept with the bold one, each narrow at its far end: never wedge shapes without it)
      expect(m.bonds.filter((b) => b.display === "wedge" && b.narrow != null)).toHaveLength(2);
    }
  }, measured(2400));
});

describe("the Haworth icon clicked again", () => {
  it("makes the ring it put down, unchanged, a ring of five in its place - and a third click a ring of six - each one step, the near edge as ST-1.9 has it every time", async () => {
    const { createWorkspaceDocument } = await import("../document");
    const { connectStoreToDocument, createEditorStore } = await import("../store");
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const mid = () => {
      const m = doc.getState().model;
      return { x: m.atoms.reduce((t, a) => t + a.x, 0) / m.atoms.length, y: m.atoms.reduce((t, a) => t + a.y, 0) / m.atoms.length };
    };
    const nearEdge = () => {
      const bonds = doc.getState().model.bonds;
      expect(bonds.filter((b) => b.display === "bold")).toHaveLength(1);
      expect(bonds.filter((b) => b.display === "wedge" && b.narrow != null)).toHaveLength(2);
    };
    st().putHaworth({ x: 4, y: -2 });
    expect(doc.getState().model.atoms.map((a) => a.el)).toEqual(["O", "C", "C", "C", "C", "C"]);
    nearEdge();
    const where = mid();
    const depth = doc.history().undoDepth;
    // (Quick Add opened on the ring - a little off its middle)
    st().putHaworth({ x: 4.5, y: -1.6 });
    expect(doc.getState().model.atoms.map((a) => a.el).sort()).toEqual(["C", "C", "C", "C", "O"]);
    expect(doc.getState().model.bonds).toHaveLength(5);
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect(doc.history().undoLabel).toBe("make five-membered ring");
    nearEdge();
    // (in its place: its middle where the six's was, near enough - a ring of five's middle is not a six's)
    expect(Math.hypot(mid().x - where.x, mid().y - where.y)).toBeLessThan(0.5);
    st().putHaworth({ x: 4, y: -2 });
    expect(doc.getState().model.atoms).toHaveLength(6);
    nearEdge();
    // (undone, the five; clicked from there, the six again)
    doc.undo();
    expect(doc.getState().model.atoms).toHaveLength(5);
    nearEdge();
    st().putHaworth({ x: 4, y: -2 });
    expect(doc.getState().model.atoms).toHaveLength(6);
    // (Quick Add opened far from it: another ring put down there, this one as it was)
    st().putHaworth({ x: 40, y: 40 });
    expect(doc.getState().model.atoms).toHaveLength(12);
    doc.undo();
    // (anything done since: another ring put down)
    st().addAtom(30, 30, "N");
    st().putHaworth({ x: 20, y: 0 });
    expect(doc.getState().model.atoms).toHaveLength(13);
  }, measured(2400));
});

describe("a Haworth ring at another scale", () => {
  it("is found on the page at its own scale - 0.7 of the ring's, or the style's bond - and its places are drawn to that scale", async () => {
    const { NOMINAL_BOND_LENGTH: L } = await import("../../../../lib/chem/acs");
    for (const length of [0.7 * L, L]) {
      for (const size of [6, 5] as const) {
        const d = haworthDrawing({ at: { x: 3, y: -1 }, size, firstId: 1, firstBondId: 1, length });
        const found = haworthOf(d, d.ring)!;
        expect(found, `${size} at ${length}`).not.toBeNull();
        expect(found.scale).toBeCloseTo(length, 9);
        expect(isProjection(d, new Set(d.atoms.map((a) => a.id)))).toBe(true);
        // (a down place out of a side atom, C-1: its length of the ring's own bond, as the text's figure draws it)
        const side = seenPlaces(d, 1).find((p) => p.free.kind === "down")!;
        expect(Math.hypot(side.place.x - d.atoms[1].x, side.place.y - d.atoms[1].y)).toBeCloseTo(HAWORTH_GROUP[size].side.down * length, 9);
      }
    }
  });
});

/** The box round every text the layout writes for atom `i`'s label: all its letters, not the first alone. */
function wholeLabel(lay: ReturnType<typeof layoutMolecule>, set: ReturnType<typeof labelSetOf>, i: number) {
  const boxes = lay.texts
    .filter((t) => (t as { atom?: number }).atom === i)
    .map((t) => {
      const b = labelBox(t, t.fontPx, set);
      return { minX: t.x - b.left, maxX: t.x + b.right, minY: t.y - b.bottom, maxY: t.y + b.top };
    });
  expect(boxes.length).toBeGreaterThan(0);
  return boxes.reduce((u, b) => ({ minX: Math.min(u.minX, b.minX), maxX: Math.max(u.maxX, b.maxX), minY: Math.min(u.minY, b.minY), maxY: Math.max(u.maxY, b.maxY) }));
}

describe("a labelled group inside a Haworth ring", () => {
  /** A six-ring from the tool with labels led out to the places named - [ring atom, up or down, label] - laid out as the page draws it. */
  const laidWith = (groups: readonly (readonly [number, "up" | "down", string])[]) => {
    const d = haworthDrawing({ at: { x: 0, y: 0 }, size: 6, firstId: 1, firstBondId: 1 });
    const model: Model = { atoms: [...d.atoms], bonds: [...d.bonds] };
    groups.forEach(([k, kind, el], i) => {
      const p = seenPlaces(d, k).find((q) => q.free.kind === kind)!;
      model.atoms.push({ id: 50 + i, x: p.place.x, y: p.place.y, r: 0.9, el } as Atom);
      model.bonds.push({ id: 200 + i, a: d.atoms[k].id, b: 50 + i, order: 1 } as Bond);
    });
    const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
    // (as the labels are typed: a label with no clear way where it stands steps along its vertical - projections/haworthLabels)
    const steps = new Map(haworthLabelsStepped(model, opts).map((s) => [s.id, s]));
    // (and each label's bond inside the ring stops close to it)
    const close = new Set(haworthStemsClose(model).filter((c) => c.close).map((c) => c.id));
    const atoms = model.atoms.map((a) => ({ x: steps.get(a.id)?.x ?? a.x, y: steps.get(a.id)?.y ?? a.y, el: a.el }));
    const index = new Map(model.atoms.map((a, i) => [a.id, i]));
    const bonds = model.bonds.map((b) => ({ a1: index.get(b.a)!, a2: index.get(b.b)!, order: 1 as const, ...(close.has(b.id) ? { close: true } : {}) }));
    return { d, atoms, opts, lay: layoutMolecule(atoms as never, bonds as never, opts, 40) };
  };
  /** The drawn stem of the vertical bond out of ring atom `k` toward `toward`, as a share of the level bond. */
  const stemOf = (w: ReturnType<typeof laidWith>, k: number, toward: number) => {
    const a = w.atoms[k];
    const [lo, hi] = [Math.min(a.y, toward), Math.max(a.y, toward)];
    const along = w.lay.lines.filter((l) => Math.abs(l.x1 - a.x) < 1e-6 && Math.abs(l.x2 - a.x) < 1e-6 && Math.min(l.y1, l.y2) >= lo - 1e-6 && Math.max(l.y1, l.y2) <= hi + 1e-6);
    return along.reduce((t, l) => t + Math.abs(l.y2 - l.y1), 0) / w.d.scale;
  };

  it("stands on a stem that shows at least the text's own - 0.29 of the level bond up from a front atom - where its label is clear there", () => {
    // (C-2, atom 2, front right, under the ring O: the CH2OH written HOH2C, as the page showed it on a stub before; C-3, atom 3, front
    //  left. An OH typed is an O, its H written beside it - up from C-2 its H lies across the bond going up from C-2 at any length, and it
    //  stands where main draws it: haworthLabels.test)
    for (const [k, label] of [[2, "H"], [2, "HOH2C"], [3, "O"], [3, "H"], [3, "CH2OH"]] as const) {
      const w = laidWith([[k, "up", label]]);
      expect(stemOf(w, k, w.atoms[6].y), `C-${k} ${label}`).toBeGreaterThanOrEqual(0.29);
    }
  });

  it("keeps a front atom's up label clear of the label of the back atom's down group above it, each on the figures' stem: C-3's OH under C-5's H", () => {
    // (C-3, atom 3, front left; C-5, atom 5, back left, on the same vertical)
    const w = laidWith([[3, "up", "O"], [5, "down", "H"]]);
    const set = labelSetOf(w.opts);
    const [front, back] = [wholeLabel(w.lay, set, 6), wholeLabel(w.lay, set, 7)];
    // (apart by `LABELS_APART`, 0.02 of the level bond, at the least: 0.027 MEASURED)
    expect((back.minY - front.maxY) / w.d.scale).toBeGreaterThan(LABELS_APART);
    expect(stemOf(w, 3, w.atoms[6].y)).toBeGreaterThanOrEqual(0.29);
    expect(stemOf(w, 5, w.atoms[7].y)).toBeGreaterThanOrEqual(0.25);
  });
});
