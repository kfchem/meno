import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { EMPTY_PAGE_LINE, EMPTY_PAGE_LINES } from "../components/EmptyPageLine";
import { emptyPageLineShown, pageHoldsNothing, thingInHand } from "./emptyPage";

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
  const all = { active: true, empty: true, opening: false, card: false, quickAdd: false, menu: false, draggedOver: false, dropping: false, talking: false, inHand: false };
  it("shows on the workspace in front where its page is empty, and says each half truly", () => {
    expect(emptyPageLineShown(all)).toBe(true);
    expect(EMPTY_PAGE_LINES).toEqual(["Double-click to add", "or drop a file"]);
    expect(EMPTY_PAGE_LINE).toBe("Double-click to add, or drop a file.");
  });
  it("steps aside while the tab's own file is read or a card says what could not be, Quick Add or a menu is open, something is dragged over or dropped, a talk is given - and where the page holds something or is behind", () => {
    for (const key of ["opening", "card", "quickAdd", "menu", "draggedOver", "dropping", "talking", "inHand"] as const) expect(emptyPageLineShown({ ...all, [key]: true }), key).toBe(false);
    for (const key of ["active", "empty"] as const) expect(emptyPageLineShown({ ...all, [key]: false }), key).toBe(false);
  });
});

describe("a thing in hand, before it is on the page", () => {
  it("is none on a new page", () => {
    const { st } = page();
    expect(thingInHand(st())).toBe(false);
  });
  it("is a chain or bond being drawn out, active or with a stroke going", () => {
    const { st } = page();
    expect(thingInHand({ ...st(), extend: { ...st().extend, active: true } })).toBe(true);
    expect(thingInHand({ ...st(), extend: { ...st().extend, stroke: {} as never } })).toBe(true);
  });
  it("is a text being written, an arrow or a shape being dragged out, a curved arrow begun, the pen's card open", () => {
    const { st } = page();
    const at = { x: 0, y: 0 };
    expect(thingInHand({ ...st(), captionEdit: { id: null, at } })).toBe(true);
    expect(thingInHand({ ...st(), arrowDraft: { from: at, to: at } })).toBe(true);
    expect(thingInHand({ ...st(), shapeDraft: {} as never })).toBe(true);
    expect(thingInHand({ ...st(), pushDraw: { from: null, half: false, pointer: null, to: null } })).toBe(true);
    expect(thingInHand({ ...st(), inkMode: { tool: "pen", color: null, width: 0 } })).toBe(true);
  });
  it("lets the line come back once it is let go: the state is read afresh", () => {
    const { st } = page();
    const held = { ...st(), captionEdit: { id: null, at: { x: 0, y: 0 } } };
    expect(thingInHand(held)).toBe(true);
    expect(thingInHand({ ...held, captionEdit: null })).toBe(false);
  });
});
