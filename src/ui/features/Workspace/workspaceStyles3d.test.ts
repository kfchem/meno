import { afterEach, describe, expect, it } from "vitest";
import { BALL_AND_STICK, DEFAULT_STYLE_3D_CHOICE, type Style3DChoice } from "../../../lib/chem/style3d";
import { workspace3dOf, workspaceCards } from "../../../lib/chem/workspaceStyle3d";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { createWorkspaceDocument } from "./document";
import { connectStoreToDocument, createEditorStore } from "./store";
import { style3dOf } from "./style3d";
import { readWorkspace, workspaceText } from "./utils/workspace";

const OWN = "own-00000000-0000-4000-8000-000000000002";
const lab: Style3DChoice = {
  ...DEFAULT_STYLE_3D_CHOICE,
  primary: OWN,
  shared: { ambientLight: 0.7 },
  own: [{ id: OWN, name: "Lab figures", look: { ...BALL_AND_STICK, ballScale: 0.16, outline: 0.02 } }],
};

const was = useAppSettings.getState().style3d;
afterEach(() => useAppSettings.setState({ style3d: was }));

/** A canvas's store over a new workspace, made as Settings has its styles now. */
function made() {
  const doc = createWorkspaceDocument(undefined, useAppSettings.getState().drawingStyle, workspace3dOf(useAppSettings.getState().style3d));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

describe("a workspace's styles in 3D, in its store", () => {
  it("are fixed as it is made: Settings changed after reach new workspaces only", () => {
    useAppSettings.setState({ style3d: lab });
    const { st } = made();
    expect(st().docStyle3d.primary.name).toBe("Lab figures");
    useAppSettings.setState({ style3d: DEFAULT_STYLE_3D_CHOICE });
    expect(st().docStyle3d.primary.name).toBe("Lab figures");
    expect(style3dOf(st()).primary.ballScale).toBe(0.16);
    expect(made().st().docStyle3d.primary.id).toBe("balls");
  });

  it("open the same on a computer without its style, on a card of its own there", () => {
    useAppSettings.setState({ style3d: lab });
    const { st } = made();
    const text = workspaceText(st());
    // (elsewhere: Meno's own styles, no Lab figures)
    useAppSettings.setState({ style3d: DEFAULT_STYLE_3D_CHOICE });
    const there = made();
    there.st().openWorkspace(readWorkspace(text)!, true);
    expect(there.st().docStyle3d).toEqual(st().docStyle3d);
    expect(style3dOf(there.st()).primary).toEqual(style3dOf(st()).primary);
    expect(style3dOf(there.st()).ambientLight).toBe(0.7);
    const cards = workspaceCards(there.st().docStyle3d, DEFAULT_STYLE_3D_CHOICE);
    expect(cards.carried.size).toBe(1);
    expect(cards.choice.own.map((o) => o.name)).toEqual(["Lab figures"]);
  });

  it("open, in a file saved before workspaces carried them, as Settings has them then", () => {
    useAppSettings.setState({ style3d: lab });
    const { st } = made();
    const text = JSON.stringify({ ...JSON.parse(workspaceText(st())), style3d: undefined });
    const there = made();
    there.st().openWorkspace(readWorkspace(text)!, true);
    expect(there.st().docStyle3d.primary.id).toBe(OWN);
  });

  it("change as one step, which an undo takes back", () => {
    const { doc, st } = made();
    const before = st().docStyle3d;
    const ws = before;
    st().setDocumentStyle3d({ ...ws, primary: ws.secondary, secondary: ws.primary });
    expect(st().docStyle3d.primary.id).toBe("space");
    expect(doc.history().undoLabel).toBe("3D style");
    doc.undo();
    expect(st().docStyle3d).toBe(before);
    doc.redo();
    expect(st().docStyle3d.primary.id).toBe("space");
  });
});
