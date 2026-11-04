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
import { diagramKept, diagramNeeds, diagramOptions, diagramValues } from "./diagramOptions";
import { howOf, kindInfo } from "./kinds";
import { stepOptions } from "./doers";
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

  it("says, where Ready would be, a Relative to naming no level that comes in - and is refused on it as it runs - and is ready once it names one, by either name", () => {
    const { doc, step } = page(undefined, { reference: "Zed" });
    const s = (d: WorkspaceDocument) => d.steps!.find((x) => x.id === step)!;
    expect([diagramNeeds(doc, s(doc)), whyNot(doc, s(doc), "meno")]).toEqual(['No level is called "Zed"', 'No level is called "Zed"']);
    const ran = runStep(doc, step, W);
    expect([s(ran).ran?.ok, s(ran).ran?.said, diagramOf(ran, step)]).toEqual([false, 'No level is called "Zed"', undefined]);
    // (named by the name Levels shows it by, or its own)
    const shown = updateStep(doc, step, { options: { reference: "start", levels: "R = start" } });
    expect([diagramNeeds(shown, s(shown)), whyNot(shown, s(shown), "meno")]).toEqual([undefined, null]);
    expect(diagramOf(runStep(shown, step, W), step)?.reference).toBe("start");
    const own = updateStep(doc, step, { options: { reference: "P" } });
    expect(diagramNeeds(own, s(own))).toBeUndefined();
    // (nothing in yet: no input says so, not this)
    const bare = { ...doc, wires: [] };
    expect(diagramNeeds(bare, s(bare))).toBeUndefined();
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

  it("names a failure of a kind Meno does not know by that kind, as it came", () => {
    expect(marked("P", { failed: [{ kind: "lost-in-transit" as never, why: "x" }] })[0]).toBe("Not every entry is a result to stand on: P #1 lost-in-transit - take it out first (a Filter on \"state = finished\")");
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
    expect(d.levels.map((l) => frequenciesSaid(l.lowest.imaginary!))).toEqual(["has 1 imaginary frequency, 300.0i cm⁻¹", "frequencies not computed", "frequencies not computed"]);
    expect(frequenciesSaid([])).toBe("no imaginary frequency");
    // (and kept in the file)
    expect(diagramIn(JSON.parse(JSON.stringify(d)))!.levels.map((l) => l.lowest.imaginary)).toEqual([[-300], "not computed", "not computed"]);
  });

  it("says which level's energy was worked out otherwise - and makes nothing", () => {
    const { doc, step } = page("B3LYP");
    const ran = runStep(doc, step, W);
    expect(ran.steps!.find((x) => x.id === step)!.ran).toMatchObject({ ok: false, said: 'Its levels\' E was not worked out one way: "energy · GFN2-xTB" for R, P; "energy · B3LYP" for TS' });
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
    // (the axis its quantity and unit alone; what worked it out on the line under it, a number and its unit never apart)
    expect(html).toContain('data-axis="y">ΔG (kcal/mol)</span>');
    for (const t of [">R<", ">TS<", ">P<", ">0.0<", ">+12.3<", ">−5.1<"]) expect(html).toContain(t);
    expect(html).toContain("3 levels · relative to R · prog · GFN2-xTB · 298.15\u00a0K · 1 left (1 of &quot;TS&quot; with no G)");
    // (and what was left named, pointed at)
    expect(html).toContain('1 of &quot;TS&quot; with no G: molecule:2#1 (conformer 2 of 3)');
    expect(html.match(/stroke-dasharray/g)?.length).toBe(2);
  });
});

