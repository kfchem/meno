import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { collectionHash, countOf, LARGE_SET, setMembers } from "./entries";
import { inputOf, resultOf } from "./flow";
import { addStep, keepSet } from "./model";
import { placeResults, resultsNow, SUMMARY_H, SUMMARY_W, type RunWith } from "./run";

/** A water, its oxygen moved along by `k` hundredths of an ångström: each one told apart. */
const water = (k = 0): Omit<Molecule3D, "id" | "at"> => ({
  atoms: [
    { el: "O", x: k / 100, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
});
const extentOf: RunWith["extentOf"] = () => ({ x0: -1, x1: 1, y0: -1, y1: 1 });
const waters = (n: number) => Array.from({ length: n }, (_, k) => water(k));

/** A step, and its result set holding `molecules` - a set of `holds`. */
function ran(molecules: Omit<Molecule3D, "id" | "at">[], holds: "molecules" | "conformers" = "molecules", doc = addStep(emptyWorkspaceDocument(), "optimise", 0, 0, {}, "xtb")): WorkspaceDocument {
  return placeResults(doc, doc.steps![0], { molecules, aside: [], holds }, { extentOf });
}

describe("a large result set (docs/WORKFLOWS-FOUNDATION.md, *What a set shows*)", () => {
  it("lays out up to 50 entries on the page, as before", () => {
    const d = ran(waters(LARGE_SET));
    expect(d.molecules3d).toHaveLength(50);
    expect(d.sets![0].collection).toBeUndefined();
    expect(setMembers(d, d.sets![0]).molecules).toHaveLength(50);
  });

  it("holds more itself, in the step's order - none on the page - its frame as large as its summary", () => {
    const d = ran(waters(LARGE_SET + 1));
    const set = d.sets![0];
    expect(d.molecules3d ?? []).toHaveLength(0);
    expect(set.members).toEqual([]);
    expect(set.collection).toHaveLength(51);
    expect(set.collection![7].atoms[0].x).toBeCloseTo(0.07, 12);
    expect(countOf(d, set)).toEqual({ holds: "molecules", entries: 51, compounds: 51 });
    expect(set.x1 - set.x0).toBeCloseTo(SUMMARY_W, 9);
    expect(set.y1 - set.y0).toBeCloseTo(SUMMARY_H, 9);
  });

  it("counts entries, not molecules: one compound of 60 conformers is held, 1 of 50 laid out", () => {
    const one = { ...water(), conformerSet: true, frames: Array.from({ length: 59 }, (_, k) => water(k + 1).atoms.flatMap((a) => [a.x, a.y, a.z])) };
    const d = ran([one], "conformers");
    expect(d.sets![0].collection).toHaveLength(1);
    expect(countOf(d, d.sets![0])).toEqual({ holds: "conformers", entries: 60, compounds: 1 });
    const fewer = ran([{ ...one, frames: one.frames.slice(0, 49) }], "conformers");
    expect(fewer.molecules3d).toHaveLength(1);
  });

  it("gives the steps after it what it holds, each molecule with an id of its own within the set", () => {
    let d = ran(waters(60));
    d = addStep(d, "energy", 20, 0, {}, "xtb");
    const set = resultOf(d, d.steps![0].id)!;
    d = { ...d, wires: [{ id: 99, from: { set: set.id }, to: d.steps![1].id }] };
    const input = inputOf(d, d.steps![1].id)!;
    expect(input.molecules).toHaveLength(60);
    expect(input.molecules.slice(0, 3).map((m) => m.id)).toEqual([-1, -2, -3]);
    // (the same molecules each time it is asked, while the collection is the same)
    expect(inputOf(d, d.steps![1].id)!.molecules[0]).toBe(input.molecules[0]);
  });

  it("is run again in place: its earlier molecules taken off the page, or its collection replaced, whichever it held", () => {
    let d = ran(waters(3));
    expect(d.molecules3d).toHaveLength(3);
    d = ran(waters(70), "molecules", d);
    expect(d.molecules3d ?? []).toHaveLength(0);
    expect(d.sets).toHaveLength(1);
    expect(d.sets![0].collection).toHaveLength(70);
    d = ran(waters(2), "molecules", d);
    expect(d.molecules3d).toHaveLength(2);
    expect(d.sets![0].collection).toBeUndefined();
    expect(setMembers(d, d.sets![0]).molecules).toHaveLength(2);
  });

  it("is kept with a run kept, as it holds it", () => {
    const d = ran(waters(55));
    expect(resultsNow(d, d.steps![0])!.molecules).toHaveLength(55);
  });

  it("is kept in the workspace's file - or, kept out of it, only how many it held and its hash", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    doc.edit("run", (d) => ran(waters(52), "molecules", addStep(d, "optimise", 0, 0, {}, "xtb")));
    const st = () => store.getState();
    const text = workspaceText(st());
    const saved = JSON.parse(text);
    expect(saved.molecules3d ?? []).toHaveLength(0);
    expect(saved.sets[0].collection).toHaveLength(52);
    const ws = readWorkspace(text)!;
    expect(ws.workflow!.sets[0].collection).toHaveLength(52);
    expect(collectionHash(st(), ws.workflow!.sets[0])).toBe(collectionHash(st(), st().sets[0]));
    // (and opened again, it holds them as it did)
    const again = createWorkspaceDocument();
    const opened = createEditorStore(again);
    connectStoreToDocument(opened, again);
    opened.getState().openWorkspace(ws, true);
    expect(opened.getState().sets[0].collection).toHaveLength(52);
    expect(countOf(opened.getState(), opened.getState().sets[0]).entries).toBe(52);
    // (kept out of the file)
    doc.edit("keep", (d) => keepSet(d, d.sets![0].id, false));
    const out = JSON.parse(workspaceText(st()));
    expect(out.sets[0].collection).toBeUndefined();
    expect(out.sets[0].notKept).toEqual({ count: 52, hash: collectionHash(st(), st().sets[0]) });
  });
});
