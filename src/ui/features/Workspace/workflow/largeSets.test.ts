import { describe, expect, it, vi } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { readWorkspace, workspaceFile, workspaceText } from "../utils/workspace";
import { rememberOutput } from "../../../../lib/calc/asks";
import { readMenoFile } from "../../../../lib/doc/menoFile";
import { workspaceOfFile } from "../../../views/openFile";
import { collectionHash, countOf, LARGE_SET, setMembers } from "./entries";
import { inputOf, resultOf } from "./flow";
import { addStep, keepSet } from "./model";
import { keepRun, placeResults, resultsNow, showRun, SUMMARY_H, SUMMARY_W, type RunWith } from "./run";
import { setRan } from "./model";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));

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
  return placeResults(doc, doc.steps![0], { molecules, rest: [], holds }, { extentOf });
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
    d = { ...d, wires: [{ id: 99, from: { set: set.id }, to: { step: d.steps![1].id, port: "in" } }] };
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
    // (the step's set, and its Failed one)
    expect(d.sets).toHaveLength(2);
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

  it("counts the molecules of its collection that do not read from a file, and says so until the step runs again", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    doc.edit("run", (d) => ran(waters(53), "molecules", addStep(d, "optimise", 0, 0, {}, "xtb")));
    const saved = JSON.parse(workspaceText(store.getState()));
    // (two of its molecules spoilt: one with no atoms, one not a molecule at all)
    saved.sets[0].collection[4] = { atoms: "none", bonds: [] };
    saved.sets[0].collection[9] = 7;
    const ws = readWorkspace(JSON.stringify(saved))!;
    expect(ws.workflow!.sets[0].collection).toHaveLength(51);
    expect(ws.workflow!.sets[0].unread).toBe(2);
    // (the count said in its frame's, besides what it holds)
    const again = createWorkspaceDocument();
    const opened = createEditorStore(again);
    connectStoreToDocument(opened, again);
    opened.getState().openWorkspace(ws, true);
    expect(opened.getState().sets[0].unread).toBe(2);
    // (saved again, and one more spoilt: the file says what it lost before, and this adds to it)
    const resaved = JSON.parse(workspaceText(opened.getState()));
    expect(resaved.sets[0].unread).toBe(2);
    resaved.sets[0].collection[0] = null;
    expect(readWorkspace(JSON.stringify(resaved))!.workflow!.sets[0].unread).toBe(3);
    // (and one none of whose collection reads still says how many it held)
    resaved.sets[0].collection = resaved.sets[0].collection.map(() => null);
    const none = readWorkspace(JSON.stringify(resaved))!.workflow!.sets[0];
    expect([none.collection, none.unread]).toEqual([[], 53]);
    // (a set none of whose collection was spoilt says none)
    expect(readWorkspace(workspaceText(store.getState()))!.workflow!.sets[0].unread).toBeUndefined();
    // (run again, it holds all the step gave: none unread)
    again.edit("run", (d) => ran(waters(60), "molecules", d));
    expect(opened.getState().sets[0].unread).toBeUndefined();
    again.edit("run", (d) => ran(waters(2), "molecules", d));
    expect(opened.getState().sets[0].unread).toBeUndefined();
  });

  it("keeps in the workspace's file the outputs its collection's molecules were read from, said to be nowhere else", async () => {
    const text = "an output's text, opened from /data/large/run.out";
    const source = await rememberOutput("run.out", text, "orca", "/data/large/run.out");
    const wavefunction = await rememberOutput("run.molden", "a wavefunction's text", "molden", "/data/large/run.molden");
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const read = waters(51).map((m, k) => (k === 30 ? { ...m, calc: { readers: ["meno"], source, wavefunction } } : m));
    doc.edit("run", (d) => ran(read, "molecules", addStep(d, "optimise", 0, 0, {}, "xtb")));
    const { bytes, notKept } = await workspaceFile(store.getState());
    expect(notKept).toEqual([]);
    const file = readMenoFile(bytes);
    expect(file.files.map((f) => f.name).sort()).toEqual(["run.molden", "run.out"]);
    expect(file.workspace).not.toContain("/data/large/run.out");
    const ws = readWorkspace(workspaceOfFile(bytes)!)!;
    expect(ws.workflow!.sets[0].collection![30].calc!.source).toEqual({ name: "run.out", sha256: source.sha256, kind: "orca" });
    // (kept out of the file, nor are its outputs)
    doc.edit("keep", (d) => keepSet(d, d.sets![0].id, false));
    expect(readMenoFile((await workspaceFile(store.getState())).bytes).files).toEqual([]);
  });

  it("names in what a save says an output of its collection's molecules held nowhere - never saved as if it were there", async () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    // (an output known by its SHA-256 alone: read from a file, held no more)
    const source = { name: "gone.out", sha256: "0".repeat(64), kind: "orca" };
    const read = waters(51).map((m, k) => (k === 7 ? { ...m, calc: { readers: ["meno"], source } } : m));
    doc.edit("run", (d) => ran(read, "molecules", addStep(d, "optimise", 0, 0, {}, "xtb")));
    const { bytes, notKept } = await workspaceFile(store.getState());
    expect(notKept).toEqual(["gone.out"]);
    expect(readMenoFile(bytes).files).toEqual([]);
    // (still said where it lay, by what it is known by)
    expect(readWorkspace(workspaceOfFile(bytes)!)!.workflow!.sets[0].collection![7].calc!.source).toMatchObject({ name: "gone.out", sha256: source.sha256 });
  });

  it("counts the molecules of an earlier run kept that do not read from a file, says so on the card's row, and in the set once it is shown again", () => {
    // (a run of 3 on the page and one of 60 held, each kept as the step runs again)
    let d = ran(waters(3));
    d = setRan(d, d.steps![0].id, { at: 1, ok: true, said: "3 optimised", input: "a" });
    d = keepRun(d, d.steps![0]);
    d = ran(waters(60), "molecules", d);
    d = setRan(d, d.steps![0].id, { at: 2, ok: true, said: "60 optimised", input: "b" });
    d = keepRun(d, d.steps![0]);
    d = setRan(ran(waters(1), "molecules", d), d.steps![0].id, { at: 3, ok: true, said: "1 optimised", input: "c" });
    const page = createWorkspaceDocument();
    const store = createEditorStore(page);
    connectStoreToDocument(store, page);
    page.edit("run", () => d);
    const saved = JSON.parse(workspaceText(store.getState()));
    const runs = saved.steps[0].runs;
    expect(runs.map((r: { results: { molecules: unknown[] } }) => r.results.molecules.length)).toEqual([60, 3]);
    runs[0].results.molecules[5] = { atoms: 3 };
    runs[1].results.molecules = runs[1].results.molecules.map(() => "spoilt");
    const read = readWorkspace(JSON.stringify(saved))!.workflow!.steps[0].runs!;
    expect(read.map((r) => [r.results!.molecules.length, r.results!.unread])).toEqual([
      [59, 1],
      [0, 3],
    ]);
    // (shown again, its result set says it, as one opened does)
    const doc = { ...d, steps: d.steps!.map((s) => ({ ...s, runs: read })) };
    const shown = showRun(doc, doc.steps[0].id, 0, { extentOf });
    expect(shown.sets![0].collection).toHaveLength(59);
    expect(shown.sets![0].unread).toBe(1);
    // (and kept again with what it gave, the count with it)
    expect(shown.steps![0].runs!.find((r) => r.at === 2)).toBeUndefined();
    const back = showRun(shown, shown.steps![0].id, 0, { extentOf });
    expect(back.steps![0].runs!.find((r) => r.at === 2)!.results!.unread).toBe(1);
    const none = showRun(doc, doc.steps[0].id, 1, { extentOf });
    expect([setMembers(none, none.sets![0]).molecules.length, none.sets![0].unread]).toEqual([0, 3]);
  });

  it("holds what a step set aside as its first exit's are held - more than 50 in its second exit's set - and counts, there too, those of a run kept that do not read", () => {
    // (Duplicates: 2 kept, 60 alike set aside)
    let d = addStep(emptyWorkspaceDocument(), "duplicates", 0, 0, {});
    d = placeResults(d, d.steps![0], { molecules: waters(2), rest: waters(60), holds: "molecules" }, { extentOf });
    const step = d.steps![0];
    const kept = resultOf(d, step.id)!;
    const rest = resultOf(d, step.id, "rest")!;
    expect([setMembers(d, kept).molecules.length, kept.collection]).toEqual([2, undefined]);
    expect([rest.collection?.length, rest.members]).toEqual([60, []]);
    expect(resultsNow(d, step)!.rest).toHaveLength(60);
    // (kept, saved, and three of what it set aside spoilt)
    d = setRan(d, step.id, { at: 1, ok: true, said: "2 kept", input: "a" });
    d = keepRun(d, d.steps![0]);
    const page = createWorkspaceDocument();
    const store = createEditorStore(page);
    connectStoreToDocument(store, page);
    page.edit("run", () => d);
    const saved = JSON.parse(workspaceText(store.getState()));
    const r = saved.steps[0].runs[0].results;
    expect([r.molecules.length, r.rest.length]).toEqual([2, 60]);
    r.rest[0] = r.rest[1] = r.rest[2] = null;
    const read = readWorkspace(JSON.stringify(saved))!.workflow!.steps[0].runs![0].results!;
    expect([read.molecules.length, read.unread, read.rest.length, read.restUnread]).toEqual([2, undefined, 57, 3]);
    // (shown again, the second exit's set says it, and only that one)
    const doc = { ...d, steps: d.steps!.map((s) => ({ ...s, runs: [{ ...s.runs![0], results: read }] })) };
    const shown = showRun(doc, doc.steps[0].id, 0, { extentOf });
    expect([resultOf(shown, step.id)!.unread, resultOf(shown, step.id, "rest")!.unread]).toEqual([undefined, 3]);
    expect(resultOf(shown, step.id, "rest")!.collection).toHaveLength(57);
  });
});
