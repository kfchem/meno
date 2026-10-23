import { describe, expect, it } from "vitest";
import { readWorkspace, workspaceText } from "./workspace";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Molecule3D } from "../store/types";
import { entryOfSet, MARKS_UNREAD, setEntries } from "../workflow/entries";
import { runMeno } from "../workflow/meno";
import { sharesOf } from "./molecule3d";
import { readRecord } from "./copyPaste";
import { leftOutSaid, leftOutSavedSaid, noting, readEach } from "./readNotes";

const SHA = (c: string) => c.repeat(64);
const atoms = [
  { el: "C", x: 0, y: 0, z: 0 },
  { el: "O", x: 1.2, y: 0, z: 0 },
];
/** A molecule in 3D as a file keeps it: carbon monoxide's two atoms, at `x` on the page. */
const molecule = (x: number, more: object = {}) => ({ atoms, bonds: [{ a1: 0, a2: 1, order: 3 }], at: { x, y: 0 }, ...more });
/** One that does not read: no atoms. */
const broken = { atoms: [], bonds: [], at: { x: 0, y: 0 } };
const frame = (d: number) => [0, 0, 0, 1.2 + d, 0, 0];
const workspace = (rest: object) => JSON.stringify({ format: "meno-workspace", version: 2, atoms: [], bonds: [], ...rest });

describe("what a workspace's file holds that does not read", () => {
  it("is left out and counted, kind by kind - never silently", () => {
    const ws = readWorkspace(
      workspace({
        arrows: [{ id: 1, x: 0, y: 0, angle: 0, length: 10 }, { id: 2, x: "far" }],
        pluses: [{ id: 3 }],
        molecules3d: [molecule(0), broken],
        pictures: [{ id: 1, name: "x.png" }],
        sets: [{ id: 1, x0: 0, y0: 0, x1: 1, y1: 1 }],
        // (a step whose id is a set's: left out, and the wire to it with it)
        steps: [{ id: 1, kind: "conformers", x: 0, y: 0 }],
        wires: [{ id: 5, from: { set: 1 }, to: { step: 1, port: "in" } }],
      }),
    )!;
    expect(ws.drawn.arrows).toHaveLength(1);
    expect(ws.drawn.molecules3d).toHaveLength(1);
    expect(ws.leftOut).toEqual({ arrow: 1, plus: 1, molecule3d: 1, picture: 1, step: 1, wire: 1 });
    expect(leftOutSaid(ws.leftOut)).toBe(
      "1 arrow, 1 plus sign, 1 molecule in 3D, 1 picture, 1 step and 1 wire in the file could not be read and were left out.",
    );
  });

  it("says nothing where everything reads", () => {
    const ws = readWorkspace(workspace({ molecules3d: [molecule(0)] }))!;
    expect(ws.leftOut).toBeUndefined();
    expect(leftOutSaid(ws.leftOut)).toBeNull();
  });

  it("is said of a copy as it is pasted", () => {
    const record = readRecord(JSON.stringify({ format: "meno-structure", version: 1, atoms: [], bonds: [], shapes: [{ id: 1, kind: "rect" }] }));
    expect(record?.leftOut).toEqual({ shape: 1 });
    expect(leftOutSaid(record!.leftOut, "copy")).toBe("1 shape in the copy could not be read and was left out.");
  });

  it("is said on every save, and the file as it was named where it is kept", () => {
    expect(leftOutSavedSaid({ picture: 2, wire: 1 })).toBe("Saved, but 2 pictures and 1 wire that could not be read when it opened are not in the file.");
    expect(leftOutSavedSaid({ frame: 1 }, "a.meno.bak")).toBe(
      "Saved, but 1 conformer or frame that could not be read when it opened is not in the file. The file as it was is kept beside it as a.meno.bak.",
    );
    expect(leftOutSavedSaid(null)).toBeNull();
  });

  it("counts reads apart, one inside another", () => {
    const { value, left } = noting(() => {
      const inner = noting(() => readEach([1, null], (v) => v, "arrow"));
      return [inner.left, readEach([null], (v) => v, "plus")];
    });
    expect(value[0]).toEqual({ arrow: 1 });
    expect(left).toEqual({ plus: 1 });
  });
});

