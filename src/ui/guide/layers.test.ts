import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ABOVE_GUIDE_LAYER, GUIDE_LAYER, QUESTION_LAYER } from "./layers";

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
    for (const opened of ["<PartMenu", "<ColourCard", "<QuickAdd", "<ExportCard", "<OrdersCard", "<RenderCard", "<PenCard", "<Ask3D", "<ConfirmDiscard", "<NameDialog"]) {
      const at = source.indexOf(opened);
      expect(at, opened).toBeGreaterThan(from);
      expect(at, opened).toBeLessThan(to);
    }
  });

  it("has a question asked over the whole window above what is opened over a canvas - Quick Add under its dimming - in a layer of the window's own", () => {
    expect(QUESTION_LAYER).toBeGreaterThan(ABOVE_GUIDE_LAYER);
    // (the window's own, as the canvas's is: inside the app's, a fixed box of its own, it lay under the canvas's whatever its number)
    const source = readFileSync(join(process.cwd(), "src/ui/network/ConsentDialog.tsx"), "utf8");
    expect(source).toMatch(/createPortal\(/);
    expect(source).toMatch(/document\.body,\n\s*\);/);
    expect(source).toMatch(/className="fixed inset-0[^"]*" style=\{\{ zIndex: QUESTION_LAYER \}\}/);
  });
});
