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
  restWords,
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
    // (60 lines: 39 of them, and a last line saying the other 21 are not on it)
    expect(big.lines).toHaveLength(SHEET_MOST_LINES - 1);
    expect(big.rest?.lines).toBe(21);
    expect(restWords(21)).toBe("21 more lines");
    expect(restWords(1)).toBe("1 more line");
    expect(big.rest?.y).toBeCloseTo((SHEET_PAD_PT + 39.5 * SHEET_LINE_PT) * POINT);
    expect(big.h).toBeCloseTo((SHEET_MOST_LINES * SHEET_LINE_PT + 2 * SHEET_PAD_PT) * POINT);
    expect(big.lines[0]).toHaveLength(SHEET_MOST_COLS);
    // (40 lines: all on it, no line said)
    expect(sheetOf("a\n".repeat(SHEET_MOST_LINES)).rest).toBeUndefined();
    // (a tab to its next stop)
    expect(sheetOf("a\tb").lines[0]).toBe("a   b");
  });

  it("of a Markdown text shows it formatted, as wide as a sheet's 80 letters, its first rows, a long text's no taller", () => {
    const md = sheetOf("# Title\n\nSome *words*.\n", true);
    expect(md.md).toBeDefined();
    expect(md.md!.rows).toBe(md.md!.laid.rows.length);
    expect(md.md!.laid.width).toBe(SHEET_MD_PX);
    expect(md.w).toBeCloseTo(md.md!.laid.width * md.md!.scale);
    // (its text as wide as a sheet's 80 letters, its margins about a sheet's)
    expect((SHEET_MD_PX - 40) * md.md!.scale).toBeCloseTo(SHEET_MOST_COLS * SHEET_LETTER * SHEET_TYPE_PT * POINT, 0);
    const long = sheetOf(Array.from({ length: 400 }, (_, i) => `Paragraph ${i}.`).join("\n\n"), true);
    expect(long.md!.rows).toBeLessThan(long.md!.laid.rows.length);
    expect(long.h).toBeLessThanOrEqual((SHEET_MOST_LINES * SHEET_LINE_PT + 2 * SHEET_PAD_PT) * POINT + 1e-9);
    // (by its kind, not its name: the same text not Markdown, its lines)
    expect(sheetOf("# Title\n", false).md).toBeUndefined();
  });

  it("counts a Chinese or Japanese letter as wide as it is set, an em and a twentieth: the sheet as wide as its line, cut where it must be", () => {
    // (worked first: a monospaced letter is 0.6 em, a wide one 1.05 em with its margin - 1.75 letters; 30 of them are 52.5, a sheet of 53)
    const thirty = sheetOf("あ".repeat(30));
    expect(thirty.cols).toBe(53);
    expect(thirty.lines[0]).toBe("あ".repeat(30));
    expect(thirty.w).toBeCloseTo((53 * SHEET_LETTER * SHEET_TYPE_PT + 2 * SHEET_PAD_PT) * POINT);
    expect(thirty.cut).toBeUndefined();
    // (mixed, no spaces: "ab" and 50 letters are 2 + 87.5 across - "ab" and 44 of them shown, 79, the 45th past 80, and the line said to be cut)
    const mixed = sheetOf(`ab${"漢".repeat(50)}`);
    expect(mixed.cols).toBe(SHEET_MOST_COLS);
    expect(mixed.lines[0]).toBe(`ab${"漢".repeat(44)}`);
    expect(mixed.cut).toBe(1);
    // ("ab" and 44 fit, 79 across: no cut)
    expect(sheetOf(`ab${"漢".repeat(44)}`).cut).toBeUndefined();
    // (full-width forms too - 36 of them 63 across; half-width kana are narrow)
    expect(sheetOf("ＡＢＣ".repeat(12)).cols).toBe(63);
    expect(sheetOf("ｱ".repeat(40)).cols).toBe(40);
    // (a tab after a wide letter goes to the next stop from the letter its part ends in: 1.75 is in the second, the stop at 4)
    expect(sheetOf("あ\tb").lines[0]).toBe("あ  b");
  });

  it("says where its text goes on past it, and how many of its lines are cut at its edge", () => {
    // (45 lines of one letter: the sheet shows 39 and says 6 more; the 40th begins after 39 letters and their 39 line ends)
    const tall = Array.from({ length: 45 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("\n") + "\n";
    const s = sheetOf(tall);
    expect(s.more).toBe(78);
    expect(tall.slice(s.more).split("\n")[0]).toBe(String.fromCharCode(97 + 39 - 26));
    expect(s.rest?.lines).toBe(6);
    expect(s.cut).toBeUndefined();
    expect(sheetOf("a\n".repeat(SHEET_MOST_LINES)).more).toBeUndefined();
    expect(sheetOf(`${"x".repeat(90)}\nshort\n${"y".repeat(81)}`).cut).toBe(2);
    // (Markdown: where the first row it leaves off begins in the text written)
    const md = Array.from({ length: 400 }, (_, i) => `Paragraph ${i}.`).join("\n\n");
    const long = sheetOf(md, true);
    expect(long.more).toBeDefined();
    expect(md.slice(long.more)).toMatch(/^Paragraph \d+\./);
    // (the paragraph it begins is the first the sheet's rows leave out; the one before it is shown)
    const k = Number(/^Paragraph (\d+)/.exec(md.slice(long.more!))![1]);
    const shownWords = long.md!.laid.rows.slice(0, long.md!.rows).flatMap((r) => r.pieces.map((p) => p.text)).join("");
    expect(shownWords).toContain(`Paragraph ${k - 1}.`);
    expect(shownWords).not.toContain(`Paragraph ${k}.`);
    // (its last line says how many lines of the text are not on it: from the one the paragraph is on - its 2k+1st of 799 - to the end; under its rows, in its height)
    expect(long.rest?.lines).toBe(799 - 2 * k);
    expect(long.rest!.y).toBeLessThan(long.h);
    expect(long.rest!.y).toBeGreaterThan(long.md!.laid.rows[long.md!.rows - 1].y * long.md!.scale);
    expect(sheetOf("# Title\n\nSome *words*.\n", true).more).toBeUndefined();
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

  it("shown full size, is taken into view: the view asked to show its whole sheet (backlog 173)", () => {
    const { state } = editor();
    state().addTexts([{ name: "a.txt", text: "a\nb\nc" }], { x: 0, y: 0 });
    const [t] = state().texts;
    const before = state().showRequest?.n ?? 0;
    state().setTextIcon(t.id, false);
    expect(state().showRequest?.n).toBe(before + 1);
    expect(state().showRequest?.box).toEqual(sheetRoom(state().texts[0]));
    // (full size already: not asked again)
    state().setTextIcon(t.id, false);
    expect(state().showRequest?.n).toBe(before + 1);
    // (made an icon again: nothing asked)
    state().setTextIcon(t.id, true);
    expect(state().showRequest?.n).toBe(before + 1);
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
