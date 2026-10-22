import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D, StepRunKept } from "../store/types";
import { droppedBy, gaveOf, runAllNote, runNote, when } from "./earlierRuns";
import { addSet, addStep, connect, setRan, withStepRuns } from "./model";
import { dropsOnRun, keepRun, keptRun, showRun } from "./run";
import { readWorkflow } from "./saved";

/** A day's times, as this computer gives them: 14:02 on 22 October, and the day before. */
const at = (h: number, m: number, day = 22) => new Date(2026, 9, day, h, m).getTime();
const NOW = at(15, 0);

const molecule = (frames = 0) => ({ atoms: [], bonds: [], ...(frames ? { frames: Array.from({ length: frames }, () => []) } : {}) }) as unknown as Omit<Molecule3D, "id" | "at">;
/** An earlier run of an optimisation at `t`, which gave `n` molecules. */
const optimised = (t: number, n: number, keep = false): StepRunKept => ({
  at: t,
  ok: true,
  said: `${n} optimised`,
  input: "k",
  kind: "optimise",
  results: { molecules: Array.from({ length: n }, () => molecule()), rest: [], holds: "molecules" },
  ...(keep ? { keep: true as const } : {}),
});

/** A step that has run (its last run at 15:00) with `runs` kept before it. */
function stepWith(runs: StepRunKept[], doc: WorkspaceDocument = emptyWorkspaceDocument(), x = 0): WorkspaceDocument {
  let d = addStep(doc, "optimise", x, 0, undefined, "xtb");
  const id = d.steps![d.steps!.length - 1].id;
  d = setRan(d, id, { at: NOW, ok: true, said: "1 optimised", input: "k", kind: "optimise" });
  return withStepRuns(d, id, runs);
}

describe("a step's earlier runs, as it runs again", () => {
  it("keep the run before in full, and every run kept; the others are dropped", () => {
    const d = stepWith([optimised(at(14, 2), 120), optimised(at(13, 0), 3, true), optimised(at(12, 0), 7)]);
    const step = d.steps![0];
    expect(dropsOnRun(step).map((r) => r.at)).toEqual([at(14, 2), at(12, 0)]);
    const after = keepRun(d, step).steps![0];
    expect(after.runs!.map((r) => [r.at, !!r.keep])).toEqual([
      [NOW, false],
      [at(13, 0), true],
    ]);
  });

  it("drop none where what the step last did is not kept in their place: a run refused before it began", () => {
    let d = stepWith([optimised(at(14, 2), 120)]);
    d = setRan(d, d.steps![0].id, { at: NOW, ok: false, said: "Nothing comes into it", input: "" });
    expect(dropsOnRun(d.steps![0])).toEqual([]);
    expect(keepRun(d, d.steps![0]).steps![0].runs).toHaveLength(1);
  });

  it("are kept however many: none dropped for a count", () => {
    const runs = Array.from({ length: 14 }, (_, k) => optimised(at(9, k), 1, true));
    const d = keepRun(stepWith(runs), stepWith(runs).steps![0]);
    expect(d.steps![0].runs).toHaveLength(15);
    // (and read back from a file, every one)
    const read = readWorkflow(JSON.parse(JSON.stringify({ sets: [], steps: d.steps, wires: [] })))!;
    expect(read.steps[0].runs).toHaveLength(15);
  });

  it("are kept by choice, and no longer: the one shown, or an earlier one - kept when shown again, and in a file", () => {
    let d = stepWith([optimised(at(14, 2), 120)]);
    const id = d.steps![0].id;
    d = keptRun(d, id, 0, true);
    expect(d.steps![0].runs![0].keep).toBe(true);
    d = keptRun(d, id, -1, true);
    expect(d.steps![0].ran!.keep).toBe(true);
    // (shown again: each keeps its choice where it goes)
    const shown = showRun(d, id, 0, { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }) }).steps![0];
    expect([shown.ran!.at, shown.ran!.keep, shown.runs![0].at, shown.runs![0].keep]).toEqual([at(14, 2), true, NOW, true]);
    const read = readWorkflow(JSON.parse(JSON.stringify({ sets: [], steps: [shown], wires: [] })))!.steps[0];
    expect([read.ran!.keep, read.runs![0].keep]).toEqual([true, true]);
    // (no longer kept: dropped on the next run)
    const unkept = keptRun(d, id, 0, false);
    expect(unkept.steps![0].runs![0].keep).toBeUndefined();
    expect(dropsOnRun(unkept.steps![0])).toHaveLength(1);
  });
});

