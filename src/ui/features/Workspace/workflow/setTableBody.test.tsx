import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { connectStoreToDocument, EditorProvider, storeOf } from "../store";
import { createWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { addStep } from "./model";
import { placeResults, type RunWith } from "./run";
import SetTableBody from "./SetTableBody";
import { chosenMolecules, tableRows } from "./setTable";
import { countOf, setMolecules } from "./entries";

// Vitest runs in Node, with no page to mount on: the server's renderer
// draws the table, and what it shows is read off that.

const extentOf: RunWith["extentOf"] = () => ({ x0: -1, x1: 1, y0: -1, y1: 1 });
/** A water with `n` geometries, each its oxygen further along, and an energy for each - the first the lowest. */
const conformers = (n: number): Omit<Molecule3D, "id" | "at"> => ({
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  frames: Array.from({ length: n - 1 }, (_, k) => [(k + 1) / 100, 0, 0, 0.76, 0.59, 0, -0.76, 0.59, 0]),
  energies: Array.from({ length: n }, (_, k) => -76 + k / 10000),
  conformerSet: true,
  made: { how: [], energies: "Field X" },
});

/** A workspace holding a step's large result set of `n` conformers of one compound, its store, and the set. */
function large(n: number) {
  const doc = createWorkspaceDocument();
  const store = storeOf(doc);
  connectStoreToDocument(store, doc);
  doc.edit("run", (d) => {
    const s = addStep(d, "conformers", 0, 0, {}, "rdkit");
    return placeResults(s, s.steps![0], { molecules: [conformers(n)], rest: [], holds: "conformers" }, { extentOf });
  });
  return { doc, store, set: store.getState().sets[0] };
}

describe("a set's table in the column", () => {
  it("names its columns as its rows have them - the energy in hartrees, above the lowest in kcal/mol, and what worked it out", () => {
    const { doc, set } = large(60);
    const html = renderToString(
      <EditorProvider tabId="t" document={doc}>
        <SetTableBody set={set} />
      </EditorProvider>,
    );
    const names = [...html.matchAll(/role="columnheader"[^>]*>(?:<button[^>]*>)?<span[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(names).toEqual(["#", "Compound", "Conformer", "E (Eh)", "ΔE (kcal/mol)", "From"]);
    // (each energy says what worked it out; nothing chosen, nothing to put on the page)
    expect(html).toContain("Field X");
    expect(html).toContain("60 conformers");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Put on the page/);
  });

  it("draws only the rows that can be seen, however many it holds", () => {
    const { doc, set } = large(1000);
    const html = renderToString(
      <EditorProvider tabId="t" document={doc}>
        <SetTableBody set={set} />
      </EditorProvider>,
    );
    // (nothing seen yet - no room measured: only those a little beyond its top)
    const drawn = html.match(/role="row" aria-rowindex/g) ?? [];
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(20);
    expect(html).toContain(`aria-rowcount="1001"`);
  });

  it("puts rows chosen on the page as a set of their own, named for the set they are from", () => {
    const { store, set } = large(60);
    const before = store.getState().molecules3d.length;
    const id = store.getState().placeAsSet([conformers(1)], { x: set.x1, y: set.y1 }, "From Conformers");
    const made = store.getState().sets.find((b) => b.id === id)!;
    expect(made.name).toBe("From Conformers");
    expect(made.made).toBeUndefined();
    expect(store.getState().molecules3d.length).toBe(before + 1);
    // (a compound's conformers, chosen, one compound: 2 of 60 said "1 compound · 2", as a conformer set's)
    const two = chosenMolecules(tableRows(setMolecules(store.getState(), set), "conformers"), new Set([3, 7]));
    const both = store.getState().placeAsSet(two, { x: set.x1, y: set.y1 }, "From Conformers")!;
    expect(countOf(store.getState(), store.getState().sets.find((b) => b.id === both)!)).toEqual({ holds: "conformers", entries: 2, compounds: 1 });
    // (none to put: no set made)
    expect(store.getState().placeAsSet([], { x: 0, y: 0 })).toBeUndefined();
  });
});

describe("a set read in the column", () => {
  it("is shown over the text or the PDF it showed, gives way to one shown, and on closing goes back to what it showed", () => {
    const { store, set } = large(60);
    const st = () => store.getState();
    st().addTexts([{ name: "notes.txt", text: "a note" }]);
    const text = st().textShown;
    st().readSetTable(set.id);
    expect([st().setsRead, st().setTableShown, st().textsOpen]).toEqual([[set.id], set.id, true]);
    // (read again: one tab still)
    st().readSetTable(set.id);
    expect(st().setsRead).toEqual([set.id]);
    // (a text shown: the table gives way, still read; shown again from its tab)
    st().showText(text!);
    expect([st().setsRead, st().setTableShown]).toEqual([[set.id], null]);
    st().showSetTable(set.id);
    expect(st().setTableShown).toBe(set.id);
    // (closed: the text it showed before, the column open)
    st().stopReadingSetTable(set.id);
    expect([st().setsRead, st().setTableShown, st().textsOpen, st().textShown]).toEqual([[], null, true, text]);
  });

  it("stays open as the page changes - rows put on the page - and goes with its set when an undo takes the set away", () => {
    const { doc, store, set } = large(60);
    const st = () => store.getState();
    st().readSetTable(set.id);
    st().placeAsSet([conformers(1)], { x: set.x1, y: set.y1 }, "From Conformers");
    expect([st().setTableShown, st().textsOpen]).toEqual([set.id, true]);
    // (the step's run undone: its set gone, and its table with it - the column shut, as it showed nothing else)
    doc.undo();
    doc.undo();
    expect([st().setsRead, st().setTableShown, st().textsOpen]).toEqual([[], null, false]);
  });

  it("closes the column where it was all it showed, and goes with its set when the set is deleted", () => {
    const { store, set } = large(60);
    const st = () => store.getState();
    st().readSetTable(set.id);
    st().stopReadingSetTable(set.id);
    expect(st().textsOpen).toBe(false);
    st().readSetTable(set.id);
    st().removeSet(set.id);
    expect([st().setsRead, st().setTableShown]).toEqual([[], null]);
  });
});
