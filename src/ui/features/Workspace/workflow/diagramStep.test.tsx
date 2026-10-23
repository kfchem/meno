import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { diagramIn, frequenciesSaid, type DiagramValue } from "../../../../lib/energyDiagram";
import { readTable } from "../../../../lib/table";
import { factor } from "../../../../lib/units";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { countOf, MARKS_UNREAD } from "./entries";
import { canWire, inputKey, resultOf, stateOf } from "./flow";
import { addSet, addStep, addTableSet, connect, updateStep } from "./model";
import { runStep, whyNot, type RunWith } from "./run";
import { readWorkflow } from "./saved";
import { DiagramBody } from "./ValueBody";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
const KCAL = factor("Eh", "kcal/mol");

/** A water called `title` at `x`, of the energies given (hartrees) - several, a conformer set - worked out by `method`. */
function water(title: string, x: number, energies: number[], method = "GFN2-xTB"): Omit<Molecule3D, "id"> {
  return {
    at: { x, y: 0 },
    title,
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: -0.24, y: 0.93, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...(energies.length > 1 ? { frames: energies.slice(1).map((_, k) => [0, 0, 0, 0.97 + 0.01 * k, 0, 0, -0.24, 0.94, 0]), conformerSet: true } : {}),
    energies,
    calc: { readers: ["meno"], program: "prog", method },
  };
}

/** A page with R, TS (two conformers, the second lower) and P in a set (its id), wired into an Energy diagram step (its id) - and its options. */
function page(tsMethod = "GFN2-xTB", options?: Record<string, string>): { doc: WorkspaceDocument; set: number; step: number } {
  let doc = addMolecule3d(emptyWorkspaceDocument(), water("R", 0, [-76.4]));
  doc = addMolecule3d(doc, water("TS", 4, [-76.375, -76.38], tsMethod));
  doc = addMolecule3d(doc, water("P", 8, [-76.42]));
  const set = doc.nextWorkflowId ?? 1;
  doc = addSet(doc, { x0: -2, y0: -2, x1: 10, y1: 2 });
  const step = doc.nextWorkflowId!;
  doc = addStep(doc, "energy-diagram", 14, 0, options);
  return { doc: connect(doc, { set }, step), set, step };
}

const diagramOf = (doc: WorkspaceDocument, step: number) => resultOf(doc, step)?.chart as DiagramValue | undefined;

