import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "./index";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { readRecord, recordText } from "../utils/copyPaste";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { StyleChoice } from "../../../../lib/chem/style";

const RSC: StyleChoice = { preset: "rsc", changes: {} };
const ACS: StyleChoice = { preset: "acs1996", changes: {} };
const settingsWas = useAppSettings.getState().drawingStyle;
afterEach(() => useAppSettings.setState({ drawingStyle: settingsWas }));

describe("a workspace's drawing style, fixed as it is made (docs/WORKSPACE.md, Drawing style)", () => {
  it("is the style it is made in - Settings' as a tab is made (views/registry) - and Settings changed after is no change to it", () => {
    expect(createWorkspaceDocument(undefined, RSC).getState().style).toBe(RSC);
    useAppSettings.setState({ drawingStyle: ACS });
    const doc = createWorkspaceDocument(undefined, useAppSettings.getState().drawingStyle);
    expect(doc.getState().style).toEqual(ACS);
    useAppSettings.setState({ drawingStyle: RSC });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    expect(store.getState().docStyle).toEqual(ACS);
  });

  it("is a file's own where it has one, and Settings' where it has none - set, not counted a change", () => {
    const doc = createWorkspaceDocument(undefined, RSC);
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const saved = workspaceText(store.getState());
    // (its own: kept)
    const own = createWorkspaceDocument(undefined, ACS);
    const ownStore = createEditorStore(own);
    connectStoreToDocument(ownStore, own);
    ownStore.getState().openWorkspace(readWorkspace(saved)!, true);
    expect(ownStore.getState().docStyle).toEqual(RSC);
    // (none - a procedure's file, an older one: Settings', and nothing to undo)
    const without = JSON.parse(saved);
    delete without.style;
    useAppSettings.setState({ drawingStyle: ACS });
    const fresh = createWorkspaceDocument(undefined, RSC);
    const freshStore = createEditorStore(fresh);
    connectStoreToDocument(freshStore, fresh);
    freshStore.getState().openWorkspace(readWorkspace(JSON.stringify(without))!, true);
    expect(freshStore.getState().docStyle).toEqual(ACS);
    expect(fresh.history().undoDepth).toBe(0);
  });
});

describe("a copy's record", () => {
  it("says the bond's printed length of the style it was copied in, and reads it back; one without pastes as it is", () => {
    const part = { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "C" }], bonds: [] };
    expect(readRecord(recordText({ ...part, bondPt: 10.8 }))?.bondPt).toBe(10.8);
    expect(readRecord(recordText(part))?.bondPt).toBeUndefined();
    expect(readRecord(recordText(part).replace('"format"', '"bondPt":-3,"format"'))?.bondPt).toBeUndefined();
  });
});

describe("the Drawing style card's changes (docs/WORKSPACE.md, Drawing style)", () => {
  const BOX = { kind: "rect" as const, x0: 0, y0: 0, x1: 20, y1: 10 };
  const bond = (v: number): StyleChoice => ({ preset: "rsc", changes: { bondLengthPt: v } });
  function editor() {
    const doc = createWorkspaceDocument(undefined, RSC);
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    return { doc, state: () => store.getState() };
  }

  it("convert the page at once, one step, where nothing is dragged", () => {
    const { doc, state } = editor();
    state().addShape(BOX);
    state().setDocumentStyle(ACS);
    expect(state().docStyle).toBe(ACS);
    expect(state().shapes[0].x1).toBeCloseTo((20 * 12.2) / 14.4, 9);
    expect(doc.history().undoDepth).toBe(2);
    doc.undo();
    expect(state().shapes[0].x1).toBe(20);
  });

  it("convert a slider's every tick from the page as its drag began, never tick upon tick, and are one step", () => {
    const { doc, state } = editor();
    state().addShape(BOX);
    for (const v of [13, 9.1, 17.3]) {
      state().setDocumentStyle(bond(v), "style:bondLengthPt");
      expect(state().shapes[0].x1).toBe(20 * (12.2 / v));
    }
    // (back where it began: the page as it was, to the last digit)
    state().setDocumentStyle(bond(12.2), "style:bondLengthPt");
    expect(state().shapes[0]).toMatchObject(BOX);
    expect(doc.history().undoDepth).toBe(2);
    state().setDocumentStyle(bond(6.1), "style:bondLengthPt");
    doc.undo();
    expect(state().docStyle).toBe(RSC);
    expect(state().shapes[0].x1).toBe(20);
  });

  it("begin a drag again from the page as it is after another edit, or another slider - nothing done between them lost", () => {
    const { state } = editor();
    state().addShape(BOX);
    state().setDocumentStyle(bond(9.1), "style:bondLengthPt");
    state().addShape(BOX);
    state().setDocumentStyle(bond(6.1), "style:bondLengthPt");
    expect(state().shapes).toHaveLength(2);
    expect(state().shapes[1].x1).toBe(20 * (9.1 / 6.1));
    expect(state().shapes[0].x1).toBeCloseTo(20 * (12.2 / 6.1), 9);
    state().setDocumentStyle({ ...bond(6.1), changes: { bondLengthPt: 6.1, lineThickness: { value: 1, unit: "pt" } } }, "style:lineThickness");
    expect(state().shapes[1].x1).toBe(20 * (9.1 / 6.1));
  });
});

describe("a paste from a workspace in another style", () => {
  it("is converted by the bond it was copied at over this one's, about its middle: its structures keep their size in units, the rest its printed size", () => {
    const part = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 1.8, y: 0, r: 0.9, el: "C" },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 1 as const }],
      shapes: [{ id: 1, kind: "rect" as const, x0: 10, y0: -5, x1: 30, y1: 5 }],
    };
    const pasted = (bondPt?: number) => {
      const doc = createWorkspaceDocument(undefined, RSC);
      const store = createEditorStore(doc);
      connectStoreToDocument(store, doc);
      store.getState().pasteModel(readRecord(recordText(bondPt ? { ...part, bondPt } : part))!);
      return store.getState();
    };
    const from = pasted(14.4);
    const [a, b] = from.model.atoms;
    expect(b.x - a.x).toBeCloseTo(1.8, 9);
    const box = from.shapes[0];
    expect(box.x1 - box.x0).toBeCloseTo((20 * 14.4) / 12.2, 9);
    // (one copied in this style, or one that says no style: as it is)
    for (const same of [pasted(12.2), pasted()]) expect(same.shapes[0].x1 - same.shapes[0].x0).toBe(20);
  });

  it("keeps its words as large in print: those given no size at the labels' size it was copied in", () => {
    const part = { atoms: [], bonds: [], captions: [{ id: 1, x: 0, y: 0, text: "heat" }, { id: 2, x: 0, y: 5, text: "Title", size: 14 }] };
    const pasted = (labelPt?: number) => {
      const doc = createWorkspaceDocument(undefined, RSC);
      const store = createEditorStore(doc);
      connectStoreToDocument(store, doc);
      store.getState().pasteModel(readRecord(recordText(labelPt ? { ...part, labelPt } : part))!);
      return store.getState().captions;
    };
    // (copied where labels are 10 pt, pasted where they are 7 pt - RSC's)
    expect(readRecord(recordText({ ...part, labelPt: 10 }))?.labelPt).toBe(10);
    const [words, title] = pasted(10);
    expect(words.size).toBe(10);
    expect(title.size).toBe(14);
    // (a copy that says no labels' size, or this style's: as it is)
    for (const same of [pasted(), pasted(7)]) expect(same[0].size).toBeUndefined();
  });
});
