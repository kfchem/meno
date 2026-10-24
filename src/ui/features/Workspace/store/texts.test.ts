import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument, isBlankDocument } from "../document";

/** Store wired to a document, the way a workspace tab is put together. */
function editor(data?: unknown) {
  const doc = createWorkspaceDocument(data);
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("the texts a workspace holds", () => {
  it("are added as one step, shown in their column - one held already shown, not added again", () => {
    const { doc, state } = editor();
    state().addTexts([
      { name: "a.inp", text: "a", path: "/w/a.inp" },
      { name: "b.txt", text: "b" },
    ]);
    expect(state().texts.map((t) => t.name)).toEqual(["a.inp", "b.txt"]);
    expect(state().texts[0].path).toBe("/w/a.inp");
    expect(state().textShown).toBe(state().texts[1].id);
    expect(state().textsOpen).toBe(true);
    expect(doc.history()).toMatchObject({ undoDepth: 1, dirty: true });
    state().addTexts([{ name: "a.inp", text: "a" }]);
    expect(state().texts).toHaveLength(2);
    expect(state().textShown).toBe(state().texts[0].id);
    expect(doc.history().undoDepth).toBe(1);
    // (a new one, with no name, named)
    state().addTexts([{ name: "", text: "" }]);
    expect(state().texts[2].name).toBe("Untitled.txt");
  });

  it("shown again in the column - one asked for that it holds already, a calculation's output shown from its molecule - over a PDF read there since: never the PDF left showing", () => {
    const { state } = editor();
    state().addTexts([{ name: "xtb.log", text: "normal termination of xtb" }]);
    const log = state().textShown;
    state().addPdfs([{ name: "paper.pdf", sha256: "a".repeat(64), pages: [[595, 842]] }], { x: 0, y: 0 });
    state().readPdf(state().pdfs[0].id);
    expect([state().pdfShown, state().textsOpen]).toEqual([state().pdfs[0].id, true]);
    // (the same output asked for again: the one held, shown - the PDF read before giving way, and staying so)
    state().addTexts([{ name: "xtb.log", text: "normal termination of xtb" }]);
    expect([state().textShown, state().pdfShown, state().textsOpen]).toEqual([log, null, true]);
    state().setTextOf(log!, { molecule: 7 });
    expect([state().textShown, state().pdfShown]).toEqual([log, null]);
  });

  it("give way, with a PDF read in the column, to a set's table asked for there: the one asked for last shown", () => {
    const { state } = editor();
    state().addPdfs([{ name: "paper.pdf", sha256: "a".repeat(64), pages: [[595, 842]] }], { x: 0, y: 0 });
    state().readPdf(state().pdfs[0].id);
    state().readSetTable(5);
    expect([state().setTableShown, state().pdfShown, state().textsOpen]).toEqual([5, null, true]);
    state().readPdf(state().pdfs[0].id);
    expect([state().setTableShown, state().pdfShown]).toEqual([null, state().pdfs[0].id]);
    state().showSetTable(5);
    expect([state().setTableShown, state().pdfShown]).toEqual([5, null]);
  });

  it("are held with their lines ended \"\\n\", however their files ended them", () => {
    const { state } = editor();
    state().addTexts([{ name: "w.inp", text: "! B3LYP\r\n\r\n* xyz 0 1\r\nO 0 0 0\r*\r\n" }]);
    expect(state().texts[0].text).toBe("! B3LYP\n\n* xyz 0 1\nO 0 0 0\n*\n");
    // (the same file opened again: the one held, not another)
    state().addTexts([{ name: "w.inp", text: "! B3LYP\r\n\r\n* xyz 0 1\r\nO 0 0 0\r*\r\n" }]);
    expect(state().texts).toHaveLength(1);
    state().editText(state().texts[0].id, "! PBE\r\n");
    expect(state().texts[0].text).toBe("! PBE\n");
  });

  it("are edited in the document, a run of typing one step", () => {
    const { doc, state } = editor();
    state().addTexts([{ name: "a.txt", text: "" }]);
    const id = state().texts[0].id;
    for (const typed of ["h", "he", "hel"]) state().editText(id, typed);
    expect(state().texts[0].text).toBe("hel");
    expect(doc.history().undoDepth).toBe(2);
    doc.undo();
    expect(state().texts[0].text).toBe("");
  });

  it("close, the column closing with the last; an undo brings one back, shown", () => {
    const { doc, state } = editor();
    state().addTexts([{ name: "a.txt", text: "a" }]);
    const id = state().texts[0].id;
    state().removeText(id);
    expect(state().texts).toEqual([]);
    expect(state().textsOpen).toBe(false);
    doc.undo();
    expect(state().texts.map((t) => t.id)).toEqual([id]);
    expect(state().textShown).toBe(id);
    expect(state().textsOpen).toBe(true);
  });

  it("stay as the column is hidden, and show again as it was", () => {
    const { state } = editor();
    state().addTexts([{ name: "a.txt", text: "a" }, { name: "b.txt", text: "b" }]);
    const first = state().texts[0].id;
    state().showText(first);
    state().closeTexts();
    expect(state().textsOpen).toBe(false);
    expect(state().textShown).toBe(first);
    state().showText(first);
    expect(state().textsOpen).toBe(true);
  });

  it("are what a canvas opened for them starts with: shown, nothing to undo, nothing unsaved", () => {
    const { doc, state } = editor({ texts: [{ name: "run.py", text: "print(1)\n", path: "/w/run.py" }, { name: 3 }] });
    expect(state().texts).toEqual([{ id: 1, name: "run.py", text: "print(1)\n", path: "/w/run.py" }]);
    expect(state().textShown).toBe(1);
    expect(state().textsOpen).toBe(true);
    expect(doc.history()).toMatchObject({ undoDepth: 0, dirty: false });
  });

  it("keep a canvas from being blank, as a molecule in 3D does", () => {
    const { doc, state } = editor();
    expect(isBlankDocument(doc.getState())).toBe(true);
    state().addTexts([{ name: "a.txt", text: "" }]);
    expect(isBlankDocument(doc.getState())).toBe(false);
    const solid = editor();
    solid.state().pasteModel({ atoms: [], bonds: [], molecules3d: [{ atoms: [{ el: "He", x: 0, y: 0, z: 0 }], bonds: [], at: { x: 0, y: 0 } } as never] });
    expect(isBlankDocument(solid.doc.getState())).toBe(false);
  });
});

describe("a double-click on empty space", () => {
  const quick = { at: { x: 1, y: 2 }, x: 10, y: 20, within: { width: 800, height: 600 } };

  it("opens Quick Add there", () => {
    const { state } = editor();
    state().doubleClickOnEmpty(quick);
    expect(state().quickAdd).toEqual(quick);
  });

  it("shuts the column instead, while it is open - the work coming back to the canvas - and opens Quick Add the next time", () => {
    const { state } = editor();
    state().addTexts([{ name: "notes.txt", text: "x" }], { x: 0, y: 0 });
    expect(state().textsOpen).toBe(true);
    state().doubleClickOnEmpty(quick);
    expect(state().textsOpen).toBe(false);
    expect(state().quickAdd).toBeNull();
    // (the text kept, its sheet on the page)
    expect(state().texts).toHaveLength(1);
    state().doubleClickOnEmpty(quick);
    expect(state().quickAdd).toEqual(quick);
  });
});

describe("New text", () => {
  it("makes an empty text, shows it in the column and marks it to be given the keys there - once", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const s = () => store.getState();
    s().newText({ x: 2, y: 3 });
    const made = s().texts[s().texts.length - 1];
    expect(made.text).toBe("");
    expect(s().textShown).toBe(made.id);
    expect(s().textsOpen).toBe(true);
    // (what the column's text body gives the keys to, as it shows it - and then lets go of)
    expect(s().textToWrite).toBe(made.id);
    s().wroteText();
    expect(s().textToWrite).toBeNull();
    // (and a canvas let go of, made again: nothing left marked)
    s().newText();
    s().letGo();
    expect(s().textToWrite).toBeNull();
  });
});
