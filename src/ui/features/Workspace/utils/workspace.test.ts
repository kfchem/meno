import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { DEFAULT_STYLE_CHOICE } from "../../../../lib/chem/style";
import { readKept, readWorkspace, workspaceFile, workspaceProblem, workspaceText } from "./workspace";
import { addSet, addStep } from "../workflow/model";
import { placeResults } from "../workflow/run";
import { collectionHash, numberedRecord } from "../workflow/entries";
import { askFor, heldOutput, outputOf, rememberOutput } from "../../../../lib/calc/asks";
import { readMenoFile } from "../../../../lib/doc/menoFile";
import { workspaceOfFile } from "../../../views/openFile";
import { floatsText, resultKey } from "../../../../lib/calc/results";

const water3d = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  frames: [[0, 0, 0, 0.8, 0.6, 0, -0.8, 0.6, 0]],
  look: "secondary" as const,
  measures: [{ id: 1, atoms: [1, 0, 2] }],
};

/** A canvas holding a drawn ethanol, an arrow, two molecules in 3D - one turned, showing its second frame - and a style of its own. */
function canvas() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const a = st().addAtom(0, 0, "C");
  const b = st().addAtom(1.8, 0, "C");
  const c = st().addAtom(2.7, 1.5, "O");
  st().addBond(a, b, 1);
  st().addBond(b, c, 1);
  st().addArrow(6, 0);
  st().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 10, y: 0 } }, { ...water3d, at: { x: 14, y: 0 } }] });
  st().setTurn3d(2, [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
  st().setFrame3d(2, 1);
  st().setDocumentStyle({ ...DEFAULT_STYLE_CHOICE, changes: { bondColor: "#204080" } } as never);
  return { doc, st };
}

describe("a workspace file", () => {
  it("holds everything on the canvas, and reads back as it was", () => {
    const { st } = canvas();
    const ws = readWorkspace(workspaceText(st()));
    expect(ws).not.toBeNull();
    expect(ws!.drawn.atoms.map((x) => x.el)).toEqual(["C", "C", "O"]);
    expect(ws!.drawn.bonds).toHaveLength(2);
    expect(ws!.drawn.arrows).toHaveLength(1);
    expect(ws!.drawn.molecules3d).toHaveLength(2);
    const [first, second] = ws!.drawn.molecules3d!;
    expect(first.turn).toBeUndefined();
    expect(second.turn).toEqual([0, 0, Math.SQRT1_2, Math.SQRT1_2]);
    expect(second.frame).toBe(1);
    expect(second.look).toBe("secondary");
    expect(second.measures).toEqual([{ id: 1, atoms: [1, 0, 2] }]);
    expect(second.frames).toEqual(water3d.frames);
  });

  it("keeps an optimisation's path as one: its frames the path to its last", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, path: true, at: { x: 0, y: 0 } }] });
    const ws = readWorkspace(workspaceText(store.getState()));
    expect(ws!.drawn.molecules3d![0].path).toBe(true);
  });

  it("opens on another canvas just as it was saved: turned, in its frame, its style its own", () => {
    const { st } = canvas();
    const text = workspaceText(st());
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().openWorkspace(readWorkspace(text)!, true);
    const s = store.getState();
    expect(s.model.atoms).toHaveLength(3);
    expect(s.arrows).toHaveLength(1);
    expect(s.molecules3d.map((m) => m.at)).toEqual([
      { x: 10, y: 0 },
      { x: 14, y: 0 },
    ]);
    expect(s.turns3d).toEqual({ 2: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
    expect(s.frames3d).toEqual({ 2: 1 });
    expect(s.docStyle).toEqual(st().docStyle);
    // where the document starts: nothing to undo
    expect(doc.history().undoDepth).toBe(0);
  });

  it("takes from a file's own style a typeface's name, never markup in its place", () => {
    const { st } = canvas();
    const json = JSON.parse(workspaceText(st()));
    // (a file made elsewhere, its typeface closing the attribute a picture writes it into)
    json.style = { preset: "meno", changes: { bondColor: "#204080", fontFamily: `x"><meta http-equiv="refresh" content="0">` } };
    expect(readWorkspace(JSON.stringify(json))!.style).toEqual({ preset: "meno", changes: { bondColor: "#204080" } });
  });

  it("opened over a canvas is one step, undone as one", () => {
    const { st } = canvas();
    const text = workspaceText(st());
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().addAtom(0, 0, "N");
    store.getState().openWorkspace(readWorkspace(text)!);
    expect(store.getState().molecules3d).toHaveLength(2);
    doc.undo();
    expect(store.getState().molecules3d).toHaveLength(0);
    expect(store.getState().model.atoms.map((a) => a.el)).toEqual(["N"]);
  });

  it("opens with a calculation's list open as it was, its row's surface - given - kept, at the value it was drawn at", async () => {
    // a molecule read from a cube file, its first grid shown and given; the
    // second a promise still
    const source = await rememberOutput("water.cube", "the cube", "cube");
    const grid = { origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], counts: [2, 2, 2], values: floatsText(new Float32Array(8)), signed: true };
    await askFor({ readers: ["meno"], source }, "meno", "grid:0", async () => ({ version: "", read: () => Promise.reject(), ask: async () => grid, probe: async () => false, write: () => Promise.reject() }));
    const calc = {
      readers: ["meno"],
      source,
      results: [{ id: "grids", on: "list", group: "Orbitals", label: "Orbitals", from: "meno", columns: [{ label: "Grid" }], rows: [{ cells: ["1"], surface: { ask: "grid:0" } }, { cells: ["2"], surface: { ask: "grid:1" } }] }],
    };
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 0, y: 0 }, calc: calc as never }] });
    store.getState().openList3d(1, resultKey({ id: "grids", from: "meno" }));
    store.getState().chooseRow3d(1, 0);
    store.getState().setIso3d(1, 0.02);
    const text = workspaceText(store.getState());

    const again = createWorkspaceDocument();
    const other = createEditorStore(again);
    connectStoreToDocument(other, again);
    other.getState().openWorkspace(readWorkspace(text)!, true);
    expect(other.getState().lists3d).toEqual({ 1: { list: resultKey({ id: "grids", from: "meno" }), row: 0, pointed: null, iso: 0.02 } });
    const rows = (other.getState().molecules3d[0].calc!.results![0] as { rows: { surface?: unknown }[] }).rows;
    expect(rows[0].surface).toEqual(grid);
    expect(rows[1].surface).toEqual({ ask: "grid:1" });
    expect(other.getState().molecules3d[0].calc!.source).toEqual(source);
  });

  it("is a file that keeps the outputs its molecules were read from, said to be nowhere else, read again from it when wanted", async () => {
    const text = "a cube's text, opened from /data/run/water.cube";
    const source = await rememberOutput("water.cube", text, "cube", "/data/run/water.cube");
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 0, y: 0 }, calc: { readers: ["meno"], source } as never }] });
    const { bytes } = await workspaceFile(store.getState());
    // (the output in it, once; where it was, no longer said)
    const file = readMenoFile(bytes);
    expect(file.files).toEqual([{ sha256: source.sha256, name: "water.cube", kind: "cube", media: "text/plain", size: new TextEncoder().encode(text).length }]);
    expect(file.workspace).not.toContain("/data/run");
    const json = workspaceOfFile(bytes)!;
    expect(readWorkspace(json)!.drawn.molecules3d![0].calc!.source).toEqual({ name: "water.cube", sha256: source.sha256, kind: "cube" });
    expect((await outputOf(readWorkspace(json)!.drawn.molecules3d![0].calc!.source!))?.text).toBe(text);
    // (one not to be had - held nowhere, not where it was - is not kept, keeps where it was, and is named)
    const gone = { name: "gone.out", sha256: "e".repeat(64), kind: "orca", path: "/data/gone.out" };
    store.getState().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 9, y: 0 }, calc: { readers: ["cclib"], source: gone } as never }] });
    const saved = await workspaceFile(store.getState());
    const both = readMenoFile(saved.bytes);
    expect(both.files.map((f) => f.name)).toEqual(["water.cube"]);
    expect(both.workspace).toContain("/data/gone.out");
    expect(saved.notKept).toEqual(["gone.out"]);
  });

  it("holds an output it keeps only if it is what its SHA-256 says", async () => {
    const { menoFileBytes } = await import("../../../../lib/doc/menoFile");
    const bytes = menoFileBytes('{"format":"meno-workspace","version":1,"atoms":[],"bonds":[]}', [
      { sha256: "f".repeat(64), name: "forged.out", media: "text/plain", data: new TextEncoder().encode("not what it says") },
    ]);
    workspaceOfFile(bytes);
    expect(await heldOutput("f".repeat(64))).toBeUndefined();
  });

  it("keeps its texts - each once, an output's too, where they were said nowhere - and opens with them, its column as it was", async () => {
    const output = "an output's text";
    const source = await rememberOutput("run.out", output, "orca", "/data/run.out");
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 0, y: 0 }, calc: { readers: ["cclib"], source } as never }] });
    store.getState().addTexts([
      { name: "job.inp", text: "! B3LYP def2-SVP\n", path: "/data/job.inp" },
      { name: "run.out", text: output, path: "/data/run.out" },
      { name: "notes.txt", text: "a note" },
    ]);
    store.getState().showText(store.getState().texts[1].id);
    const { bytes } = await workspaceFile(store.getState());
    const file = readMenoFile(bytes);
    // (the output and the text that is its words kept once; no text said to be anywhere)
    expect(file.files.map((f) => f.name)).toEqual(["run.out", "job.inp", "notes.txt"]);
    expect(file.workspace).not.toContain("/data/");
    const saved = readWorkspace(workspaceOfFile(bytes)!)!;
    expect(saved.texts.map((t) => t.name)).toEqual(["job.inp", "run.out", "notes.txt"]);
    expect(saved.textShown).toBe(1);
    const { ws, missing } = await readKept(saved);
    expect(missing).toEqual([]);
    const otherDoc = createWorkspaceDocument();
    const other = createEditorStore(otherDoc);
    connectStoreToDocument(other, otherDoc);
    other.getState().openWorkspace(ws, true);
    expect(otherDoc.history()).toMatchObject({ undoDepth: 0, dirty: false });
    expect(other.getState().texts.map((t) => [t.name, t.text])).toEqual([
      ["job.inp", "! B3LYP def2-SVP\n"],
      ["run.out", output],
      ["notes.txt", "a note"],
    ]);
    expect(other.getState().textShown).toBe(other.getState().texts[1].id);
    expect(other.getState().textsOpen).toBe(true);
    // (its column closed, it opens closed)
    store.getState().closeTexts();
    const closed = readWorkspace(workspaceText(store.getState(), new Set(), ["a", "b", "c"].map((x) => x.repeat(64))))!;
    expect(closed.textShown).toBeUndefined();
  });

  it("opens with a text its file does not hold as one that could not be read - shown, if it was - and says which", async () => {
    const saved = readWorkspace(
      JSON.stringify({ format: "meno-workspace", version: 1, atoms: [], bonds: [], texts: [{ name: "lost.txt", sha256: "d".repeat(64) }, { name: "bad", sha256: "x" }], textShown: 0 }),
    )!;
    // (one not known by a SHA-256 is no text)
    expect(saved.texts).toEqual([{ name: "lost.txt", sha256: "d".repeat(64) }]);
    const { ws, missing } = await readKept(saved);
    expect(missing).toEqual(["lost.txt"]);
    expect(ws.texts.map((t) => [t.name, t.text])).toEqual([["lost.txt", undefined]]);
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().openWorkspace(ws, true);
    expect(store.getState().texts).toEqual([]);
    expect(store.getState().textsLost).toEqual([{ id: 1, name: "lost.txt", sha256: "d".repeat(64) }]);
    expect(store.getState()).toMatchObject({ textShown: 1, textsOpen: true });
  });

  it("is not read where it is not one, or of a version this one does not read", () => {
    expect(readWorkspace("not json")).toBeNull();
    expect(readWorkspace(JSON.stringify({ format: "meno-structure", version: 1, atoms: [], bonds: [] }))).toBeNull();
    expect(readWorkspace(JSON.stringify({ format: "meno-workspace", version: 3, atoms: [], bonds: [] }))).toBeNull();
  });
});

