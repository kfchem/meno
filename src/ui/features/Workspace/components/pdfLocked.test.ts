import { describe, expect, it, vi } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { markLocked, markUnlocked } from "../../../../lib/doc/locked";
import * as reader from "../../../../lib/pdf/reader";
import { Pictures } from "./pdfPictures";

const sha = "d".repeat(64);

function editor(pages: [number, number][]) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().addPdfs([{ name: "paper.pdf", sha256: sha, pages }], { x: 0, y: 0 });
  return { doc, store };
}

describe("a PDF locked with a password, on the page", () => {
  it("is given the real sizes of its pages as it is opened: kept at the next save, no step to undo", () => {
    const { doc, store } = editor([[595, 842]]);
    doc.markSaved();
    expect(doc.history().dirty).toBe(false);
    store.getState().setPdfPages(sha, [[300, 400], [300, 400]]);
    expect(store.getState().pdfs[0].pages).toEqual([[300, 400], [300, 400]]);
    // (to be saved: what the file holds of it is wrong till then)
    expect(doc.history().dirty).toBe(true);
    // (no step of its own: undo takes back the putting down, not the opening)
    const undone = doc.history().undoLabel;
    expect(undone).toBe("add PDF");
  });

  it("is left as it is where its pages are the same as were kept, saved or not", () => {
    const { doc, store } = editor([[300, 400]]);
    doc.markSaved();
    const was = doc.getState();
    store.getState().setPdfPages(sha, [[300, 400]]);
    expect(doc.getState()).toBe(was);
    expect(doc.history().dirty).toBe(false);
  });

  it("keeps the page on top where it still is a page, and puts pages laid in places of their own back in rows", () => {
    const { doc, store } = editor([[595, 842], [595, 842], [595, 842]]);
    store.getState().turnPdf(1, 2);
    store.getState().placePdfPage(1, 0, 10, 10);
    expect(store.getState().pdfs[0].placed).toBeTruthy();
    store.getState().setPdfPages(sha, [[300, 400], [300, 400]]);
    const p = store.getState().pdfs[0];
    expect(p.page).toBe(1);
    expect(p.placed).toBeUndefined();
    expect(doc.getState().pdfs?.[0].pages).toHaveLength(2);
  });

  it("is asked of nothing for its pictures while it is locked, and is as soon as it is opened", () => {
    const draw = vi.spyOn(reader, "drawPart").mockReturnValue(new Promise(() => {}));
    const pics = new Pictures();
    markLocked(sha);
    expect(pics.preview({ sha256: sha, pages: [[300, 400]] }, 0)).toBeNull();
    expect(pics.ask({ sha256: sha, page: 0, size: [300, 400], level: 1, part: { x0: 0, y0: 0, x1: 300, y1: 400 }, nearness: () => 0, stillSince: () => 0 }, 0)).toBe(false);
    expect(draw).not.toHaveBeenCalled();
    markUnlocked(sha);
    pics.preview({ sha256: sha, pages: [[300, 400]] }, 0);
    expect(draw).toHaveBeenCalledTimes(1);
    draw.mockRestore();
  });
});
