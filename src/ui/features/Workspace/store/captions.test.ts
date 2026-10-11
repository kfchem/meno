import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { selectedOf } from "./slices/selectionSlice";
import { createWorkspaceDocument, isBlankDocument } from "../document";
import { centredAt, readRecord, recordText, schemeAmong } from "../utils/copyPaste";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { drawingSvg, drawnOf } from "../fileActions";
import { ACS_1996 } from "../../../../lib/chem/style";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("words on the page", () => {
  it("are added, written anew, moved and deleted, each one step", () => {
    const { doc, state } = editor();
    const id = state().addCaption("K2CO3, DMF", 1, 2);
    expect(state().captions).toEqual([{ id, x: 1, y: 2, text: "K2CO3, DMF" }]);
    expect(isBlankDocument(doc.getState())).toBe(false);
    state().updateCaption(id, { text: "K2CO3, DMF, 60 °C" });
    for (const x of [2, 3, 4]) state().updateCaption(id, { x, y: 2 }, "drag");
    expect(state().captions[0]).toMatchObject({ x: 4, text: "K2CO3, DMF, 60 °C" });
    expect(doc.history().undoDepth).toBe(3);
    doc.undo();
    expect(state().captions[0].x).toBe(1);
    state().removeCaption(id);
    expect(state().captions).toEqual([]);
    doc.undo();
    expect(state().captions).toHaveLength(1);
  });

  it("are made wider or narrower, a drag one step - saved, read back and drawn so - and as wide as their words again", () => {
    const { doc, state } = editor();
    const id = state().addCaption("The rotational barrier of the hydroxyl group was found to be small.", 0, 0);
    for (const width of [20, 15, 10]) state().updateCaption(id, { width, x: width / 2 }, "resize");
    expect(state().captions[0]).toMatchObject({ width: 10, x: 5 });
    expect(doc.history().undoDepth).toBe(2);
    expect(doc.history().undoLabel).toBe("resize text");
    const ws = readWorkspace(workspaceText(state()));
    expect(ws?.drawn.captions?.[0]).toMatchObject({ width: 10 });
    // (drawn broken into lines: more than one)
    const svg = drawingSvg(drawnOf(state()), { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    expect((svg.match(/<text/g) ?? []).length).toBeGreaterThan(1);
    // (laid to the left, or spread: one step each; centred again, as none)
    state().updateCaption(id, { align: "justify" });
    expect(doc.history().undoLabel).toBe("align text");
    expect(readWorkspace(workspaceText(state()))?.drawn.captions?.[0]).toMatchObject({ align: "justify" });
    state().updateCaption(id, { align: "center" });
    expect(state().captions[0].align).toBeUndefined();
    state().updateCaption(id, { width: null });
    expect(state().captions[0].width).toBeUndefined();
    // (none, or one not a width: as wide as its words)
    state().updateCaption(id, { width: -3 });
    expect(state().captions[0].width).toBeUndefined();
  });

  it("over an arrow go where it goes - moved, reshaped, with a selection - and stay where they are when it goes", () => {
    const { state } = editor();
    const arrow = state().addArrow(0, 0);
    const over = state().addCaption("Pd(PPh3)4", 0, 1, arrow);
    const free = state().addCaption("note", 9, 9);
    state().updateArrow(arrow, { x: 2, y: -1 });
    expect(state().captions.find((c) => c.id === over)).toMatchObject({ x: 2, y: 0, arrow });
    expect(state().captions.find((c) => c.id === free)).toMatchObject({ x: 9, y: 9 });
    // (moved with atoms, as a drag of a selection moves an arrow among it)
    state().moveAtoms([], "drag", { arrows: [{ id: arrow, x: 3, y: -1 }] });
    expect(state().captions.find((c) => c.id === over)).toMatchObject({ x: 3, y: 0 });
    // (moved itself as well: where it is put, not twice as far)
    state().moveAtoms([], "drag2", { arrows: [{ id: arrow, x: 4, y: -1 }], captions: [{ id: over, x: 4, y: 0 }] });
    expect(state().captions.find((c) => c.id === over)).toMatchObject({ x: 4, y: 0 });
    // (taken from it by being moved away)
    state().updateCaption(over, { x: 5, y: 5, arrow: null });
    expect(state().captions.find((c) => c.id === over)!.arrow).toBeUndefined();
    state().updateCaption(over, { x: 4, y: 0, arrow });
    state().removeArrow(arrow);
    expect(state().captions.find((c) => c.id === over)).toEqual({ id: over, x: 4, y: 0, text: "Pd(PPh3)4" });
  });

  it("go with a selection among them - over an arrow that is among it too - and are copied, pasted and saved with it", () => {
    const { state } = editor();
    const a = state().addAtom(0, 0, "C");
    const b = state().addAtom(10, 0, "C");
    const arrow = state().addArrow(5, 0, 0, 4);
    const over = state().addCaption("hv", 5, 1, arrow);
    const far = state().addCaption("far away", 30, 30);
    const drawn = drawnOf(state());
    const among = schemeAmong(drawn, new Set([a, b]));
    expect(among.captions.map((c) => c.id)).toEqual([over]);
    expect(among.captions.map((c) => c.id)).not.toContain(far);
    // (a copy's record keeps them, over their arrow)
    const record = readRecord(recordText({ ...drawn, captions: among.captions, arrows: among.arrows }))!;
    expect(record.captions).toEqual([{ id: over, x: 5, y: 1, text: "hv", arrow }]);
    // (pasted, over the arrow pasted with them, as it is numbered there)
    const other = editor();
    other.state().addArrow(50, 50);
    other.state().pasteModel(centredAt({ ...record, atoms: drawn.atoms, bonds: [] }, { x: 0, y: 0 }));
    const pasted = other.state().captions;
    expect(pasted).toHaveLength(1);
    expect(pasted[0].arrow).toBe(other.state().arrows[1].id);
    expect(pasted[0].x).toBeCloseTo(other.state().arrows[1].x);
    // (a workspace keeps them all)
    const ws = readWorkspace(workspaceText({ ...state(), turns3d: {}, frames3d: {}, lists3d: {} }))!;
    expect(ws.drawn.captions?.map((c) => c.text)).toEqual(["hv", "far away"]);
    // (deleted with the selection: those among it - not those away from it)
    state().setSel({ atoms: new Set([a, b]), bonds: new Set() });
    state().deleteSelection();
    expect(state().captions.map((c) => c.id)).toEqual([far]);
  });

  it("are selected each as one thing - by Select all too - and deleted and pasted as the selection is", () => {
    const { doc, state } = editor();
    const a = state().addAtom(0, 0, "C");
    const one = state().addCaption("one", 30, 30);
    const two = state().addCaption("two", -30, 30);
    state().selectCaptions([one]);
    expect([...state().selCaptions]).toEqual([one]);
    // (words alone selected are a selection: the keys act on it, a right-click on empty space opens its menu)
    expect(selectedOf(state())).toEqual({ any: true, drawing: false });
    // (Select all takes every word on the page; nothing selected, none)
    state().selectAll();
    expect([...state().selCaptions].sort()).toEqual([one, two]);
    state().clearSel();
    expect(state().selCaptions.size).toBe(0);
    // (words alone pasted: added - numbered on - and selected)
    const other = editor();
    other.state().pasteModel({ atoms: [], bonds: [], captions: [{ id: 7, x: 0, y: 0, text: "pasted" }] });
    expect(other.state().captions.map((c) => c.text)).toEqual(["pasted"]);
    expect([...other.state().selCaptions]).toEqual([other.state().captions[0].id]);
    // (deleted as the selection is, the structure left)
    state().selectCaptions([one]);
    state().deleteSelection();
    expect(state().captions.map((c) => c.id)).toEqual([two]);
    expect(state().model.atoms.map((x) => x.id)).toEqual([a]);
    // (undone: back)
    doc.undo();
    expect(state().captions.map((c) => c.id).sort()).toEqual([one, two]);
    // (deleted on their own: no longer selected)
    state().selectCaptions([two]);
    state().removeCaption(two);
    expect(state().selCaptions.size).toBe(0);
  });

  it("written, are drawn in place of their own until kept or let go, and their own again once those are drawn", () => {
    const { state } = editor();
    const id = state().addCaption("one", 0, 0);
    // (each writing its own number)
    state().setCaptionEdit({ id, at: { x: 0, y: 0 } });
    const n = state().captionEdit!.n!;
    expect(n).toBeGreaterThan(0);
    expect(state().captionEdit!.drawn).toBeFalsy();
    // (what is written drawn: the caption's own no longer)
    state().markCaptionDrawn(n);
    expect(state().captionEdit!.drawn).toBe(true);
    // (another's word on it changes nothing)
    state().markCaptionDrawn(n + 1);
    state().leaveCaptionEdit(n + 1, id);
    expect(state().captionEdit?.n).toBe(n);
    // (kept: drawn as written until the caption's own are)
    state().leaveCaptionEdit(n, id);
    expect(state().captionEdit).toBeNull();
    expect(state().captionLeft).toEqual({ id, n, at: { x: 0, y: 0 } });
    // (another opened meanwhile: both drawn, each as it is)
    state().setCaptionEdit({ id: null, at: { x: 5, y: 5 } });
    expect(state().captionEdit!.n).toBeGreaterThan(n);
    expect(state().captionLeft?.id).toBe(id);
    state().captionShown(id + 1);
    expect(state().captionLeft?.id).toBe(id);
    state().captionShown(id);
    expect(state().captionLeft).toBeNull();
    // (new words let go: nothing to hand back)
    const m = state().captionEdit!.n!;
    state().leaveCaptionEdit(m, null);
    expect(state().captionEdit).toBeNull();
    expect(state().captionLeft).toBeNull();
  });

  it("are read only as words, over an arrow that is there", () => {
    const read = readRecord(
      JSON.stringify({
        format: "meno-structure",
        version: 1,
        atoms: [],
        bonds: [],
        arrows: [{ id: 1, x: 0, y: 0, angle: 0, length: 4 }],
        captions: [
          { id: 1, x: 0, y: 1, text: "ok", arrow: 1 },
          { id: 2, x: 0, y: 1, text: "gone arrow", arrow: 9 },
          { id: 3, x: 0, y: 1, text: "   " },
          { id: "4", x: 0, y: 1, text: "bad id" },
        ],
      }),
    )!;
    expect(read.captions).toEqual([
      { id: 1, x: 0, y: 1, text: "ok", arrow: 1 },
      { id: 2, x: 0, y: 1, text: "gone arrow" },
    ]);
  });
});

describe("words in a picture", () => {
  it("are set as on the canvas: their counts low, and the picture as large as they reach", () => {
    const svg = drawingSvg({ atoms: [], bonds: [], captions: [{ id: 1, x: 0, y: 0, text: "K2CO3, DMF" }] }, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    const texts = [...svg.matchAll(/<text[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => [m[2], Number(m[1])] as const);
    expect(texts.map(([t]) => t)).toEqual(["K", "2", "CO", "3", ", DMF"]);
    // (the counts smaller than the rest)
    expect(texts[1][1]).toBeLessThan(texts[0][1]);
    const width = Number(/width="([\d.]+)/.exec(svg)![1]);
    expect(width).toBeGreaterThan(20);
  });
});

describe("words given a size of their own and letters marked (docs/EDITOR-2D.md, Text)", () => {
  it("keep their size and marks - changed each one step - saved, copied and read back, what does not read left out", () => {
    const { doc, state } = editor();
    const id = state().addCaption("Title", 0, 0, undefined, undefined, undefined, undefined, { size: 28, marks: [{ from: 0, to: 5, bold: true }] });
    expect(state().captions[0]).toMatchObject({ size: 28, marks: [{ from: 0, to: 5, bold: true }] });
    state().colourWords([id], "#317689");
    expect(state().captions[0].marks).toEqual([{ from: 0, to: 5, bold: true, color: "#317689" }]);
    state().styleWords([id], "bold");
    expect(state().captions[0].marks).toEqual([{ from: 0, to: 5, color: "#317689" }]);
    state().updateCaption(id, { size: null });
    expect("size" in state().captions[0]).toBe(false);
    doc.undo();
    expect(state().captions[0].size).toBe(28);
    const text = workspaceText(state());
    const back = readWorkspace(text)!.drawn.captions![0];
    expect(back).toMatchObject({ size: 28, marks: [{ from: 0, to: 5, color: "#317689" }] });
    const record = readRecord(recordText({ atoms: [], bonds: [], captions: state().captions }))!;
    expect(record.captions![0]).toMatchObject({ size: 28 });
    // (a size out of reason, marks past the words or of no colour: left out)
    const odd = readRecord(JSON.stringify({ format: "meno-structure", version: 1, atoms: [], bonds: [], captions: [{ id: 1, x: 0, y: 0, text: "abc", size: 9000, marks: [{ from: 0, to: 9, bold: true }, { from: 0, to: 2, color: "red" }, { from: 1, to: 2, italic: true }] }] }))!;
    expect(odd.captions![0]).toEqual({ id: 1, x: 0, y: 0, text: "abc", marks: [{ from: 1, to: 2, italic: true }] });
  });

  it("are set in pictures at their own size, their letters bold and coloured as marked", () => {
    const captions = [{ id: 1, x: 0, y: 0, text: "Big", size: 28, marks: [{ from: 0, to: 1, bold: true as const, color: "#cd4560" }] }, { id: 2, x: 0, y: -10, text: "small" }];
    const svg = drawingSvg({ atoms: [], bonds: [], captions }, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    const texts = [...svg.matchAll(/<text[^>]*font-size="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)].map((m) => ({ size: Number(m[1]), attrs: m[2], text: m[3] }));
    const big = texts.find((t) => t.text === "B")!;
    const small = texts.find((t) => t.text === "small")!;
    expect(big.size / small.size).toBeCloseTo(2.8, 1);
    expect(big.attrs).toMatch(/font-weight="bold"/);
    expect(big.attrs).toMatch(/fill="#cd4560"/);
    expect(texts.find((t) => t.text === "ig")!.attrs).not.toMatch(/bold/);
  });
});