describe("an Energy diagram of outputs opened, its levels as its card lists them", () => {
  // HCN, its isomerisation's saddle point and HNC as ORCA 6.1.1 gave them (r2SCAN-3c, Opt Freq): each FINAL SINGLE POINT ENERGY
  // and Final Gibbs free energy (298.15 K, 1 atm), in hartrees - each molecule called by the file it came from, as one opened is
  const reading = (id: string, value: number) => ({ id, on: "molecule", group: "Thermochemistry", label: id, value, quantity: "energy" }) as never;
  const opened = (name: string, x: number, e: number, g: number): Omit<Molecule3D, "id"> => {
    const { title: _, ...m } = water(name, x, [e], "r2SCAN-3c");
    return { ...m, name, calc: { readers: ["cclib 1.9rc1"], program: "ORCA", method: "r2SCAN-3c", results: [reading("thermo.free-energy", g), reading("thermo.temperature", 298.15)] } };
  };
  /** The three opened in the order P, R, TS - as files named so come - in a set wired into an Energy diagram with `options`. */
  function rtp(options?: Record<string, string>) {
    let doc = addMolecule3d(emptyWorkspaceDocument(), opened("P.out", 0, -93.375824209007, -93.37984432));
    doc = addMolecule3d(doc, opened("R.out", 4, -93.399651434575, -93.40279161));
    doc = addMolecule3d(doc, opened("TS.out", 8, -93.324592691836, -93.33491231));
    const set = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -2, y0: -2, x1: 10, y1: 2 });
    const step = doc.nextWorkflowId!;
    doc = addStep(doc, "energy-diagram", 14, 0, options);
    return { doc: connect(doc, { set }, step), step };
  }
  const levelsOf = (doc: WorkspaceDocument, step: number) => diagramOf(doc, step)!.levels.map((l) => [l.name, Number(l.value.toFixed(2))]);

  it("names each level by its file, without its extension, and draws them as they come where none is listed", () => {
    const { doc, step } = rtp();
    const ran = runStep(doc, step, W);
    expect(levelsOf(ran, step)).toEqual([
      ["P", 0],
      ["R", -14.95],
      ["TS", 32.15],
    ]);
  });

  it("draws them as listed, R, TS, P relative to R - ΔE 47.10 and 14.95 kcal/mol, ΔG 42.59 and 14.40, by hand from ORCA's own", () => {
    const { doc, step } = rtp({ levels: "R\nTS\nP", reference: "R" });
    const ran = runStep(doc, step, W);
    expect(levelsOf(ran, step)).toEqual([
      ["R", 0],
      ["TS", 47.1],
      ["P", 14.95],
    ]);
    expect(ran.steps!.find((x) => x.id === step)!.ran?.said).toBe("3 levels · relative to R");
    // (by hand: the free energies' differences, x 627.509)
    expect([((-93.33491231 + 93.40279161) * KCAL).toFixed(2), ((-93.37984432 + 93.40279161) * KCAL).toFixed(2)]).toEqual(["42.59", "14.40"]);
    const g = runStep(updateStep(doc, step, { options: { levels: "R = HCN\nTS\nP = HNC", reference: "R", quantity: "thermo.free-energy" } }), step, W);
    expect(levelsOf(g, step)).toEqual([
      ["HCN", 0],
      ["TS", 42.59],
      ["HNC", 14.4],
    ]);
    expect([diagramOf(g, step)!.axis.name, diagramOf(g, step)!.reference]).toEqual(["ΔG", "HCN"]);
  });

  it("lists on its card the energies its levels carry, by symbol and how; its levels, one to a line; and which one the rest are relative to", () => {
    const { doc, step } = rtp();
    const s = doc.steps!.find((x) => x.id === step)!;
    const options = diagramOptions(doc, s, stepOptions(s));
    const byId = (id: string) => options.find((o) => o.id === id)!;
    expect(byId("quantity")).toMatchObject({
      type: "choice",
      default: "energy",
      choices: [
        { value: "energy", label: "ΔE · electronic energy · ORCA · r2SCAN-3c" },
        { value: "thermo.free-energy", label: "ΔG · Gibbs free energy · ORCA · r2SCAN-3c · 298.15\u00a0K" },
      ],
    });
    expect(byId("levels")).toMatchObject({ type: "lines", default: "P\nR\nTS" });
    expect(byId("reference")).toMatchObject({ type: "choice", default: "P", choices: ["P", "R", "TS"].map((n) => ({ value: n, label: n })) });
    // (listed again, the reference's list follows - each by the name it is shown by; each line read as the level it puts where)
    const listed = diagramOptions(doc, { ...s, options: { levels: "R = HCN\nTS\nQ\nTS" } }, stepOptions(s));
    expect(listed.find((o) => o.id === "reference")).toMatchObject({ default: "R", choices: [{ value: "R", label: "HCN" }, { value: "TS", label: "TS" }, { value: "P", label: "P" }] });
    const lines = listed.find((o) => o.id === "levels")!;
    expect(lines.type === "lines" && lines.readAs?.("R = HCN\nTS\nQ\nTS")).toEqual([
      { said: "1 \u00b7 as HCN" },
      { said: "2" },
      { said: 'No level "Q" comes in', problem: true },
      { said: "Listed already", problem: true },
    ]);
    // (put down blank - its levels as they come, relative to the first - the card shows them listed, the first picked, and says which)
    const blank = diagramValues(options, { ...s.options, quantity: "energy", levels: "", reference: "" });
    expect([blank.levels, blank.reference, blank.quantity]).toEqual(["P\nR\nTS", "P", "energy"]);
    expect(howOf(options, blank, kindInfo("energy-diagram").how)).toBe("ΔE, relative to P");
    // (one its list no longer has: its list's default; one it has, as it is - by the name it is shown by)
    expect(diagramValues(listed, { reference: "R.out", levels: "R = HCN\nTS\nP" }).reference).toBe("R");
    expect(howOf(listed, diagramValues(listed, { reference: "R", levels: "R = HCN\nTS\nQ\nTS" }), kindInfo("energy-diagram").how)).toBe("ΔE, relative to HCN");
    // (Levels changed alone: the reference left as shown, blank, stays blank - the first as they are now listed - never P, as it stood)
    const shown = diagramValues(options, { quantity: "energy", levels: "", reference: "" });
    expect(diagramKept({ ...shown, levels: "R = HCN\nTS\nP" }, shown, { quantity: "energy", levels: "", reference: "" })).toEqual({ quantity: "energy", levels: "R = HCN\nTS\nP", reference: "" });
    // (one the chemist picked: kept)
    expect(diagramKept({ ...shown, reference: "TS" }, shown, { reference: "" }).reference).toBe("TS");
    // (nothing in Levels: as the kind declares them)
    const bare = addStep(emptyWorkspaceDocument(), "energy-diagram", 0, 0);
    expect(diagramOptions(bare, bare.steps![0], stepOptions(bare.steps![0])).map((o) => o.type)).toEqual(["text", "lines", "text"]);
  });
});

