import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument, isBlankDocument } from "../document";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { centredAt, clipItems, readRecord, recordText } from "../utils/copyPaste";
import { drawingLayout, drawingSvg } from "../fileActions";
import { layoutEmf } from "../../../../lib/chem/emf";
import { ACS_1996 } from "../../../../lib/chem/style";
import type { InkLook } from "./types";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

const PEN: InkLook = { pen: "pen", width: 1 };
const stroke = (x: number) => ({ points: [x, 0, 0.5, x + 1, 1, 0.5, x + 2, 0, 0.5] });

describe("writing by hand on the page", () => {
  it("is kept a stroke at a time, each one step, a stroke joining the piece before it where asked and in the same pen", () => {
    const { doc, state } = editor();
    const a = state().writeStroke(PEN, stroke(0));
    expect(a).toBe(1);
    expect(isBlankDocument(doc.getState())).toBe(false);
    expect(state().writeStroke(PEN, stroke(3), a)).toBe(a);
    expect(state().inks[0].strokes).toHaveLength(2);
    // (in another pen: a piece of its own, though asked to join)
    expect(state().writeStroke({ pen: "marker", width: 1 }, stroke(6), a)).toBe(2);
    expect(doc.history().undoDepth).toBe(3);
    doc.undo();
    expect(state().inks).toHaveLength(1);
    // (nothing to write: no step)
    expect(state().writeStroke(PEN, { points: [] })).toBeNull();
  });

  it("is rubbed out a stroke at a time, one step for a rub - a piece left with none, gone", () => {
    const { doc, state } = editor();
    const a = state().writeStroke(PEN, stroke(0))!;
    state().writeStroke(PEN, stroke(3), a);
    const depth = doc.history().undoDepth;
    state().eraseStrokes([{ id: a, index: 0 }], "rub");
    state().eraseStrokes([{ id: a, index: 0 }], "rub");
    expect(state().inks).toEqual([]);
    expect(doc.history().undoDepth).toBe(depth + 1);
  });

  it("on a slide, is taken by its Select what is on it - a piece by its middle - and not off it", () => {
    const { state } = editor();
    const slide = state().addSlide({ x: 0, y: 0, w: 32, h: 18 })!;
    const on = state().writeStroke(PEN, stroke(0))!;
    const off = state().writeStroke({ pen: "marker", width: 1 }, stroke(40))!;
    state().selectOnSlide(slide);
    expect([...state().selInks]).toEqual([on]);
    expect(state().selInks.has(off)).toBe(false);
    // (a piece an undo took away: no selection)
    state().clearSel();
    state().removeInk(off);
    state().selectInks([off]);
    expect(state().selInks.size).toBe(0);
  });

  it("is coloured, selected, moved and deleted with the rest of the selection", () => {
    const { state } = editor();
    const a = state().writeStroke(PEN, stroke(0))!;
    state().colourInks([a], "#cd4560");
    expect(state().inks[0].color).toBe("#cd4560");
    state().colourInks([a], null);
    expect("color" in state().inks[0]).toBe(false);
    state().selectAll();
    expect([...state().selInks]).toEqual([a]);
    state().moveAtoms([], "drag", { inks: [{ id: a, strokes: [stroke(10)] }] });
    expect(state().inks[0].strokes[0].points[0]).toBe(10);
    state().deleteSelection();
    expect(state().inks).toEqual([]);
  });

  it("is copied and pasted, each piece whole and selected, in Meno's own record alone - what does not read left out", () => {
    const { state } = editor();
    const part = { atoms: [], bonds: [], inks: [{ id: 4, pen: "marker" as const, width: 2 as const, color: "#b2d9e4", strokes: [{ points: [0, 0, 0.3, 1, 1, 0.8], pressure: true as const }] }] };
    expect(clipItems(part).map((i) => i.flavor)).toEqual(["meno"]);
    const back = readRecord(recordText(part))!;
    expect(back.inks).toEqual(part.inks);
    state().pasteModel(centredAt(back, { x: 50, y: 0 }));
    expect(state().inks).toHaveLength(1);
    expect(state().inks[0].strokes[0].points[0]).toBeCloseTo(49.5);
    expect([...state().selInks]).toEqual([state().inks[0].id]);
    const bad = readRecord(JSON.stringify({ format: "meno-structure", version: 1, atoms: [], bonds: [], inks: [{ id: 1, pen: "brush", strokes: [{ points: [0, 0, 1] }] }, { id: 2, pen: "pen", strokes: [{ points: [0, 0] }] }] }))!;
    expect(bad.inks).toBeUndefined();
  });

  it("is saved in the workspace's file, and comes back so", () => {
    const { state } = editor();
    state().writeStroke(PEN, stroke(0));
    state().writeStroke({ pen: "marker", width: 0, color: "#ebb3be" }, stroke(5));
    const text = workspaceText(state());
    const other = editor();
    other.state().openWorkspace(readWorkspace(text)!, true);
    expect(other.state().inks.map((k) => k.pen)).toEqual(["pen", "marker"]);
    expect(other.state().inks[1].color).toBe("#ebb3be");
    expect(other.state().writeStroke(PEN, stroke(9))).toBe(3);
  });

  it("is drawn in pictures: a marker's see-through under the drawing, a pen's over everything", () => {
    const part = {
      atoms: [],
      bonds: [],
      captions: [{ id: 1, x: 0, y: 3, text: "words" }],
      inks: [
        { id: 1, pen: "marker" as const, width: 1 as const, strokes: [stroke(0)] },
        { id: 2, pen: "pen" as const, width: 1 as const, color: "#cd4560", strokes: [stroke(0)] },
      ],
    };
    const svg = drawingSvg(part, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    const marker = svg.indexOf('fill-opacity="0.38"');
    const pen = svg.indexOf('fill="#cd4560"');
    expect(marker).toBeGreaterThan(0);
    expect(marker).toBeLessThan(svg.indexOf("<text"));
    expect(pen).toBeGreaterThan(svg.lastIndexOf("</text>"));
    const { layout, opts } = drawingLayout(part, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    expect(layout.inks).toHaveLength(2);
    expect(layoutEmf(layout, opts).emf.length).toBeGreaterThan(0);
  });

  it("is kept on a PDF's page in its points, a stroke at a time, rubbed out there, and saved and read back with the PDF", () => {
    const { doc, state } = editor();
    doc.edit("add pdf", (d) => ({ ...d, pdfs: [{ id: 1, name: "a.pdf", sha256: "a".repeat(64), pages: [[612, 792], [612, 792]], x: 0, y: 0, page: 0 }], nextPdfId: 2 }));
    expect(state().writePdfStroke(1, 0, PEN, stroke(10))).toBe(0);
    expect(state().writePdfStroke(1, 0, PEN, stroke(20), 0)).toBe(0);
    // (on another page: a piece of its own, though asked to join)
    expect(state().writePdfStroke(1, 1, PEN, stroke(30), 0)).toBe(1);
    // (a page it has not: nothing)
    expect(state().writePdfStroke(1, 5, PEN, stroke(30))).toBeNull();
    expect(state().pdfs[0].inks?.map((k) => [k.page, k.strokes.length])).toEqual([
      [0, 2],
      [1, 1],
    ]);
    const text = workspaceText(state());
    const back = readWorkspace(text)!;
    expect(back.pdfs[0].inks?.[0].strokes).toHaveLength(2);
    state().erasePdfStrokes([{ pdf: 1, piece: 1, index: 0 }], "rub");
    expect(state().pdfs[0].inks?.map((k) => k.page)).toEqual([0]);
  });

  it("over a slide in a talk, is the view's alone and goes as the slide does", () => {
    const { doc, state } = editor();
    state().addSlide({ x: 0, y: 0, w: 32, h: 18 });
    state().addSlide({ x: 50, y: 0, w: 32, h: 18 });
    // (the pen's card, open as the talk begins, is closed)
    state().setInkMode({ tool: "pen", color: null, width: 1 });
    state().present(0);
    expect(state().inkMode).toBeNull();
    const depth = doc.history().undoDepth;
    state().writeTalkStroke(PEN, stroke(0));
    state().writeTalkStroke(PEN, stroke(5));
    expect(state().talkInk).toHaveLength(2);
    expect(doc.history().undoDepth).toBe(depth);
    state().eraseTalkStrokes([0]);
    expect(state().talkInk).toHaveLength(1);
    state().presentAt(1);
    expect(state().talkInk).toEqual([]);
    state().writeTalkStroke(PEN, stroke(0));
    state().endPresenting();
    expect(state().talkInk).toEqual([]);
  });
});