describe("an Energy diagram step", () => {
  it("stands each molecule's name at its lowest energy relative to the first, in kcal/mol, each joined to the next", () => {
    const { doc: d0, step } = page();
    const doc = runStep(d0, step, W);
    const s = doc.steps!.find((x) => x.id === step)!;
    expect([s.ran?.ok, s.ran?.said, stateOf(doc, s, "meno")]).toEqual([true, "3 levels · relative to R", "done"]);
    const d = diagramOf(doc, step)!;
    expect(d.levels.map((l) => [l.name, Number(l.value.toFixed(3)), l.lowestOf, l.lowest.number])).toEqual([
      ["R", 0, 1, 1],
      // (TS at its lower conformer, #2: 0.02 hartree above R)
      ["TS", Number((0.02 * KCAL).toFixed(3)), 2, 2],
      ["P", Number((-0.02 * KCAL).toFixed(3)), 1, 1],
    ]);
    expect([d.axis.name, d.axis.unit, d.axis.by?.program, d.links]).toEqual(["ΔE", "kcal/mol", "prog", [[0, 1], [1, 2]]]);
    expect(countOf(doc, resultOf(doc, step)!)).toMatchObject({ holds: "chart", entries: 3 });
  });

  it("joins the levels as a table wired into Connects says - run again when it changes - relative to the level named", () => {
    const made = page(undefined, { reference: "P" });
    const step = made.step;
    let doc = made.doc;
    doc = addTableSet(doc, { x: 0, y: 20 }, readTable("from,to\nR,TS\nTS,P\n"), "paths.csv");
    const table = doc.nextWorkflowId! - 1;
    expect(canWire(doc, { set: table }, step, "connects")).toBe(true);
    expect(canWire(doc, { set: table }, step, "levels")).toBe(false);
    doc = connect(doc, { set: table }, step);
    doc = runStep(doc, step, W);
    const s = () => doc.steps!.find((x) => x.id === step)!;
    expect([diagramOf(doc, step)!.reference, diagramOf(doc, step)!.links, diagramOf(doc, step)!.levels[2].value]).toEqual(["P", [[0, 1], [1, 2]], 0]);
    const key = inputKey(doc, s(), "meno");
    doc = { ...doc, sets: doc.sets!.map((b) => (b.id === table ? { ...b, table: readTable("from,to\nR,P\n") } : b)) };
    expect([inputKey(doc, s(), "meno") !== key, stateOf(doc, s(), "meno")]).toEqual([true, "changed"]);
    doc = runStep(doc, step, W);
    expect(diagramOf(doc, step)!.links).toEqual([[0, 2]]);
    // (a level renamed - its molecule's title - has changed what comes in too)
    const ran = inputKey(doc, s(), "meno");
    doc = { ...doc, molecules3d: doc.molecules3d!.map((m) => (m.title === "TS" ? { ...m, title: "TS1" } : m)) };
    expect([inputKey(doc, s(), "meno") !== ran, stateOf(doc, s(), "meno")]).toEqual([true, "changed"]);
  });

  it("runs the step before each of its inputs first, wherever it is wired - and does not run where one of them failed", () => {
    // (R and P, each of one geometry, into a Filter whose kept go into Levels - wired after Connects, so not its first wire)
    let doc = addMolecule3d(emptyWorkspaceDocument(), water("R", 0, [-76.4]));
    doc = addMolecule3d(doc, water("P", 4, [-76.42]));
    const set = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -2, y0: -2, x1: 6, y1: 2 });
    const filter = doc.nextWorkflowId!;
    doc = addStep(doc, "filter", 10, 0, { conditions: "energy < 0 Eh" });
    doc = connect(doc, { set }, filter);
    doc = runStep(doc, filter, W);
    const step = doc.nextWorkflowId!;
    doc = addStep(doc, "energy-diagram", 30, 0);
    doc = addTableSet(doc, { x: 0, y: 20 }, readTable("from,to\nR,P\n"), "paths.csv");
    doc = connect(doc, { set: doc.nextWorkflowId! - 1 }, step, "connects");
    doc = connect(doc, { set: resultOf(doc, filter)!.id }, step, "levels");
    // (the Filter changed since it ran: run again first, before the diagram)
    doc = updateStep(doc, filter, { options: { conditions: "energy < -76.41 Eh" } });
    const later: RunWith = { ...W, now: 2000 };
    doc = runStep(doc, step, later);
    const ran = (id: number) => doc.steps!.find((x) => x.id === id)!.ran!;
    expect([ran(filter).at, ran(filter).said]).toEqual([2000, "1 of 2 entries kept \u00b7 rest 1 (1: not energy < -76.41 Eh (-76.4 Eh))"]);
    expect([ran(step).ok, ran(step).said]).toEqual([false, "It takes two levels at least"]);
    // (and where the Filter fails, the diagram says so, and does not run on what it gave before)
    doc = updateStep(doc, filter, { options: { conditions: "energy <" } });
    doc = runStep(doc, step, { ...W, now: 3000 });
    expect([ran(filter).ok, ran(step).said]).toEqual([false, "The step before it failed"]);
  });

  /** The page's TS, P or R given `marks`, its diagram run: what the step says, and the diagram it made, none where none. */
  const marked = (title: string, marks: Partial<Molecule3D>) => {
    const made = page();
    const doc = { ...made.doc, molecules3d: made.doc.molecules3d!.map((m) => (m.title === title ? { ...m, ...marks } : m)) };
    const ran = runStep(doc, made.step, W);
    return [ran.steps!.find((x) => x.id === made.step)!.ran!.said, resultOf(ran, made.step)?.chart ?? null];
  };

  // (refused where an entry under a level is no result, naming it, and nothing drawn: TS's #2, its lowest, not converged - not
  //  the lowest of the rest either, which may not be the level's lowest; P failed, its marks unread, refused)
  it.each([
    ["TS", { failed: [null, { kind: "not-converged" as const, why: "stopped at 200 cycles" }] }, "TS #2 not converged"],
    ["P", { failed: [{ kind: "not-converged" as const, why: "stopped at 200 cycles" }] }, "P #1 not converged"],
    ["P", { marksUnread: true as const }, `P #1: ${MARKS_UNREAD}`],
    ["P", { failed: [{ kind: "refused" as const, why: "an element it has no parameters for" }] }, "P #1 refused"],
  ])("refuses where %s's entry is no result (%j), naming it, and draws nothing", (title, marks, named) => {
    expect(marked(title, marks)).toEqual([`Not every entry is a result to stand on: ${named} - take it out first (a Filter on "state = finished")`, null]);
  });

  it("names every entry that is no result, not the first alone", () => {
    expect(marked("TS", { failed: [{ kind: "program-error", why: "x" }, { kind: "not-converged", why: "y" }] })[0]).toBe(
      "Not every entry is a result to stand on: TS #1 the program stopped with an error; TS #2 not converged - take them out first (a Filter on \"state = finished\")",
    );
  });

  it("carries each level's imaginary frequencies, of the entry it stands at - drawn all the same, and said pointed at", () => {
    const made = page();
    // (R judged to have one imaginary frequency; TS and P with no vibrations worked out)
    const doc = { ...made.doc, molecules3d: made.doc.molecules3d!.map((m) => (m.title === "R" ? { ...m, calc: { ...m.calc!, imaginary: [-300] } } : m)) };
    const d = diagramOf(runStep(doc, made.step, W), made.step)!;
    expect(d.levels.map((l) => [l.name, l.lowest.imaginary])).toEqual([
      ["R", [-300]],
      ["TS", "not computed"],
      ["P", "not computed"],
    ]);
    expect(d.levels.map((l) => frequenciesSaid(l.lowest.imaginary!))).toEqual(["has 1 imaginary frequency, 300.0i cm-1", "frequencies not computed", "frequencies not computed"]);
    expect(frequenciesSaid([])).toBe("no imaginary frequency");
    // (and kept in the file)
    expect(diagramIn(JSON.parse(JSON.stringify(d)))!.levels.map((l) => l.lowest.imaginary)).toEqual([[-300], "not computed", "not computed"]);
  });

  it("says which level's energy was worked out otherwise - and makes nothing", () => {
    const { doc, step } = page("B3LYP");
    const ran = runStep(doc, step, W);
    expect(ran.steps!.find((x) => x.id === step)!.ran).toMatchObject({ ok: false, said: 'Its levels\' energy was not worked out one way: "energy · GFN2-xTB" for R, P; "energy · B3LYP" for TS' });
    expect(diagramOf(ran, step)).toBeUndefined();
  });

  it("takes nothing but molecules into Levels, and cannot run with nothing there", () => {
    let doc = addTableSet(emptyWorkspaceDocument(), { x: 0, y: 0 }, readTable("from,to\nR,P\n"));
    doc = addStep(doc, "energy-diagram", 10, 0);
    doc = connect(doc, { set: 1 }, 2);
    expect(doc.wires![0].to.port).toBe("connects");
    expect(whyNot(doc, doc.steps![0], "meno")).toBe("Nothing comes into Levels");
    expect(inputKey(doc, doc.steps![0], "meno")).toBe("");
  });

  it("is kept in the workspace's file, and reads back as it was - none where a line names no level it has", () => {
    const { doc: d0, step } = page();
    const doc = runStep(d0, step, W);
    const back = readWorkflow(JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires })))!;
    expect(back.sets.find((b) => b.made?.step === step)?.chart).toEqual(diagramOf(doc, step));
    const d = diagramOf(doc, step)!;
    expect(diagramIn({ ...d, links: [[0, 3]] })).toBeUndefined();
    expect(diagramIn({ ...d, levels: [{ ...d.levels[0], value: "0" }] })).toBeUndefined();
  });
});

