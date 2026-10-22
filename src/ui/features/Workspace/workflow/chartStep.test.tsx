import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { chartIn, type ChartValue } from "../../../../lib/chart";
import { readTable } from "../../../../lib/table";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { countOf, holdsOf } from "./entries";
import { canWire, entryOnPage, inputKey, resultOf, stateOf, tableInto } from "./flow";
import { addSet, addStep, addTableSet, connect, updateStep } from "./model";
import { runStep, whyNot, type RunWith } from "./run";
import { readWorkflow } from "./saved";
import { ChartBody } from "./ValueBody";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** Five atoms' shifts, worked out and measured: one not measured. */
const SHIFTS = readTable("atom,calc (none),measured (none)\nC1,128.4,128.5\nC2,129.1,128.9\nC3,126.0,n/a\nC4,137.6,137.8\nC5,21.3,21.4\n");

/** A page with the shifts as a set of their own (set 1) wired into a Chart step (step 2) - its options, where given. */
function charted(options?: Record<string, string>): WorkspaceDocument {
  let doc = addTableSet(emptyWorkspaceDocument(), { x: 0, y: 0 }, SHIFTS, "shifts.csv");
  doc = addStep(doc, "chart", 10, 0, options);
  return connect(doc, { set: 1 }, 2);
}

const chartOf = (doc: WorkspaceDocument) => resultOf(doc, 2)?.chart;

