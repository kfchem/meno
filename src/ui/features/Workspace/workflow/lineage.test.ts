import { describe, expect, it, vi } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { readCarried3D } from "../utils/copyPaste";
import { noting } from "../utils/readNotes";
import { entryOfSet, setEntries, setEntryOfEntry, type SetEntry } from "./entries";
import { addStep } from "./model";
import { placeResults, resultsOf, type RunWith } from "./run";
import { framesMolecule } from "./setTable";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));

// What an entry was made from, by id (`SetEntry.madeOf`, `Molecule3D.madeOf`):
// its lineage, which its entry record gives as its own - never the molecule
// a step's entry is a frame of (`SetEntry.from`).

/** A water, its oxygen moved along by `k` hundredths of an ångström, with `frames` conformers. */
const water = (k = 0, extra: Partial<Molecule3D> = {}, frames = 1): Omit<Molecule3D, "id" | "at"> => ({
  atoms: [
    { el: "O", x: k / 100, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  ...(frames > 1 ? { frames: Array.from({ length: frames - 1 }, (_, f) => [k / 100, 0, 0, 0.76, 0.59 + (f + 1) / 10, 0, -0.76, 0.59, 0]) } : {}),
  ...(frames > 1 ? { conformerSet: true, energies: Array.from({ length: frames }, (_, f) => -76 + f / 1000) } : {}),
  ...extra,
});
const onPage = (m: Omit<Molecule3D, "id" | "at">, id = 1): Molecule3D => ({ ...m, id, at: { x: 0, y: 0 } });
const extentOf: RunWith["extentOf"] = () => ({ x0: -1, x1: 1, y0: -1, y1: 1 });

describe("what an entry was made from", () => {
  it("is each frame's entry's, and its entry record's lineage - the molecule it is a frame of where it has none", () => {
    const m = onPage(water(0, { madeOf: ["a#1", "b#2"] }, 2), 4);
    const made = setEntries([m], "conformers");
    expect(made.map((e) => [e.madeOf, e.from])).toEqual([
      [["a#1", "b#2"], 4],
      [["a#1", "b#2"], 4],
    ]);
    expect(entryOfSet(made[1], "x").from).toEqual(["a#1", "b#2"]);
    // (each its own list, none the molecule's nor another's: one changed changes no other)
    expect(new Set([m.madeOf, ...made.map((e) => e.madeOf), entryOfSet(made[0], "x").from]).size).toBe(4);
    const plain = setEntries([onPage(water(), 4)], "molecules")[0];
    expect([plain.madeOf, entryOfSet(plain, "x").from]).toEqual([undefined, ["molecule:4#0"]]);
  });

  it("is kept by a step's molecules: one each; a compound's where all its conformers have the same, else none", () => {
    const entry = (compound: number, number: number, madeOf?: string[]): SetEntry => ({ ...setEntries([onPage(water(number))], "molecules")[0], compound, number, ...(madeOf ? { madeOf } : {}) });
    const one = entry(0, 1, ["a"]);
    const each = resultsOf({ ok: true, holds: "molecules", kept: [one, entry(1, 1)], aside: [], said: "" }, "duplicates");
    expect(each.molecules.map((m) => m.madeOf)).toEqual([["a"], undefined]);
    expect(each.molecules[0].madeOf).not.toBe(one.madeOf);
    const first = entry(0, 1, ["a"]);
    const compounds = resultsOf({ ok: true, holds: "conformers", kept: [first, entry(0, 2, ["a"]), entry(1, 1, ["a"]), entry(1, 2, ["b"]), entry(2, 1, ["a"]), entry(2, 2)], aside: [], said: "" }, "duplicates");
    expect(compounds.molecules.map((m) => m.madeOf)).toEqual([["a"], undefined, undefined]);
    expect(compounds.molecules[0].madeOf).not.toBe(first.madeOf);
  });

  it("is kept by the frames a set's table takes of a molecule", () => {
    const m = onPage(water(0, { madeOf: ["a"] }, 3));
    const taken = framesMolecule(m, [2, 0]).madeOf;
    expect(taken).toEqual(["a"]);
    expect(taken).not.toBe(m.madeOf);
  });

  it("is kept by an entry a step gives back as it was, and by one it made anew of that one entry - not by one made of several", () => {
    const was = { ...setEntries([onPage(water(), 4)], "molecules")[0], madeOf: ["a"] };
    const same = entryOfSet(was, "0");
    const tagged = setEntryOfEntry({ ...same, properties: { ...same.properties, id: { value: "x", unit: "none", status: "computed" } } }, { compound: 0, number: 1 }, was)!;
    expect([tagged.madeOf, tagged.from]).toEqual([["a"], 4]);
    // (at another geometry: what was worked out at the old one gone, its lineage at a remove kept)
    const moved = setEntryOfEntry({ ...same, geometry: { kind: "3d", xyz: was.xyz.map((v, i) => (i === 0 ? v + 0.1 : v)) } }, { compound: 0, number: 1 }, was)!;
    expect([moved.madeOf, moved.from, moved.energy]).toEqual([["a"], 4, undefined]);
    expect(moved.madeOf).not.toBe(was.madeOf);
    // (no one entry it was made of - Re-bond's, several parts combined: none)
    expect(setEntryOfEntry(same, { compound: 0, number: 1 })!.madeOf).toBeUndefined();
  });

  it("is read from a file as data: each id that is no text left out, and counted", () => {
    const { value, left } = noting(() => readCarried3D({ ...onPage(water()), madeOf: ["a", 7, "b"] }));
    expect(value?.madeOf).toEqual(["a", "b"]);
    expect(left).toEqual({ madeFrom: 1 });
    expect(noting(() => readCarried3D({ ...onPage(water()), madeOf: "a" })).value?.madeOf).toBeUndefined();
  });

  it("is kept in the workspace's file with a result set's molecules - on the page, or held by a large set - and read back", () => {
    for (const n of [2, 52]) {
      const doc = createWorkspaceDocument();
      const store = createEditorStore(doc);
      connectStoreToDocument(store, doc);
      const molecules = Array.from({ length: n }, (_, k) => water(k, { madeOf: [`drawn#${k}`] }));
      doc.edit("run", (d) => {
        const ran = addStep(d, "optimise", 0, 0, {}, "xtb");
        return placeResults(ran, ran.steps![0], { molecules, rest: [], holds: "molecules" }, { extentOf });
      });
      const ws = readWorkspace(workspaceText(store.getState()))!;
      const again = createWorkspaceDocument();
      const opened = createEditorStore(again);
      connectStoreToDocument(opened, again);
      opened.getState().openWorkspace(ws, true);
      const st = opened.getState();
      const read = n > 50 ? st.sets[0].collection! : st.molecules3d;
      expect(read.map((m) => m.madeOf)).toEqual(molecules.map((m) => m.madeOf));
    }
  });
});
