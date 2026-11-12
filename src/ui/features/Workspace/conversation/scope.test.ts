import { describe, expect, it } from "vitest";
import { sheetMiddle } from "../utils/textSheets";
import { addMolecule3d, createWorkspaceDocument, type WorkspaceDocument } from "../document";
import { CARD, cardRect, FRAME_LEAST, framedForCard } from "../pageGl/conversationCard";
import { pagePx } from "../pageGl/units";
import { addConversation, updateConversation } from "./ops";
import { readConversations } from "./saved";
import { cardRoomOf, inScope, placingFrameOf, type Scope } from "./scope";
import { NEW_RIGHTS } from "./types";

const PX = pagePx(1);
/** A frame put down 30 across, 14 high: its card - 13.5 wide, against its right edge, a padding in - lies from x 16.125 to 29.625. */
const FRAME = { x0: 0, y0: 0, x1: 30, y1: 14 };
const scope: Scope = { frame: FRAME };
const room = cardRect(FRAME)!;

/** Methanol-like: two carbons a bond apart, level at `y`, from `x`: its middle is 0.75 to the right of `x`. */
const chain = (x: number, y: number, first: number) => ({
  atoms: [
    { id: first, el: "C", x, y, r: 0.3 },
    { id: first + 1, el: "C", x: x + 1.5, y, r: 0.3 },
  ],
  bonds: [{ id: first + 100, a: first, b: first + 1, order: 1 as const }],
});

/** A page with a structure, a molecule in 3D, a picture, a text sheet, an arrow, a plus and a set, each with its middle at (x, 7). */
function pageAt(x: number): WorkspaceDocument {
  const doc = createWorkspaceDocument();
  doc.edit("things", (d) => {
    const c = chain(x - 0.75, 7, 1);
    const withMolecule = addMolecule3d(
      { ...d, model: { atoms: c.atoms, bonds: c.bonds }, nextId: 200 },
      { atoms: [{ el: "O", x: 0, y: 0, z: 0 }], bonds: [], at: { x, y: 7 } } as Parameters<typeof addMolecule3d>[1],
    );
    return {
      ...withMolecule,
      pictures: [{ id: 1, name: "scheme.png", sha256: "a".repeat(64), media: "image/png", px: [10, 10], x, y: 7, w: 2, h: 2 }],
      arrows: [{ id: 1, x, y: 7, angle: 0, length: 3 }],
      pluses: [{ id: 1, x, y: 7 }],
    } as WorkspaceDocument;
  });
  return doc.getState();
}

const seen = (d: WorkspaceDocument, s: Scope = scope) => {
  const r = inScope(d, s);
  return { structure: r.structure.length, molecule: r.molecule.length, picture: r.picture.length, arrow: r.arrow.length, plus: r.plus.length };
};
const ALL = { structure: 1, molecule: 1, picture: 1, arrow: 1, plus: 1 };
const NONE = { structure: 0, molecule: 0, picture: 0, arrow: 0, plus: 0 };

