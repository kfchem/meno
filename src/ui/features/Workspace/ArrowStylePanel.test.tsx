import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { connectStoreToDocument, createEditorStore, EditorProvider } from "./store";
import { createWorkspaceDocument } from "./document";
import ArrowStylePanel from "./ArrowStylePanel";

describe("an arrow's style panel", () => {
  it("names its close button by what it closes, as its title says - not the window's own Close", () => {
    const doc = createWorkspaceDocument();
    // (drawn by a store of its own: the panel's, made from the document, starts with the arrow - the server's renderer reads a store as it began)
    const drawing = createEditorStore(doc);
    connectStoreToDocument(drawing, doc);
    const arrow = drawing.getState().addArrow(0, 0);
    const html = renderToString(
      <EditorProvider tabId="arrow-panel" document={doc}>
        <ArrowStylePanel arrowId={arrow} onClose={() => {}} />
      </EditorProvider>,
    );
    expect(html).toContain('aria-label="Close Arrow"');
    expect(html).not.toContain('aria-label="Close"');
  });
});