describe("a Chart step", () => {
  it("charts a table's first two columns of numbers, a point a row with both - in a set of its own, the row left counted and said", () => {
    const doc = runStep(charted(), 2, W);
    const step = doc.steps!.find((s) => s.id === 2)!;
    expect([step.ran?.ok, step.ran?.said, stateOf(doc, step, "meno")]).toEqual([true, "4 points \u00b7 1 row left", "done"]);
    const set = resultOf(doc, 2)!;
    expect([holdsOf(doc, set), countOf(doc, set).entries, set.made?.holds]).toEqual(["chart", 4, "chart"]);
    const c = chartOf(doc)!;
    expect([c.x.name, c.y.name, c.points.map((p) => [p.x, p.y, p.row]), c.left]).toEqual([
      "calc",
      "measured",
      [
        [128.4, 128.5, 0],
        [129.1, 128.9, 1],
        [137.6, 137.8, 3],
        [21.3, 21.4, 4],
      ],
      [{ count: 1, why: "with no measured" }],
    ]);
  });

  it("charts the columns its options name, and says why not where it cannot - nothing made", () => {
    const named = chartOf(runStep(charted({ x: "measured", y: "calc" }), 2, W))!;
    expect([named.x.name, named.y.name]).toEqual(["measured", "calc"]);
    const wrong = runStep(charted({ x: "atom" }), 2, W);
    expect(wrong.steps!.find((s) => s.id === 2)!.ran).toMatchObject({ ok: false, said: '"atom" is no column of numbers' });
    expect(chartOf(wrong)).toBeUndefined();
  });

  it("is run again on a table changed - its key is what the table holds - in the set it made before", () => {
    let doc = runStep(charted(), 2, W);
    const step = () => doc.steps!.find((s) => s.id === 2)!;
    const key = inputKey(doc, step(), "meno");
    const frame = resultOf(doc, 2)!.id;
    doc = updateStep(doc, 2, { options: { x: "measured", y: "calc" } });
    expect(stateOf(doc, step(), "meno")).toBe("changed");
    doc = { ...doc, sets: doc.sets!.map((b) => (b.id === 1 ? { ...b, table: readTable("a (none),b (none)\n1,2\n3,4\n") } : b)) };
    expect(inputKey(doc, step(), "meno")).not.toBe(key);
    doc = runStep(updateStep(doc, 2, { options: { x: "", y: "" } }), 2, W);
    expect([resultOf(doc, 2)!.id, chartOf(doc)!.points.length, doc.sets!.filter((b) => b.chart).length]).toEqual([frame, 2, 1]);
  });

  it("takes a conformer set, seen as a table: a conformer a row, named for its molecule and frame, its energy with what worked it out", () => {
    const water = (x: number, energies: number[]): Omit<Molecule3D, "id"> => ({
      at: { x, y: 0 },
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0.96, y: 0, z: 0 },
        { el: "H", x: -0.24, y: 0.93, z: 0 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      ...(energies.length > 1 ? { frames: energies.slice(1).map(() => [0, 0, 0, 0.97, 0, 0, -0.24, 0.94, 0]) } : {}),
      energies,
      conformerSet: true,
      calc: { readers: ["meno"], program: "prog", method: "GFN2-xTB", solvation: "none" },
    });
    let doc = addMolecule3d(emptyWorkspaceDocument(), water(0, [-5.07, -5.06, -5.08]));
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    doc = addStep(doc, "chart", 10, 0);
    doc = connect(doc, { set: 1 }, 2);
    expect(canWire(doc, { set: 1 }, 2)).toBe(true);
    const t = tableInto(doc, 2)!;
    const energy = t.columns.find((c) => c.name === "energy")!;
    expect(energy).toMatchObject({ kind: "number", unit: "Eh", by: { program: "prog", method: expect.stringContaining("GFN2-xTB") } });
    doc = runStep(doc, 2, W);
    const c = chartOf(doc)!;
    // (its first two columns of numbers: each conformer's number, and its energy - at its own geometry, one column)
    expect([c.x.name, c.y.name, c.y.by?.program, c.points.map((p) => [p.x, p.y, p.entry])]).toEqual([
      "number",
      "energy",
      "prog",
      [
        [1, -5.07, "molecule:1#0"],
        [2, -5.06, "molecule:1#1"],
        [3, -5.08, "molecule:1#2"],
      ],
    ]);
    // (a point pressed shows that molecule at that frame; one of no molecule on the page, nothing)
    expect([entryOnPage(doc, "molecule:1#2"), entryOnPage(doc, "molecule:9#0"), entryOnPage(doc, "C1"), entryOnPage(doc, undefined)]).toEqual([{ molecule: 1, frame: 2 }, null, null, null]);
  });

  it("takes no structures drawn, and says what it takes", () => {
    let doc = emptyWorkspaceDocument();
    doc = { ...doc, model: { ...doc.model, atoms: [{ id: 1, el: "C", x: 0, y: 0 } as WorkspaceDocument["model"]["atoms"][number]] } };
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    doc = addStep(doc, "chart", 10, 0);
    expect(canWire(doc, { set: 1 }, 2)).toBe(false);
    doc = { ...doc, wires: [{ id: 99, from: { set: 1 }, to: { step: 2, port: "in" } }] };
    expect(whyNot(doc, doc.steps![0], "meno")).toBe("Takes a table");
  });

  it("is kept in the workspace's file, and reads back as it was - none where a point does not read", () => {
    const doc = runStep(charted(), 2, W);
    const back = readWorkflow(JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires })))!;
    const set = back.sets.find((b) => b.made?.step === 2)!;
    expect([set.made?.holds, set.chart]).toEqual(["chart", chartOf(doc)]);
    const c = chartOf(doc)!;
    expect(chartIn({ ...c, points: [{ x: "1", y: 2, row: 0 }] })).toBeUndefined();
    expect(chartIn({ ...c, x: { name: "x", unit: "furlongs" } })).toBeUndefined();
  });
});

describe("a chart, in its set's frame", () => {
  it("labels each axis with its name, unit and what worked it out, and says how many points and why rows were left", () => {
    const c: ChartValue = {
      x: { name: "number", unit: "none" },
      y: { name: "energy", unit: "Eh", by: { program: "prog", method: "GFN2-xTB" } },
      points: [
        { x: 1, y: -5.07, row: 0 },
        { x: 2, y: -5.06, row: 1 },
      ],
      left: [{ count: 1, why: "with no energy" }],
    };
    const html = renderToString(<ChartBody chart={c} />).split("<!-- -->").join("");
    expect(html).toContain("energy (Eh) \u00b7 prog \u00b7 GFN2-xTB");
    expect(html).toContain(">number<");
    expect(html).toContain("2 points \u00b7 1 row left (1 with no energy)");
    expect(html.match(/<circle/g)?.length).toBe(2);
  });
});
