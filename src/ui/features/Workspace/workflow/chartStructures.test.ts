import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel, DrawnRecord } from "../store/types";
import { BEFORE_THE_EDIT, STATE_FINISHED } from "./entries";
import { inputKey, resultOf } from "./flow";
import { addStep, connect, setRan } from "./model";
import { placeResults, runStep, type RunWith } from "./run";
import { takes } from "./kinds";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** Ethane drawn, with a record: its mw and logp as a step gave them. */
const ethane = (record: DrawnRecord): DrawnModel => ({
  atoms: [
    { id: 1, el: "C", x: 0, y: 0 },
    { id: 2, el: "C", x: 1.56, y: 0.9 },
  ] as never,
  bonds: [{ id: 1, a: 1, b: 2, order: 1 }] as never,
  record,
});
const value = (v: number, unit: Property["unit"] = "none"): Property => ({ value: v, unit, status: "computed", by: { plugin: "p", version: "1" } });
const done = (mw: number, logp: number): DrawnRecord => ({ properties: { mw: value(mw, "g/mol"), logp: value(logp) }, status: "done" });

/** A step's result set holding `made`, wired into a Chart of logp against mw, run. */
function charted(made: DrawnRecord[]): WorkspaceDocument {
  // (a step that made them from nothing, run and up to date: the chart runs on what it gave)
  let doc = addStep(emptyWorkspaceDocument(), "generate", 0, 0);
  const made0 = doc.steps![0];
  doc = placeResults(doc, made0, { molecules: [], rest: [], holds: "structures", drawn: { made: made.map(ethane), rest: [] } }, W);
  doc = setRan(doc, made0.id, { at: 1, ok: true, said: "made", input: inputKey(doc, made0, "meno"), kind: made0.kind });
  doc = addStep(doc, "chart", 40, 0, { x: "mw", y: "logp" });
  const chart = doc.steps![1];
  doc = connect(doc, { set: resultOf(doc, doc.steps![0].id, "out")!.id }, chart.id);
  return runStep(doc, chart.id, W);
}
const ran = (doc: WorkspaceDocument) => doc.steps![1].ran!;
const chartOf = (doc: WorkspaceDocument) => resultOf(doc, doc.steps![1].id, "out")?.chart;

describe("Chart, taking structures drawn", () => {
  it("is offered structures drawn, as it is a table", () => {
    expect(takes("chart", "structures")).toBe(true);
  });

  it("charts each structure's values as a point - x and y as named, from its record", () => {
    const doc = charted([done(46, -0.3), done(60, 0.2), done(88, 1.1)]);
    expect(ran(doc).ok).toBe(true);
    const c = chartOf(doc)!;
    expect(c.kind === "points" && c.points.map((p) => [p.x, p.y])).toEqual([
      [46, -0.3],
      [60, 0.2],
      [88, 1.1],
    ]);
  });

  it("refuses where a structure failed - its mw there all the same - naming it, and the Filter that takes it out", () => {
    const failed: DrawnRecord = { properties: { mw: value(60, "g/mol"), logp: value(0.2) }, status: { failed: "no 3D" } };
    const doc = charted([done(46, -0.3), failed, done(88, 1.1)]);
    expect(ran(doc).ok).toBe(false);
    expect(ran(doc).said).toBe(`Not every structure is a result to stand on: structure 2 of 3 failed: no 3D - take it out first (a Filter on "${STATE_FINISHED}")`);
    expect(chartOf(doc)).toBeUndefined();
  });

  it("refuses where a structure was edited since its values were given, naming it", () => {
    const stale: DrawnRecord = { ...done(60, 0.2), stale: BEFORE_THE_EDIT };
    const doc = charted([done(46, -0.3), stale]);
    expect(ran(doc).ok).toBe(false);
    expect(ran(doc).said).toBe(`Not every structure is a result to stand on: structure 2 of 2 edited since: ${BEFORE_THE_EDIT} - take it out first (a Filter on "${STATE_FINISHED}")`);
  });

  it("charts structures set aside: their values are results, their state finished", () => {
    const aside = (mw: number, logp: number): DrawnRecord => ({ ...done(mw, logp), status: { aside: "logp > 0" } });
    const doc = charted([done(46, -0.3), aside(60, 0.2), aside(88, 1.1)]);
    expect(ran(doc).ok).toBe(true);
    const c = chartOf(doc)!;
    expect(c.kind === "points" && c.points.map((p) => [p.x, p.y])).toEqual([
      [46, -0.3],
      [60, 0.2],
      [88, 1.1],
    ]);
  });

  it("leaves out a structure whose value was not worked out - a cell saying so, never a number - counted and named", () => {
    const notWorked: DrawnRecord = { properties: { mw: value(60, "g/mol"), logp: { value: null, unit: "none", status: { failed: "no charges" }, by: { plugin: "p", version: "1" } } as never }, status: "done" };
    const doc = charted([done(46, -0.3), notWorked, done(88, 1.1)]);
    expect(ran(doc).ok).toBe(true);
    const c = chartOf(doc)!;
    expect(c.kind === "points" && c.points.length).toBe(2);
    expect(c.kind === "points" && c.left.map((l) => [l.count, l.why, l.rows.length])).toEqual([[1, "with no logp", 1]]);
  });
});
