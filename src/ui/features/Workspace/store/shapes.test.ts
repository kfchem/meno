import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument, isBlankDocument, SHAPE_PAD } from "../document";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { centredAt, clipItems, readRecord, recordText } from "../utils/copyPaste";
import { drawingSvg, drawnOf } from "../fileActions";
import { ACS_1996 } from "../../../../lib/chem/style";
import { layoutEmf } from "../../../../lib/chem/emf";
import { drawingLayout } from "../fileActions";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

const BOX = { kind: "rect" as const, x0: 0, y0: 0, x1: 20, y1: 10 };

describe("shapes on the page", () => {
  it("are put down over those before, each one step - a box with no room, or a line with no length, not", () => {
    const { doc, state } = editor();
    const a = state().addShape(BOX);
    const b = state().addShape({ kind: "line", x0: 0, y0: 0, x1: 5, y1: 5 });
    expect(state().shapes.map((s) => s.id)).toEqual([a, b]);
    expect(isBlankDocument(doc.getState())).toBe(false);
    expect(doc.history().undoDepth).toBe(2);
    expect(state().addShape({ ...BOX, x1: 0 })).toBeNull();
    expect(state().addShape({ kind: "line", x0: 1, y0: 1, x1: 1, y1: 1 })).toBeNull();
    expect(state().addShape({ ...BOX, x0: Number.NaN })).toBeNull();
    doc.undo();
    expect(state().shapes.map((s) => s.id)).toEqual([a]);
  });

  it("are made larger, a drag one step; their look changed - regular, plain, one head and no colour being unsaid - and brought over or under the others", () => {
    const { doc, state } = editor();
    const id = state().addShape(BOX)!;
    const other = state().addShape({ ...BOX, x0: 30, x1: 40 })!;
    for (const x1 of [21, 22, 23]) state().updateShape(id, { x1 }, "corner");
    expect(state().shapes[0].x1).toBe(23);
    expect(doc.history().undoDepth).toBe(3);
    // (never to a box with no room)
    state().updateShape(id, { x1: -5 });
    expect(state().shapes[0].x1).toBe(23);
    state().styleShapes([id], { weight: "thick", dash: true });
    expect(state().shapes[0]).toMatchObject({ weight: "thick", dash: true });
    state().styleShapes([id], { weight: "regular", dash: false });
    expect("weight" in state().shapes[0] || "dash" in state().shapes[0]).toBe(false);
    state().colourShapes([id, other], "fill", "#b2d9e4");
    state().colourShapes([id], "stroke", "none");
    expect(state().shapes.map((s) => s.fill)).toEqual(["#b2d9e4", "#b2d9e4"]);
    expect(state().shapes[0].stroke).toBe("none");
    state().colourShapes([id], "fill", null);
    expect("fill" in state().shapes[0]).toBe(false);
    state().orderShapes([id], true);
    expect(state().shapes.map((s) => s.id)).toEqual([other, id]);
    const depth = doc.history().undoDepth;
    // (where it is already: no step)
    state().orderShapes([id], true);
    expect(doc.history().undoDepth).toBe(depth);
    state().orderShapes([id], false);
    expect(state().shapes.map((s) => s.id)).toEqual([id, other]);
  });

  it("hold words about their middles, as wide as they are inside, the words going where the shape goes and with it when it is deleted", () => {
    const { state } = editor();
    const id = state().addShape(BOX)!;
    const words = state().addCaption("Transition state", 10, 5, undefined, undefined, 20 - 2 * SHAPE_PAD, undefined, { shape: id });
    state().updateShape(id, { x1: 40, y1: 20 });
    expect(state().captions[0]).toMatchObject({ id: words, x: 20, y: 10, width: 40 - 2 * SHAPE_PAD, shape: id });
    state().selectShapes([id]);
    state().moveAtoms([], "drag", { shapes: [{ id, x0: 100, y0: 0, x1: 140, y1: 20 }] });
    expect(state().captions[0]).toMatchObject({ x: 120, y: 10 });
    state().deleteSelection();
    expect(state().shapes).toEqual([]);
    expect(state().captions).toEqual([]);
  });

  it("are selected, moved with the rest of the selection, their tails with them, and deleted with it", () => {
    const { state } = editor();
    const a = state().addShape({ kind: "callout", x0: 0, y0: 0, x1: 20, y1: 10, tail: { x: 2, y: -5 } })!;
    const b = state().addShape({ kind: "line", x0: 50, y0: 0, x1: 60, y1: 5 })!;
    state().selectAll();
    expect([...state().selShapes]).toEqual([a, b]);
    state().clearSel();
    expect(state().selShapes.size).toBe(0);
    state().selectShapes([b]);
    state().deleteSelection();
    expect(state().shapes.map((s) => s.id)).toEqual([a]);
    expect(state().selShapes.size).toBe(0);
  });

  it("are copied and pasted, selected, their words in them - in Meno's own record alone", () => {
    const { state } = editor();
    const part = {
      atoms: [],
      bonds: [],
      shapes: [{ id: 7, kind: "callout" as const, x0: 0, y0: 0, x1: 20, y1: 10, tail: { x: 2, y: -6 }, fill: "#ebb3be", weight: "thick" as const }],
      captions: [{ id: 3, x: 10, y: 5, text: "here", width: 18, shape: 7 }],
    };
    expect(clipItems(part).map((i) => i.flavor)).toEqual(["meno"]);
    const back = readRecord(recordText(part))!;
    expect(back.shapes).toEqual(part.shapes);
    expect(back.captions?.[0].shape).toBe(7);
    state().addShape(BOX);
    state().pasteModel(centredAt(back, { x: 100, y: 0 }));
    expect(state().shapes).toHaveLength(2);
    const pasted = state().shapes[1];
    expect(pasted).toMatchObject({ kind: "callout", fill: "#ebb3be", weight: "thick" });
    expect([...state().selShapes]).toEqual([pasted.id]);
    // (its words in it, as it is numbered here)
    expect(state().captions[0].shape).toBe(pasted.id);
    // (what does not read is left out; words in a shape not there, in none)
    const bad = readRecord(
      JSON.stringify({
        format: "meno-structure",
        version: 1,
        atoms: [],
        bonds: [],
        shapes: [
          { id: 1, kind: "star", x0: 0, y0: 0, x1: 1, y1: 1 },
          { id: 2, kind: "rect", x0: 5, y0: 0, x1: 1, y1: 1 },
          { id: 3, kind: "line", x0: 0, y0: 0, x1: 1, y1: 1, fill: "#ffffff", stroke: "red" },
        ],
        captions: [{ id: 1, x: 0, y: 0, text: "a", shape: 9 }],
      }),
    )!;
    expect(bad.shapes).toEqual([{ id: 3, kind: "line", x0: 0, y0: 0, x1: 1, y1: 1 }]);
    expect(bad.captions?.[0].shape).toBeUndefined();
  });

  it("are saved in the workspace's file from the back, with their words, and come back so", () => {
    const { state } = editor();
    const a = state().addShape({ ...BOX, fill: "#b2d9e4" })!;
    const b = state().addShape({ kind: "line", x0: 0, y0: 0, x1: 9, y1: 0, dash: true })!;
    state().orderShapes([b], false);
    state().addCaption("ΔG‡", 10, 5, undefined, undefined, 10, undefined, { shape: a });
    const text = workspaceText(state());
    expect(JSON.parse(text).shapes.map((s: { id: number }) => s.id)).toEqual([b, a]);
    const other = editor();
    other.state().openWorkspace(readWorkspace(text)!, true);
    expect(other.state().shapes.map((s) => s.kind)).toEqual(["line", "rect"]);
    expect(other.state().shapes[0]).toMatchObject({ dash: true });
    expect(other.state().captions[0].shape).toBe(other.state().shapes[1].id);
    expect(other.state().addShape(BOX)).toBe(3);
    // (a shape's arrow, saved before arrows were the page's one Arrow: not read - the rest is)
    const old = JSON.parse(text);
    old.shapes.push({ id: 9, kind: "arrow", x0: 0, y0: 0, x1: 5, y1: 0, heads: 2 });
    const third = editor();
    third.state().openWorkspace(readWorkspace(JSON.stringify(old))!, true);
    expect(third.state().shapes.map((s) => s.kind)).toEqual(["line", "rect"]);
  });

  it("are drawn in pictures under everything else: filled, their lines - dashed in pieces - over that", () => {
    const shapes = [
      { id: 1, ...BOX, fill: "#b2d9e4", stroke: "#cd4560" },
      { id: 2, kind: "line" as const, x0: 0, y0: 20, x1: 10, y1: 20, dash: true as const },
    ];
    const part = { atoms: [], bonds: [], shapes, captions: [{ id: 1, x: 10, y: 5, text: "words", shape: 1 }] };
    const svg = drawingSvg(part, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    expect(svg).toMatch(/<path d="[^"]+" fill="#b2d9e4" stroke="none" \/><path d="[^"]+ Z" fill="none" stroke="#cd4560"/);
    // (the dashed line: several pieces, all before the words)
    const dashes = svg.match(/fill="none" stroke="#000000"/g) ?? [];
    expect(dashes.length).toBeGreaterThan(2);
    expect(svg.indexOf("stroke=\"#cd4560\"")).toBeLessThan(svg.indexOf("<text"));
    const { layout, opts } = drawingLayout(part, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    expect(layout.bounds.min.y).toBeLessThan(0.01);
    expect(layout.bounds.max.y).toBeGreaterThan(20);
    expect(layoutEmf(layout, opts).emf.length).toBeGreaterThan(0);
    expect(drawnOf({ model: { atoms: [], bonds: [] }, arrows: [], pluses: [], captions: [], shapes }).shapes).toEqual(shapes);
  });
});
