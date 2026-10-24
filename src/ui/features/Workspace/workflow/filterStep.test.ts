import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { readCarried3D } from "../utils/copyPaste";
import { noting } from "../utils/readNotes";
import { editedCopy } from "../utils/edit3d";
import { setMolecules } from "./entries";
import { inputKey, resultOf } from "./flow";
import { filterHow, howOf, kindInfo } from "./kinds";
import { addSet, addStep, connect, updateStep } from "./model";
import { runStep, type RunWith } from "./run";
import { STATE_FINISHED } from "./meno";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** A model's NLL of a structure, as a plugin gives it: no unit, what worked it out. */
const nll = (v: number): Property => ({ value: v, unit: "none", by: { plugin: "gen", model: "a model", version: "1" }, status: "computed" });

/** A water of `frames` frames - each a conformer where `conformerSet` - each frame's properties as given. */
function water(properties: Record<string, Property>[], extra: Partial<Molecule3D> = {}): Omit<Molecule3D, "id"> {
  return {
    at: { x: 0, y: 0 },
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: -0.24, y: 0.93, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...(properties.length > 1 ? { frames: properties.slice(1).map((_, k) => [0, 0, 0, 0.96 + k / 100, 0, 0, -0.24, 0.93, 0]) } : {}),
    energies: properties.map((_, k) => -76.4 + k / 1000),
    properties,
    ...extra,
  };
}

/** A page with `molecules` in a set (1) wired into a Filter (2) with `conditions`. */
function filtering(molecules: Omit<Molecule3D, "id">[], conditions: string, match: "all" | "any" = "all"): WorkspaceDocument {
  let doc = emptyWorkspaceDocument();
  for (const m of molecules) doc = addMolecule3d(doc, m);
  doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
  doc = addStep(doc, "filter", 10, 0, { conditions, match });
  return connect(doc, { set: 1 }, 2);
}

const ran = (doc: WorkspaceDocument) => doc.steps!.find((s) => s.id === 2)!.ran;
const out = (doc: WorkspaceDocument, exit = "out") => setMolecules(doc, resultOf(doc, 2, exit)!);

