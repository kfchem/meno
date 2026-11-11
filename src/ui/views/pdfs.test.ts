import { describe, expect, it } from "vitest";
import { addAtom, createWorkspaceDocument } from "../features/Workspace/document";
import { connectStoreToDocument, createEditorStore } from "../features/Workspace/store";
import { suggestedSavePath } from "../features/Workspace/fileActions";
import { openedPdfs, outsidePdfsPlan, type OpenedPdf } from "./pdfs";
import { opensReadingFilled } from "../features/Workspace/document";

const pdf = (name: string, c: string): OpenedPdf => ({ name, sha256: c.repeat(64), size: 9, pages: [[595, 842]] });

describe("PDFs opened on a canvas of their own", () => {
  const opened = openedPdfs([pdf("paper.pdf", "a")]);
  /** The tab's document, made as the app makes it (ui/views/registry). */
  const made = () => createWorkspaceDocument(opened.data);

  it("is a workspace tab named for the first PDF", () => {
    expect(opened).toMatchObject({ kind: "workspace", label: "paper.pdf", data: { filename: "paper.pdf" } });
    expect(openedPdfs([pdf("b.pdf", "b"), pdf("c.pdf", "c")]).label).toBe("b.pdf");
  });

  it("holds the PDF on its page as the saved state: unchanged, so nothing to undo and no ask to save as it is closed", () => {
    const doc = made();
    expect(doc.getState().pdfs?.map((p) => p.name)).toEqual(["paper.pdf"]);
    expect(doc.history().dirty).toBe(false);
    expect(doc.history().undoDepth).toBe(0);
  });

  it("asks as any workspace does once anything changes - a stroke drawn, a PDF taken away - and not again where it is changed back", () => {
    const stroke = made();
    stroke.edit("add atom", (d) => addAtom(d, 0, 0));
    expect(stroke.history().dirty).toBe(true);
    stroke.undo();
    expect(stroke.history().dirty).toBe(false);
    const doc = made();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().removePdf(1);
    expect(doc.history().dirty).toBe(true);
  });

  it("offers the PDF's name with .meno to Save, beside it where it came from", () => {
    expect(suggestedSavePath({ savedPath: null, openedName: "paper.pdf" })).toBe("paper.meno");
    expect(suggestedSavePath({ savedPath: null, openedName: "/data/run 3/paper.pdf" })).toBe("/data/run 3/paper.meno");
  });

  it("is a change where the same PDF is added into a workspace that has something in it, as it always was", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    doc.edit("add atom", (d) => addAtom(d, 0, 0));
    doc.markSaved();
    expect(doc.history().dirty).toBe(false);
    store.getState().addPdfs([pdf("paper.pdf", "a")], { x: 0, y: 0 });
    expect(doc.history().dirty).toBe(true);
  });
});

describe("PDFs opened from outside Meno", () => {
  const opened = openedPdfs([pdf("paper.pdf", "a")], true);

  it("are opened in a canvas of their own, the first read in the column, which fills the workspace - the document still clean", () => {
    expect(opened.data).toMatchObject({ filename: "paper.pdf", readFilled: true });
    const doc = createWorkspaceDocument(opened.data);
    expect(opensReadingFilled(doc)).toBe(true);
    expect(doc.getState().pdfs?.[0].reading).toEqual({ at: 0, zoom: 1 });
    expect(doc.history().dirty).toBe(false);
    expect(doc.history().undoDepth).toBe(0);
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = store.getState();
    expect(st.columnFilled).toBe(true);
    expect(st.textsOpen).toBe(true);
    expect(st.pdfShown).toBe(st.pdfs[0].id);
  });

  it("are not read filled where they are opened some other way - Open, a drop: a canvas as it was", () => {
    const doc = createWorkspaceDocument(openedPdfs([pdf("paper.pdf", "a")]).data);
    expect(opensReadingFilled(doc)).toBe(false);
    expect(doc.getState().pdfs?.[0].reading).toBeUndefined();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    expect(store.getState().columnFilled).toBe(false);
    expect(store.getState().textsOpen).toBe(false);
  });

  it("only hide the workspace: it is there throughout, and the column's button and key switch between the two views", () => {
    const doc = createWorkspaceDocument(opened.data);
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    doc.edit("add atom", (d) => addAtom(d, 0, 0));
    for (const filled of [false, true, false]) {
      store.getState().setColumnFilled(filled);
      expect(store.getState().columnFilled).toBe(filled);
      // (its document, and the drawing in it, held either way; the PDF still read in the column)
      expect(store.getState().model.atoms).toHaveLength(1);
      expect(store.getState().pdfs[0].reading).toBeTruthy();
      expect(store.getState().textsOpen).toBe(true);
    }
  });

  it("bring a tab that holds the PDF already forward, as it was left, and open the rest together", () => {
    const tabs = [
      { id: "t1", pdfs: [{ sha256: "a".repeat(64) }] },
      { id: "t2", pdfs: undefined },
      { id: "t3", pdfs: [{ sha256: "c".repeat(64) }, { sha256: "d".repeat(64) }] },
    ];
    const a = pdf("a.pdf", "a");
    const b = pdf("b.pdf", "b");
    const c = pdf("c.pdf", "c");
    const d = pdf("d.pdf", "d");
    expect(outsidePdfsPlan([a], tabs)).toEqual({ forward: ["t1"], fresh: [] });
    expect(outsidePdfsPlan([b], tabs)).toEqual({ forward: [], fresh: [b] });
    // (several in one go: each tab once, in the order they came; the new ones together; the same one twice, once)
    expect(outsidePdfsPlan([c, b, a, d, b], tabs)).toEqual({ forward: ["t3", "t1"], fresh: [b] });
    expect(outsidePdfsPlan([], tabs)).toEqual({ forward: [], fresh: [] });
  });
});
