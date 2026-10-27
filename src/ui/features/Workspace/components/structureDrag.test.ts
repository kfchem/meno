import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import camphor from "../../../../lib/figure/fixtures/camphor-rdkitacs.json";
import aldol from "../../../../lib/figure/fixtures/aldol-rdkitrxn.json";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { PRESS_WIDENED, structureAt, structuresOf, type PageStructure } from "../utils/pageStructures";
import { dragStructure, inRow, movedTo, picksAfter, setStructureSay, togglesPick } from "./structureDrag";
import { setCanvasPlace } from "./wordsDrag";
import { pdfRoom } from "../../../../lib/pdf/layout";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { marksOn, shadesNow } from "./pdfMarks";
import { PICKED_POINTED_SHADE, POINTED_SHADE, SELECTION_SHADE } from "./selectionShade";

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
  it("put down on the canvas at any zoom, come in at the style's bond length, at their true size: none shown magnified", () => {
    const canvas = {} as HTMLElement;
    const doc = globalThis.document as unknown as { elementFromPoint: (x: number, y: number) => unknown };
    const was = doc.elementFromPoint;
    doc.elementFromPoint = () => canvas;
    try {
      for (const px of [2, 10, 37.5]) {
        const store = editor();
        // (the canvas under every point of the window, `px` pixels to a unit of the page, far from the PDF)
        setCanvasPlace(store, { canvas: () => canvas, worldAt: (x, y) => ({ x: 1000 + x / px, y: 1000 - y / px }) });
        dragStructure(store, { id: 1, sha256: "a".repeat(64) }, 0, ring, { x: ring.box[0] + 1, y: ring.box[1] + 1 }, { ...screen, pxPerPoint: px / 4 });
        window.dispatchEvent(Object.assign(new Event("pointerup"), { clientX: 50, clientY: 50 }));
        const { atoms, bonds } = store.getState().model;
        expect(atoms.length).toBe(model(ring).atoms.length);
        const at = new Map(atoms.map((a) => [a.id, a]));
        const lengths = bonds.map((b) => Math.hypot(at.get(b.a)!.x - at.get(b.b)!.x, at.get(b.a)!.y - at.get(b.b)!.y)).sort((a, b) => a - b);
        expect(lengths[Math.floor(lengths.length / 2)]).toBeCloseTo(NOMINAL_BOND_LENGTH, 4);
        expect(atoms.filter((a) => a.magnified != null)).toEqual([]);
      }
    } finally {
      doc.elementFromPoint = was;
    }
  });

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

  it("pressed, moved and let go on the canvas beside the PDF they came from, are put down - whichever PDF was hovered last, as the column, laid over where that PDF was double-clicked open, leaves it said", () => {
    const store = editor();
    // (the canvas under every point of the window, ten pixels to a unit of the page, y up)
    const canvas = {} as HTMLElement;
    const doc = globalThis.document as unknown as { elementFromPoint: (x: number, y: number) => unknown };
    const was = doc.elementFromPoint;
    doc.elementFromPoint = () => canvas;
    setCanvasPlace(store, { canvas: () => canvas, worldAt: (x, y) => ({ x: x / 10, y: -y / 10 }) });
    try {
      store.getState().setHoveredPdf(1);
      const room = pdfRoom(store.getState().pdfs[0]);
      const carry = (x: number, y: number) => {
        dragStructure(store, { id: 1, sha256: "a".repeat(64) }, 0, ring, { x: ring.box[0] + 1, y: ring.box[1] + 1 }, screen);
        window.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: x / 2, clientY: y / 2 }));
        window.dispatchEvent(Object.assign(new Event("pointerup"), { clientX: x, clientY: y }));
        return store.getState().pdfStructureFlight?.now.end?.to;
      };
      // (let go a few units past the PDF's right: put down there)
      expect(carry((room.x1 + 5) * 10, -((room.y0 + room.y1) / 2) * 10)).toBe("page");
      expect(store.getState().model.atoms.length).toBeGreaterThan(0);
      // (let go on the PDF itself: back, nothing more put down)
      const atoms = store.getState().model.atoms.length;
      expect(carry(((room.x0 + room.x1) / 2) * 10, -((room.y0 + room.y1) / 2) * 10)).toBe("back");
      expect(store.getState().model.atoms.length).toBe(atoms);
    } finally {
      doc.elementFromPoint = was;
      setCanvasPlace(store, null);
    }
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

  it("are shaded on the page as the canvas shades a selection - a disc on each atom, a band along each bond - each in its own shade once it has come: pointed at, picked, both", () => {
    const pdf = { id: 1, sha256: "a".repeat(64) };
    const [picked] = marksOn(pdf, 0, null, [], null, () => {}, null, null, { lit: null, picked: [ring] });
    expect(picked.shade).toEqual({ atoms: ring.atoms, bonds: ring.bonds, bond: ring.reach * 3 });
    const done = (wanted: (readonly [PageStructure, string])[], page: string) => {
      shadesNow(page, wanted, 0);
      return shadesNow(page, wanted, 1000).map((x) => x.color.hex);
    };
    expect(done([[ring, SELECTION_SHADE]], "p1")).toEqual([SELECTION_SHADE]);
    expect(done([[ring, POINTED_SHADE]], "p2")).toEqual([POINTED_SHADE]);
    expect(done([[ring, PICKED_POINTED_SHADE]], "p3")).toEqual([PICKED_POINTED_SHADE]);
  });

  it("come into their shade and go out of it over a moment, eased - never at once", () => {
    const at = (t: number, wanted: (readonly [PageStructure, string])[]) => shadesNow("p9", wanted, t);
    const on = [[ring, SELECTION_SHADE] as const];
    expect(at(0, on)[0].color).toEqual({ hex: "#ffffff", moving: true });
    const mid = at(60, on)[0].color;
    expect([mid.hex !== "#ffffff", mid.hex !== SELECTION_SHADE, mid.moving]).toEqual([true, true, true]);
    expect(at(200, on)[0].color).toEqual({ hex: SELECTION_SHADE, moving: false });
    // (let go: going out from where it was, then gone)
    expect(at(200, [])[0].color.moving).toBe(true);
    expect(at(260, [])[0].color.hex).not.toBe(SELECTION_SHADE);
    expect(at(400, [])).toEqual([]);
  });
});

describe("a click on a structure of a PDF", () => {
  const key = (k: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }>) => ({ shiftKey: false, ctrlKey: false, metaKey: false, ...k });
  const a = { id: 1, page: 0, figure: [0, 0, 1, 1] as [number, number, number, number], key: "0:0" };
  const b = { ...a, key: "0:1" };

  it("adds it to those picked or takes it out with ⌘ or Shift on a Mac, with Ctrl or Shift elsewhere - as everywhere in Meno, structures having no range", () => {
    expect([key({ metaKey: true }), key({ shiftKey: true }), key({ ctrlKey: true }), key({})].map((e) => togglesPick(e, true))).toEqual([true, true, false, false]);
    expect([key({ ctrlKey: true }), key({ shiftKey: true }), key({ metaKey: true }), key({})].map((e) => togglesPick(e, false))).toEqual([true, true, false, false]);
  });

  it("toggling: added, and clicked again, taken out; else picked alone", () => {
    expect(picksAfter([a], b, true)).toEqual([a, b]);
    expect(picksAfter([a, b], a, true)).toEqual([b]);
    expect(picksAfter([a, b], b, false)).toEqual([b]);
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

