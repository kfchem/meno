import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { readRecord, recordText, centredAt } from "../utils/copyPaste";
import { addSet, addStep, connect, setRan } from "./model";
import { CARD_H, CARD_W } from "./look";
import { resultOf } from "./flow";
import { appendParts, flowIn, flowOf, partsBounds, partsOf, procedureParts, removeParts } from "./parts";

/**
 * A flow: an input set (1) wired (5) into an optimisation (2), whose exit's
 * set (3) is wired (9) into an energy (6), its exit's set 7; and a step on its
 * own (10), its exit's set 11. Each step's second exit, *Failed*, is a set of
 * its own: 4, 8 and 12.
 */
function flow(): WorkspaceDocument {
  let d = addSet(emptyWorkspaceDocument(), { x0: 0, y0: 0, x1: 4, y1: 4 });
  d = addStep(d, "optimise", 6, 3, { method: "gfn2" }, "xtb");
  d = connect(d, { set: 1 }, 2);
  d = setRan(d, 2, { at: 1, ok: true, said: "done", input: "x" });
  d = addStep(d, "energy", 18, 3, { method: "gfn2" }, "xtb");
  d = connect(d, { set: 3 }, 6);
  d = addStep(d, "frequencies", 30, 30, {}, "xtb");
  // (the ids as the comment has them: every step's exit a set made with it)
  expect([resultOf(d, 2)!.id, resultOf(d, 6)!.id, resultOf(d, 10)!.id]).toEqual([3, 7, 11]);
  expect([resultOf(d, 2, "failed")!.id, resultOf(d, 6, "failed")!.id, resultOf(d, 10, "failed")!.id]).toEqual([4, 8, 12]);
  expect(d.wires!.map((w) => w.id)).toEqual([5, 9]);
  return d;
}

describe("a workflow's parts taken together", () => {
  it("are those sets and steps - without what the steps did, or what their sets held - and the wires among them", () => {
    const d = flow();
    const parts = partsOf(d, new Set([1, 3]), new Set([2]));
    expect(parts.sets.map((b) => b.id)).toEqual([1, 3]);
    // (the set of step 2's exit, its exit still - empty, until that step runs where it is put down)
    expect(parts.sets[1].made).toEqual({ step: 2, exit: "out" });
    expect(parts.steps).toEqual([{ id: 2, kind: "optimise", x: 6, y: 3, by: "xtb", options: { method: "gfn2" } }]);
    // (the wire from set 3 into step 6 is not among them)
    expect(parts.wires.map((w) => [w.from, w.to])).toEqual([[{ set: 1 }, { step: 2, port: "in" }]]);
    // a set whose step is not among them: a set the chemist drew
    expect(partsOf(d, new Set([3]), new Set()).sets[0].made).toBeUndefined();
  });

  it("are added numbered on, moved, wired as they were - each step with a set for every exit - and taken away with every wire into and out of them", () => {
    const d = flow();
    // (step 6 taken without its exits' sets, and step 2 without its Failed one: they are given them)
    const parts = partsOf(d, new Set([1, 3]), new Set([2, 6]));
    const added = appendParts(d, parts, 100, -10);
    const next = d.nextWorkflowId!;
    expect(added.sets).toEqual([next, next + 1, next + 6, next + 7, next + 8]);
    expect(added.steps).toEqual([next + 2, next + 3]);
    const sets = added.doc.sets!.slice(-5);
    expect(sets[0]).toMatchObject({ x0: 100, x1: 104, y0: -10, y1: -6 });
    expect(sets.slice(1).map((b) => b.made)).toEqual([
      { step: next + 2, exit: "out" },
      { step: next + 2, exit: "failed" },
      { step: next + 3, exit: "out" },
      { step: next + 3, exit: "failed" },
    ]);
    expect(added.doc.steps!.slice(-2).map((s) => [s.kind, s.x, s.y])).toEqual([
      ["optimise", 106, -7],
      ["energy", 118, -7],
    ]);
    expect(added.doc.wires!.slice(-2).map((w) => [w.from, w.to])).toEqual([
      [{ set: next }, { step: next + 2, port: "in" }],
      [{ set: next + 1 }, { step: next + 3, port: "in" }],
    ]);
    const gone = removeParts(added.doc, added.sets, added.steps);
    expect(gone.sets).toEqual(d.sets);
    expect(gone.steps).toEqual(d.steps);
    expect(gone.wires).toEqual(d.wires);
  });

  it("are taken by a box or a lasso where their middles are inside it", () => {
    const d = flow();
    expect(flowIn(d, "box", [{ x: -1, y: -1 }, { x: 10, y: 5 }])).toEqual({ sets: [1], steps: [2] });
    const lasso = [{ x: 10, y: -5 }, { x: 40, y: -5 }, { x: 40, y: 40 }, { x: 10, y: 40 }];
    // (sets 11 and 12, step 10's exits, stand to the right of the lasso)
    expect(flowIn(d, "lasso", lasso)).toEqual({ sets: [3, 4, 7, 8], steps: [6, 10] });
    expect(partsBounds(partsOf(d, new Set([1]), new Set([2])))).toEqual({ x0: 0, y0: Math.min(0, 3 - CARD_H), x1: 6 + CARD_W, y1: 4 });
    expect(partsBounds(partsOf(d, new Set(), new Set([10])))).toEqual({ x0: 30, y0: 30 - CARD_H, x1: 30 + CARD_W, y1: 30 });
  });

  it("go to the clipboard in Meno's record and come back, moved with the rest", () => {
    const d = flow();
    const flowParts = partsOf(d, new Set([1]), new Set([2]));
    const read = readRecord(recordText({ atoms: [], bonds: [], flow: flowParts }));
    expect(read?.flow).toEqual(flowParts);
    // (what a step did is never carried; nor a wire to what is not there)
    const withRun = { ...flowParts, steps: [{ ...flowParts.steps[0], ran: { at: 1, ok: true, said: "x", input: "y" } }], wires: [...flowParts.wires, { id: 99, from: { set: 42 }, to: { step: 2, port: "in" } }] };
    expect(readRecord(recordText({ atoms: [], bonds: [], flow: withRun }))?.flow).toEqual(flowParts);
    const moved = centredAt({ atoms: [], bonds: [], flow: flowParts }, { x: 0, y: 0 });
    const b = partsBounds(moved.flow!)!;
    expect((b.x0 + b.x1) / 2).toBeCloseTo(0);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(0);
  });
});

