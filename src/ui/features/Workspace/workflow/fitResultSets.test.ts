import { afterEach, describe, expect, it } from "vitest";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { connectStoreToDocument, createEditorStore } from "../store";
import { addMolecule3d, createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { reachOverFrames } from "../utils/molecule3d";
import { setMembers, type Frame } from "./entries";
import { BETWEEN, CHIP, CHIP_CHAR, SET_PAD, SET_TOP } from "./look";
import { addSet, addStep } from "./model";
import { resultOf } from "./flow";
import { chipWide, fitResultSets, placeResults, type RunWith } from "./run";
import { PATH_FRAME, REFINED_SAID } from "./entries";
import { style3dIn } from "../../../../lib/chem/workspaceStyle3d";

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
  d = placeResults(d, d.steps![0], { molecules: [bent(), bent("S"), bent(), bent("S")], rest: [], holds: "molecules" }, { extentOf: reaching(r) });
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

  it("takes its step's Failed set down with it, under it as it was made, as a run does", () => {
    const failedOf = (d: WorkspaceDocument) => resultOf(d, d.steps![0].id, "failed")!;
    const small = resultSet(1);
    const was = failedOf(small);
    expect(was.y1).toBeLessThanOrEqual(small.sets![0].y0 - BETWEEN + 1e-9);
    const big = fitResultSets(small, reaching(2.5));
    const grown = big.sets![0];
    expect(grown.y0).toBeLessThan(was.y1);
    // (moved straight down, as tall as it was, clear of the set it is under)
    const now = failedOf(big);
    expect([now.x0, now.x1]).toEqual([was.x0, was.x1]);
    expect(now.y1 - now.y0).toBeCloseTo(was.y1 - was.y0);
    expect(now.y1).toBeCloseTo(grown.y0 - BETWEEN);
    // (a run in that look leaves it where the widened set does)
    expect(failedOf(resultSet(2.5)).y1).toBeCloseTo(now.y1);
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
    const results = { molecules: [bent(), bent("S"), bent(), bent("S")], rest: [], holds: "molecules" as const };
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
    const look: RunWith["extentOf"] = (m, turn) => reachOverFrames({ ...m, id: 0 }, STYLE_3D, turn);
    doc.edit("run", (d) => {
      d = addStep(d, "optimise", 0, 0, {}, "xtb");
      return placeResults(d, d.steps![0], { molecules: [bent(), bent("S"), bent(), bent("S")], rest: [], holds: "molecules" }, { extentOf: look });
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

  it("in the workspace's styles lays the result sets out again in the same step, which an undo takes back", () => {
    const { doc, state, look } = editor();
    const before = doc.getState();
    // (its two swapped: its molecules space-filling now)
    const ws = state().docStyle3d;
    state().setDocumentStyle3d({ ...ws, primary: ws.secondary, secondary: ws.primary });
    const swapped: RunWith["extentOf"] = (m, turn) => reachOverFrames({ ...m, id: 0 }, style3dIn(doc.getState().style3d, choice), turn);
    expect(fitted(doc.getState(), swapped)).toEqual({ count: 4, inside: true, apart: true });
    expect(doc.getState().sets![0].x1).toBeGreaterThan(before.sets![0].x1);
    expect(doc.history().undoLabel).toBe("3D style");
    doc.undo();
    expect(doc.getState()).toBe(before);
    expect(fitted(doc.getState(), look)).toEqual({ count: 4, inside: true, apart: true });
    // (Settings changed since: the workspace keeps its own)
    useAppSettings.setState({ style3d: { ...choice, primary: "space", secondary: "balls" } });
    expect(state().docStyle3d).toBe(ws);
  });
});

// (the conformance run, #324: "4 / 4 · 0.00 kcal/mol" under a water ran onto its neighbour's chip, and out past the set's frame)
describe("a result set of molecules narrower than their frames chips", () => {
  it("lays each chip clear of its neighbours', inside the frame", () => {
    const optimised = (el: string, n: number): Omit<Molecule3D, "id" | "at"> => {
      const b = bent(el);
      const xyz = b.atoms.flatMap((a) => [a.x, a.y, a.z]);
      return { ...b, frames: Array.from({ length: n - 1 }, () => xyz), energies: Array.from({ length: n }, (_, i) => -5 - i / 1000), path: true };
    };
    let d = addStep(emptyWorkspaceDocument(), "optimise", 0, 0, {}, "xtb");
    d = placeResults(d, d.steps![0], { molecules: [optimised("O", 4), optimised("S", 5), optimised("O", 12)], rest: [], holds: "molecules" }, { extentOf: reaching(0.4) });
    const set = d.sets![0];
    const chips = d.molecules3d!.map((m) => ({ x0: m.at.x - chipWide(m) / 2, x1: m.at.x + chipWide(m) / 2, y: m.at.y }));
    expect(chips.every((c) => c.x1 - c.x0 > 0.8)).toBe(true);
    // (one row: each chip ends before the next begins, all within the frame)
    expect(new Set(chips.map((c) => c.y)).size).toBe(1);
    for (let i = 1; i < chips.length; i++) expect(chips[i].x0).toBeGreaterThanOrEqual(chips[i - 1].x1);
    expect(chips[0].x0).toBeGreaterThanOrEqual(set.x0);
    expect(chips[chips.length - 1].x1).toBeLessThanOrEqual(set.x1);
  });

  it("gives a chip room as wide as what it says, and a single geometry's none", () => {
    const one = bent();
    expect(chipWide(one)).toBe(0);
    const xyz = one.atoms.flatMap((a) => [a.x, a.y, a.z]);
    const four = { ...one, frames: [xyz, xyz, xyz] };
    expect(chipWide({ ...four, energies: [-1, -1, -1, -1] })).toBeGreaterThan(chipWide(four));
    expect(chipWide({ ...four, energies: [-1, -1, -1, -1], shares: [0.25, 0.25, 0.25, 0.25] })).toBeGreaterThan(chipWide({ ...four, energies: [-1, -1, -1, -1] }));
    // (a conformer set's shares by Boltzmann given room - but none of a part of a search's conformers, which shows none)
    const set = { ...four, energies: [-1, -1, -1, -1], conformerSet: true };
    expect(chipWide(set)).toBeGreaterThan(chipWide({ ...four, energies: [-1, -1, -1, -1] }));
    expect(chipWide({ ...set, partOf: true })).toBe(chipWide({ ...four, energies: [-1, -1, -1, -1] }));
  });

  // (Rank's "The first 1": a compound of a conformer set, one conformer kept, says "1 / 1 · 0.00 kcal/mol · 100%" under it -
  //  laid out with no room for it, its chip ran over the set's frame)
  it("gives a conformer set's compound of one conformer its chip's room, as a compound of several", () => {
    const kept = { ...bent(), energies: [-1], shares: [1], conformerSet: true };
    expect(chipWide(kept)).toBeGreaterThan(0);
    let d = addStep(emptyWorkspaceDocument(), "optimise", 0, 0, {}, "xtb");
    d = placeResults(d, d.steps![0], { molecules: [kept, { ...kept, atoms: bent("S").atoms }], rest: [], holds: "molecules" }, { extentOf: reaching(1) });
    const set = d.sets![0];
    const m = d.molecules3d![0];
    // (its chip below its reach, and the frame's pad below that)
    expect(m.at.y - 1 - CHIP - SET_PAD).toBeCloseTo(set.y0, 6);
    for (const n of d.molecules3d!) expect(n.at.x - chipWide(n) / 2).toBeGreaterThanOrEqual(set.x0 + SET_PAD - 1e-6);
  });

  // (a saddle point's chip says "1 imaginary frequency, 450.0i ..." after its numbers, a failed one why: laid out with room for its
  //  numbers alone, its chip ran into its neighbours' and past the set's frame)
  it("gives a chip room for what it says of a frame besides its numbers - a saddle point's imaginary frequency, why one failed", () => {
    const one = { ...bent(), energies: [-1], shares: [1], conformerSet: true };
    const saddle = { ...one, imaginary: [[-450]] };
    const failed = { ...one, failed: [{ kind: "not-converged" as const, why: "stopped at 200 cycles" }] };
    expect(chipWide(saddle)).toBeGreaterThan(chipWide(one) + 20 * CHIP_CHAR);
    // (one of a single frame that failed: no lowest to stand above, said in its energy's place - its chip as wide as that, and why)
    expect(chipWide(failed)).toBeGreaterThanOrEqual(("1 / 1 · none finished: no lowest to stand above · not converged".length) * CHIP_CHAR);
    let d = addStep(emptyWorkspaceDocument(), "optimise", 0, 0, {}, "xtb");
    d = placeResults(d, d.steps![0], { molecules: [saddle, { ...saddle, imaginary: [[-1234.5]] }, failed], rest: [], holds: "molecules" }, { extentOf: reaching(0.4) });
    const set = d.sets![0];
    const chips = d.molecules3d!.map((m) => ({ x0: m.at.x - chipWide(m) / 2, x1: m.at.x + chipWide(m) / 2, y: m.at.y }));
    // (each chip ends before the next begins, in a row, all within the frame)
    for (let i = 1; i < chips.length; i++) if (chips[i].y === chips[i - 1].y) expect(chips[i].x0).toBeGreaterThanOrEqual(chips[i - 1].x1);
    for (const c of chips) expect(c.x0).toBeGreaterThanOrEqual(set.x0);
    for (const c of chips) expect(c.x1).toBeLessThanOrEqual(set.x1);
  });

  // (a path search's molecule, its highest point refined, says each frame's energy from its start - "3 / 3 · ΔE 12.3 kcal/mol from
  //  its start" - not the bare height a plain set's chip says)
  it("gives a path search's chip room for its energy from the path's start", () => {
    const xyz = bent().atoms.flatMap((a) => [a.x, a.y, a.z]);
    const plain = { ...bent(), frames: [xyz, xyz], energies: [-1, -0.99, -0.995] };
    const calc = { program: "test", results: [{ id: PATH_FRAME, group: "Path", label: "Frame", on: "frames" as const, values: ["", REFINED_SAID, ""] }] };
    const path = { ...plain, calc } as unknown as typeof plain;
    expect(chipWide(path)).toBeGreaterThanOrEqual("3 / 3 · ΔE 12.3 kcal/mol from its start".length * CHIP_CHAR);
    expect(chipWide(path)).toBeGreaterThan(chipWide(plain));
  });
});
