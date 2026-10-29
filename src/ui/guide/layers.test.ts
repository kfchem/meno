import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ABOVE_GUIDE_LAYER, GUIDE_LAYER } from "./layers";

describe("the guide among the window's layers", () => {
  it("lies under what the chemist opens over a canvas, and that under the window's own questions", () => {
    expect(ABOVE_GUIDE_LAYER).toBeGreaterThan(GUIDE_LAYER);
    // (ConfirmDiscard and NameDialog, at the window's level: z-[100])
    expect(ABOVE_GUIDE_LAYER).toBeLessThan(100);
  });

  it("has a canvas's menus, cards and questions drawn in the layer above it, not in the tab's own", () => {
    const source = readFileSync(join(process.cwd(), "src/ui/features/Workspace/Workspace.tsx"), "utf8");
    const from = source.indexOf("<AboveGuide over={dropRef}");
    const to = source.indexOf("</AboveGuide>");
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    for (const opened of ["<PartMenu", "<ColourCard", "<WordsCard", "<QuickAdd", "<ExportCard", "<OrdersCard", "<RenderCard", "<PenCard", "<Ask3D", "<ConfirmDiscard", "<NameDialog"]) {
      const at = source.indexOf(opened);
      expect(at, opened).toBeGreaterThan(from);
      expect(at, opened).toBeLessThan(to);
    }
  });
});
