import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { diagramIn, type DiagramValue } from "../../../../lib/energyDiagram";
import { readTable } from "../../../../lib/table";
import { factor } from "../../../../lib/units";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { countOf } from "./entries";
import { canWire, inputKey, resultOf, stateOf } from "./flow";
import { addSet, addStep, addTableSet, connect } from "./model";
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
