import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import { addMolecule3d, addPicture, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel, DrawnRecord } from "../store/types";
import { inputKey, resultOf } from "./flow";
import { addSet, addStep, connect, holdMembers, setRan } from "./model";
import { emptyIn, placeResults, ranEmpty, runStep, type RunWith } from "./run";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** Ethane drawn, its mw and logp as a step gave them. */
const ethane = (mw: number, logp: number): DrawnModel => {
  const value = (v: number, unit: Property["unit"] = "none"): Property => ({ value: v, unit, status: "computed", by: { plugin: "p", version: "1" } });
  const record: DrawnRecord = { properties: { mw: value(mw, "g/mol"), logp: value(logp) }, status: "done" };
  return {
    atoms: [
      { id: 1, el: "C", x: 0, y: 0 },
      { id: 2, el: "C", x: 1.56, y: 0.9 },
    ] as never,
    bonds: [{ id: 1, a: 1, b: 2, order: 1 }] as never,
    record,
  };
};

/** `doc` with its first step run again, ok, giving `made` - none, where a branch gave nothing this time. */
function gave(doc: WorkspaceDocument, made: DrawnModel[]): WorkspaceDocument {
  const first = doc.steps![0];
  doc = placeResults(doc, first, { molecules: [], rest: [], holds: "structures", drawn: { made, rest: [] } }, W);
  return setRan(doc, first.id, { at: 1, ok: true, said: "made", input: inputKey(doc, first, "meno"), kind: first.kind });
}

/** Water in 3D, in a set drawn round it (1). */
function water(): WorkspaceDocument {
  let doc = addMolecule3d(emptyWorkspaceDocument(), {
    at: { x: 0, y: 0 },
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0, y: 0.76, z: 0.59 },
      { el: "H", x: 0, y: -0.76, z: 0.59 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
  });
  doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
  return doc;
}

describe("A step on an empty set a step before it gave, having run ok", () => {
  it("leaves no chart of an earlier run under a Chart that says nothing came in", () => {
    let doc = gave(addStep(emptyWorkspaceDocument(), "generate", 0, 0), [ethane(46, -0.3), ethane(60, 0.2)]);
    doc = addStep(doc, "chart", 40, 0, { x: "mw", y: "logp" });
    const chart = doc.steps![1].id;
    doc = connect(doc, { set: resultOf(doc, doc.steps![0].id, "out")!.id }, chart);
    doc = runStep(doc, chart, W);
    expect(resultOf(doc, chart, "out")!.chart).toBeDefined();
    // (the step before it run again, giving none: the Chart run again ends at once, its old chart gone)
    doc = runStep(gave(doc, []), chart, W);
    expect(doc.steps![1].ran).toMatchObject({ ok: true, said: "Nothing came in" });
    const set = resultOf(doc, chart, "out")!;
    expect(set.chart).toBeUndefined();
    expect(set.members).toEqual([]);
    // (the run before it kept among its runs, its chart with it)
    expect(doc.steps![1].runs?.[0]).toMatchObject({ ok: true });
  });

  it("takes away the pictures an earlier Render put in its set", () => {
    let doc = addStep(water(), "render", 10, 0);
    const render = doc.steps![0].id;
    doc = connect(doc, { set: 1 }, render);
    // (a picture an earlier run made, in the step's set)
    doc = addPicture(doc, { name: "water.png", sha256: "a".repeat(64), media: "image/png", px: [10, 10], x: 20, y: 0, w: 4, h: 4 });
    const out = resultOf(doc, render, "out")!.id;
    doc = holdMembers(doc, out, [{ picture: doc.pictures![0].id }]);
    doc = ranEmpty(doc, render, "Nothing came in", "", W);
    expect(doc.pictures ?? []).toEqual([]);
    expect(resultOf(doc, render, "out")!.members).toEqual([]);
    expect(doc.steps![0].ran).toMatchObject({ ok: true, said: "Nothing came in" });
  });

  it("is run as ever, and fails as ever, where that step has not run ok - not run, or failed", () => {
    let doc = addStep(water(), "filter", 10, 0, { conditions: "number ≥ 2", match: "all" });
    doc = connect(doc, { set: 1 }, 2);
    const filter = 2;
    doc = addStep(doc, "duplicates", 30, 0);
    const after = doc.steps![1].id;
    doc = connect(doc, { set: resultOf(doc, filter, "out")!.id }, after);
    // (the Filter not run: its set is empty only because nothing is in it yet)
    expect(emptyIn(doc, doc.steps![1], "meno")).toBeNull();
    doc = setRan(doc, filter, { at: 1, ok: false, said: "refused", input: "", kind: "filter" });
    expect(emptyIn(doc, doc.steps![1], "meno")).toBeNull();
    // (run ok, keeping none: now it is so)
    doc = runStep(doc, filter, W);
    expect(doc.steps![0].ran).toMatchObject({ ok: true });
    expect(emptyIn(doc, doc.steps![1], "meno")).toBe("Nothing came in");
  });

  it("is left to Merge's own rule where Merge's other input is not empty", () => {
    let doc = addStep(water(), "filter", 10, 0, { conditions: "number ≥ 2", match: "all" });
    doc = runStep(connect(doc, { set: 1 }, 2), 2, W);
    doc = addStep(doc, "merge", 30, 0);
    const merge = doc.steps![1];
    doc = connect(doc, { set: 1 }, merge.id, "first");
    doc = connect(doc, { set: resultOf(doc, 2, "out")!.id }, merge.id, "second");
    expect(emptyIn(doc, doc.steps![1], "meno")).toBeNull();
    // (and both empty: said which)
    doc = connect(doc, { set: resultOf(doc, 2, "out")!.id }, merge.id, "first");
    expect(emptyIn(doc, doc.steps![1], "meno")).toBe("Nothing came into First and Second");
  });
});
