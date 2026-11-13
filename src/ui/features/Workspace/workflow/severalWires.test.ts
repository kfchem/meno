import { describe, expect, it } from "vitest";
import { addMolecule3d, appendModel, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel, Model } from "../store/types";
import { setEntries } from "./entries";
import { CAME_FROM, chainTo, inputKey, inputOf, newestWire, resultOf, tablesJoined, wireRefusal, wiresInto } from "./flow";
import { addSet, addStep, connect, removeWire } from "./model";
import { procedureLine } from "./procedures";
import { programEntries } from "./programs";
import { runStep, whyNot, type RunWith } from "./run";
import { readWorkflow } from "./saved";
import type { Table } from "../../../../lib/table";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** `doc` with water in 3D at (x, y), a set named `name` drawn round it; and that set's id. */
function waterAt(doc: WorkspaceDocument, x: number, y: number, name: string, more: { conformerSet?: true } = {}): { doc: WorkspaceDocument; set: number } {
  doc = addMolecule3d(doc, {
    at: { x, y },
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0, y: 0.76, z: 0.59 },
      { el: "H", x: 0, y: -0.76, z: 0.59 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...more,
  });
  doc = addSet(doc, { x0: x - 3, y0: y - 3, x1: x + 3, y1: y + 3 }, undefined, name);
  return { doc, set: doc.sets![doc.sets!.length - 1].id };
}

/** Two sets of water, "Round 1" higher on the page (y up) than "Round 2", and a Duplicates step after them; their ids. */
function twoRounds() {
  const one = waterAt(emptyWorkspaceDocument(), 0, 10, "Round 1");
  const two = waterAt(one.doc, 0, 0, "Round 2");
  const doc = addStep(two.doc, "duplicates", 20, 0);
  return { doc, high: one.set, low: two.set, step: doc.steps![doc.steps!.length - 1].id };
}

/** `doc` with ethane drawn at (x, y), a set named `name` drawn round it - holding off the page, where given, more structures drawn; and that set's id. */
function ethaneAt(doc: WorkspaceDocument, x: number, y: number, name: string, held?: DrawnModel[]): { doc: WorkspaceDocument; set: number } {
  const model = { atoms: [{ id: 1, el: "C", x, y }, { id: 2, el: "C", x: x + 1.5, y }], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } as unknown as Model;
  doc = addSet(appendModel(doc, model), { x0: x - 3, y0: y - 3, x1: x + 5, y1: y + 3 }, undefined, name);
  const set = doc.sets![doc.sets!.length - 1].id;
  return { doc: held ? { ...doc, sets: doc.sets!.map((b) => (b.id === set ? { ...b, drawnCollection: held } : b)) } : doc, set };
}

const moleculeOf = (doc: WorkspaceDocument, set: number) => doc.sets!.find((b) => b.id === set)!.members!.flatMap((m) => ("molecule" in m ? [m.molecule] : []));

