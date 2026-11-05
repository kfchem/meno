import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
    const source = readFileSync(join(process.cwd(), "src/ui/layouts/QuestionLayer.tsx"), "utf8");
    expect(source).toMatch(/createPortal\(/);
    expect(source).toMatch(/document\.body,\n\s*\);/);
    expect(source).toMatch(/className="fixed inset-0[^"]*" style=\{\{ zIndex: QUESTION_LAYER \}\}/);
  });

  it("has every question asked in a layer: the window's own (layouts/QuestionLayer), or its canvas's - never a box of its own inside a tab", () => {
    const ui = join(process.cwd(), "src/ui");
    const files = (readdirSync(ui, { recursive: true }) as string[]).filter((f) => f.endsWith(".tsx") && !/\.test\./.test(f)).map((f) => ({ f, text: readFileSync(join(ui, f), "utf8") }));
    // (each question: a box that holds the keys while it asks)
    const questions = files.filter((x) => x.text.includes('aria-modal="true"')).map((x) => x.f.replace(/^.*\//, "").replace(/\.tsx$/, ""));
    expect(questions.sort()).toEqual(["ConfirmDiscard", "ConsentDialog", "HideHydrogensAsk", "NameDialog", "StyleFileAsk"]);
    // (asked in the window's layer by themselves)
    for (const q of ["ConsentDialog", "HideHydrogensAsk", "StyleFileAsk"]) expect(files.find((x) => x.f.endsWith(`${q}.tsx`))!.text, q).toContain("<QuestionLayer>");
    // (the boxes others ask in - wherever one is put, it is in a layer: the window's, or - only on a canvas - the canvas's (above))
    for (const q of ["ConfirmDiscard", "NameDialog"]) {
      for (const x of files.filter((y) => y.text.includes(`<${q}`))) {
        const where = x.f.replace(/^.*\//, "");
        // (Workspace: in its canvas's layer, as above; pluginFiles: its question handed to Plugins, which asks it in the window's)
        if (where === "Workspace.tsx" || where === "pluginFiles.tsx") continue;
        expect(x.text, `${q} in ${where}`).toContain("<QuestionLayer");
      }
    }
    // (and no box over the whole window of its own, under what is opened over a canvas whatever its number)
    for (const x of files) if (!x.f.endsWith("QuestionLayer.tsx")) expect(x.text, x.f).not.toMatch(/fixed inset-0[^"]*z-\[/);
  });
});