describe("a workspace that does not open", () => {
  it("says why before a tab is made for it - saved by a newer Meno, or none Meno reads - and nothing where it opens", () => {
    const { state } = (() => {
      const doc = createWorkspaceDocument();
      const store = createEditorStore(doc);
      connectStoreToDocument(store, doc);
      return { state: () => store.getState() };
    })();
    state().addCaption("K2CO3, DMF", 0, 0);
    const saved = workspaceText(state());
    expect(workspaceProblem(saved)).toBeNull();
    const newer = JSON.stringify({ ...JSON.parse(saved), version: 3 });
    expect(workspaceProblem(newer)).toBe("it was saved by a newer Meno - update Meno to open it");
    expect(workspaceProblem("{")).toBe("it is not a workspace Meno reads");
    expect(workspaceProblem(JSON.stringify({ format: "something else", version: 1 }))).toBe("it is not a workspace Meno reads");
  });
});

// Null, a number, a string or a list where a workspace's lists hold objects
// threw as it was read - and so as it was asked about, before a tab was made
// for it. Each such thing is put in every list of a workspace that holds one
// of everything, first and last, and in place of every value it has.
describe("a workspace with what is no entry in its lists", () => {
  const STRAYS: unknown[] = [null, 0, 7, "", "C", [], [1, 2], true];
  const job = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const ink = { pen: "pen", strokes: [{ points: [0, 0, 0.5, 1, 1, 0.5] }] };
  const molecule = { ...water3d, made: { method: "ETKDG v3 + MMFF94", how: [{ label: "Optimised", text: "MMFF94" }] } };
  // (a cyclopropane, its ring filled, an electron-pushing arrow on it - and one of everything else a workspace holds)
  const WHOLE = {
    format: "meno-workspace",
    version: 1,
    atoms: [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 0.75, y: 1.3, el: "C" },
    ],
    bonds: [
      { id: 11, a: 1, b: 2, order: 1 },
      { id: 12, a: 2, b: 3, order: 1 },
      { id: 13, a: 3, b: 1, order: 1 },
    ],
    pushes: [{ id: 1, from: { atom: 1 }, to: { bond: 12 } }],
    ringFills: { "1-2-3": "#ff0000" },
    arrows: [{ id: 1, x: 6, y: 0, angle: 0, length: 2, corners: [{ along: 0.5, across: 0.2 }] }],
    pluses: [{ id: 1, x: -3, y: 0 }],
    captions: [{ id: 1, x: 6, y: 1, text: "heat", marks: [{ from: 0, to: 2, bold: true }] }],
    molecules3d: [{ ...molecule, at: { x: 10, y: 0 } }],
    sets: [
      { id: 1, x0: 0, y0: -9, x1: 4, y1: -5 },
      { id: 4, x0: 9, y0: -9, x1: 13, y1: -5, made: { step: 2, exit: "out", holds: "molecules" } },
    ],
    steps: [
      {
        id: 2,
        kind: "optimise",
        x: 8,
        y: -7,
        ran: { at: 1, ok: true, said: "done", input: "in", jobs: [job] },
        runs: [{ at: 1, ok: true, said: "done", input: "in", kind: "optimise", results: { molecules: [molecule], rest: [molecule], holds: "molecules" } }],
        running: { at: 2, input: "in", jobs: [{ id: job, entries: [0], reads: ["run.out"] }] },
      },
    ],
    wires: [{ id: 3, from: { set: 1 }, to: { step: 2, port: "in" } }],
    texts: [{ name: "notes.txt", sha256: "c".repeat(64), at: { x: 0, y: 9 } }],
    pdfs: [{ name: "paper.pdf", sha256: "b".repeat(64), pages: [[612, 792]], x: 20, y: 0, placed: [{ page: 0, x: 30, y: 0 }], inks: [{ ...ink, page: 0 }] }],
    pictures: [{ id: 1, name: "a.png", sha256: "a".repeat(64), media: "image/png", px: [10, 10], x: 0, y: 20, w: 1, h: 1 }],
    slides: [{ id: 1, x: 0, y: 30, w: 16, h: 9 }],
    shapes: [{ id: 1, kind: "rect", x0: 0, y0: 40, x1: 1, y1: 41 }],
    inks: [{ ...ink, id: 1 }],
  };

  type Path = (string | number)[];
  type Node = Record<string | number, unknown>;
  /** Every place in `v` - each list's entries and each object's fields - by its path. */
  const placesIn = (v: unknown, path: Path = []): Path[] =>
    v && typeof v === "object"
      ? Object.entries(v).flatMap(([k, x]) => {
          const here = [...path, Array.isArray(v) ? Number(k) : k];
          return [here, ...placesIn(x, here)];
        })
      : [];
  const valueAt = (path: Path) => path.reduce((o: unknown, k) => (o as Node)[k], WHOLE);
  /** The workspace's JSON with `edit` done to a copy of it at `path`: given what holds the place there, and its key. */
  const edited = (path: Path, edit: (holder: Node, key: string | number) => void) => {
    // (copied through its JSON, as a file holds it: no list in two places)
    const copy = JSON.parse(JSON.stringify(WHOLE));
    edit(path.slice(0, -1).reduce((o: unknown, k) => (o as Node)[k], copy) as Node, path[path.length - 1]);
    return JSON.stringify(copy);
  };
  const lists = placesIn(WHOLE).filter((p) => Array.isArray(valueAt(p)));
  const isEntry = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);

  it("reads, holding one of everything", () => {
    const ws = readWorkspace(JSON.stringify(WHOLE))!;
    const d = ws.drawn;
    expect([d.atoms, d.bonds, d.pushes, d.arrows, d.arrows![0].corners, d.pluses, d.captions, d.captions![0].marks].map((l) => l?.length)).toEqual([3, 3, 1, 1, 1, 1, 1, 1]);
    expect([d.molecules3d, d.molecules3d![0].measures, d.molecules3d![0].made?.how, d.pictures, d.slides, d.shapes, d.inks].map((l) => l?.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(d.ringFills).toEqual({ "1-2-3": "#ff0000" });
    const { sets, steps, wires } = ws.workflow!;
    expect(sets[1].made).toEqual({ step: 2, exit: "out", holds: "molecules" });
    expect([sets, wires, steps[0].ran?.jobs, steps[0].runs, steps[0].runs?.[0].results?.molecules, steps[0].runs?.[0].results?.rest, steps[0].running?.jobs].map((l) => l?.length)).toEqual([2, 1, 1, 1, 1, 1, 1]);
    expect([ws.texts, ws.pdfs, ws.pdfs[0].placed, ws.pdfs[0].inks].map((l) => l?.length)).toEqual([1, 1, 1, 1]);
  });

  it("reads round it in any list of entries, first or last: it is left out, and what reads is read as before - a set's or a run's molecules counted, those it set aside too", () => {
    const whole = readWorkspace(JSON.stringify(WHOLE));
    const entries = lists.filter((p) => (valueAt(p) as unknown[]).every(isEntry));
    expect(entries.length).toBeGreaterThan(30);
    for (const path of entries) {
      const key = path[path.length - 1];
      // (a list of molecules a step gave, kept in a set or with a run: one that does not read there is counted - WorkflowSet.unread)
      const of = path.findIndex((k, i) => k === "collection" || ((k === "molecules" || k === "rest") && path[i - 1] === "results"));
      // (counted where the file counts them: a run's set-aside molecules as `restUnread`)
      const counter = path[of] === "rest" ? "restUnread" : "unread";
      // (as an atom or a bond that does not read: the workspace, or the molecule it is of, does not - one a step gave read as one that is no molecule)
      const expected =
        key !== "atoms" && key !== "bonds"
          ? whole
          : path.length === 1
            ? null
            : of >= 0
              ? readWorkspace(edited(path.slice(0, -1), (holder, k) => ((holder as unknown as unknown[])[k as number] = null)))
              : readWorkspace(edited(path.slice(0, -1), (holder, k) => (holder as unknown as unknown[]).splice(k as number, 1)));
      for (const stray of STRAYS)
        for (const first of [true, false]) {
          const text = edited(path, (holder, k) => {
            const list = holder[k] as unknown[];
            if (first) list.unshift(stray);
            else list.push(stray);
          });
          const read = readWorkspace(text);
          // (one there left out, and counted)
          if (of >= 0 && path.length === of + 1) {
            const holder = ["workflow", ...path.slice(0, of)].reduce((o: unknown, k) => (o as Node)[k], read) as unknown as Record<string, number | undefined>;
            expect(holder[counter], `${path.join(".")} holding ${JSON.stringify(stray)}`).toBe(1);
            delete holder[counter];
          }
          expect(read, `${path.join(".")} holding ${JSON.stringify(stray)}`).toEqual(expected);
          expect(workspaceProblem(text)).toBe(expected ? null : "it is not a workspace Meno reads");
        }
    }
  }, 60_000);

  it("does not open with null for its atom, and says so before a tab is made for it", () => {
    const text = '{"format":"meno-workspace","version":1,"atoms":[null],"bonds":[]}';
    expect(readWorkspace(text)).toBeNull();
    expect(workspaceProblem(text)).toBe("it is not a workspace Meno reads");
  });

  it("is never thrown at by it, anywhere: first or last in a list of any kind, or in place of any value", () => {
    const threw: string[] = [];
    const tryReading = (text: string, said: string) => {
      // (asked as a file is before a tab is made for it - which reads it first)
      try {
        workspaceProblem(text);
      } catch (e) {
        threw.push(`${said}: ${(e as Error).message}`);
      }
    };
    for (const stray of STRAYS) {
      for (const path of lists) {
        tryReading(edited(path, (holder, k) => (holder[k] as unknown[]).unshift(stray)), `${path.join(".")} holding ${JSON.stringify(stray)} first`);
        tryReading(edited(path, (holder, k) => (holder[k] as unknown[]).push(stray)), `${path.join(".")} holding ${JSON.stringify(stray)} last`);
      }
      for (const path of placesIn(WHOLE)) tryReading(edited(path, (holder, k) => (holder[k] = stray)), `${path.join(".")} = ${JSON.stringify(stray)}`);
      tryReading(JSON.stringify(stray), `the whole = ${JSON.stringify(stray)}`);
    }
    expect(threw).toEqual([]);
  }, 60_000);
});