describe("a conformer that does not read", () => {
  // (an ensemble of four geometries - the molecule's own, then three frames - the second frame damaged)
  const ensemble = molecule(0, {
    frames: [frame(0.01), [0, 0, "x"], frame(0.03)],
    energies: [-113.1, -113.2, -113.3, -113.4],
    numbers: [1, 2, 3, 4],
    shares: [0.4, 0.3, 0.2, 0.1],
    degeneracies: [1, 2, 1, 2],
    failed: [null, null, { kind: "program", why: "it stopped" }, { kind: "program", why: "it did not converge" }],
    imaginary: [null, [-42], [-310], null],
    calc: {
      readers: ["test-reader 1.0"],
      results: [
        { id: "g", group: "Thermo", label: "G", on: "frames", values: [1, 2, 3, 4] },
        { id: "l", group: "Scan", label: "Scan", on: "list", columns: [{ label: "E" }], rows: [{ cells: [1], frame: 2 }, { cells: [2], frame: 3 }] },
      ],
    },
  });
  const read = readWorkspace(workspace({ molecules3d: [ensemble] }))!;
  const m = read.drawn.molecules3d![0];

  it("is left out alone: every other conformer keeps its energy, number, share and degeneracy", () => {
    // (before, one damaged frame lost every conformer's energy, number, share and degeneracy)
    expect(m.frames).toEqual([frame(0.01), frame(0.03)]);
    expect(m.energies).toEqual([-113.1, -113.2, -113.4]);
    expect(m.numbers).toEqual([1, 2, 4]);
    expect(m.shares).toEqual([0.4, 0.3, 0.1]);
    expect(m.degeneracies).toEqual([1, 2, 2]);
  });

  it("takes why it failed and its imaginary frequencies with it", () => {
    expect(m.failed?.map((f) => f?.why ?? null)).toEqual([null, null, "it did not converge"]);
    expect(m.imaginary).toEqual([null, [-42], null]);
  });

  it("whose marks of failure do not read is kept whole, those marks alone left out and said - none of its frames ever taken for a minimum", () => {
    const two = (more: object) => molecule(0, { frames: [frame(0.01)], energies: [-1, -2], conformerSet: true, ...more });
    const read = (more: object) => readWorkspace(workspace({ molecules3d: [two(more)] }))!;
    // (one mark for two frames; a mark that is neither a failure nor none; imaginary frequencies that are no list)
    for (const more of [{ failed: [{ kind: "not-converged", why: "it did not converge" }] }, { failed: [null, { kind: "not-converged" }] }, { imaginary: [null, "382.6i"] }, { imaginary: [[-382.6]] }]) {
      const r = read(more);
      const [got] = r.drawn.molecules3d!;
      // (its geometry, frames and energies as they were: nothing of the chemist's lost)
      expect(got, JSON.stringify(more)).toMatchObject({ atoms, frames: [frame(0.01)], energies: [-1, -2], conformerSet: true, marksUnread: true });
      expect(got.failed, JSON.stringify(more)).toBeUndefined();
      expect(got.imaginary, JSON.stringify(more)).toBeUndefined();
      expect(r.leftOut, JSON.stringify(more)).toEqual({ frameMarks: 1 });
    }
    // (marks that read, none among them, or an empty list for a frame with none: read, nothing said)
    for (const more of [{ failed: [null, null] }, { imaginary: [[], null] }, { imaginary: [null, [-382.6]] }]) {
      const r = read(more);
      expect(r.drawn.molecules3d?.[0].marksUnread, JSON.stringify(more)).toBeUndefined();
      expect(r.leftOut ?? {}, JSON.stringify(more)).toEqual({});
    }
  });

  it("whose marks did not read is saved so and opened again whole - its frames still not taken for minima by any step or its chip", () => {
    const opened = readWorkspace(workspace({ molecules3d: [molecule(0, { frames: [frame(0.01)], energies: [-1, -2], conformerSet: true, failed: [null] })] }))!;
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().pasteModel({ atoms: [], bonds: [], molecules3d: opened.drawn.molecules3d! });
    const again = readWorkspace(workspaceText(store.getState()))!;
    const [m2] = again.drawn.molecules3d!;
    expect(m2).toMatchObject({ atoms, frames: [frame(0.01)], energies: [-1, -2], conformerSet: true, marksUnread: true });
    // (said once, as it was first read: saved, it reads as kept)
    expect(again.leftOut ?? {}).toEqual({});
    const entries = setEntries([{ ...m2, id: 1 } as Molecule3D], "conformers");
    for (const e of entries) expect(entryOfSet(e, "e").status).toEqual({ failed: MARKS_UNREAD });
    for (const kind of ["populations", "energy-window"] as const) {
      const out = runMeno(kind, entries, "conformers");
      expect(out.ok, kind).toBe(false);
      expect(out.said, kind).toContain(MARKS_UNREAD);
    }
    expect(sharesOf(m2)).toBeUndefined();
    expect(sharesOf({ ...m2, marksUnread: undefined })).toHaveLength(2);
  });

  it("is counted with the frames its file left out, and said", () => {
    expect(m.framesLeftOut).toBe(1);
    expect(read.leftOut).toEqual({ frame: 1 });
  });

  it("takes its calculation results with it: each other frame's result stays its own", () => {
    const [g, l] = m.calc!.results!;
    expect(g).toMatchObject({ on: "frames", values: [1, 2, 4] });
    // (the row of the frame left out is of none; the row of the last frame, the last frame still)
    expect(l).toMatchObject({ on: "list", rows: [{ cells: [1] }, { cells: [2], frame: 2 }] });
    expect((l as { rows: { frame?: number }[] }).rows[0].frame).toBeUndefined();
  });

  it("a list of energies of the wrong length is left out, and said", () => {
    const ws = readWorkspace(workspace({ molecules3d: [molecule(0, { frames: [frame(0.01)], energies: [-1] })] }))!;
    expect(ws.drawn.molecules3d![0].energies).toBeUndefined();
    expect(ws.leftOut).toEqual({ frameValues: 1 });
  });
});

