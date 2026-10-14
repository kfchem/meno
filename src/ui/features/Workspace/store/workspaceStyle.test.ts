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
