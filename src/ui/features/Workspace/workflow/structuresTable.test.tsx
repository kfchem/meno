import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { connectStoreToDocument, EditorProvider, storeOf } from "../store";
import { createWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Atom, DrawnModel, DrawnRecord, Model, WorkflowSet } from "../store/types";
import type { Property } from "../../../../lib/entry";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { BEFORE_THE_EDIT, readAsTable } from "./entries";
import { resultOf } from "./flow";
import { drawnSmiles, drawnStereo, sortedRows, structuresAsTable } from "./structuresTable";
import { cipInput, cipSaid } from "../../../../lib/chem/cip/testdata/cipFrom";
import { setStructures, setStructuresTable } from "./run";
import StructuresTableBody from "./StructuresTableBody";

// Vitest runs in Node, with no page to mount on: the server's renderer draws
// the table, and what it shows is read off that.

const by = { plugin: "sketchkit", version: "1", program: "Sketchkit 2026.03.6" };
const value = (v: number | string, unit: Property["unit"] = "none"): Property => ({ value: v, unit, status: "computed", by });
/** Ethanol drawn, its atoms from `base`, `x` along. */
const ethanol = (base: number, x: number): Model => ({
  atoms: [
    { id: base, el: "C", x, y: 0, r: 0.9 },
    { id: base + 1, el: "C", x: x + 1.3, y: 0.75, r: 0.9 },
    { id: base + 2, el: "O", x: x + 2.6, y: 0, r: 0.9 },
  ] as Atom[],
  bonds: [
    { id: base + 50, a: base, b: base + 1, order: 1 },
    { id: base + 51, a: base + 1, b: base + 2, order: 1 },
  ],
});

/**
 * A workspace whose set holds `shown` ethanols on the page, each its record
 * numbered, and `held` propanols off it (`drawnCollection`), after them -
 * as a step's set shows as many as its area allows and holds the rest.
 */
function holding(shown: number, held: number, record: (k: number) => DrawnRecord = (k) => ({ properties: { k: value(k) } })) {
  const doc = createWorkspaceDocument();
  const parts = Array.from({ length: shown }, (_, k) => ethanol(1000 + 100 * k, 10 * k));
  const propanol = drawnFromSmiles("CCCO");
  doc.edit("draw", (d): WorkspaceDocument => ({
    ...d,
    model: { atoms: parts.flatMap((p) => p.atoms), bonds: parts.flatMap((p) => p.bonds) },
    nextId: 100_000,
    sets: [
      {
        id: 5,
        x0: -5,
        y0: -5,
        x1: 10 * shown + 5,
        y1: 5,
        made: { step: 4, exit: "out", holds: "structures" },
        members: parts.map((p, k) => ({ structure: p.atoms.map((a) => a.id), record: record(k) })),
        ...(held ? { drawnCollection: Array.from({ length: held }, (_, k): DrawnModel => ({ ...propanol, record: record(shown + k) })) } : {}),
      } as WorkflowSet,
    ],
    nextWorkflowId: 6,
  }));
  const store = storeOf(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, set: store.getState().sets.find((b) => b.id === 5)! };
}

/** A table's column, by name: its cells, row by row. */
const column = (t: ReturnType<typeof structuresAsTable>, name: string) => {
  const i = t.columns.findIndex((c) => c.name === name);
  expect(i, name).toBeGreaterThanOrEqual(0);
  return t.rows.map((r) => r[i]);
};

