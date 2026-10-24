import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { selectionReaches } from "./useKeepUnselected";

/** A place on the page: the canvas's, or one beside it - the column's. */
const canvas = { contains: (n: never) => (n as unknown as string).startsWith("canvas") };

describe("the page's text selection kept off the canvas and what lies over it", () => {
  it("lets go of one that begins or ends there - a note's words, a chip's, a card's - however it got there", () => {
    expect(selectionReaches({ isCollapsed: false, anchorNode: "canvas/note", focusNode: "canvas/note" }, canvas, false)).toBe(true);
    // (a drag begun on the canvas and let go over the column; one begun in the column and let go on the canvas)
    expect(selectionReaches({ isCollapsed: false, anchorNode: "canvas/chip", focusNode: "column/words" }, canvas, false)).toBe(true);
    expect(selectionReaches({ isCollapsed: false, anchorNode: "column/words", focusNode: "canvas/card" }, canvas, false)).toBe(true);
  });

  it("leaves the column's words, a text field's own selection, and a caret alone", () => {
    expect(selectionReaches({ isCollapsed: false, anchorNode: "column/a", focusNode: "column/b" }, canvas, false)).toBe(false);
    expect(selectionReaches({ isCollapsed: false, anchorNode: "canvas/field", focusNode: "canvas/field" }, canvas, true)).toBe(false);
    expect(selectionReaches({ isCollapsed: true, anchorNode: "canvas/note", focusNode: "canvas/note" }, canvas, false)).toBe(false);
    expect(selectionReaches(null, canvas, false)).toBe(false);
  });

  it("is watched on the canvas, which with what lies over it - the page's HTML, the cards above the guide - is not the page's to select", () => {
    const workspace = readFileSync(join(process.cwd(), "src/ui/features/Workspace/Workspace.tsx"), "utf8");
    expect(workspace).toContain("useKeepUnselected(dropRef)");
    expect(workspace).toMatch(/ref=\{dropRef\}\s+data-guide="page"\s+className=\{`[^`]*\bselect-none\b/);
    expect(readFileSync(join(process.cwd(), "src/ui/layouts/AboveGuide.tsx"), "utf8")).toMatch(/className="fixed select-none/);
    // (a field's words selectable all the same)
    expect(readFileSync(join(process.cwd(), "src/App.css"), "utf8")).toMatch(/input,\s+textarea,\s+\[contenteditable="true"\] \{\s+-webkit-user-select: text;\s+user-select: text;/);
  });
});
