import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "..";
import { createWorkspaceDocument } from "../../document";
import { freeFrame } from "./conversationsSlice";
import { CONVERSATION_FRAME } from "../../conversation/ops";
import { framedForCard } from "../../pageGl/conversationCard";
import { freePlace, pageBoxes } from "../../utils/freePlace";
import { styleOf } from "../../../../../lib/chem/style";
import { NOMINAL_BOND_LENGTH as B } from "../../../../../lib/chem/acs";

type Box = { x0: number; y0: number; x1: number; y1: number };

/** A conversation's frame as Quick Add asks for one about `at`. */
const asked = (at: { x: number; y: number }): Box => {
  const w = CONVERSATION_FRAME.w * B;
  const h = CONVERSATION_FRAME.h * B;
  return { x0: at.x - w / 2, y0: at.y - h / 2, x1: at.x + w / 2, y1: at.y + h / 2 };
};

const within = (p: { x: number; y: number }, f: Box) => p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1;
const apart = (a: Box, b: Box) => a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;

function page() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store };
}

describe("a new conversation's frame", () => {
  it("is put where it was asked for on an empty page, as large as asked", () => {
    const { store } = page();
    const want = asked({ x: 3 * B, y: -2 * B });
    const id = store.getState().addConversation(want)!;
    const c = store.getState().conversations.find((x) => x.id === id)!;
    expect({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }).toEqual(framedForCard(want));
  });

  it("holds none of the things on the page, drawn at and around where it was asked for", () => {
    const { store } = page();
    const st = store.getState();
    // (structures at the asking place and a few bonds about it, each side)
    const atoms = [
      [0, 0],
      [4 * B, 1 * B],
      [-5 * B, -2 * B],
      [1 * B, 4 * B],
      [-2 * B, -5 * B],
    ].map(([x, y]) => ({ x, y, id: st.addAtom(x, y) }));
    // (and another conversation's frame beside the asking place)
    store.getState().addConversation({ x0: 14 * B, y0: -6 * B, x1: 40 * B, y1: 10 * B });
    const before = store.getState().conversations.map((c) => c.id);
    const id = store.getState().addConversation(asked({ x: 0, y: 0 }))!;
    const now = store.getState();
    const c = now.conversations.find((x) => x.id === id)!;
    for (const a of atoms) expect(within(a, c)).toBe(false);
    for (const other of now.conversations.filter((x) => before.includes(x.id))) expect(apart(c, other)).toBe(true);
    // (clear of every box on the page)
    for (const b of pageBoxes(now, styleOf(now.docStyle))) expect(apart(c, b)).toBe(true);
  });

  it("is the nearest free place by the placer's own rule (utils/freePlace)", () => {
    const { store } = page();
    store.getState().addAtom(0, 0);
    store.getState().addAtom(2 * B, 3 * B);
    const st = store.getState();
    const want = framedForCard(asked({ x: B, y: B }));
    const at = { x: (want.x0 + want.x1) / 2, y: (want.y0 + want.y1) / 2 };
    const foot = { x0: want.x0 - at.x, y0: want.y0 - at.y, x1: want.x1 - at.x, y1: want.y1 - at.y };
    const p = freePlace(pageBoxes(st, styleOf(st.docStyle)), foot, at, B);
    const got = freeFrame(st, asked({ x: B, y: B }));
    expect(got.x0).toBeCloseTo(p.x + foot.x0, 9);
    expect(got.y0).toBeCloseTo(p.y + foot.y0, 9);
    expect(got.x1 - got.x0).toBeCloseTo(want.x1 - want.x0, 9);
    expect(got.y1 - got.y0).toBeCloseTo(want.y1 - want.y0, 9);
    // (moved off the asking place, which was taken)
    expect(p).not.toEqual(at);
  });

  it("asks the view to show it, and one undo takes it away, the page as it was", () => {
    const { doc, store } = page();
    store.getState().addAtom(0, 0);
    const was = doc.getState();
    const shown = store.getState().showRequest?.n ?? 0;
    const id = store.getState().addConversation(asked({ x: 0, y: 0 }))!;
    const c = store.getState().conversations.find((x) => x.id === id)!;
    expect(store.getState().showRequest).toMatchObject({ box: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }, n: shown + 1 });
    doc.undo();
    expect(store.getState().conversations).toEqual([]);
    expect(doc.getState().model).toEqual(was.model);
    expect(doc.getState().conversations ?? []).toEqual(was.conversations ?? []);
  });
});
