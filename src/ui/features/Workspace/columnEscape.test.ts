import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "./store";
import { createWorkspaceDocument } from "./document";
import { escapeLeftForColumn, shutColumnOnceHeard } from "./columnEscape";

const A4: [number, number] = [595, 842];
const nobodyAsks = () => false;

/** A workspace with a PDF read in the column. */
function reading() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().addPdfs([{ name: "paper.pdf", sha256: "b".repeat(64), pages: [A4, A4] }], { x: 0, y: 0 });
  store.getState().readPdf(1);
  return store;
}

/** An Escape as the window hands it on, once everything has heard it. */
const escape = (over: Partial<{ target: unknown; defaultPrevented: boolean; key: string }> = {}) => ({
  key: "Escape",
  target: {},
  defaultPrevented: false,
  ...over,
});

/** Runs what is asked for later at once. */
const now = (go: () => void) => go();

describe("Escape and the column", () => {
  it("shuts the column reading a PDF, as its Hide does - the PDF kept, going back to the page", () => {
    const store = reading();
    expect(store.getState().textsOpen).toBe(true);
    shutColumnOnceHeard(escape(), store, now, nobodyAsks);
    expect(store.getState().textsOpen).toBe(false);
    expect(store.getState().pdfs).toHaveLength(1);
  });

  it("is asked only once the key has gone round the window: a card that took it in between keeps the column open", () => {
    const store = reading();
    const e = escape();
    let later: (() => void) | null = null;
    shutColumnOnceHeard(e, store, (go) => (later = go), nobodyAsks);
    // (heard first by the workspace: nothing shut yet)
    expect(store.getState().textsOpen).toBe(true);
    // (a card over the page, hearing it after, takes it)
    e.defaultPrevented = true;
    later!();
    expect(store.getState().textsOpen).toBe(true);
  });

  it("leaves the column open for what is smaller: a text field's Escape, a gesture under way, the search, the column filling the workspace, a question", () => {
    const store = reading();
    const s = () => store.getState();
    expect(escapeLeftForColumn(escape({ target: { tagName: "INPUT", type: "text" } }), s(), nobodyAsks)).toBe(false);
    expect(escapeLeftForColumn(escape({ target: { tagName: "TEXTAREA" } }), s(), nobodyAsks)).toBe(false);
    expect(escapeLeftForColumn(escape({ defaultPrevented: true }), s(), nobodyAsks)).toBe(false);
    expect(escapeLeftForColumn(escape({ key: "Enter" }), s(), nobodyAsks)).toBe(false);
    expect(escapeLeftForColumn(escape(), s(), () => true)).toBe(false);
    store.setState({ columnFilled: true });
    expect(escapeLeftForColumn(escape(), s(), nobodyAsks)).toBe(false);
    store.setState({ columnFilled: false, moveDrag: { ...s().moveDrag, active: true } });
    expect(escapeLeftForColumn(escape(), s(), nobodyAsks)).toBe(false);
    store.setState({ moveDrag: { ...s().moveDrag, active: false } });
    expect(escapeLeftForColumn(escape(), s(), nobodyAsks)).toBe(true);
  });

  it("does nothing with the column shut", () => {
    const store = reading();
    store.getState().closeTexts();
    expect(escapeLeftForColumn(escape(), store.getState(), nobodyAsks)).toBe(false);
  });
});
