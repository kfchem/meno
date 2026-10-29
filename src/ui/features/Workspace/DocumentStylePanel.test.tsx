import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { workspace3dOf } from "../../../lib/chem/workspaceStyle3d";
import { EditorProvider } from "./store";
import { createWorkspaceDocument } from "./document";
import DocumentStylePanel from "./DocumentStylePanel";

/** The Styles card of a workspace drawn in `drawing`, as it opens. */
function panel(drawing: { preset: string; changes: Record<string, never> }) {
  const { style3d } = useAppSettings.getInitialState();
  const doc = createWorkspaceDocument(undefined, drawing, workspace3dOf(style3d));
  return renderToString(
    <EditorProvider tabId="t" document={doc}>
      <DocumentStylePanel onClose={() => undefined} />
    </EditorProvider>,
  );
}

describe("a workspace's Styles card", () => {
  it("offers Settings' styles only where the workspace's differ from them", () => {
    const settings = useAppSettings.getInitialState().drawingStyle;
    expect(panel({ preset: settings.preset, changes: {} })).not.toContain("Use Settings&#x27; styles");
    const other = settings.preset === "rsc" ? "acs1996" : "rsc";
    expect(panel({ preset: other, changes: {} })).toContain("Use Settings&#x27; styles");
  });
});
