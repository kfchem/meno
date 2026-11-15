import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { EMPTY_PAGE_LINE } from "../components/EmptyPageLine";
import { emptyPageLineShown, pageHoldsNothing } from "./emptyPage";

// The one quiet line on an empty page (docs/WORKSPACE.md, *First steps*).

function page() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

describe("a page that holds nothing at all", () => {
  it("is a new page; not once anything is put on it - an atom, words; and is again when emptied", () => {
    const { doc, st } = page();
    expect(pageHoldsNothing(st())).toBe(true);
    st().addAtom(0, 0, "C");
    expect(pageHoldsNothing(st())).toBe(false);
    doc.undo();
    expect(pageHoldsNothing(st())).toBe(true);
    st().addCaption("words", 0, 0);
    expect(pageHoldsNothing(st())).toBe(false);
  });

  it("counts every kind of thing a page can hold", () => {
    const { st } = page();
    const base = st();
    for (const key of ["molecules3d", "captions", "arrows", "pluses", "pictures", "pdfs", "texts", "slides", "shapes", "inks", "cycles", "conversations", "textsLost", "steps", "sets", "renderFrames"] as const) {
      expect(pageHoldsNothing({ ...base, [key]: [{}] } as never), key).toBe(false);
    }
  });
});

describe("the empty page's line", () => {
  const all = { active: true, empty: true, quickAdd: false, menu: false, draggedOver: false, dropping: false, talking: false };
  it("shows on the workspace in front where its page is empty, and says each half truly", () => {
    expect(emptyPageLineShown(all)).toBe(true);
    expect(EMPTY_PAGE_LINE).toBe("Double-click to add something, or drop a file here.");
  });
  it("steps aside while Quick Add or a menu is open, something is dragged over or dropped, a talk is given - and where the page holds something or is behind", () => {
    for (const key of ["quickAdd", "menu", "draggedOver", "dropping", "talking"] as const) expect(emptyPageLineShown({ ...all, [key]: true }), key).toBe(false);
    for (const key of ["active", "empty"] as const) expect(emptyPageLineShown({ ...all, [key]: false }), key).toBe(false);
  });
});