describe("a set of structures drawn as a table", () => {
  it("has a row for every structure it holds - those on the page and those off it, all of them, in the step's order", () => {
    // (120: 50 on the page, the 70 more held in the set)
    const { store, set } = holding(50, 70);
    const t = setStructuresTable(store.getState(), set);
    expect(t.rows).toHaveLength(120);
    expect(column(t, "what")).toEqual(Array.from({ length: 120 }, (_, k) => `structure ${k + 1} of 120`));
    // (each with its own record, in order: the page's first, then those held)
    expect(column(t, "k")).toEqual(Array.from({ length: 120 }, (_, k) => k));
    expect(column(t, "SMILES (drawing)").slice(48, 52)).toEqual(["CCO", "CCO", "CCCO", "CCCO"]);
    // (no step gave any its SMILES: no column of them)
    expect(t.columns.map((c) => c.name)).not.toContain("SMILES (record)");
    expect(column(t, "id")[0]).toBe("structure:5#0");
    expect(setStructures(store.getState(), set).map((e) => e.place)).toEqual(Array.from({ length: 120 }, (_, k) => k));
  });

  it("has each value its record holds as a column, under its own name and unit - those of the one it was made from as named", () => {
    const record = (k: number): DrawnRecord => ({
      properties: {
        smiles: value(k ? "CC[C@H](C)O" : "CC[C@@H](C)O"),
        made: value(`${k + 1} of 2`),
        "made_from.nll": value(23.5),
        mw: value(74.123, "g/mol"),
        tpsa: value(20.23, "Å2"),
      },
    });
    const { store, set } = holding(2, 0, record);
    const t = setStructuresTable(store.getState(), set);
    const head = t.columns.map((c) => (c.kind === "number" && c.unit !== "none" ? `${c.name} (${c.unit})` : c.name));
    expect(head).toEqual(["id", "structure", "what", "SMILES (record)", "SMILES (drawing)", "state", "made", "made_from.nll", "mw (g/mol)", "tpsa (Å2)"]);
    // (its SMILES as the step that made it gave it - its stereo with it - and not again among its values; the drawing's beside it, never in its place)
    expect(column(t, "SMILES (record)")).toEqual(["CC[C@@H](C)O", "CC[C@H](C)O"]);
    expect(column(t, "SMILES (drawing)")).toEqual(["CCO", "CCO"]);
    expect(column(t, "mw")).toEqual([74.123, 74.123]);
    expect(column(t, "made_from.nll")).toEqual([23.5, 23.5]);
    expect(column(t, "state")).toEqual(["finished", "finished"]);
  });

  it("says each one's state - failed, and why - and why one was set aside", () => {
    const record = (k: number): DrawnRecord => ({
      properties: { nll: value(20 + k) },
      ...(k === 1 ? { status: { failed: "the program stopped with an error" } } : k === 2 ? { status: { aside: "not mw < 500 g/mol (612.4 g/mol)" } } : {}),
    });
    const { store, set } = holding(3, 0, record);
    const t = setStructuresTable(store.getState(), set);
    expect(column(t, "state")).toEqual(["finished", "failed: the program stopped with an error", "finished"]);
    expect(column(t, "set aside")).toEqual([null, null, "not mw < 500 g/mol (612.4 g/mol)"]);
    // (no column of why where none was set aside)
    expect(setStructuresTable(store.getState(), { ...set, members: set.members!.slice(0, 2) }).columns.map((c) => c.name)).not.toContain("set aside");
  });

  it("never mixes a SMILES a step gave with one written from the drawing: rows of both, each in its own column", () => {
    // (two enantiomers a step gave, and one drawn by the chemist with none given: the record's column blank for it)
    const record = (k: number): DrawnRecord => (k < 2 ? { properties: { smiles: value(k ? "F[C@@](Cl)Br" : "F[C@](Cl)Br") } } : {});
    const { store, set } = holding(3, 0, record);
    const t = setStructuresTable(store.getState(), set);
    expect(column(t, "SMILES (record)")).toEqual(["F[C@](Cl)Br", "F[C@@](Cl)Br", null]);
    expect(column(t, "SMILES (drawing)")).toEqual(["CCO", "CCO", "CCO"]);
  });

  it("writes a wedged centre's configuration in the SMILES from the drawing: two enantiomers never read alike", () => {
    // (CHFClBr: its F wedged up, wedged down, and plain. In a structure's own coordinates y runs up: F above the C, Cl lower
    //  right, Br lower left. Wedged up, its H behind: Br, Cl, F go anticlockwise, S; written from the C, its H first then F,
    //  Cl, Br - seen from the H those go anticlockwise, @. Wedged down, R and @@)
    const chfclbr = (stereo?: "up" | "down"): Model => ({
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, r: 0.9 },
        { id: 2, el: "F", x: 0, y: 1.5, r: 0.9 },
        { id: 3, el: "Cl", x: 1.3, y: -0.75, r: 0.9 },
        { id: 4, el: "Br", x: -1.3, y: -0.75, r: 0.9 },
      ] as Atom[],
      bonds: [
        { id: 5, a: 1, b: 2, order: 1, ...(stereo ? { stereo } : {}) },
        { id: 6, a: 1, b: 3, order: 1 },
        { id: 7, a: 1, b: 4, order: 1 },
      ],
    });
    expect([drawnStereo(chfclbr("up")), drawnStereo(chfclbr("down")), drawnStereo(chfclbr())]).toEqual([false, false, false]);
    const t = structuresAsTable([chfclbr("up"), chfclbr("down"), chfclbr()].map((drawn, place) => ({ place, drawn })));
    expect(column(t, "SMILES (drawing)")).toEqual(["[C@H](F)(Cl)Br", "[C@@H](F)(Cl)Br", "C(F)(Cl)Br"]);
    expect([cipSaid(cipInput("[C@H](F)(Cl)Br")), cipSaid(cipInput("[C@@H](F)(Cl)Br"))]).toEqual([["C0:S"], ["C0:R"]]);
    // (all written: no column saying stereo is left out)
    expect(t.columns.map((c) => c.name)).not.toContain("stereo in the drawing");
  });

  it("writes no hand for a centre drawn in an AND or OR group, and says so: a racemate is never written as one enantiomer", () => {
    // (CHFClBr wedged up and down, its C in AND1, then in OR1: both drawings stand for the same, and write the same, unmarked)
    const chfclbr = (stereo: "up" | "down", kind: "and" | "or"): Model => ({
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, r: 0.9, stereoGroup: { kind, n: 1 } },
        { id: 2, el: "F", x: 0, y: 1.5, r: 0.9 },
        { id: 3, el: "Cl", x: 1.3, y: -0.75, r: 0.9 },
        { id: 4, el: "Br", x: -1.3, y: -0.75, r: 0.9 },
      ] as Atom[],
      bonds: [
        { id: 5, a: 1, b: 2, order: 1, stereo },
        { id: 6, a: 1, b: 3, order: 1 },
        { id: 7, a: 1, b: 4, order: 1 },
      ],
    });
    for (const kind of ["and", "or"] as const) {
      const t = structuresAsTable([chfclbr("up", kind), chfclbr("down", kind)].map((drawn, place) => ({ place, drawn })));
      expect(column(t, "SMILES (drawing)")).toEqual(["C(F)(Cl)Br", "C(F)(Cl)Br"]);
      expect(column(t, "stereo in the drawing")).toEqual(["stereo drawn, not written here", "stereo drawn, not written here"]);
    }
  });

  it("keeps an absolute centre's hand beside a grouped one, and writes neither of a group of two", () => {
    // (2-chloro-3-fluorobutane, both centres wedged: its C3 in AND1 stands for a pair of diastereomers, its C2 the same in
    //  both - so C2 keeps its mark and C3 has none; both in AND1, the pair and its mirror, neither)
    const butane = (groups: Record<number, "and">): Model => ({
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, r: 0.9 },
        { id: 2, el: "C", x: 1.3, y: 0.75, r: 0.9, ...(groups[2] ? { stereoGroup: { kind: groups[2], n: 1 } } : {}) },
        { id: 3, el: "C", x: 2.6, y: 0, r: 0.9, ...(groups[3] ? { stereoGroup: { kind: groups[3], n: 1 } } : {}) },
        { id: 4, el: "C", x: 3.9, y: 0.75, r: 0.9 },
        { id: 5, el: "Cl", x: 1.3, y: 2.25, r: 0.9 },
        { id: 6, el: "F", x: 2.6, y: -1.5, r: 0.9 },
      ] as Atom[],
      bonds: [
        { id: 7, a: 1, b: 2, order: 1 },
        { id: 8, a: 2, b: 3, order: 1 },
        { id: 9, a: 3, b: 4, order: 1 },
        { id: 10, a: 2, b: 5, order: 1, stereo: "up" },
        { id: 11, a: 3, b: 6, order: 1, stereo: "up" },
      ],
    });
    const absolute = drawnSmiles(butane({}));
    expect(absolute).toMatch(/^C\[C@@?H\]\(\[C@@?H\]\(C\)F\)Cl$/);
    expect(drawnStereo(butane({}))).toBe(false);
    expect(drawnSmiles(butane({ 3: "and" }))).toBe(absolute.replace(/\[C@@?H\](\(C\)F)/, "C$1"));
    expect(drawnStereo(butane({ 3: "and" }))).toBe(true);
    expect(drawnSmiles(butane({ 2: "and", 3: "and" }))).toBe("CC(C(C)F)Cl");
    expect(drawnStereo(butane({ 2: "and", 3: "and" }))).toBe(true);
  });

  it("writes (S)-lactic acid drawn with its OH hashed, and (R) with it wedged", () => {
    // (y runs up: OH above the centre, CH3 lower left, COOH lower right, H on the other side of the OH. Wedged, H behind:
    //  OH, COOH, CH3 go clockwise, R; hashed, S)
    const lactic = (stereo: "up" | "down"): Model => ({
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, r: 0.9 },
        { id: 2, el: "O", x: 0, y: 1.5, r: 0.9 },
        { id: 3, el: "C", x: -1.3, y: -0.75, r: 0.9 },
        { id: 4, el: "C", x: 1.3, y: -0.75, r: 0.9 },
        { id: 5, el: "O", x: 2.6, y: 0, r: 0.9 },
        { id: 6, el: "O", x: 1.3, y: -2.25, r: 0.9 },
      ] as Atom[],
      bonds: [
        { id: 7, a: 1, b: 2, order: 1, stereo },
        { id: 8, a: 1, b: 3, order: 1 },
        { id: 9, a: 1, b: 4, order: 1 },
        { id: 10, a: 4, b: 5, order: 2 },
        { id: 11, a: 4, b: 6, order: 1 },
      ],
    });
    expect(cipSaid(cipInput(drawnSmiles(lactic("down"))))).toEqual(["C0:S"]);
    expect(cipSaid(cipInput(drawnSmiles(lactic("up"))))).toEqual(["C0:R"]);
  });

  it("says where a drawing carries stereo its SMILES does not write: a wedge that does not read", () => {
    // (trimethylamine with a wedge on one bond: its N turns over, the wedge states nothing - said, not written)
    const amine: Model = {
      atoms: [
        { id: 1, el: "N", x: 0, y: 0, r: 0.9 },
        { id: 2, el: "C", x: 0, y: 1.5, r: 0.9 },
        { id: 3, el: "C", x: 1.3, y: -0.75, r: 0.9 },
        { id: 4, el: "C", x: -1.3, y: -0.75, r: 0.9 },
      ] as Atom[],
      bonds: [
        { id: 5, a: 1, b: 2, order: 1, stereo: "up" },
        { id: 6, a: 1, b: 3, order: 1 },
        { id: 7, a: 1, b: 4, order: 1 },
      ],
    };
    expect(drawnStereo(amine)).toBe(true);
    const t = structuresAsTable([{ place: 0, drawn: amine }]);
    expect(column(t, "SMILES (drawing)")).toEqual(["N(C)(C)C"]);
    expect(column(t, "stereo in the drawing")).toEqual(["stereo drawn, not written here"]);
  });

  it("sorts each way with the values in order and those with none - blank, or not worked out - last either way", () => {
    const rows = [[300], [null], [100], ["not worked out: ran out of memory"], [200]];
    expect(sortedRows({ rows }, 0, true)).toEqual([0, 4, 2, 1, 3]);
    expect(sortedRows({ rows }, 0, false)).toEqual([2, 4, 0, 1, 3]);
    // (mw down, a failed row and a blank one among them, through a set's table)
    const record = (k: number): DrawnRecord =>
      k === 1 ? { properties: { mw: { value: 0, unit: "g/mol", status: { failed: "ran out of memory" }, by } } } : k === 2 ? {} : { properties: { mw: value(40 + k, "g/mol") } };
    const { store, set } = holding(4, 0, record);
    const t = setStructuresTable(store.getState(), set);
    const mw = t.columns.findIndex((c) => c.name === "mw");
    expect(sortedRows(t, mw, true).map((k) => t.rows[k][mw])).toEqual([43, 40, "not worked out: ran out of memory", null]);
  });

  it("says a structure edited since its record was given is that - never finished", () => {
    const { store, set } = holding(2, 0, (k) => (k === 1 ? { stale: BEFORE_THE_EDIT } : { properties: { nll: value(20) } }));
    const entries = setStructures(store.getState(), set);
    // (as setMembers gives one whose drawing changed since: its record saying so, its properties gone)
    const t = structuresAsTable(entries.map((e, k) => (k === 1 ? { ...e, record: { stale: BEFORE_THE_EDIT } } : e)));
    expect(column(t, "state")).toEqual(["finished", "edited since: its properties were for the structure before the edit"]);
  });

  it("shows a failed structure's values worked out as they are, and a value not worked out as that - never blank, never a number", () => {
    const failedEnergy = (why: string): Property => ({ value: 0, unit: "kcal/mol", status: { failed: why }, by });
    const record = (k: number): DrawnRecord =>
      k === 0
        ? { properties: { mw: value(46.07, "g/mol"), energy: value(-1.5, "kcal/mol") } }
        : { properties: { mw: value(46.07, "g/mol"), energy: failedEnergy("ran out of memory"), gap: failedEnergy("ran out of memory") }, status: { failed: "ran out of memory" } };
    const { store, set } = holding(2, 0, record);
    const t = setStructuresTable(store.getState(), set);
    expect(column(t, "state")).toEqual(["finished", "failed: ran out of memory"]);
    // (its weight, worked out on the structure, as it is; the energy the failed step was to give, said)
    expect(column(t, "mw")).toEqual([46.07, 46.07]);
    expect(column(t, "energy")).toEqual([-1.5, "not worked out: ran out of memory"]);
    // (one no row has worked out: a column of its own, saying so)
    expect(column(t, "gap")).toEqual([null, "not worked out: ran out of memory"]);
    expect(t.left.map((l) => l.column)).not.toContain("energy");
  });

  it("reads an Enumerate's products, held off the page, with their numbers and how each was made", async () => {
    const doc = createWorkspaceDocument();
    const drawn = drawnFromSmiles("*Oc1ccc(*)cc1");
    let r = 0;
    const model = { ...drawn, atoms: drawn.atoms.map((a) => (a.el === "*" ? { ...a, el: "R#", rgroups: [++r] } : a)) };
    const r2 = ["F", "Cl", "Br", "I", "*C", "*CC", "*CCC", "*C(C)C", "*C#N", "*N", "*C=O", "*C(F)(F)F", "*S", "*C(=O)C", "*N(C)C", "*C=C", "*C#C"];
    doc.edit("draw", (d) => ({ ...d, model, nextId: 5000 }));
    const store = storeOf(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const template = st().addSet({ x0: -50, y0: -50, x1: 50, y1: 50 });
    const enumerate = st().addStep("enumerate", "meno", 80, 0);
    doc.edit("options", (d) => ({ ...d, steps: d.steps!.map((s) => (s.id === enumerate ? { ...s, options: { lists: `R1: *C\n*CC\n*CCC\nR2: ${r2.join("\n")}` } } : s)) }));
    st().connect({ set: template }, enumerate);
    await st().runStep(enumerate);
    const out = resultOf(doc.getState(), enumerate, "out")!;
    const t = setStructuresTable(st(), st().sets.find((b) => b.id === out.id)!);
    expect(t.rows).toHaveLength(51);
    expect(column(t, "number")).toEqual(Array.from({ length: 51 }, (_, k) => k + 1));
    expect(column(t, "made.how")[0]).toMatch(/R1/);
    // (written from the drawing, where no step gave its SMILES)
    expect(column(t, "SMILES (drawing)").every((s) => typeof s === "string" && s.length > 0)).toBe(true);
    expect(readAsTable(st(), st().sets.find((b) => b.id === out.id)!)).toBe(true);
  });

  it("writes a structure's SMILES from its drawing where no step gave one: its constitution, a label of no element as *", () => {
    expect(drawnSmiles(ethanol(1, 0))).toBe("CCO");
    const labelled = { ...ethanol(1, 0), atoms: ethanol(1, 0).atoms.map((a, i) => (i === 2 ? { ...a, el: "Ph" } : a)) };
    expect(drawnSmiles(labelled)).toBe("CC*");
  });

  it("shows in the column every row - drawn only where seen - its values' names with their units", () => {
    const record = (k: number): DrawnRecord => ({ properties: { mw: value(46.07 + k, "g/mol") } });
    const { doc, set } = holding(50, 70, record);
    const html = renderToString(
      <EditorProvider tabId="t" document={doc}>
        <StructuresTableBody set={set} />
      </EditorProvider>,
    );
    // (a name's chevron before it where it is set to the right: the name read past it)
    const names = [...html.matchAll(/role="columnheader"[^>]*><button[^>]*>(?:<svg.*?<\/svg>)?<span[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(names).toEqual(["#", "structure", "SMILES (drawing)", "state", "mw (g/mol)"]);
    expect(html).toContain("120 structures");
    expect(html).toContain(`aria-rowcount="121"`);
    const drawn = html.match(/role="row" aria-rowindex/g) ?? [];
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(20);
  });
});
