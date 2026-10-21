import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument, isBlankDocument } from "../document";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { centredAt, clipItems, readRecord, recordText } from "../utils/copyPaste";
import { drawingSvg, drawnOf } from "../fileActions";
import { ACS_1996, RSC } from "../../../../lib/chem/style";
import { emfRecords, layoutEmf } from "../../../../lib/chem/emf";
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
    state().styleShapes([id], { width: 2, dash: true });
    expect(state().shapes[0]).toMatchObject({ width: 2, dash: true });
    // (as the bonds again: no width of its own)
    state().styleShapes([id], { width: null, dash: false });
    expect("width" in state().shapes[0] || "dash" in state().shapes[0]).toBe(false);
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

  it("round a rectangle's corners as asked - square again at 0 - one step each", () => {
    const { doc, state } = editor();
    const id = state().addShape(BOX)!;
    const depth = doc.history().undoDepth;
    state().updateShape(id, { radius: 6 });
    expect(state().shapes[0]).toMatchObject({ kind: "rect", radius: 6 });
    expect(doc.history().undoDepth).toBe(depth + 1);
    state().updateShape(id, { radius: 0 });
    expect("radius" in state().shapes[0]).toBe(false);
    // (an ellipse has no corners to round)
    const e = state().addShape({ ...BOX, kind: "ellipse" })!;
    state().updateShape(e, { radius: 6 });
    expect("radius" in state().shapes.find((x) => x.id === e)!).toBe(false);
  });

  it("are selected, moved with the rest of the selection, and deleted with it", () => {
    const { state } = editor();
    const a = state().addShape({ ...BOX, radius: 4 })!;
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

  it("are copied and pasted, selected - in Meno's own record alone", () => {
    const { state } = editor();
    const part = { atoms: [], bonds: [], shapes: [{ id: 7, ...BOX, radius: 5, fill: "#ebb3be", width: 2 }] };
    expect(clipItems(part).map((i) => i.flavor)).toEqual(["meno"]);
    const back = readRecord(recordText(part))!;
    expect(back.shapes).toEqual(part.shapes);
    state().addShape(BOX);
    state().pasteModel(centredAt(back, { x: 100, y: 0 }));
    expect(state().shapes).toHaveLength(2);
    const pasted = state().shapes[1];
    expect(pasted).toMatchObject({ kind: "rect", radius: 5, fill: "#ebb3be", width: 2 });
    expect([...state().selShapes]).toEqual([pasted.id]);
    // (what does not read is left out)
    const bad = readRecord(
      JSON.stringify({
        format: "meno-structure",
        version: 1,
        atoms: [],
        bonds: [],
        shapes: [
          { id: 1, kind: "star", x0: 0, y0: 0, x1: 1, y1: 1 },
          { id: 2, kind: "rect", x0: 5, y0: 0, x1: 1, y1: 1 },
          { id: 3, kind: "line", x0: 0, y0: 0, x1: 1, y1: 1, fill: "#ffffff", stroke: "red", radius: 3 },
        ],
      }),
    )!;
    expect(bad.shapes).toEqual([{ id: 3, kind: "line", x0: 0, y0: 0, x1: 1, y1: 1 }]);
  });

  it("are saved in the workspace's file from the back, and come back so", () => {
    const { state } = editor();
    const a = state().addShape({ ...BOX, fill: "#b2d9e4", radius: 3 })!;
    const b = state().addShape({ kind: "line", x0: 0, y0: 0, x1: 9, y1: 0, dash: true })!;
    state().orderShapes([b], false);
    const text = workspaceText(state());
    expect(JSON.parse(text).shapes.map((s: { id: number }) => s.id)).toEqual([b, a]);
    const other = editor();
    other.state().openWorkspace(readWorkspace(text)!, true);
    expect(other.state().shapes.map((s) => s.kind)).toEqual(["line", "rect"]);
    expect(other.state().shapes[0]).toMatchObject({ dash: true });
    expect(other.state().shapes[1]).toMatchObject({ radius: 3 });
    expect(other.state().addShape(BOX)).toBe(3);
    // (a shape's arrow, saved before arrows were the page's one Arrow: not read - the rest is)
    const old = JSON.parse(text);
    old.shapes.push({ id: 9, kind: "arrow", x0: 0, y0: 0, x1: 5, y1: 0, heads: 2 });
    const third = editor();
    third.state().openWorkspace(readWorkspace(JSON.stringify(old))!, true);
    expect(third.state().shapes.map((s) => s.kind)).toEqual(["line", "rect"]);
  });

  it("saved before 2026-10-19 open as a shape is now: a rounded rectangle and a callout a rectangle with those corners, its tail let go, and words written in a shape words on the page where they were", () => {
    const { state } = editor();
    const text = JSON.parse(workspaceText(state()));
    text.shapes = [
      { id: 1, kind: "rounded", x0: 0, y0: 0, x1: 20, y1: 10, weight: "thick" },
      { id: 2, kind: "callout", x0: 30, y0: 0, x1: 50, y1: 10, tail: { x: 32, y: -5 }, fill: "#b2d9e4", weight: "thin" },
      { id: 3, kind: "rounded", x0: 0, y0: 20, x1: 2, y1: 21 },
    ];
    text.captions = [
      { id: 1, x: 10, y: 5, text: "in it", width: 18, shape: 1 },
      { id: 2, x: 80, y: 5, text: "beside it" },
    ];
    const other = editor();
    other.state().openWorkspace(readWorkspace(JSON.stringify(text))!, true);
    const shapes = other.state().shapes;
    expect(shapes.map((s) => s.kind)).toEqual(["rect", "rect", "rect"]);
    // (in ACS 1996's style - a point 0.125 units - as rounded as they were drawn: 9 points, or 18% of a small box's shorter side)
    expect(shapes[0].radius).toBeCloseTo(9);
    expect(shapes[1]).toMatchObject({ fill: "#b2d9e4" });
    expect("tail" in shapes[1]).toBe(false);
    expect(shapes[2].radius).toBeCloseTo((1 * 0.18) / 0.125);
    // (its line's weight a width of its own, in points - thick 2, thin 0.6 - and regular as the bonds')
    expect(shapes.map((x) => x.width)).toEqual([2, 0.6, undefined]);
    // (nothing written is lost: the words as they were - where, as wide - no longer the shape's)
    expect(other.state().captions.map((c) => c.text)).toEqual(["in it", "beside it"]);
    expect(other.state().captions[0]).toEqual({ id: 1, x: 10, y: 5, text: "in it", width: 18 });
  });

  it("are drawn in pictures under everything else: filled, their lines - dashed in pieces - over that", () => {
    const shapes = [
      { id: 1, ...BOX, fill: "#b2d9e4", stroke: "#cd4560" },
      { id: 2, kind: "line" as const, x0: 0, y0: 20, x1: 10, y1: 20, dash: true as const },
    ];
    const part = { atoms: [], bonds: [], shapes, captions: [{ id: 1, x: 10, y: 5, text: "words" }] };
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

  it("draw their lines in pictures as wide as the drawing's bonds - in the style it is drawn in - or as wide as their own", () => {
    const part = { atoms: [], bonds: [], shapes: [{ id: 1, ...BOX }, { id: 2, ...BOX, x0: 30, x1: 50, width: 2 }] };
    for (const style of [ACS_1996, RSC]) {
      const { layout, opts } = drawingLayout(part, { aromaticEnabled: false, aromaticRings: {} }, style);
      const [asBonds, own] = layout.shapes!.map((s) => s.lines[0].width / opts.pointPx!);
      expect(asBonds).toBeCloseTo(opts.lineWidthPx / opts.pointPx!, 9);
      expect(own).toBeCloseTo(2, 9);
    }
    // (0.6 points in ACS 1996's style, 0.45 in RSC's)
    const acs = drawingLayout(part, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    const rsc = drawingLayout(part, { aromaticEnabled: false, aromaticRings: {} }, RSC);
    expect(acs.layout.shapes![0].lines[0].width / acs.opts.pointPx!).toBeCloseTo(0.6, 6);
    expect(rsc.layout.shapes![0].lines[0].width / rsc.opts.pointPx!).toBeCloseTo(0.45, 6);
  });

  it("draw an ellipse in pictures as the curve it is - its line and its fill - smooth however far enlarged", () => {
    const ellipse = { id: 1, kind: "ellipse" as const, x0: 0, y0: 0, x1: 20, y1: 10, fill: "#b2d9e4" };
    const part = { atoms: [], bonds: [], shapes: [ellipse] };
    const svg = drawingSvg(part, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    // (its fill and its line, each a path of four cubic curves, closed)
    const curved = svg.match(/<path d="M[^"]*(C[^"]*){4}Z"/g) ?? [];
    expect(curved).toHaveLength(2);
    const { layout, opts } = drawingLayout(part, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    // (in EMF, the line as a PolyBezier - and the dashed one's as before, in pieces)
    expect(emfRecords(layoutEmf(layout, opts).emf)!.filter((r) => r.type === 2)).toHaveLength(1);
    const dashed = drawingLayout({ ...part, shapes: [{ ...ellipse, dash: true as const }] }, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    expect(emfRecords(layoutEmf(dashed.layout, dashed.opts).emf)!.filter((r) => r.type === 2)).toHaveLength(0);
  });
});
