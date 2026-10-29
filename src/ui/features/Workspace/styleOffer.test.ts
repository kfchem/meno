import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE_3D_CHOICE, withRole } from "../../../lib/chem/style3d";
import { workspace3dOf } from "../../../lib/chem/workspaceStyle3d";
import { drawingName, keyOf, settingsDiffer, settingsStylesOf, styleAsk } from "./styleOffer";
import { connectStoreToDocument, createEditorStore } from "./store";
import { createWorkspaceDocument } from "./document";

const ACS = { preset: "acs1996", changes: {} };
const RSC = { preset: "rsc", changes: {} };
const MENO = { preset: "meno", changes: {} };

describe("a workspace offered Settings' styles", () => {
  const opened = settingsStylesOf(ACS, DEFAULT_STYLE_3D_CHOICE);
  const ws = { style: ACS, style3d: workspace3dOf(DEFAULT_STYLE_3D_CHOICE) };

  it("is asked only where Settings has changed since it was opened, or last answered", () => {
    // (Settings as it was when the workspace was opened: not asked, whatever the workspace is drawn in - someone else's style)
    expect(styleAsk({ ...ws, style: RSC }, opened, keyOf(opened))).toBeNull();
    // (Settings changed to another drawing style: asked, by name)
    const changed = settingsStylesOf(RSC, DEFAULT_STYLE_3D_CHOICE);
    expect(styleAsk(ws, changed, keyOf(opened))).toEqual({ drawing: { now: "ACS 1996", settings: "RSC" } });
    // (answered - kept - not asked again until Settings changes again)
    expect(styleAsk(ws, changed, keyOf(changed))).toBeNull();
    // (Settings changed to what the workspace has already: nothing to ask)
    expect(styleAsk({ ...ws, style: RSC }, changed, keyOf(opened))).toBeNull();
  });

  it("names the 3D styles in their roles where they differ, and a style changed in Settings as changed", () => {
    const swapped = withRole(DEFAULT_STYLE_3D_CHOICE, "primary", DEFAULT_STYLE_3D_CHOICE.secondary);
    const changed = settingsStylesOf(ACS, swapped);
    const ask = styleAsk(ws, changed, keyOf(opened))!;
    expect(ask.drawing).toBeUndefined();
    expect(ask.d3!.now).toBe(`${ws.style3d.primary.name} and ${ws.style3d.secondary.name}`);
    expect(ask.d3!.settings).toBe(`${ws.style3d.secondary.name} and ${ws.style3d.primary.name}`);
    expect(drawingName({ preset: "acs1996", changes: { bondLengthPt: 12 } })).toBe("ACS 1996, changed");
  });

  it("tells values apart by what they hold, not by the order their fields were made or read in", () => {
    expect(keyOf({ a: 1, b: { c: [1, 2], d: undefined } })).toBe(keyOf({ b: { c: [1, 2] }, a: 1 }));
    expect(keyOf({ a: 1 })).not.toBe(keyOf({ a: 2 }));
  });

  it("applied: its drawing style and its looks in 3D taken as one step, which one undo takes back", () => {
    const doc = createWorkspaceDocument(undefined, MENO, workspace3dOf(DEFAULT_STYLE_3D_CHOICE));
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const was = doc.getState();
    const settings = settingsStylesOf(ACS, withRole(DEFAULT_STYLE_3D_CHOICE, "primary", DEFAULT_STYLE_3D_CHOICE.secondary));
    const depth = doc.history().undoDepth;
    store.getState().adoptSettingsStyles(settings.drawing, settings.roles);
    expect(doc.getState().style).toEqual(ACS);
    expect(doc.getState().style3d.primary).toEqual(settings.roles.primary);
    // (its light, its own: kept)
    expect(doc.getState().style3d.scene).toEqual(was.style3d.scene);
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect(doc.getState().style).toEqual(was.style);
    expect(doc.getState().style3d).toEqual(was.style3d);
  });

  it("tells which of a workspace's styles differ from Settings' - none where they are its own", () => {
    expect(settingsDiffer(ws, opened)).toBeNull();
    expect(settingsDiffer({ ...ws, style: RSC }, opened)).toEqual({ drawing: true, d3: false });
    const swapped = settingsStylesOf(ACS, withRole(DEFAULT_STYLE_3D_CHOICE, "primary", DEFAULT_STYLE_3D_CHOICE.secondary));
    expect(settingsDiffer(ws, swapped)).toEqual({ drawing: false, d3: true });
    expect(settingsDiffer({ ...ws, style: MENO }, swapped)).toEqual({ drawing: true, d3: true });
  });
});