describe("several wires into one input (docs/WORKFLOWS.md, *Several wires into one input*)", () => {
  it("are kept side by side: the same set wired again changes nothing, and one taken out leaves the other", () => {
    const { doc: d0, high, low, step } = twoRounds();
    let doc = connect(connect(d0, { set: high }, step), { set: low }, step);
    expect(wiresInto(doc, step).map((w) => w.from.set)).toEqual([high, low]);
    expect(connect(doc, { set: low }, step)).toBe(doc);
    doc = removeWire(doc, doc.wires!.find((w) => w.from.set === high)!.id);
    expect(wiresInto(doc, step).map((w) => w.from.set)).toEqual([low]);
  });

  it("come in the order their sets lie on the page - the higher first - whatever order they were wired in", () => {
    const { doc: d0, high, low, step } = twoRounds();
    for (const order of [
      [low, high],
      [high, low],
    ]) {
      const doc = order.reduce((d, set) => connect(d, { set }, step), d0);
      expect(wiresInto(doc, step).map((w) => w.from.set)).toEqual([high, low]);
      expect(inputOf(doc, step)!.molecules.map((m) => m.id)).toEqual([...moleculeOf(doc, high), ...moleculeOf(doc, low)]);
    }
    // (about level: the one to the left first)
    const left = waterAt(emptyWorkspaceDocument(), 0, 0, "Left");
    const right = waterAt(left.doc, 20, 0.5, "Right");
    let doc = addStep(right.doc, "duplicates", 40, 0);
    const dup = doc.steps![0].id;
    doc = connect(connect(doc, { set: right.set }, dup), { set: left.set }, dup);
    expect(wiresInto(doc, dup).map((w) => w.from.set)).toEqual([left.set, right.set]);
  });

  it("name every entry by the set it came from - one wire alone adds no such name", () => {
    const { doc: d0, high, low, step } = twoRounds();
    const one = connect(d0, { set: low }, step);
    const alone = inputOf(one, step)!;
    expect(setEntries(alone.molecules, "molecules").map((e) => e.properties?.[CAME_FROM])).toEqual([undefined]);
    const doc = connect(one, { set: high }, step);
    const input = inputOf(doc, step)!;
    const entries = setEntries(input.molecules, "molecules");
    expect(entries.map((e) => e.properties?.[CAME_FROM]?.value)).toEqual(["Round 1", "Round 2"]);
    expect(entries[0].properties?.[CAME_FROM]).toEqual({ value: "Round 1", unit: "none", label: true, status: "computed" });
    // (and the key of what comes in is worked out once for each molecule and name: the same, asked again)
    expect(inputOf(doc, step)!.molecules[0]).toBe(input.molecules[0]);
    expect(inputKey(doc, doc.steps![0], "meno")).toBe(inputKey(doc, doc.steps![0], "meno"));
  });

  it("of structures drawn give every set's on the page, in page order, then every set's held off it, in page order", () => {
    const heldOne = (y: number): DrawnModel => ({ atoms: [{ id: 1, el: "O", x: 0, y }], bonds: [] }) as unknown as DrawnModel;
    const top = ethaneAt(emptyWorkspaceDocument(), 0, 20, "Top", [heldOne(1)]);
    const bottom = ethaneAt(top.doc, 0, 0, "Bottom", [heldOne(2)]);
    let doc = addStep(bottom.doc, "check-structures", 30, 0);
    const step = doc.steps![0].id;
    doc = connect(connect(doc, { set: bottom.set }, step), { set: top.set }, step);
    const input = inputOf(doc, step)!;
    const idsOf = (set: number) => doc.sets!.find((b) => b.id === set)!.members!.flatMap((m) => ("structure" in m ? [m.structure] : []));
    expect(input.holds).toBe("structures");
    expect(input.structures).toEqual([...idsOf(top.set), ...idsOf(bottom.set)]);
    expect(input.held!.map((m) => m.atoms[0].y)).toEqual([1, 2]);
    expect(input.held!.map((m) => m.record?.properties?.[CAME_FROM]?.value)).toEqual(["Top", "Bottom"]);
    expect(input.records.map((r) => r?.properties?.[CAME_FROM]?.value)).toEqual(["Top", "Bottom"]);
  });

  it("at the same corner come in the order they were wired; one from no set there, last", () => {
    const one = waterAt(emptyWorkspaceDocument(), 0, 0, "One");
    const two = waterAt(one.doc, 0, 0, "Two");
    let doc = addStep(two.doc, "duplicates", 20, 0);
    const step = doc.steps![doc.steps!.length - 1].id;
    doc = connect(connect(doc, { set: two.set }, step), { set: one.set }, step);
    expect(wiresInto(doc, step).map((w) => w.from.set)).toEqual([two.set, one.set]);
    expect(wiresInto({ ...doc, wires: [...doc.wires!].reverse() }, step).map((w) => w.from.set)).toEqual([two.set, one.set]);
    const port = doc.wires![0].to.port;
    const gone = { ...doc, wires: [{ id: 1, from: { set: 999 }, to: { step, port } }, ...doc.wires!] };
    expect(wiresInto(gone, step).map((w) => w.from.set)).toEqual([two.set, one.set, 999]);
  });

  it("are picked up at their port the last wired first", () => {
    const { doc: d0, high, low, step } = twoRounds();
    const doc = connect(connect(d0, { set: low }, step), { set: high }, step);
    const port = doc.wires![0].to.port;
    expect(newestWire(doc, step, port)?.from.set).toBe(high);
    expect(newestWire({ wires: [...doc.wires!].reverse() }, step, port)?.from.set).toBe(high);
    expect(newestWire(doc, step, "elsewhere")).toBeUndefined();
  });

  it("make the step wait for a set wired in whose step has not run - one empty adds nothing, and its line says so", () => {
    const { doc: d0, high, low, step } = twoRounds();
    // (a Filter on Round 2 that keeps none: run, its set empty)
    let doc = addStep(d0, "filter", 10, -20, { conditions: "number ≥ 2", match: "all" });
    const filter = doc.steps![doc.steps!.length - 1].id;
    doc = connect(doc, { set: low }, filter);
    doc = connect(connect(doc, { set: resultOf(doc, filter, "out")!.id }, step), { set: high }, step);
    expect(chainTo(doc, step)).toEqual([filter, step]);
    doc = runStep(doc, step, W);
    expect(doc.steps!.find((s) => s.id === filter)!.ran).toMatchObject({ ok: true });
    const ran = doc.steps!.find((s) => s.id === step)!.ran!;
    expect(ran.ok).toBe(true);
    expect(ran.said).toMatch(/ · 2 wires, 1 empty$/);
    expect(setEntries(inputOf(doc, step)!.molecules, "molecules")).toHaveLength(1);
  });

  it("are refused where they give another kind than the wire there already - and a number, where one is wired already", () => {
    const { doc: d0, low, step } = twoRounds();
    const conf = waterAt(d0, 0, -20, "Conformers", { conformerSet: true });
    let doc = connect(conf.doc, { set: low }, step);
    expect(wireRefusal(doc, { set: conf.set }, step)).toBe("It gives a conformer set, and what is wired into it already molecules in 3D: an input takes one kind");
    // (an empty set adds nothing, of no kind: wired beside either)
    const empty = addSet(conf.doc, { x0: 50, y0: 50, x1: 60, y1: 60 }, undefined, "Empty");
    const emptyId = empty.sets![empty.sets!.length - 1].id;
    expect(wireRefusal(connect(empty, { set: conf.set }, step), { set: emptyId }, step)).toBeNull();
    expect(wireRefusal(connect(empty, { set: emptyId }, step), { set: conf.set }, step)).toBeNull();
    expect(whyNot(connect(connect(empty, { set: low }, step), { set: emptyId }, step), empty.steps!.find((s) => s.id === step)!, "meno")).toBeNull();
    // (wired so all the same - as a set may come to hold another kind after it is wired: said before it runs)
    doc = { ...doc, wires: [...doc.wires!, { id: 999, from: { set: conf.set }, to: { step, port: doc.wires![0].to.port } }] };
    expect(whyNot(doc, doc.steps!.find((s) => s.id === step)!, "meno")).toBe("Round 2 holds molecules in 3D and Conformers conformer sets: one input takes one kind");
    // (Add's Number: one number)
    let add = addStep(d0, "add", 30, 0);
    const sum = add.steps![add.steps!.length - 1].id;
    add = addStep(add, "number", 0, 30);
    const n1 = add.steps![add.steps!.length - 1].id;
    add = addStep(add, "number", 0, 40);
    const n2 = add.steps![add.steps!.length - 1].id;
    add = connect(add, { set: resultOf(add, n1)!.id }, sum, "number");
    expect(wireRefusal(add, { set: resultOf(add, n2)!.id }, sum, "number")).toBe("It takes one number: one is wired into it already");
    expect(wireRefusal(add, { set: resultOf(add, n1)!.id }, sum, "number")).toBeNull();
    // (two numbers wired so all the same: said before it runs)
    const two = { ...add, wires: [...add.wires!, { id: 998, from: { set: resultOf(add, n2)!.id }, to: { step: sum, port: "number" } }] };
    expect(whyNot(two, two.steps!.find((s) => s.id === sum)!, "meno")).toBe("Number takes one number: 2 are wired into it");
  });

  it("into a Path search's Start, paired In order, count all their entries, in order", () => {
    let doc = waterAt(emptyWorkspaceDocument(), 0, 10, "Start 1").doc;
    doc = waterAt(doc, 0, 0, "Start 2").doc;
    const [s1, s2] = doc.sets!.map((b) => b.id);
    // (End: two waters in one set)
    const { id: _id, ...water } = doc.molecules3d![0];
    doc = addMolecule3d(doc, { ...water, at: { x: 31, y: 1 } });
    const endsAt = waterAt(doc, 30, 0, "Ends");
    doc = endsAt.doc;
    const ends = endsAt.set;
    expect(moleculeOf(doc, ends)).toHaveLength(2);
    doc = addStep(doc, "path-search", 60, 0, undefined, "quanta");
    const path = doc.steps![0].id;
    doc = connect(doc, { set: ends }, path, "end");
    doc = connect(doc, { set: s1 }, path, "start");
    const one = programEntries(doc, path, "path-search", { pairs: "order" });
    expect(one && "why" in one && one.why).toBe("Start holds 1 and End 2: in order, each start is paired with the end in its place");
    doc = connect(doc, { set: s2 }, path, "start");
    const two = programEntries(doc, path, "path-search", { pairs: "order" });
    expect(two && !("why" in two) && two.entries.length).toBe(2);
  });

  it("lead a saved procedure's line from the step that feeds one of them, wherever the other comes from", () => {
    const { doc: d0, high, low, step } = twoRounds();
    // (Duplicates higher on the page than the Filter that feeds it, its first wire from a chemist's set)
    let doc = addStep(d0, "filter", 10, -40, { conditions: "number ≥ 1", match: "all" });
    const filter = doc.steps![doc.steps!.length - 1].id;
    doc = connect(connect(connect(doc, { set: low }, filter), { set: high }, step), { set: resultOf(doc, filter, "out")!.id }, step);
    expect(procedureLine({ sets: doc.sets!, steps: doc.steps!, wires: doc.wires! })).toBe("Filter · Meno → Duplicates · Meno");
  });

  it("lead a saved procedure's line past the furthest step that feeds any of them", () => {
    const { doc: d0, low, step } = twoRounds();
    // (Filter, then Tag after it - and Duplicates wired from both, the Filter's wire first, Duplicates highest on the page)
    let doc = addStep(d0, "filter", 10, -40, { conditions: "number ≥ 1", match: "all" });
    const filter = doc.steps![doc.steps!.length - 1].id;
    doc = addStep(doc, "tag", 30, -60, { name: "x" });
    const tag = doc.steps![doc.steps!.length - 1].id;
    doc = connect(connect(doc, { set: low }, filter), { set: resultOf(doc, filter, "out")!.id }, tag);
    doc = connect(connect(doc, { set: resultOf(doc, filter, "out")!.id }, step), { set: resultOf(doc, tag, "out")!.id }, step);
    expect(wiresInto(doc, step)).toHaveLength(2);
    expect(procedureLine({ sets: doc.sets!, steps: doc.steps!, wires: doc.wires! })).toBe("Filter · Meno → Tag · Meno → Duplicates · Meno");
  });

  it("are kept through a save and opening again, each as it was", () => {
    const { doc: d0, high, low, step } = twoRounds();
    const doc = connect(connect(d0, { set: low }, step), { set: high }, step);
    const read = readWorkflow(JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires })))!;
    expect(read.wires).toEqual(doc.wires);
    const opened = { ...doc, ...read };
    expect(inputOf(opened, step)!.molecules.map((m) => m.id)).toEqual(inputOf(doc, step)!.molecules.map((m) => m.id));
  });
});

describe("tables wired into one input", () => {
  const table = (columns: string[], rows: (number | string)[][], unread: Table["unread"] = []): Table => ({ columns: columns.map((name) => ({ name, kind: "number" })) as Table["columns"], rows, unread, left: [] });

  it("are one after another: the first's columns, then each a later one adds - a row with no cell there, empty", () => {
    const joined = tablesJoined([table(["a", "b"], [[1, 2]]), table(["b", "c"], [[3, 4]], [{ row: 0, column: "c", text: "x", why: "not a number" }])]);
    expect(joined.columns.map((c) => c.name)).toEqual(["a", "b", "c"]);
    expect(joined.rows).toEqual([
      [1, 2, null],
      [null, 3, 4],
    ]);
    expect(joined.unread).toEqual([{ row: 1, column: "c", text: "x", why: "not a number" }]);
    // (a row shorter than its columns: empty past its end)
    expect(tablesJoined([table(["a"], [[1]]), table(["a", "b"], [[2]])]).rows).toEqual([
      [1, null],
      [2, null],
    ]);
  });
});