describe("a Filter step", () => {
  it("keeps the entries that are results to stand on (state = finished) - the rest each saying what it is: not converged, refused, marks not read", () => {
    // (a conformer set of four: #2 not converged, #3 refused)
    const set = water([{}, {}, {}, {}], { conformerSet: true, failed: [null, { kind: "not-converged", why: "stopped at 200 cycles" }, { kind: "refused", why: "no parameters" }, null] });
    // (and another of two whose file's marks did not read)
    const unread = water([{}, {}], { at: { x: 2, y: 0 }, conformerSet: true, marksUnread: true });
    const doc = runStep(filtering([set, unread], STATE_FINISHED), 2, W);
    expect(STATE_FINISHED).toBe("state = finished");
    expect(ran(doc)).toMatchObject({
      ok: true,
      said: "2 of 6 entries kept \u00b7 rest 4 (2: not state = finished (marks not read); 1: not state = finished (not converged); 1: not state = finished (refused))",
    });
    expect(out(doc)[0].numbers).toEqual([1, 4]);
  });

  it("never keeps an entry that is no result on a condition on a value - set aside, named, its state said - though its value would pass", () => {
    // (#2 not converged, #3's marks fine but refused: both with energies under the condition's)
    const set = water([{}, {}, {}, {}], { conformerSet: true, failed: [null, { kind: "not-converged", why: "stopped at 200 cycles" }, { kind: "refused", why: "no parameters" }, null] });
    const doc = runStep(filtering([set], "energy < 0 Eh"), 2, W);
    expect(ran(doc)).toMatchObject({ ok: true, said: "2 of 4 entries kept \u00b7 rest 2 (1: a #2 not converged; 1: a #3 refused)" });
    expect([out(doc)[0].numbers, out(doc, "rest")[0].numbers]).toEqual([[1, 4], [2, 3]]);
    // (and where any is met, as well)
    expect(ran(runStep(filtering([set], "energy < 0 Eh; nll < 5", "any"), 2, W))?.said).toMatch(/^2 of 4 entries kept/);
    // (on its state alone, judged by that: kept where its state is asked for)
    expect(ran(runStep(filtering([set], 'state = "not converged"'), 2, W))?.said).toMatch(/^1 of 4 entries kept/);
  });


  it("keeps the conformers that meet its conditions, the rest out of its second exit - both counted, and why each of the rest was, one with no value for the property said", () => {
    // (a conformer set of four: NLL 12, 40, none, 25)
    const doc = runStep(filtering([water([{ nll: nll(12) }, { nll: nll(40) }, {}, { nll: nll(25) }], { conformerSet: true })], "nll < 30"), 2, W);
    expect(ran(doc)).toMatchObject({ ok: true, said: "2 of 4 entries kept \u00b7 rest 2 (1: not nll < 30 (40); 1: it has no nll)" });
    const [kept] = out(doc);
    const [rest] = out(doc, "rest");
    // (each as it came: its number, its energy, its properties)
    expect([kept.numbers, kept.energies, kept.properties?.map((p) => p.nll?.value)]).toEqual([[1, 4], [-76.4, -76.397], [12, 25]]);
    expect([rest.numbers, rest.properties?.map((p) => p.nll?.value ?? null)]).toEqual([[2, 3], [40, null]]);
    expect(kept.properties![0].nll).toEqual(nll(12));
  });

  it("compares in the condition's unit, and keeps where any is met when asked", () => {
    const a = water([{ nll: nll(50), gap: { value: 2, unit: "eV", status: "computed" } }]);
    const b = water([{ nll: nll(10), gap: { value: 0.5, unit: "eV", status: "computed" } }]);
    // (1 eV is 23.060548 kcal/mol, from the SI values of e and N_A and the thermochemical calorie: 2 eV is 46.12 kcal/mol, above 40; 0.5 eV is 11.530274)
    const all = runStep(filtering([a, b], "gap > 40 kcal/mol"), 2, W);
    expect([ran(all)?.said, out(all).length]).toEqual(["1 of 2 entries kept \u00b7 rest 1 (1: not gap > 40 kcal/mol (11.530274 kcal/mol))", 1]);
    const any = runStep(filtering([a, b], "gap > 40 kcal/mol; nll < 20", "any"), 2, W);
    expect([ran(any)?.said, out(any).length]).toEqual(["2 of 2 entries kept", 2]);
  });

  it("reads Meno's own properties of an entry as well: its energy, its number, its group", () => {
    const doc = runStep(filtering([water([{}, {}, {}], { conformerSet: true })], "energy <= -76.399 Eh; number != 1"), 2, W);
    expect([ran(doc)?.said, out(doc)[0].numbers]).toEqual(["1 of 3 entries kept \u00b7 rest 2 (1: not number \u2260 1 (1); 1: not energy \u2264 -76.399 Eh (-76.398 Eh))", [2]]);
  });

  it("says why, and makes nothing, where its conditions do not read, or there are none", () => {
    const bad = runStep(filtering([water([{ nll: nll(1) }])], "mw < 500 furlongs"), 2, W);
    expect(ran(bad)).toMatchObject({ ok: false, said: '"mw < 500 furlongs": furlongs is no unit Meno knows' });
    const none = runStep(filtering([water([{ nll: nll(1) }])], ""), 2, W);
    expect(ran(none)).toMatchObject({ ok: false, said: "No conditions yet" });
  });

  it("refuses a condition on a name that is Meno's own and an entry's too - never reads it as either - and filters on others as given", () => {
    const own = (v: number): Property => ({ value: v, unit: "Eh", by: { plugin: "gen" }, status: "computed" });
    const given = [water([{ energy: own(-1), nll: nll(5) }]), water([{ nll: nll(50) }])];
    const doc = runStep(filtering(given, "energy < 0 Eh"), 2, W);
    expect(ran(doc)).toMatchObject({ ok: false, said: '"energy" is Meno\'s own, and 1 entry carries one of its own by that name too: which is meant cannot be told' });
    // (a condition on another: the entry, and its own energy, go on as they came)
    const other = runStep(filtering(given, "nll < 30"), 2, W);
    expect([ran(other)?.said, out(other)[0].properties?.[0].energy]).toEqual(["1 of 2 entries kept \u00b7 rest 1 (1: not nll < 30 (50))", own(-1)]);
  });

  it("says how it filters on its card: its conditions as read, all or any", () => {
    const info = kindInfo("filter");
    expect(howOf(info.options!, { conditions: "nll<30;mw <= 500", match: "all" }, info.how)).toBe("nll < 30 and mw \u2264 500");
    expect(filterHow("nll < 30; mw <= 500", "any")).toBe("nll < 30 or mw \u2264 500");
    expect(filterHow("", "all")).toBe("No conditions yet");
    expect(filterHow("nll 30", "all")).toMatch(/compares nothing/);
  });

  it("is run again when the properties of what comes in change", () => {
    let doc = filtering([water([{ nll: nll(12) }])], "nll < 30");
    const key = inputKey(doc, doc.steps![0], "meno");
    doc = { ...doc, molecules3d: doc.molecules3d!.map((m) => ({ ...m, properties: [{ nll: nll(31) }] })) };
    expect(inputKey(doc, doc.steps![0], "meno")).not.toBe(key);
    expect(updateStep(doc, 2, { options: { conditions: "nll < 40" } }).steps![0].options).toMatchObject({ conditions: "nll < 40" });
  });
});

describe("a molecule's properties", () => {
  it("are kept in the file, a map for each frame - those that do not read left out - and none where none reads", () => {
    const m = { ...water([{ nll: nll(12) }, { nll: { value: [1, 2], unit: "none", status: "computed" } as unknown as Property, mw: { value: 18.02, unit: "none", status: "computed" } }]), id: 1 };
    const left = noting(() => readCarried3D(JSON.parse(JSON.stringify(m)))!);
    expect(left.value.properties).toEqual([{ nll: nll(12) }, { mw: { value: 18.02, unit: "none", status: "computed" } }]);
    // (the one that does not read - a list - counted, as what a file holds that does not read is)
    expect(left.left).toEqual({ property: 1 });
    // (one per frame or none: a list of another length is not read)
    expect(readCarried3D(JSON.parse(JSON.stringify({ ...m, properties: [{ nll: nll(12) }] })))!.properties).toBeUndefined();
    expect(readCarried3D(JSON.parse(JSON.stringify({ ...m, properties: [{ x: { value: 1, unit: "furlongs", status: "computed" } }, {}] })))!.properties).toBeUndefined();
  });

  it("are not a frame's edited into a molecule of its own: they were of the result", () => {
    const m = { ...water([{ nll: nll(12) }]), id: 1 };
    expect(editedCopy(m, 0, [0, 0, 0, 1, 0, 0, -0.3, 0.9, 0], undefined, { x: 1, y: 1 }).properties).toBeUndefined();
  });
});
