import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { DEFAULT_STYLE_CHOICE } from "../../../../lib/chem/style";
import { readTexts, readWorkspace, workspaceFile, workspaceText } from "./workspace";
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
    const bytes = await workspaceFile(store.getState());
    // (the output in it, once; where it was, no longer said)
    const file = readMenoFile(bytes);
    expect(file.files).toEqual([{ sha256: source.sha256, name: "water.cube", kind: "cube", media: "text/plain", size: new TextEncoder().encode(text).length }]);
    expect(file.workspace).not.toContain("/data/run");
    const json = workspaceOfFile(bytes)!;
    expect(readWorkspace(json)!.drawn.molecules3d![0].calc!.source).toEqual({ name: "water.cube", sha256: source.sha256, kind: "cube" });
    expect((await outputOf(readWorkspace(json)!.drawn.molecules3d![0].calc!.source!))?.text).toBe(text);
    // (one not held this session is not kept, and keeps where it was)
    const gone = { name: "gone.out", sha256: "e".repeat(64), kind: "orca", path: "/data/gone.out" };
    store.getState().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 9, y: 0 }, calc: { readers: ["cclib"], source: gone } as never }] });
    const both = readMenoFile(await workspaceFile(store.getState()));
    expect(both.files.map((f) => f.name)).toEqual(["water.cube"]);
    expect(both.workspace).toContain("/data/gone.out");
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
    const bytes = await workspaceFile(store.getState());
    const file = readMenoFile(bytes);
    // (the output and the text that is its words kept once; no text said to be anywhere)
    expect(file.files.map((f) => f.name)).toEqual(["run.out", "job.inp", "notes.txt"]);
    expect(file.workspace).not.toContain("/data/");
    const saved = readWorkspace(workspaceOfFile(bytes)!)!;
    expect(saved.texts.map((t) => t.name)).toEqual(["job.inp", "run.out", "notes.txt"]);
    expect(saved.textShown).toBe(1);
    const { ws, missing } = await readTexts(saved);
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

  it("opens without a text its file does not hold, and says which", async () => {
    const saved = readWorkspace(
      JSON.stringify({ format: "meno-workspace", version: 1, atoms: [], bonds: [], texts: [{ name: "lost.txt", sha256: "d".repeat(64) }, { name: "bad", sha256: "x" }], textShown: 0 }),
    )!;
    // (one not known by a SHA-256 is no text)
    expect(saved.texts).toEqual([{ name: "lost.txt", sha256: "d".repeat(64) }]);
    const { ws, missing } = await readTexts(saved);
    expect(missing).toEqual(["lost.txt"]);
    expect(ws.texts).toEqual([]);
    expect(ws.textShown).toBeUndefined();
  });

  it("is not read where it is not one, or of a version this one does not read", () => {
    expect(readWorkspace("not json")).toBeNull();
    expect(readWorkspace(JSON.stringify({ format: "meno-structure", version: 1, atoms: [], bonds: [] }))).toBeNull();
    expect(readWorkspace(JSON.stringify({ format: "meno-workspace", version: 2, atoms: [], bonds: [] }))).toBeNull();
  });
});