describe("the card's room is never scope", () => {
  it("lies against the frame's right edge, a padding in from it", () => {
    expect(cardRoomOf(scope)).toEqual(room);
    expect(room.x1).toBeCloseTo(FRAME.x1 - pagePx(CARD.pad), 9);
    expect(room.x1 - room.x0).toBeCloseTo(pagePx(CARD.w), 9);
    expect(cardRoomOf({ page: true })).toBeNull();
  });

  it("leaves out what has its middle on the card - of every kind - and takes in what has it a pixel to the left, exactly at the card's edge both ways", () => {
    // (a thing in the middle of the scope to the left: seen; in the middle of the card: not)
    expect(seen(pageAt(5))).toEqual(ALL);
    expect(seen(pageAt((room.x0 + room.x1) / 2))).toEqual(NONE);
    // (its left edge itself is the card's: one page pixel to its left is what the conversation sees)
    expect(seen(pageAt(room.x0))).toEqual(NONE);
    expect(seen(pageAt(room.x0 - PX))).toEqual(ALL);
    // (the room above and below the card, and to its right, is the frame's: seen)
    expect(seen(pageAt(room.x1 + PX))).toEqual(ALL);
    const d = pageAt(5);
    const above = { ...d, arrows: [{ ...d.arrows[0], x: (room.x0 + room.x1) / 2, y: room.y1 + PX }] };
    expect(inScope(above, scope).arrow).toEqual([1]);
    const below = { ...d, arrows: [{ ...d.arrows[0], x: (room.x0 + room.x1) / 2, y: room.y0 - PX }] };
    expect(inScope(below, scope).arrow).toEqual([1]);
    const onIt = { ...d, arrows: [{ ...d.arrows[0], x: (room.x0 + room.x1) / 2, y: room.y1 }] };
    expect(inScope(onIt, scope).arrow).toEqual([]);
  });

  it("leaves out a text sheet and a set by their middles on the card too", () => {
    // (a sheet put where its middle is the point given)
    const sheet = (m: { x: number; y: number }) => {
      const off = sheetMiddle({ x: 0, y: 0 }, "x", "notes.txt");
      return { id: 1, name: "notes.txt", text: "x", at: { x: m.x - off.x, y: m.y - off.y } };
    };
    const d = { ...pageAt(5), texts: [sheet({ x: 5, y: 7 })], nextTextId: 2 } as WorkspaceDocument;
    expect(inScope(d, scope).text).toEqual([1]);
    const onCard = { ...d, texts: [sheet({ x: (room.x0 + room.x1) / 2, y: 7 })] } as WorkspaceDocument;
    expect(inScope(onCard, scope).text).toEqual([]);
    const set = { id: 50, x0: (room.x0 + room.x1) / 2 - 1, y0: 6, x1: (room.x0 + room.x1) / 2 + 1, y1: 8, name: "S" };
    expect(inScope({ ...d, sets: [set] } as WorkspaceDocument, scope).set).toEqual([]);
    expect(inScope({ ...d, sets: [{ ...set, x0: 4, x1: 6 }] } as WorkspaceDocument, scope).set).toEqual([50]);
  });

  it("holds for a conversation of the whole page: it has no card", () => {
    expect(seen(pageAt((room.x0 + room.x1) / 2), { page: true })).toEqual(ALL);
  });

  it("is put down only to the left of the card: the frame the changes use ends at its left edge", () => {
    expect(placingFrameOf(FRAME)).toEqual({ ...FRAME, x1: room.x0 });
    // (a frame no wider than its card's padding has no card: as it is)
    const none = { x0: 0, y0: 0, x1: 0.5, y1: 14 };
    expect(cardRect(none)).toBeNull();
    expect(placingFrameOf(none)).toBe(none);
  });
});

describe("a frame always holds its card", () => {
  const least = { w: pagePx(FRAME_LEAST.w), h: pagePx(FRAME_LEAST.h) };
  it("is as it is where it holds the card, to the pixel; where it falls short by one, grown to the left or down with its top right corner kept", () => {
    const exact = { x0: 10, y0: 20, x1: 10 + least.w, y1: 20 + least.h };
    expect(framedForCard(exact)).toBe(exact);
    const narrower = framedForCard({ ...exact, x0: exact.x0 + PX });
    expect(narrower.x0).toBeCloseTo(exact.x0, 9);
    expect(narrower).toMatchObject({ x1: exact.x1, y0: exact.y0, y1: exact.y1 });
    const lower = framedForCard({ ...exact, y0: exact.y0 + PX });
    expect(lower.y0).toBeCloseTo(exact.y0, 9);
    expect(lower).toMatchObject({ x0: exact.x0, x1: exact.x1, y1: exact.y1 });
    const tiny = framedForCard({ x0: 5, y0: 5, x1: 6, y1: 6 });
    expect(tiny.x1).toBe(6);
    expect(tiny.y1).toBe(6);
    expect(tiny.x1 - tiny.x0).toBeCloseTo(least.w, 9);
    expect(tiny.y1 - tiny.y0).toBeCloseTo(least.h, 9);
    // (its card has room in it, as far as a card is the width it is: the whole of CARD.w)
    const r = cardRect(tiny)!;
    expect(r.x1 - r.x0).toBeCloseTo(pagePx(CARD.w), 9);
  });

  it("is so as a conversation is put down, sized, and as a file gives it", () => {
    const small = { x0: 0, y0: 0, x1: 3, y1: 3 };
    const added = addConversation(createWorkspaceDocument().getState(), small);
    const c = added.conversations![0];
    expect(c.x1 - c.x0).toBeCloseTo(least.w, 9);
    expect(c.y1 - c.y0).toBeCloseTo(least.h, 9);
    expect([c.x1, c.y1]).toEqual([3, 3]);
    // (sized smaller: grown again; sized larger: as it was sized)
    const smaller = updateConversation(added, 1, { frame: { x0: 0, y0: 0, x1: 1, y1: 1 } }).conversations![0];
    expect(smaller.x1 - smaller.x0).toBeCloseTo(least.w, 9);
    const larger = updateConversation(added, 1, { frame: { x0: -50, y0: -50, x1: 3, y1: 3 } }).conversations![0];
    expect(larger).toMatchObject({ x0: -50, y0: -50, x1: 3, y1: 3 });
    const [read] = readConversations([{ x0: 0, y0: 0, x1: 2, y1: 2, rights: NEW_RIGHTS, said: [], sent: [] }]);
    expect(read.x1 - read.x0).toBeCloseTo(least.w, 9);
    expect([read.x1, read.y1]).toEqual([2, 2]);
  });
});