describe("an energy diagram, in its set's frame", () => {
  it("draws each level with its name and value, the axis its quantity, unit and what worked it out, and says what it is", () => {
    const d: DiagramValue = {
      kind: "diagram",
      axis: { name: "ΔG", unit: "kcal/mol", by: { program: "prog", method: "GFN2-xTB" }, at: { geometry: "own", kelvin: 298.15 } },
      reference: "R",
      levels: [
        { name: "R", value: 0, lowestOf: 1, lowest: { row: 0 } },
        { name: "TS", value: 12.34, lowestOf: 3, lowest: { row: 2, number: 2 } },
        { name: "P", value: -5.06, lowestOf: 1, lowest: { row: 4 } },
      ],
      links: [
        [0, 1],
        [1, 2],
      ],
      left: [{ count: 1, why: 'of "TS" with no G', rows: ["molecule:2#1 (conformer 2 of 3)"] }],
    };
    const html = renderToString(<DiagramBody diagram={d} />).split("<!-- -->").join("");
    expect(html).toContain("ΔG (kcal/mol) · prog · GFN2-xTB · 298.15 K");
    for (const t of [">R<", ">TS<", ">P<", ">0.0<", ">+12.3<", ">−5.1<"]) expect(html).toContain(t);
    expect(html).toContain('3 levels · relative to R · 1 left (1 of &quot;TS&quot; with no G)');
    // (and what was left named, pointed at)
    expect(html).toContain('1 of &quot;TS&quot; with no G: molecule:2#1 (conformer 2 of 3)');
    expect(html.match(/stroke-dasharray/g)?.length).toBe(2);
  });
});