describe("an Energy diagram's level of several compounds", () => {
  type A = { el: string; charge?: number };
  /** A molecule called `title` at `x`: its atoms (placed along a line - only their elements, charges and bonds count here), bonds, one energy in hartrees, and a charge its calculation gave. */
  const mol = (title: string, x: number, atoms: A[], bonds: [number, number][], energy: number, charge?: number): Omit<Molecule3D, "id"> => ({
    at: { x, y: 0 },
    title,
    atoms: atoms.map((a, k) => ({ ...a, x: k * 1.1, y: 0, z: 0 })),
    bonds: bonds.map(([a1, a2]) => ({ a1, a2, order: 1 })),
    energies: [energy],
    calc: { readers: ["meno"], program: "prog", method: "m", ...(charge != null ? { charge, multiplicity: 1 } : {}) },
  });
  const H = { el: "H" };
  // (made up, so that the answer is known by construction - each level's atoms as a reaction's are: CH4BrO, charge -1)
  const ch3br = () => mol("R", 0, [{ el: "C" }, H, H, H, { el: "Br" }], [[0, 1], [0, 2], [0, 3], [0, 4]], -2614.0);
  const hydroxide = () => mol("R", 2, [{ el: "O", charge: -1 }, H], [[0, 1]], -75.6);
  const ts = () => mol("TS", 4, [{ el: "C" }, H, H, H, { el: "Br" }, { el: "O" }, H], [[0, 1], [0, 2], [0, 3], [5, 6]], -2689.58, -1);
  const methanol = () => mol("P", 6, [{ el: "C" }, H, H, H, { el: "O" }, H], [[0, 1], [0, 2], [0, 3], [0, 4], [4, 5]], -115.7);
  const bromide = () => mol("P", 8, [{ el: "Br", charge: -1 }], [], -2573.95);
  function run(molecules: Omit<Molecule3D, "id">[]) {
    let doc = emptyWorkspaceDocument();
    for (const m of molecules) doc = addMolecule3d(doc, m);
    const set = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -2, y0: -2, x1: 10, y1: 2 });
    const step = doc.nextWorkflowId!;
    doc = addStep(doc, "energy-diagram", 14, 0);
    const ran = runStep(connect(doc, { set }, step), step, W);
    return { ran, step, s: ran.steps!.find((x) => x.id === step)! };
  }

  it("stands each at the sum of its compounds - R, CH3Br and OH- apart; P, CH3OH and Br- - and says which it sums", () => {
    const { ran, step, s } = run([ch3br(), hydroxide(), ts(), methanol(), bromide()]);
    // (R: -2614.0 - 75.6 = -2689.6; TS 0.02 above, 12.55 kcal/mol; P: -115.7 - 2573.95 = -2689.65, 0.05 below, -31.38)
    expect(diagramOf(ran, step)!.levels.map((l) => [l.name, Number(l.value.toFixed(2)), l.sums?.map((p) => p.formula)])).toEqual([
      ["R", 0, ["CH3Br", "HO\u2212"]],
      ["TS", Number((0.02 * KCAL).toFixed(2)), undefined],
      ["P", Number((-0.05 * KCAL).toFixed(2)), ["CH4O", "Br\u2212"]],
    ]);
    expect([(0.02 * KCAL).toFixed(2), (-0.05 * KCAL).toFixed(2)]).toEqual(["12.55", "-31.38"]);
    expect(s.ran?.said).toBe("3 levels \u00b7 relative to R \u00b7 R sums CH3Br + HO\u2212; P sums CH4O + Br\u2212");
    // (kept with the workspace, what each sums with it)
    const back = readWorkflow(JSON.parse(JSON.stringify({ sets: ran.sets, steps: ran.steps, wires: ran.wires })))!;
    expect(back.sets.find((b) => b.made?.step === step)?.chart).toEqual(diagramOf(ran, step));
  });

  it("refuses levels that do not hold the same atoms and charge, saying what each holds - never a sum of different reactions", () => {
    // (the audit's: R CH3Br alone, against a TS and products that have OH- in them - which drew -47,496 and 1.57 x 10^6 kcal/mol)
    const { ran, step, s } = run([ch3br(), ts(), methanol(), bromide()]);
    expect([s.ran?.ok, s.ran?.said]).toEqual([false, "Its levels do not hold the same atoms and charge: R has CH3Br; TS, P have CH4BrO\u2212 - P sums two compounds: CH4O, Br\u2212"]);
    expect(diagramOf(ran, step)).toBeUndefined();
  });

  it("takes a compound's conformers at their lowest, and a level of one compound as before", () => {
    const low = { ...ts(), energies: [-2689.57, -2689.58], frames: [ts().atoms.flatMap((a) => [a.x + 0.01, a.y, a.z])], conformerSet: true as const };
    const { ran, step } = run([ch3br(), hydroxide(), low, methanol(), bromide()]);
    const level = diagramOf(ran, step)!.levels[1];
    expect([level.name, Number(level.value.toFixed(2)), level.lowestOf, level.sums]).toEqual(["TS", Number((0.02 * KCAL).toFixed(2)), 2, undefined]);
  });
});