describe("a ring's circle, saved", () => {
  it("is saved only for a ring still drawn: a gone ring's would come back on a ring of new atoms given its atoms' ids", () => {
    const { st } = canvas();
    const ring = [0, 1, 2, 3, 4, 5].map((k) => st().addAtom(Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3), "C"));
    ring.forEach((a, k) => st().addBond(a, ring[(k + 1) % 6], 1));
    const key = [...ring].sort((a, b) => a - b).join("-");
    st().setRingEnabled(key, true);
    // (and one of atoms no longer drawn)
    st().setRingEnabled("901-902-903-904-905-906", true);
    const saved = JSON.parse(workspaceText(st())) as { aromaticRings?: Record<string, boolean> };
    expect(saved.aromaticRings).toEqual({ [key]: true });
  });
});


describe("a workspace's sets, saved (version 2)", () => {
  /** The canvas with a set round the ethanol and the second molecule, and a step's result set round the first, kept out of the file where told. */
  function withSets(keep?: false) {
    const { doc, st } = canvas();
    doc.edit("sets", (d) => {
      let next = addSet(d, { x0: -1, y0: -1, x1: 3, y1: 2 });
      next = { ...next, sets: next.sets!.map((b) => ({ ...b, members: [...b.members!, { molecule: 2 }] })) };
      next = addSet(next, { x0: 9, y0: -1, x1: 11, y1: 1 });
      return { ...next, sets: next.sets!.map((b) => (b.id === 2 ? { ...b, made: { step: 9, exit: "out", holds: "molecules" as const }, ...(keep === false ? { keep } : {}) } : b)) };
    });
    return { doc, st };
  }

  it("keeps each set's members: a structure by its atoms' ids, a molecule by its place - and they open as they were", () => {
    const { st } = withSets();
    const text = workspaceText(st());
    const saved = JSON.parse(text);
    expect(saved.version).toBe(2);
    expect(saved.sets[0].members).toEqual([{ structure: [1, 2, 3] }, { molecule: 1 }]);
    expect(saved.sets[1].members).toEqual([{ molecule: 0 }]);
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().openWorkspace(readWorkspace(text)!, true);
    const s = store.getState();
    expect(s.sets.map((b) => b.members)).toEqual(st().sets.map((b) => b.members));
  });

  it("reads a molecule member by its place among those that read: one that does not read before it shifts it, one it names that does not read is left out", () => {
    const { st } = withSets();
    const saved = JSON.parse(workspaceText(st()));
    saved.molecules3d = [null, ...saved.molecules3d];
    saved.sets[0].members = [{ structure: [1, 2, 3] }, { molecule: 2 }, { molecule: 0 }];
    const ws = readWorkspace(JSON.stringify(saved))!;
    expect(ws.workflow!.sets[0].members).toEqual([{ structure: [1, 2, 3] }, { molecule: 2 }]);
  });

  it("of a result set kept out of the file: its molecules not written, only how many it held and their collection's hash", () => {
    const kept = JSON.parse(workspaceText(withSets().st()));
    const { st } = withSets(false);
    const hash = collectionHash(st(), st().sets[1]);
    const saved = JSON.parse(workspaceText(st()));
    expect(saved.molecules3d).toHaveLength(kept.molecules3d.length - 1);
    expect(saved.sets[1].members).toBeUndefined();
    expect(saved.sets[1].notKept).toEqual({ count: 1, hash });
    // (the other set's molecule by its place among those written)
    expect(saved.sets[0].members).toEqual([{ structure: [1, 2, 3] }, { molecule: 0 }]);
    const ws = readWorkspace(JSON.stringify(saved))!;
    expect(ws.workflow!.sets[1].notKept).toEqual({ count: 1, hash });
  });

  it("of a result set of structures drawn kept out of the file: its structures not written, the page's others written as they are", () => {
    const { doc, st } = canvas();
    // (a second structure, apart from the first: a step's, held by its result set, kept out of the file)
    const n = st().addAtom(20, 0, "N");
    const o = st().addAtom(21.8, 0, "O");
    st().addBond(n, o, 2);
    doc.edit("sets", (d) => {
      const next = addSet(d, { x0: 19, y0: -1, x1: 23, y1: 1 });
      return { ...next, sets: next.sets!.map((b) => ({ ...b, made: { step: 9, exit: "out", holds: "structures" as const }, keep: false as const, members: [{ structure: [n, o] }], put: [n, o] })) };
    });
    const hash = collectionHash(st(), st().sets[0]);
    const saved = JSON.parse(workspaceText(st()));
    expect(saved.atoms.map((a: { el: string }) => a.el)).toEqual(["C", "C", "O"]);
    expect(saved.bonds).toHaveLength(2);
    expect(saved.sets[0].members).toBeUndefined();
    expect(saved.sets[0].notKept).toEqual({ count: 1, hash });
    // (nor which atoms its step put there: not written, their ids could be another's once the file opens and numbering goes on)
    expect(saved.sets[0].put).toBeUndefined();
    // (opened, nothing of it is on the page: the set says how many it held)
    const ws = readWorkspace(JSON.stringify(saved))!;
    expect(ws.drawn.atoms.map((a) => a.el)).toEqual(["C", "C", "O"]);
    expect(ws.workflow!.sets[0].notKept).toEqual({ count: 1, hash });
  });

  it("of a large result set of structures drawn: each written as the set holds it, with what its step said of it - or, kept out of the file, only how many and their hash", () => {
    const { doc, st } = canvas();
    // (51 nitrogen molecules a step gave, numbered: more than are laid out, so held in the set)
    const n2 = (k: number) => ({ atoms: [{ id: 1, el: "N", x: 0, y: 0, r: 0.9 }, { id: 2, el: "N", x: 1.1, y: 0, r: 0.9 }] as never[], bonds: [{ id: 1, a: 1, b: 2, order: 3 }] as never[], record: numberedRecord(k, `R1 = ${k}`) });
    const made = Array.from({ length: 51 }, (_, k) => n2(k + 1));
    doc.edit("sets", (d) => {
      const s = addStep(d, "duplicates", 40, 0);
      return placeResults(s, s.steps![s.steps!.length - 1], { molecules: [], rest: [], holds: "structures", drawn: { made, rest: [] } }, { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }) });
    });
    const at = st().sets.findIndex((b) => b.made?.exit === "out");
    const saved = JSON.parse(workspaceText(st()));
    // (none of them on the page, so none among its atoms)
    expect(saved.atoms.map((a: { el: string }) => a.el)).toEqual(["C", "C", "O"]);
    expect(saved.sets[at].members).toEqual([]);
    expect(saved.sets[at].drawnCollection).toEqual(made);
    const ws = readWorkspace(JSON.stringify(saved))!;
    expect(ws.workflow!.sets[at].drawnCollection).toEqual(made);
    // (kept out of the file: not written, only how many it held and their hash)
    doc.edit("sets", (d) => ({ ...d, sets: d.sets!.map((b, i) => (i === at ? { ...b, keep: false as const } : b)) }));
    const hash = collectionHash(st(), st().sets[at]);
    const unkept = JSON.parse(workspaceText(st()));
    expect(unkept.sets[at].drawnCollection).toBeUndefined();
    expect(unkept.sets[at].notKept).toEqual({ count: 51, hash });
    // (the hash tells what it held apart: one of them another structure, another hash)
    const held = st().sets[at];
    const other = { ...held, drawnCollection: held.drawnCollection!.map((m, k) => (k === 9 ? { ...m, bonds: [{ ...m.bonds[0], order: 2 as const }] } : m)) };
    expect(collectionHash(st(), other)).not.toBe(hash);
  });

  it("of a file of version 1 - sets that did not keep members - are what lies inside each frame as it opens", () => {
    const { st } = withSets();
    const saved = JSON.parse(workspaceText(st()));
    saved.version = 1;
    for (const b of saved.sets) delete b.members;
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().openWorkspace(readWorkspace(JSON.stringify(saved))!, true);
    expect(store.getState().sets[0].members).toEqual([{ structure: [1, 2, 3] }]);
  });
});