describe("a molecule's labels and marks that do not read", () => {
  it("an R/S label of an atom it does not have is left out alone", () => {
    const ws = readWorkspace(workspace({ molecules3d: [molecule(0, { stereo: { atoms: { 0: "R", 7: "S" }, bonds: {} } })] }))!;
    // (before, one label out of range lost every label)
    expect(ws.drawn.molecules3d![0].stereo?.atoms).toEqual({ 0: "R" });
    expect(ws.leftOut).toEqual({ stereo: 1 });
  });

  it("a ligand's atoms of unknown orders: each its own kept, one out of range said", () => {
    const ws = readWorkspace(workspace({ molecules3d: [molecule(0, { bondOrders: "unknown", unknownOrders: [0, 9] })] }))!;
    expect(ws.drawn.molecules3d![0].unknownOrders).toEqual([0]);
    expect(ws.drawn.molecules3d![0].bondOrders).toBe("unknown");
    expect(ws.leftOut).toEqual({ bondOrders: 1 });
  });

  it("a mark of how its orders are known that does not read is said", () => {
    const ws = readWorkspace(workspace({ molecules3d: [molecule(0, { bondOrders: "guessed" })] }))!;
    expect(ws.drawn.molecules3d![0].bondOrders).toBeUndefined();
    expect(ws.leftOut).toEqual({ bondOrders: 1 });
  });
});

describe("what a file says by place, where one before it does not read", () => {
  it("a text of a molecule is of that molecule - never the one after it", () => {
    const ws = readWorkspace(
      workspace({
        molecules3d: [broken, molecule(10), molecule(20)],
        texts: [
          { name: "of the second", sha256: SHA("a"), of: { molecule: 1 } },
          { name: "of the broken", sha256: SHA("b"), of: { molecule: 0 } },
        ],
      }),
    )!;
    // (the molecule at place 1 in the file is the first read)
    expect(ws.drawn.molecules3d!.map((m) => m.at.x)).toEqual([10, 20]);
    expect(ws.texts[0].of).toEqual({ molecule: 0 });
    // (of one that did not read: of none, and said)
    expect(ws.texts[1].of).toBeUndefined();
    expect(ws.leftOut).toEqual({ molecule3d: 1, textOf: 1 });
  });

  it("the text shown is the one the file said", () => {
    const ws = readWorkspace(
      workspace({
        texts: [{ name: "bad", sha256: "x" }, { name: "first", sha256: SHA("a") }, { name: "second", sha256: SHA("b") }],
        textShown: 1,
      }),
    )!;
    // (before, place 1 among those read - "second" - was shown)
    expect(ws.texts[ws.textShown!].name).toBe("first");
    expect(ws.leftOut).toEqual({ text: 1 });
  });

  it("the PDF shown is the one the file said", () => {
    const pdf = (name: string, c: string) => ({ name, sha256: SHA(c), pages: [[600, 800]], x: 0, y: 0, reading: { at: 0, zoom: 1 } });
    const ws = readWorkspace(workspace({ pdfs: [{ name: "bad" }, pdf("first", "a"), pdf("second", "b")], pdfShown: 1 }))!;
    expect(ws.pdfs[ws.pdfShown!].name).toBe("first");
    expect(ws.leftOut).toEqual({ pdf: 1 });
  });

  it("a PDF one of whose pages' sizes does not read is left out - never its pages a place wrong", () => {
    const ws = readWorkspace(workspace({ pdfs: [{ name: "p", sha256: SHA("a"), pages: [[600, 800], "x", [600, 800]], x: 0, y: 0 }] }))!;
    expect(ws.pdfs).toEqual([]);
    expect(ws.leftOut).toEqual({ pdf: 1 });
  });

  it("a set's member of a molecule that did not read is left out, and said", () => {
    const ws = readWorkspace(
      workspace({
        molecules3d: [broken, molecule(10)],
        sets: [{ id: 1, x0: 0, y0: 0, x1: 1, y1: 1, members: [{ molecule: 0 }, { molecule: 1 }] }],
      }),
    )!;
    expect(ws.workflow!.sets[0].members).toEqual([{ molecule: 1 }]);
    expect(ws.leftOut).toEqual({ molecule3d: 1, member: 1 });
  });

  it("a result set whose step is not there is a set, and said", () => {
    const ws = readWorkspace(workspace({ sets: [{ id: 1, x0: 0, y0: 0, x1: 1, y1: 1, made: { step: 9, exit: "out" } }] }))!;
    expect(ws.workflow!.sets[0].made).toBeUndefined();
    expect(ws.leftOut).toEqual({ made: 1 });
  });
});
