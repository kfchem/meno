import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { columnDrawn, type ColumnLast } from "./columnDrawn";

const A4: [number, number] = [595, 842];
const OPEN = 440;

/** A workspace with a PDF and two texts, and what its column's pass draws, frame by frame, as PdfColumn asks. */
function workspace() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  let last: ColumnLast = { pdf: null, text: null };
  const draws = (cover = store.getState().textsOpen ? OPEN : 0) => {
    const s = store.getState();
    const now = columnDrawn({ open: s.textsOpen, cover, pdf: s.pdfShown, pdfRead: s.pdfs.some((p) => p.id === s.pdfShown && p.reading), text: s.textShown }, last);
    last = now.last;
    return { pdf: now.pdf, text: now.text };
  };
  return { store, draws };
}

function addPdf(store: ReturnType<typeof workspace>["store"]): number {
  store.getState().addPdfs([{ name: "paper.pdf", sha256: "b".repeat(64), pages: [A4, A4] }], { x: 0, y: 0 });
  return store.getState().pdfs[0].id;
}

function addText(store: ReturnType<typeof workspace>["store"], name: string, text: string): number {
  store.getState().addTexts([{ name, text }]);
  return store.getState().texts[store.getState().texts.length - 1].id;
}

describe("what the column's pass draws", () => {
  it("draws a text chosen after a PDF read there, not the PDF", () => {
    const { store, draws } = workspace();
    const pdf = addPdf(store);
    store.getState().readPdf(pdf);
    expect(draws()).toEqual({ pdf, text: null });
    const notes = addText(store, "notes.txt", "a line\nanother line");
    expect(draws()).toEqual({ pdf: null, text: notes });
    const readme = addText(store, "readme.md", "# A heading\n\nSome words.");
    expect(draws()).toEqual({ pdf: null, text: readme });
  });

  it("follows the tabs chosen in turn, the PDF's included", () => {
    const { store, draws } = workspace();
    const pdf = addPdf(store);
    store.getState().readPdf(pdf);
    const notes = addText(store, "notes.txt", "a line");
    const readme = addText(store, "readme.md", "# A heading");
    draws();
    store.getState().showPdf(pdf);
    expect(draws()).toEqual({ pdf, text: null });
    store.getState().showText(notes);
    expect(draws()).toEqual({ pdf: null, text: notes });
    store.getState().showText(readme);
    expect(draws()).toEqual({ pdf: null, text: readme });
    store.getState().showPdf(pdf);
    expect(draws()).toEqual({ pdf, text: null });
  });

  it("draws a text with no PDF read, as it did", () => {
    const { store, draws } = workspace();
    const notes = addText(store, "notes.txt", "a line");
    expect(draws()).toEqual({ pdf: null, text: notes });
    const readme = addText(store, "readme.md", "# A heading");
    expect(draws()).toEqual({ pdf: null, text: readme });
  });

  it("draws nothing under a table or a conversation shown after a PDF", () => {
    // (its body is the column's own, over the canvas: the PDF read before is not drawn under it)
    const now = columnDrawn({ open: true, cover: OPEN, pdf: null, pdfRead: false, text: null }, { pdf: 1, text: null });
    expect(now).toEqual({ pdf: null, text: null, last: { pdf: null, text: null } });
  });

  it("shutting, draws what it last showed as it slides away, then nothing", () => {
    const { store, draws } = workspace();
    const pdf = addPdf(store);
    store.getState().readPdf(pdf);
    draws();
    const notes = addText(store, "notes.txt", "a line");
    draws();
    store.getState().closeTexts();
    // (the text it showed, not the PDF read before it)
    expect(draws(OPEN / 2)).toEqual({ pdf: null, text: notes });
    expect(draws(0)).toEqual({ pdf: null, text: null });
  });

  it("shutting on a PDF, draws the PDF as it slides away", () => {
    const { store, draws } = workspace();
    const pdf = addPdf(store);
    store.getState().readPdf(pdf);
    draws();
    store.getState().closeTexts();
    expect(draws(OPEN / 2)).toEqual({ pdf, text: null });
  });
});
