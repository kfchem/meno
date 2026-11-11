import { describe, expect, it, vi } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { LARGE_SET } from "./entries";
import { addStep } from "./model";
import { CHIP, SET_PAD, SET_TOP } from "./look";
import { placeResults, LEAST_W, type RunWith } from "./run";
import { HELD_CHIP_ROW, HELD_VIEWS, chipRows, heldFrame, heldViewAt, heldViewId, heldViews, isHeldView, shownIn, showsOneAtATime } from "./heldView";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));

/** A water, its oxygen moved along by `k` hundredths of an ångström: each one told apart. */
const water = (k = 0): Omit<Molecule3D, "id" | "at"> => ({
  atoms: [
    { el: "O", x: k / 100, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
});
/** A conformer set of `n` geometries of a water. */
const conformers = (k: number, n: number): Omit<Molecule3D, "id" | "at"> => ({ ...water(k), conformerSet: true, frames: Array.from({ length: n - 1 }, (_, j) => water(j + 1).atoms.flatMap((a) => [a.x, a.y, a.z])) });
const extentOf: RunWith["extentOf"] = () => ({ x0: -1, x1: 2, y0: -3, y1: 1 });
const waters = (n: number) => Array.from({ length: n }, (_, k) => water(k));

function ran(molecules: Omit<Molecule3D, "id" | "at">[], holds: "molecules" | "conformers" = "molecules"): WorkspaceDocument {
  const doc = addStep(emptyWorkspaceDocument(), "optimise", 0, 0, {}, "xtb");
  return placeResults(doc, doc.steps![0], { molecules, rest: [], holds }, { extentOf });
}

/** A store joined to a document holding a step's result set of `molecules`. */
function held(molecules: Omit<Molecule3D, "id" | "at">[], holds: "molecules" | "conformers" = "molecules") {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  doc.edit("run", (d) => {
    const s = addStep(d, "optimise", 0, 0, {}, "xtb");
    return placeResults(s, s.steps![0], { molecules, rest: [], holds }, { extentOf });
  });
  return { doc, store, st: () => store.getState() };
}

describe("a view of a large result set's molecule (id)", () => {
  it("has an id of its own for each molecule of each set, clear of a collection's - and of every molecule on a page", () => {
    expect(heldViewId(1, 0)).not.toBe(heldViewId(1, 1));
    expect(heldViewId(1, 5)).not.toBe(heldViewId(2, 5));
    expect(heldViewId(0, 0)).not.toBe(heldViewId(1, 0));
    expect(isHeldView(heldViewId(7, 117))).toBe(true);
    expect(isHeldView(heldViewId(0, 0))).toBe(true);
    // (a collection's own: from -1 down, a page's: from 1 up)
    expect(isHeldView(-1)).toBe(false);
    expect(isHeldView(-100000)).toBe(false);
    expect(isHeldView(-(HELD_VIEWS - 1))).toBe(false);
    expect(isHeldView(5)).toBe(false);
    expect(isHeldView(0)).toBe(false);
  });
});

describe("which molecule a view shows", () => {
  const b = { id: 4, collection: waters(60) };
  it("is the first until it is told another, and is kept in its collection", () => {
    expect(shownIn(b, {})).toBe(0);
    expect(shownIn(b, { 4: 7 })).toBe(7);
    expect(shownIn(b, { 4: 59 })).toBe(59);
    expect(shownIn(b, { 4: 60 })).toBe(0);
    expect(shownIn(b, { 4: -1 })).toBe(0);
    expect(shownIn(b, { 4: 2.5 })).toBe(0);
    // (another set's is not this one's)
    expect(shownIn(b, { 5: 7 })).toBe(0);
    expect(shownIn({ id: 4 }, { 4: 7 })).toBe(0);
  });
  it("is a view only of a set that holds more molecules than a page lays out", () => {
    expect(showsOneAtATime({ collection: waters(LARGE_SET + 1) })).toBe(true);
    expect(showsOneAtATime({ collection: waters(LARGE_SET) })).toBe(false);
    expect(showsOneAtATime({})).toBe(false);
  });
});

describe("a held set's frame", () => {
  const room = (w: number, h: number) => ({ x0: -w / 2, x1: w / 2, y0: -h / 2, y1: h / 2, chip: 0 });
  it("is as wide as the widest molecule it holds and as tall as the tallest, and its chips", () => {
    const f = heldFrame([room(10, 4), room(6, 12), room(8, 8)], 2, 1);
    expect(f.width).toBeCloseTo(10 + 2 * SET_PAD, 9);
    expect(f.height).toBeCloseTo(SET_TOP + 12 + 2 * CHIP + SET_PAD, 9);
    // (a molecule's room about its place: the greater side of it)
    const lopsided = heldFrame([{ x0: -1, x1: 5, y0: -2, y1: 0.5, chip: 0 }], 1, 1);
    expect(lopsided.width).toBeCloseTo(10 + 2 * SET_PAD, 9);
    expect(lopsided.height).toBeCloseTo(SET_TOP + 4 + CHIP + SET_PAD, 9);
  });
  it("is at least as wide as its name and count need", () => {
    expect(heldFrame([room(0.1, 0.1)], 1, 500).width).toBe(500);
    expect(heldFrame([room(0.1, 0.1)], 1, 0.1).width).toBeCloseTo(0.1 + 2 * SET_PAD, 9);
  });
  it("has the rows its chips take: a stack chip, and a frames chip where any molecule has one", () => {
    expect(chipRows(waters(60))).toBe(1);
    expect(chipRows([...waters(60), conformers(0, 3)])).toBe(2);
    expect(HELD_CHIP_ROW).toBeGreaterThan(0);
    expect(HELD_CHIP_ROW).toBeLessThan(CHIP);
  });
  it("holds its molecule across its middle, in the room between its name and its chips", () => {
    const frame = { x0: 10, x1: 30, y0: -50, y1: -10 };
    const at = heldViewAt({ x0: 10, x1: 30, y0: -50, y1: -10 }, 1);
    expect(at.x).toBe(20);
    const room = 40 - SET_TOP - CHIP - SET_PAD;
    expect(at.y).toBeCloseTo(-10 - SET_TOP - room / 2, 9);
    // (more chips under it: it stands higher)
    expect(heldViewAt(frame, 2).y).toBeGreaterThan(at.y - CHIP);
    expect(heldViewAt(frame, 2).y).toBeCloseTo(at.y + CHIP / 2, 9);
  });
});

describe("a placed large set", () => {
  it("is as large as its largest molecule's room and its chips need - not as a summary card", () => {
    const d = ran(waters(LARGE_SET + 1));
    const set = d.sets![0];
    const f = heldFrame([{ x0: -1, x1: 2, y0: -3, y1: 1, chip: 0 }], 1, LEAST_W);
    expect(set.x1 - set.x0).toBeCloseTo(f.width, 9);
    expect(set.y1 - set.y0).toBeCloseTo(f.height, 9);
    // (a conformer set among them: a frames chip's row too)
    const withFrames = ran([...waters(LARGE_SET), conformers(0, 4)], "conformers");
    expect(withFrames.sets![0].y1 - withFrames.sets![0].y0).toBeCloseTo(f.height + CHIP, 9);
  });
});

describe("the views of a page", () => {
  it("are one for each large set on it, the molecule it shows on its own id, in its frame", () => {
    const d = ran(waters(LARGE_SET + 1));
    const [v, ...rest] = heldViews(d, {});
    expect(rest).toEqual([]);
    expect(v.index).toBe(0);
    expect(v.count).toBe(51);
    expect(v.molecule.id).toBe(heldViewId(d.sets![0].id, 0));
    expect(v.molecule.at).toEqual(heldViewAt(d.sets![0], chipRows(d.sets![0].collection!)));
    expect(v.molecule.atoms).toEqual(d.sets![0].collection![0].atoms);
    // (the next, once the view has gone over to it)
    const [w] = heldViews(d, { [d.sets![0].id]: 7 });
    expect(w.index).toBe(7);
    expect(w.molecule.id).toBe(heldViewId(d.sets![0].id, 7));
    expect(w.molecule.atoms[0].x).toBeCloseTo(0.07, 12);
    // (the same view of the same molecule in the same place: the one object, not asked to be drawn again)
    expect(heldViews(d, { [d.sets![0].id]: 7 })[0].molecule).toBe(w.molecule);
  });

  it("are none of a set a page lays out, nor of one held off the page, its exit wired on", () => {
    const few = ran(waters(LARGE_SET));
    expect(heldViews(few, {})).toEqual([]);
    const d = ran(waters(LARGE_SET + 1));
    const wired = addStep(d, "energy", 20, 0, {}, "xtb");
    const on = { ...wired, wires: [{ id: 99, from: { set: d.sets![0].id }, to: { step: wired.steps![1].id, port: "in" } }] };
    expect(on.sets![0].collection).toHaveLength(51);
    expect(heldViews(on, {})).toEqual([]);
  });

  it("show a molecule of 600 conformers as a molecule: its frames chip is the molecule's own", () => {
    const d = ran(Array.from({ length: LARGE_SET + 1 }, (_, k) => conformers(k, 200)), "conformers");
    const [v] = heldViews(d, { [d.sets![0].id]: 3 });
    expect(v.molecule.conformerSet).toBe(true);
    expect(v.molecule.frames).toHaveLength(199);
    expect(chipRows(d.sets![0].collection!)).toBe(2);
  });
});

describe("a view going over to another molecule", () => {
  it("is the view's, not the document's: nothing the document holds changes, nothing to undo", () => {
    const { doc, st } = held(waters(LARGE_SET + 1));
    const set = st().sets[0];
    const before = doc.getState();
    const depth = doc.history().undoDepth;
    st().showHeld(set.id, 5);
    expect(st().heldShown).toEqual({ [set.id]: 5 });
    expect(doc.getState()).toBe(before);
    expect(doc.history().undoDepth).toBe(depth);
    expect(st().sets[0].collection).toBe(set.collection);
    // (as far as the collection goes, and no further)
    st().showHeld(set.id, LARGE_SET);
    expect(st().heldShown[set.id]).toBe(LARGE_SET);
    st().showHeld(set.id, LARGE_SET + 1);
    st().showHeld(set.id, -1);
    st().showHeld(set.id, 1.5);
    expect(st().heldShown[set.id]).toBe(LARGE_SET);
    // (another set's: none)
    st().showHeld(set.id + 100, 3);
    expect(Object.keys(st().heldShown)).toEqual([String(set.id)]);
  });

  it("goes on with the turn of the one it let go of, as a stack's does, so that each is seen against the last", () => {
    const { st } = held(waters(LARGE_SET + 1));
    const id = st().sets[0].id;
    st().setTurn3d(heldViewId(id, 0), [0, 0.6, 0, 0.8]);
    st().showHeld(id, 1);
    expect(st().turns3d[heldViewId(id, 1)]).toEqual([0, 0.6, 0, 0.8]);
    // (turned on, and gone back: the first takes the turn of the one it went on from)
    st().setTurn3d(heldViewId(id, 1), [0.6, 0, 0, 0.8]);
    st().showHeld(id, 0);
    expect(st().turns3d[heldViewId(id, 0)]).toEqual([0.6, 0, 0, 0.8]);
    // (one not turned, the next as it is, unturned: nothing kept of it)
    const fresh = held(waters(LARGE_SET + 1));
    fresh.st().showHeld(fresh.st().sets[0].id, 2);
    expect(Object.keys(fresh.st().turns3d)).toEqual([]);
  });

  it("is kept in the file: opened again, the view shows the molecule it showed, and its molecules are as they were", () => {
    const { st } = held(waters(LARGE_SET + 3));
    const id = st().sets[0].id;
    st().showHeld(id, 9);
    const text = workspaceText(st());
    expect(JSON.parse(text).sets[0].shown).toBe(9);
    const ws = readWorkspace(text)!;
    const again = createWorkspaceDocument();
    const opened = createEditorStore(again);
    connectStoreToDocument(opened, again);
    opened.getState().openWorkspace(ws, true);
    const set = opened.getState().sets[0];
    expect(opened.getState().heldShown).toEqual({ [set.id]: 9 });
    expect(set.collection).toHaveLength(LARGE_SET + 3);
    expect(set.collection![9].atoms).toEqual(st().sets[0].collection![9].atoms);
    expect(heldViews(opened.getState(), opened.getState().heldShown)[0].index).toBe(9);
    // (the first one shown: nothing said, as nothing was kept of a view that is as a set is made)
    st().showHeld(id, 0);
    expect(JSON.parse(workspaceText(st())).sets[0].shown).toBeUndefined();
    // (a file that says a place past its collection's end: the first)
    const spoilt = JSON.parse(text);
    spoilt.sets[0].shown = 999;
    const odd = createWorkspaceDocument();
    const oddStore = createEditorStore(odd);
    connectStoreToDocument(oddStore, odd);
    oddStore.getState().openWorkspace(readWorkspace(JSON.stringify(spoilt))!, true);
    expect(heldViews(oddStore.getState(), oddStore.getState().heldShown)[0].index).toBe(0);
  });
});
