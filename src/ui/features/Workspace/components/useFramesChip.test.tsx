/**
 * A molecule's frames chip, drawn with no workspace around it: Settings'
 * 3D preview and its style cards draw a molecule alone, outside any
 * workspace's store - the chip is drawn there all the same, and asks
 * nothing of a store (0.1.23: the 3D section stopped, "useEditorStore must
 * be used within EditorProvider").
 */
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { useFramesChip } from "./useFramesChip";
import { EditorProvider } from "../store";
import { createWorkspaceDocument } from "../document";

// (the page's hits, which ask the canvas where the pointer is: none here - drawn as on the server, no canvas)
vi.mock("../pageGl/PageHits", async (real) => ({ ...(await real<object>()), useHitAt: () => () => null }));

function Chip({ seen }: { seen: () => void }) {
  useFramesChip({ chipKey: "m1", id: 1, facts: { count: 3, frame: 0, energies: [-1, -1.1, -1.2] }, frame: 0, open: false, onFrame: () => {} });
  seen();
  return null;
}

describe("a molecule's frames chip", () => {
  it("is drawn with no workspace around it - Settings' 3D preview - asking nothing of a store", () => {
    let seen = 0;
    expect(() => renderToString(<Chip seen={() => seen++} />)).not.toThrow();
    expect(seen).toBe(1);
  });

  it("is drawn in a workspace as ever", () => {
    let seen = 0;
    renderToString(
      <EditorProvider tabId="t" document={createWorkspaceDocument()}>
        <Chip seen={() => seen++} />
      </EditorProvider>,
    );
    expect(seen).toBe(1);
  });
});
