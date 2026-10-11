import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import * as ops from "../document";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { ICON_HEIGHT, ICON_NAME_WIDTH, POINT } from "../../../../lib/pdf/layout";
import {
  drawnSheetBox,
  iconScaleOf,
  SHEET_LEAST_COLS,
  SHEET_LETTER,
  SHEET_LINE_PT,
  SHEET_MD_PX,
  SHEET_MOST_COLS,
  SHEET_MOST_LINES,
  SHEET_PAD_PT,
  SHEET_TYPE_PT,
  sheetOf,
  sheetRoom,
} from "../utils/textSheets";

function editor(data?: unknown) {
  const doc = createWorkspaceDocument(data);
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

describe("a text's sheet", () => {
  it("is as large as its first lines need, at the size they would be printed - within bounds", () => {
    const small = sheetOf("hello\nworld\n");
    expect(small.lines).toEqual(["hello", "world"]);
    expect(small.cols).toBe(SHEET_LEAST_COLS);
    expect(small.h).toBeCloseTo((3 * SHEET_LINE_PT + 2 * SHEET_PAD_PT) * POINT);
    const big = sheetOf(Array.from({ length: 60 }, () => "x".repeat(120)).join("\n"));
    expect(big.cols).toBe(SHEET_MOST_COLS);
    expect(big.lines).toHaveLength(SHEET_MOST_LINES);
    expect(big.lines[0]).toHaveLength(SHEET_MOST_COLS);
    // (a tab to its next stop)
    expect(sheetOf("a\tb").lines[0]).toBe("a   b");
  });

  it("of a Markdown text shows it formatted, as wide as a sheet's 80 letters, its first rows, a long text's no taller", () => {
    const md = sheetOf("# Title\n\nSome *words*.\n", "notes.md");
    expect(md.md).toBeDefined();
    expect(md.md!.rows).toBe(md.md!.laid.rows.length);
    expect(md.md!.laid.width).toBe(SHEET_MD_PX);
    expect(md.w).toBeCloseTo(md.md!.laid.width * md.md!.scale);
    // (its text as wide as a sheet's 80 letters, its margins about a sheet's)
    expect((SHEET_MD_PX - 40) * md.md!.scale).toBeCloseTo(SHEET_MOST_COLS * SHEET_LETTER * SHEET_TYPE_PT * POINT, 0);
    const long = sheetOf(Array.from({ length: 400 }, (_, i) => `Paragraph ${i}.`).join("\n\n"), "long.md");
    expect(long.md!.rows).toBeLessThan(long.md!.laid.rows.length);
    expect(long.h).toBeLessThanOrEqual((SHEET_MOST_LINES * SHEET_LINE_PT + 2 * SHEET_PAD_PT) * POINT + 1e-9);
    // (by its name: the same text named otherwise, its lines)
    expect(sheetOf("# Title\n", "notes.txt").md).toBeUndefined();
  });

  it("is put on the page an icon, where asked, a row of them, clear of a sheet already there and its name", () => {
    const first = ops.textsInRow([{ name: "a.txt", text: "a" }], { x: 0, y: 0 }, { texts: [] });
    const s = sheetOf("a");
    expect(first[0].icon).toBe(true);
    expect(first[0].at.x).toBeCloseTo(-s.w / 2);
    expect(first[0].at.y).toBeCloseTo(s.h / 2);
    const second = ops.textsInRow([{ name: "b.txt", text: "b" }], { x: 0, y: 0 }, { texts: [{ id: 1, ...first[0] }] });
    expect(sheetRoom(second[0])!.x0).toBeGreaterThanOrEqual(sheetRoom(first[0])!.x1);
    // (a row: room for each one's name between them)
    const row = ops.textsInRow([{ name: "c.txt", text: "c" }, { name: "d.txt", text: "d" }], { x: 0, y: 0 }, { texts: [] });
    expect(drawnSheetBox(row[1])!.x0 - drawnSheetBox(row[0])!.x0).toBeGreaterThanOrEqual(ICON_NAME_WIDTH);
  });

  it("made an icon, is as large as a PDF's icon by its longer side, about its middle", () => {
    for (const text of ["short", Array.from({ length: 60 }, () => "x".repeat(20)).join("\n")]) {
      const s = sheetOf(text);
      const icon = drawnSheetBox({ at: { x: 0, y: 0 }, text, icon: true })!;
      expect(Math.max(icon.x1 - icon.x0, icon.y1 - icon.y0)).toBeCloseTo(ICON_HEIGHT);
      expect((icon.x0 + icon.x1) / 2).toBeCloseTo(s.w / 2);
      expect((icon.y0 + icon.y1) / 2).toBeCloseTo(-s.h / 2);
      expect(iconScaleOf(s)).toBeLessThan(1);
    }
  });
});

describe("texts on the page", () => {
  it("come as sheets, read in the column; a tab closed leaves the sheet, and reading it again brings the tab back", () => {
    const { state } = editor();
    state().addTexts([{ name: "notes.txt", text: "some words" }], { x: 10, y: 20 });
    const [t] = state().texts;
    expect(t.at).toBeDefined();
    expect(state().textShown).toBe(t.id);
    expect(state().textsOpen).toBe(true);
    state().stopReadingText(t.id);
    expect(state().texts[0]).toMatchObject({ id: t.id, reading: false });
    expect(state().textShown).toBeNull();
    expect(state().textsOpen).toBe(false);
    state().readText(t.id);
    expect(state().texts[0].reading).toBeUndefined();
    expect(state().textShown).toBe(t.id);
    expect(state().textsOpen).toBe(true);
  });

  it("without a sheet - an output, a log - go when their tab is closed", () => {
    const { state } = editor();
    state().addTexts([{ name: "run.log", text: "log" }]);
    const [t] = state().texts;
    expect(t.at).toBeUndefined();
    state().stopReadingText(t.id);
    expect(state().texts).toHaveLength(0);
  });

  it("are selected, moved with the selection, and deleted with it as one step", () => {
    const { doc, state } = editor();
    state().addTexts([{ name: "a.txt", text: "a" }], { x: 0, y: 0 });
    const [t] = state().texts;
    state().selectAll();
    expect([...state().selTexts]).toEqual([t.id]);
    state().moveAtoms([], "drag-1", { texts: [{ id: t.id, x: t.at!.x + 5, y: t.at!.y - 3 }] });
    expect(state().texts[0].at).toEqual({ x: t.at!.x + 5, y: t.at!.y - 3 });
    const depth = doc.history().undoDepth;
    state().deleteSelection();
    expect(state().texts).toHaveLength(0);
    expect(state().selTexts.size).toBe(0);
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect(state().texts[0]).toMatchObject({ id: t.id, name: "a.txt" });
    state().clearSel();
    expect(state().selTexts.size).toBe(0);
  });

  it("rise from their sheets into the column as they are read, and go back as it shuts - those without a sheet do not", () => {
    const { state } = editor();
    state().addTexts([{ name: "a.txt", text: "a" }], { x: 0, y: 0 });
    const [t] = state().texts;
    // (made new: from its sheet, as the column opens on it)
    expect(state().textFlight).toMatchObject({ id: t.id, to: "column" });
    state().endTextFlight();
    state().closeTexts();
    expect(state().textFlight).toMatchObject({ id: t.id, to: "page" });
    state().endTextFlight();
    state().readText(t.id);
    expect(state().textFlight).toMatchObject({ id: t.id, to: "column" });
    state().endTextFlight();
    // (read where the column shows it already: nothing rises)
    state().readText(t.id);
    expect(state().textFlight).toBeNull();
    // (its tab closed, the last: back to its sheet)
    state().stopReadingText(t.id);
    expect(state().textFlight).toMatchObject({ id: t.id, to: "page" });
    state().endTextFlight();
    state().addTexts([{ name: "run.log", text: "log" }]);
    expect(state().textFlight).toBeNull();
  });

  it("are made full size and an icon again, each a step", () => {
    const { doc, state } = editor();
    state().addTexts([{ name: "a.txt", text: "a" }], { x: 0, y: 0 });
    const [t] = state().texts;
    expect(t.icon).toBe(true);
    const depth = doc.history().undoDepth;
    state().setTextIcon(t.id, false);
    expect(state().texts[0].icon).toBeUndefined();
    expect(state().texts[0].at).toEqual(t.at);
    expect(doc.history().undoDepth).toBe(depth + 1);
    // (as it is already: no step)
    state().setTextIcon(t.id, false);
    expect(doc.history().undoDepth).toBe(depth + 1);
    state().setTextIcon(t.id, true);
    expect(state().texts[0].icon).toBe(true);
    doc.undo();
    expect(state().texts[0].icon).toBeUndefined();
  });

  it("without a sheet keep what they are the text of - a molecule by its place, as the molecules are numbered again", () => {
    const { doc, state } = editor();
    const water = { atoms: [{ el: "O", x: 0, y: 0, z: 0 }], bonds: [], at: { x: 0, y: 0 } };
    doc.edit("two", (d) => ops.addMolecule3d(ops.addMolecule3d(d, water), { ...water, at: { x: 9, y: 0 } }));
    const [, second] = state().molecules3d;
    state().addTexts([{ name: "water.log", text: "out", of: { molecule: second.id } }]);
    const t = state().texts[0];
    expect(t.of).toEqual({ molecule: second.id });
    // (shown from another molecule: of that one now - no step to undo)
    const depth = doc.history().undoDepth;
    state().setTextOf(t.id, { molecule: state().molecules3d[0].id });
    expect(state().texts[0].of).toEqual({ molecule: state().molecules3d[0].id });
    expect(doc.history().undoDepth).toBe(depth);
    state().setTextOf(t.id, { molecule: second.id });
    const ws = readWorkspace(workspaceText(state(), new Set(), ["a".repeat(64)]));
    expect(ws?.texts[0].of).toEqual({ molecule: 1 });
    const again = editor();
    again.state().openWorkspace({ ...ws!, texts: ws!.texts.map((x) => ({ ...x, text: "out" })) }, true);
    expect(again.state().texts[0].of).toEqual({ molecule: again.state().molecules3d[1].id });
  });

  it("keep their sheets' places, whether they are icons and whether they are read, in the workspace", () => {
    const { state } = editor();
    state().addTexts([{ name: "a.txt", text: "a" }, { name: "b.txt", text: "b" }], { x: 1, y: 2 });
    state().stopReadingText(state().texts[0].id);
    state().setTextIcon(state().texts[1].id, false);
    const ws = readWorkspace(workspaceText(state(), new Set(), ["a".repeat(64), "b".repeat(64)]));
    expect(ws?.texts[0]).toMatchObject({ name: "a.txt", at: state().texts[0].at, reading: false, icon: true });
    expect(ws?.texts[1].icon).toBeUndefined();
    // (opened again: as they were)
    const again = editor();
    again.state().openWorkspace({ ...ws!, texts: ws!.texts.map((t) => ({ ...t, text: t.name[0] })) }, true);
    expect(again.state().texts[0]).toMatchObject({ name: "a.txt", at: state().texts[0].at, reading: false, icon: true });
    expect(again.state().texts[1]).toMatchObject({ name: "b.txt", at: state().texts[1].at });
    expect(again.state().texts[1].icon).toBeUndefined();
  });
});