describe("what a run drops, said before it", () => {
  it("names each run by its time - its day too, where that is not today - and what it gave", () => {
    expect(when(at(14, 2), NOW)).toBe("14:02");
    expect(when(at(9, 5, 21), NOW)).toBe("21 Oct 09:05");
    const d = stepWith([optimised(at(14, 2), 120), optimised(at(9, 5, 21), 1)]);
    expect(droppedBy(d, [d.steps![0].id], NOW)).toBe("the run from 14:02 (120 molecules) and the run from 21 Oct 09:05 (1 molecule)");
  });

  it("counts a conformer set's conformers, and says where a run gave nothing", () => {
    const conformers: StepRunKept = { ...optimised(at(14, 2), 0), results: { molecules: [molecule(9), molecule(1)], rest: [molecule()], holds: "conformers" } };
    expect(gaveOf(conformers)).toBe("13 conformers");
    expect(gaveOf({ ...optimised(at(14, 2), 0), results: undefined })).toBe("no results");
    expect(gaveOf(optimised(at(14, 2), 0))).toBe("no results");
  });

  it("names each step's runs where several steps drop some, and counts those past three", () => {
    let d = stepWith([optimised(at(14, 2), 120), optimised(at(14, 1), 2)]);
    d = stepWith([optimised(at(13, 2), 5), optimised(at(13, 1), 6)], d, 30);
    expect(droppedBy(d, d.steps!.map((s) => s.id), NOW)).toBe("Optimise's run from 14:02 (120 molecules), Optimise's run from 14:01 (2 molecules), Optimise's run from 13:02 (5 molecules) and 1 more run");
  });

  it("says nothing where nothing is dropped", () => {
    const d = stepWith([optimised(at(14, 2), 120, true)]);
    expect(droppedBy(d, [d.steps![0].id], NOW)).toBeUndefined();
    expect(runNote(d, d.steps![0].id, NOW)).toBeUndefined();
    expect(runAllNote(d, NOW)).toBeUndefined();
  });

  it("covers every step the click runs: a step before it run first, and those after it for Run from here", () => {
    // (three steps in a row: the first changed since it ran, so Run on the second runs it first; the third after it)
    let d = stepWith([optimised(at(10, 0), 4)]);
    d = stepWith([optimised(at(11, 0), 5)], d, 30);
    d = stepWith([optimised(at(12, 0), 6)], d, 60);
    const [a, b, c] = d.steps!.map((s) => s.id);
    d = addSet(d, { x0: 10, y0: -5, x1: 20, y1: 5 }, { step: a, exit: "out", holds: "molecules" });
    d = connect(d, { set: d.sets![0].id }, b);
    d = addSet(d, { x0: 40, y0: -5, x1: 50, y1: 5 }, { step: b, exit: "out", holds: "molecules" });
    d = connect(d, { set: d.sets![1].id }, c);
    // (the first changed: what came into it is not what it ran on)
    d = { ...d, steps: d.steps!.map((s) => (s.id === a ? { ...s, ran: { ...s.ran!, input: "was" } } : s)) };
    expect(runNote(d, b, NOW)).toBe(
      "Running drops Optimise's run from 10:00 (4 molecules) and Optimise's run from 11:00 (5 molecules) from this workspace. Running from here also drops Optimise's run from 12:00 (6 molecules).",
    );
    // (a step running already drops nothing more for being asked again)
    const running = { ...d, steps: d.steps!.map((s) => (s.id === a ? { ...s, running: { at: NOW, input: "", options: {}, jobs: [] } } : s)) };
    expect(runNote(running, b, NOW)).toBe("Running drops the run from 11:00 (5 molecules) from this workspace. Running from here also drops Optimise's run from 12:00 (6 molecules).");
  });
});
