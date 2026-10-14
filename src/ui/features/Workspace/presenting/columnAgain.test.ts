import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { columnAgain, openColumnAgain } from "./columnAgain";

const A4: [number, number] = [595, 842];

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return () => store.getState();
}

describe("the column as a talk ends", () => {
  it("opens again on the PDF it showed - shown, not flown to from the page, so the view stays on its way to the slide", () => {
    const state = editor();
    state().addPdfs([{ name: "paper.pdf", sha256: "a".repeat(64), pages: [A4, A4] }], { x: 0, y: 0 });
    const id = state().pdfs[0].id;
    state().readPdf(id);
    state().endPdfFlight();
    // (the talk found it so, and shut the column)
    const was = { open: state().textsOpen, pdf: state().pdfShown, text: state().textShown, cover: 400 };
    state().closeTexts();
    // (the PDF gone back to its page as the talk began)
    state().endPdfFlight();
    expect(state().textsOpen).toBe(false);
    const again = columnAgain(state(), was);
    expect(again).toEqual({ pdf: id });
    openColumnAgain(state(), again!);
    expect(state().textsOpen).toBe(true);
    expect(state().pdfShown).toBe(id);
    expect(state().pdfFlight).toBeNull();
  });

  it("stays shut where it was shut, or where what it showed is gone", () => {
    const state = editor();
    expect(columnAgain(state(), { open: false, pdf: null, text: null, cover: 0 })).toBeNull();
    expect(columnAgain(state(), { open: true, pdf: 7, text: null, cover: 400 })).toBeNull();
    expect(columnAgain(state(), { open: true, pdf: null, text: 3, cover: 400 })).toBeNull();
  });
});
