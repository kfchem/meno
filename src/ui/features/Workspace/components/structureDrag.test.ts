import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import camphor from "../../../../lib/figure/fixtures/camphor-rdkitacs.json";
import aldol from "../../../../lib/figure/fixtures/aldol-rdkitrxn.json";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { PRESS_WIDENED, structureAt, structuresOf, type PageStructure } from "../utils/pageStructures";
import { dragStructure, inRow, movedTo, setStructureSay } from "./structureDrag";
import { marksOn } from "./pdfMarks";

// (the window and the page as the pointer sees them, bare: no canvas under any point)
Object.assign(globalThis, { window: Object.assign(new EventTarget(), { setTimeout, clearTimeout }), document: { elementFromPoint: () => null } });

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().addPdfs([{ name: "paper.pdf", sha256: "a".repeat(64), pages: [[595, 842]] }], { x: 0, y: 0 });
  return store;
}
const screen = { pxPerPoint: 1, at: (_: number, x: number, y: number) => ({ x, y }) };
const [ring] = structuresOf(camphor as unknown as FigureDrawn, 0, "a".repeat(64), 0, []);
const model = (s: PageStructure) => {
  if ("none" in s.read) throw new Error(s.read.none);
  return s.read.model;
};

describe("structures picked from a PDF, in the editor", () => {
  it("are one selection with words selected and a box drawn: picking them lets those go, and those let them go", () => {
    const store = editor();
    const pick = { id: 1, page: 0, figure: [0, 0, 100, 100] as [number, number, number, number], key: "0:0" };
    store.getState().setPdfBox({ id: 1, page: 0, box: [0, 0, 10, 10] });
    store.getState().setPdfStructures({ id: 1, picks: [pick] });
    expect([store.getState().pdfBox, store.getState().pdfStructures?.picks]).toEqual([null, [pick]]);
    store.getState().setPdfSel({ id: 1, anchor: { page: 0, at: 0 }, focus: { page: 0, at: 3 } });
    expect(store.getState().pdfStructures).toBeNull();
  });

  it("not read whole, are not carried: why is said, and nothing lifts off", () => {
    const store = editor();
    const said: string[] = [];
    setStructureSay(store, (w) => void (w && said.push(w)));
    const refused: PageStructure = { ...ring, read: { none: "Part of this structure could not be read (\"x\"), so none of it is taken." } };
    dragStructure(store, { id: 1, sha256: "a".repeat(64) }, 0, refused, { x: 10, y: 10 }, screen);
    expect(said).toEqual(['Part of this structure could not be read ("x"), so none of it is taken.']);
    expect(store.getState().pdfStructureFlight).toBeNull();
  });

  it("read whole, lift off as Meno's own drawing of them, where they lay on the page", () => {
    const store = editor();
    dragStructure(store, { id: 1, sha256: "a".repeat(64) }, 0, ring, { x: ring.box[0] + 1, y: ring.box[1] + 1 }, screen);
    const f = store.getState().pdfStructureFlight!;
    expect(f.svg.startsWith("<svg")).toBe(true);
    expect(f.from).toEqual({ left: ring.box[0], top: ring.box[1], width: ring.box[2] - ring.box[0], height: ring.box[3] - ring.box[1] });
    expect(f.w).toBeGreaterThan(0);
    window.dispatchEvent(Object.assign(new Event("pointerup"), { clientX: 0, clientY: 0 }));
    // (let go off the canvas: back, and nothing put on the page)
    expect(store.getState().pdfStructureFlight?.now.end?.to).toBe("back");
    expect(store.getState().model.atoms).toHaveLength(0);
  });

  it("put down at a point: their middle there", () => {
    const m = movedTo(model(ring), { x: 10, y: -4 });
    const xs = m.atoms.map((a) => a.x);
    const ys = m.atoms.map((a) => a.y);
    const r = model(ring);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(10 + (Math.min(...r.atoms.map((a) => a.x)) + Math.max(...r.atoms.map((a) => a.x))) / 2, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(-4 + (Math.min(...r.atoms.map((a) => a.y)) + Math.max(...r.atoms.map((a) => a.y))) / 2, 6);
  });

  it("several, put on the page together: in a row, each its own atoms and bonds, numbered apart", () => {
    const three = structuresOf(aldol as unknown as FigureDrawn, 0, "a".repeat(64), 0, []).map(model);
    const row = inRow(three, 1.8);
    expect(row.atoms).toHaveLength(three.reduce((n, m) => n + m.atoms.length, 0));
    expect(new Set([...row.atoms.map((a) => a.id), ...row.bonds.map((b) => b.id)]).size).toBe(row.atoms.length + row.bonds.length);
    for (const b of row.bonds) expect(row.atoms.some((a) => a.id === b.a) && row.atoms.some((a) => a.id === b.b)).toBe(true);
  });

  it("are lit along their bonds and over their labels on the page: picked stronger than pointed at", () => {
    const marks = marksOn({ id: 1, sha256: "a".repeat(64) }, 0, null, [], null, () => {}, null, null, { lit: null, picked: [ring] });
    expect(marks).toHaveLength(1);
    expect(marks[0].bars).toHaveLength(ring.bonds.length);
    expect(marks[0].rects).toEqual(ring.labels);
  });
});

describe("a press near a structure, words of its scheme beside it", () => {
  const found = structuresOf(aldol as unknown as FigureDrawn, 0, "a".repeat(64), 0, []);
  const s = found[0];
  const [a, b] = s.bonds[0];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const bond = s.reach * 3;
  // (a point 0.45 of a bond off its bond - a conditions line, words, 0.7 of a bond off on the same side)
  const p = { x: mid.x + n.x * 0.45 * bond, y: mid.y + n.y * 0.45 * bond };
  const words = { segments: [], points: [], boxes: [[mid.x + n.x * 0.7 * bond - 30, mid.y + n.y * 0.7 * bond - 3, mid.x + n.x * 0.7 * bond + 30, mid.y + n.y * 0.7 * bond + 3] as [number, number, number, number]] };

  it("takes the structure, within half a bond of it, before the words: a press, widened", () => {
    expect(structureAt(found, p.x, p.y, words, PRESS_WIDENED)?.key).toBe(s.key);
  });

  it("but the pointer, not pressing, lights it only within a third of a bond", () => {
    expect(structureAt(found, p.x, p.y, words)).toBeNull();
  });
});

