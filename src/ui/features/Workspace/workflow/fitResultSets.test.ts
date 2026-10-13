import { afterEach, describe, expect, it } from "vitest";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { connectStoreToDocument, createEditorStore } from "../store";
import { addMolecule3d, createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { currentStyle3D } from "../style3d";
import { reachOverFrames } from "../utils/molecule3d";
import { setMembers, type Frame } from "./entries";
import { BETWEEN, SET_TOP } from "./look";
import { addSet, addStep, moveStep } from "./model";
import { fitResultSets, placeResults, type RunWith } from "./run";

/** A bent triatomic about the origin: water, or one of its kind. */
const bent = (el = "O"): Omit<Molecule3D, "id" | "at"> => ({
  atoms: [
    { el, x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
});

/** Each molecule reaching `r` every way about its middle: a look `r` wide. */
const reaching = (r: number | ((m: Omit<Molecule3D, "id">) => number)): RunWith["extentOf"] => (m) => {
  const k = typeof r === "number" ? r : r(m);
  return { x0: -k, x1: k, y0: -k, y1: k };
};

/** A step's result set of four molecules, laid out as each reaches `r`. */
function resultSet(r: number): WorkspaceDocument {
  let d = addStep(emptyWorkspaceDocument(), "optimise", 0, 0, {}, "xtb");
  d = placeResults(d, d.steps![0], { molecules: [bent(), bent("S"), bent(), bent("S")], aside: [], holds: "molecules" }, { extentOf: reaching(r) });
  return d;
}

/** Where the set's molecules reach, as `extentOf` has them, and whether they are all inside its frame, below its name, none over another. */
function fitted(d: WorkspaceDocument, extentOf: RunWith["extentOf"], set = d.sets![0]) {
  const ms = setMembers(d, set).molecules.map((id) => d.molecules3d!.find((m) => m.id === id)!);
  const boxes: Frame[] = ms.map((m) => {
    const e = extentOf(m);
    return { x0: m.at.x + e.x0, x1: m.at.x + e.x1, y0: m.at.y + e.y0, y1: m.at.y + e.y1 };
  });
  const eps = 1e-6;
  const inside = boxes.every((b) => b.x0 >= set.x0 - eps && b.x1 <= set.x1 + eps && b.y0 >= set.y0 - eps && b.y1 <= set.y1 - SET_TOP + eps);
  const apart = boxes.every((a, i) => boxes.every((b, j) => j <= i || !(a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.y0 < b.y1 - eps && b.y0 < a.y1 - eps)));
  return { count: ms.length, inside, apart };
}

// (the maintainer, 2026-10-13: a bigger 3D look chosen, a result set's frame widens and its molecules are laid out again - nothing ever over another)
describe("a result set its molecules no longer fit", () => {
  it("is widened from its top left and laid out again, as a run in that look would lay it out", () => {
    const small = resultSet(1);
    const set = small.sets![0];
    expect(fitted(small, reaching(1))).toEqual({ count: 4, inside: true, apart: true });
    // a bigger look: they spill over the frame and onto one another
    expect(fitted(small, reaching(2.5))).toMatchObject({ inside: false, apart: false });
    const big = fitResultSets(small, reaching(2.5));
    const grown = big.sets![0];
    expect(fitted(big, reaching(2.5))).toEqual({ count: 4, inside: true, apart: true });
    expect([grown.x0, grown.y1]).toEqual([set.x0, set.y1]);
    expect(grown.x1 - grown.x0).toBeGreaterThan(set.x1 - set.x0);
    // (where a run in that look puts them)
    const fresh = resultSet(2.5);
    expect(big.molecules3d!.map((m) => m.at)).toEqual(fresh.molecules3d!.map((m) => m.at));
    expect(grown).toMatchObject({ x0: fresh.sets![0].x0, x1: fresh.sets![0].x1, y0: fresh.sets![0].y0, y1: fresh.sets![0].y1 });
  });

  it("is left as it is where they fit - and a smaller look leaves it as wide as it is", () => {
    const small = resultSet(1);
    expect(fitResultSets(small, reaching(1))).toBe(small);
    const big = fitResultSets(small, reaching(2.5));
    expect(fitResultSets(big, reaching(1))).toBe(big);
  });

  it("is laid out for one molecule grown alone, the set no narrower than it was", () => {
    const small = resultSet(1);
    // (one switched to a bigger look of its own: the sulphur ones, here)
    const one = reaching((m) => (m.atoms[0].el === "S" ? 3 : 1));
    const big = fitResultSets(small, one);
    expect(fitted(big, one)).toEqual({ count: 4, inside: true, apart: true });
    expect(big.sets![0].x1 - big.sets![0].x0).toBeGreaterThanOrEqual(small.sets![0].x1 - small.sets![0].x0);
  });

  it("keeps them in the order the run gave them, one grown bigger than the next", () => {
    // (laid out with the sulphur ones bigger - their middles lower than their neighbours', by more than a row's tolerance - then grown more)
    const sizes = (s: number) => reaching((m) => (m.atoms[0].el === "S" ? s : 1));
    let d = addStep(emptyWorkspaceDocument(), "optimise", 0, 0, {}, "xtb");
    const results = { molecules: [bent(), bent("S"), bent(), bent("S")], aside: [], holds: "molecules" as const };
    d = placeResults(d, d.steps![0], results, { extentOf: sizes(2.5) });
    const big = fitResultSets(d, sizes(3.5));
    let fresh = addStep(emptyWorkspaceDocument(), "optimise", 0, 0, {}, "xtb");
    fresh = placeResults(fresh, fresh.steps![0], results, { extentOf: sizes(3.5) });
    expect(big.molecules3d!.map((m) => [m.atoms[0].el, m.at])).toEqual(fresh.molecules3d!.map((m) => [m.atoms[0].el, m.at]));
  });

  it("grows downwards, its rows as wide as the set was, where widening would reach the next step's card", () => {
    let d = resultSet(1);
    const set = d.sets![0];
    // (the next step, just right of the set)
    d = addStep(d, "energy", set.x1 + 2 * BETWEEN, set.y1, {}, "xtb");
    const card = d.steps![1];
    const big = fitResultSets(d, reaching(2.5));
    const grown = big.sets![0];
    expect(fitted(big, reaching(2.5))).toEqual({ count: 4, inside: true, apart: true });
    expect(grown.x1 + BETWEEN).toBeLessThanOrEqual(card.x);
    expect(grown.y1 - grown.y0).toBeGreaterThan(set.y1 - set.y0);
    // (with nothing beside it, it widens as a run would lay it out)
    expect(fitResultSets(resultSet(1), reaching(2.5)).sets![0].x1).toBeGreaterThan(card.x);
  });

  it("leaves a chemist's set, a set holding none of the molecules named, and a set of pictures as they are", () => {
    // a chemist's set, tight round two molecules
    let d = addMolecule3d(addMolecule3d(emptyWorkspaceDocument(), { ...bent(), at: { x: 0, y: 0 } }), { ...bent(), at: { x: 3, y: 0 } });
    d = addSet(d, { x0: -1.5, x1: 4.5, y0: -1.5, y1: 1.5 + SET_TOP });
    expect(fitResultSets(d, reaching(2.5))).toBe(d);
    // a result set, but only other molecules named
    const small = resultSet(1);
    expect(fitResultSets(small, reaching(2.5), undefined, new Set([999]))).toBe(small);
    expect(fitResultSets(small, reaching(2.5), undefined, new Set([small.molecules3d![0].id]))).not.toBe(small);
    // a Render step's set: pictures
    const pictures = { ...small, sets: small.sets!.map((b) => ({ ...b, made: { ...b.made!, holds: "pictures" as const } })) };
    expect(fitResultSets(pictures, reaching(2.5))).toBe(pictures);
  });
});

describe("a 3D look chosen on the canvas or in Settings", () => {
  const choice = useAppSettings.getState().style3d;
  afterEach(() => useAppSettings.setState({ style3d: choice }));

  /** A canvas's store over a document holding a result set laid out in the 3D look Settings has. */
  function editor() {
    const doc = createWorkspaceDocument();
    const look: RunWith["extentOf"] = (m, turn) => reachOverFrames({ ...m, id: 0 }, currentStyle3D(), turn);
    doc.edit("run", (d) => {
      d = addStep(d, "optimise", 0, 0, {}, "xtb");
      return placeResults(d, d.steps![0], { molecules: [bent(), bent("S"), bent(), bent("S")], aside: [], holds: "molecules" }, { extentOf: look });
    });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    return { doc, state: () => store.getState(), look };
  }

  it("on a molecule (its other look) lays its set out again in the same step, which an undo takes back", () => {
    useAppSettings.setState({ style3d: { ...choice, primary: "balls", secondary: "space" } });
    const { doc, state, look } = editor();
    const before = doc.getState();
    const id = setMembers(before, before.sets![0]).molecules[1];
    state().switchLook3d(id);
    const after = doc.getState();
    expect(after.molecules3d!.find((m) => m.id === id)!.look).toBe("secondary");
    expect(fitted(after, look)).toEqual({ count: 4, inside: true, apart: true });
    expect(after.sets![0].x1).toBeGreaterThan(before.sets![0].x1);
    expect(doc.history().undoLabel).toBe("secondary style");
    doc.undo();
    expect(doc.getState()).toBe(before);
  });

  it("in Settings lays the result sets out again with no step of its own, the workspace as saved as it was", () => {
    useAppSettings.setState({ style3d: { ...choice, primary: "balls", secondary: "space" } });
    const { doc, state, look } = editor();
    // (an edit after the run, for an undo to go back over)
    doc.edit("move step", (d) => moveStep(d, d.steps![0].id, -5, 0));
    doc.markSaved();
    const depth = doc.history().undoDepth;
    useAppSettings.setState({ style3d: { ...choice, primary: "space", secondary: "balls" } });
    expect(fitted(doc.getState(), look).apart).toBe(false);
    state().fitResultSets();
    expect(fitted(doc.getState(), look)).toEqual({ count: 4, inside: true, apart: true });
    expect(doc.history().undoDepth).toBe(depth);
    expect(doc.history().dirty).toBe(false);
    // (and the state before it, as an undo brings it back, laid out for that look too)
    doc.undo();
    expect(doc.getState().steps![0].x).toBe(0);
    expect(fitted(doc.getState(), look)).toEqual({ count: 4, inside: true, apart: true });
  });
});
