import { describe, expect, it } from "vitest";
import { addAtom, createWorkspaceDocument } from "../features/Workspace/document";
import { connectStoreToDocument, createEditorStore } from "../features/Workspace/store";
import { suggestedSavePath } from "../features/Workspace/fileActions";
import { openedPdfs, type OpenedPdf } from "./pdfs";

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