describe("a whole flow", () => {
  it("is every set and step joined to one by wires, either way, and the sets its steps' exits made", () => {
    const d = flow();
    const whole = { sets: new Set([1, 3, 4, 7, 8]), steps: new Set([2, 6]) };
    expect(flowOf(d, { step: 6 })).toEqual(whole);
    expect(flowOf(d, { set: 1 })).toEqual(whole);
    expect(flowOf(d, { step: 10 })).toEqual({ sets: new Set([11, 12]), steps: new Set([10]) });
  });

  it("as a procedure: its steps as set, its sets empty frames - its inputs, and its steps' exits the wires lead on from - placed from its top left", () => {
    const d = flow();
    const proc = procedureParts(d, flowOf(d, { step: 2 }));
    expect(proc.sets.map((b) => [b.id, b.made])).toEqual([
      [1, undefined],
      [3, { step: 2, exit: "out" }],
      [4, { step: 2, exit: "failed" }],
      [7, { step: 6, exit: "out" }],
      [8, { step: 6, exit: "failed" }],
    ]);
    expect(proc.sets[0]).toEqual({ id: 1, x0: 0, x1: 4, y0: -4, y1: 0 });
    expect(proc.steps.map((s) => [s.id, s.kind, s.x, s.y, s.by])).toEqual([
      [2, "optimise", 6, -1, "xtb"],
      [6, "energy", 18, -1, "xtb"],
    ]);
    expect(proc.wires.map((w) => [w.from, w.to])).toEqual([
      [{ set: 1 }, { step: 2, port: "in" }],
      [{ set: 3 }, { step: 6, port: "in" }],
    ]);
    // put down again: the chain, wired, ready for an input
    const down = appendParts(emptyWorkspaceDocument(), proc, 50, 50).doc;
    expect(down.sets).toHaveLength(5);
    expect(down.steps!.map((s) => s.kind)).toEqual(["optimise", "energy"]);
    expect(down.wires).toHaveLength(2);
  });
});
