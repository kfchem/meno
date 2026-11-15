import { describe, expect, it } from "vitest";
import { addMolecule3d, createWorkspaceDocument, type WorkspaceDocument } from "../document";
import { addConversation } from "../conversation/ops";
import { cardRect } from "../pageGl/conversationCard";
import { pagePx } from "../pageGl/units";
import { cardsCleared, easedOffCard, framesSettled } from "./fitFrames";
import { inScope } from "../conversation/scope";
import { SET_PAD } from "./look";

const PX = pagePx(1);
const reach = () => ({ x0: -1, x1: 1, y0: -1, y1: 1, chip: 0 });
const extent = reach as never;

/** A conversation put down 30 across and 14 high, from the origin: its card lies from x 16.125 to 29.625, y 0.375 to 13.625. */
const frame = { x0: 0, y0: 0, x1: 30, y1: 14 };
const base = () => addConversation(createWorkspaceDocument().getState(), frame);
const room = cardRect(frame)!;
const middleY = 7;

/** `doc` with a structure of two carbons whose middle is at (x, 7), atoms 1 and 2. */
const withStructure = (doc: WorkspaceDocument, x: number): WorkspaceDocument => ({
  ...doc,
  model: { atoms: [{ id: 1, el: "C", x: x - 0.75, y: middleY, r: 0.3 }, { id: 2, el: "C", x: x + 0.75, y: middleY, r: 0.3 }], bonds: [{ id: 3, a: 1, b: 2, order: 1 }] },
  nextId: 10,
});
const atomsX = (d: WorkspaceDocument) => d.model.atoms.map((a) => a.x);

describe("a thing let go with its middle on a conversation's card is eased off it", () => {
  it("ends with its right edge a padding left of the card, inside what the conversation sees - a structure, whichever side it came from, in one edit", () => {
    const down = withStructure(base(), 5);
    // (dragged onto the card: its middle in the middle of the card)
    const now = withStructure(down, (room.x0 + room.x1) / 2);
    expect(inScope(now, { frame }).structure).toEqual([]);
    const out = cardsCleared(now, down, extent);
    // (the labels of a carbon are not drawn: its box is its atoms' - a little over their points)
    const right = Math.max(...atomsX(out));
    expect(right).toBeLessThan(room.x0 - SET_PAD + 1e-9);
    expect(right).toBeGreaterThan(room.x0 - SET_PAD - 1);
    expect(inScope(out, { frame }).structure).toEqual([1]);
    // (only along the page: up and down it stays)
    expect(out.model.atoms.map((a) => a.y)).toEqual(now.model.atoms.map((a) => a.y));
    expect(out.model.atoms[1].x - out.model.atoms[0].x).toBeCloseTo(1.5, 9);
  });

  it("is exact at the card's edge: a middle on the edge is on the card and eased, a pixel left of it stays where it is", () => {
    const down = withStructure(base(), 5);
    const on = cardsCleared(withStructure(down, room.x0), down, extent);
    expect(inScope(on, { frame }).structure).toEqual([1]);
    expect(Math.max(...atomsX(on))).toBeLessThan(room.x0);
    const near = withStructure(down, room.x0 - PX);
    expect(cardsCleared(near, down, extent)).toBe(near);
    // (the card's top and bottom edges the same: a middle on its top edge is on it, a pixel above is not)
    const onTop = { ...withStructure(down, 20), model: { ...withStructure(down, 20).model, atoms: withStructure(down, 20).model.atoms.map((a) => ({ ...a, y: room.y1 })) } };
    expect(cardsCleared(onTop, down, extent)).not.toBe(onTop);
    const above = { ...onTop, model: { ...onTop.model, atoms: onTop.model.atoms.map((a) => ({ ...a, y: room.y1 + PX })) } };
    expect(cardsCleared(above, down, extent)).toBe(above);
  });

  it("eases a molecule in 3D and a picture the same way, by their middles, and leaves what the gesture did not touch where it is", () => {
    const flat = base();
    const middle = (room.x0 + room.x1) / 2;
    const withMolecule = addMolecule3d(flat, { atoms: [{ el: "O", x: 0, y: 0, z: 0 }], bonds: [], at: { x: 5, y: middleY } } as Parameters<typeof addMolecule3d>[1]);
    const down: WorkspaceDocument = { ...withMolecule, pictures: [{ id: 1, name: "a.png", sha256: "a".repeat(64), media: "image/png", px: [10, 10], x: 6, y: middleY, w: 2, h: 2 }] } as WorkspaceDocument;
    // (both dragged onto the card)
    const now: WorkspaceDocument = { ...down, molecules3d: down.molecules3d!.map((m) => ({ ...m, at: { x: middle, y: middleY } })), pictures: down.pictures!.map((p) => ({ ...p, x: middle })) };
    const out = cardsCleared(now, down, extent);
    expect(out.molecules3d![0].at.x).toBeCloseTo(room.x0 - SET_PAD - 1, 9);
    expect(out.molecules3d![0].at.y).toBe(middleY);
    expect(out.pictures![0].x).toBeCloseTo(room.x0 - SET_PAD - 1, 9);
    expect(out.pictures![0].y).toBe(middleY);
    // (the same page as it was pressed: nothing was moved, nothing is eased - what lay there before stays)
    const lying: WorkspaceDocument = { ...now };
    expect(cardsCleared(lying, now, extent)).toBe(lying);
  });

  it("is done for what a card was moved or sized over, and for a conversation put down over it", () => {
    const placed = withStructure(createWorkspaceDocument().getState(), 20);
    const down = { ...placed, conversations: [] };
    // (a conversation put down this gesture: the structure under its card is eased)
    const put = addConversation(placed, frame);
    expect(Math.max(...atomsX(cardsCleared(put, down, extent)))).toBeLessThan(room.x0);
    // (the frame the same as it was: not)
    expect(cardsCleared(put, put, extent)).toBe(put);
    // (moved 30 to the right over a structure at x = 50, outside the frame it was: eased off the card, to its left)
    const before = withStructure(base(), 50);
    const moved = { ...before, conversations: before.conversations!.map((c) => ({ ...c, x0: c.x0 + 30, x1: c.x1 + 30 })) };
    const out = cardsCleared(moved, before, extent);
    const r = cardRect(moved.conversations![0])!;
    expect(inScope(moved, { frame: moved.conversations![0] }).structure).toEqual([]);
    expect(Math.max(...atomsX(out))).toBeLessThan(r.x0);
    expect(inScope(out, { frame: moved.conversations![0] }).structure).toEqual([1]);
  });

  it("leaves a conversation of the whole page and what a set holds as they are", () => {
    const down = withStructure(base(), 5);
    const on = withStructure(down, (room.x0 + room.x1) / 2);
    const whole = { ...on, conversations: on.conversations!.map((c) => ({ ...c, wholePage: true as const })) };
    expect(cardsCleared(whole, { ...down, conversations: whole.conversations }, extent)).toBe(whole);
    // (a set holding it: its member is the set's, and the frame of the set is its fit's)
    const held = { ...on, sets: [{ id: 5, x0: room.x0, y0: 6, x1: room.x1, y1: 8, name: "S" }] } as unknown as WorkspaceDocument;
    expect(atomsX(cardsCleared(held, down, extent))).toEqual(atomsX(held));
  });

  it("leaves a molecule in 3D and a picture a set holds, as it leaves a structure: they are the set's, not eased off a card", () => {
    const middle = (room.x0 + room.x1) / 2;
    const flat = addMolecule3d(base(), { atoms: [{ el: "O", x: 0, y: 0, z: 0 }], bonds: [], at: { x: 5, y: middleY } } as Parameters<typeof addMolecule3d>[1]);
    const down: WorkspaceDocument = {
      ...flat,
      pictures: [{ id: 1, name: "a.png", sha256: "a".repeat(64), media: "image/png", px: [10, 10], x: 6, y: middleY, w: 2, h: 2 }],
      sets: [{ id: 5, x0: room.x0, y0: 6, x1: room.x1, y1: 8, name: "S" }],
    } as WorkspaceDocument;
    const now: WorkspaceDocument = { ...down, molecules3d: down.molecules3d!.map((m) => ({ ...m, at: { x: middle, y: middleY } })), pictures: down.pictures!.map((p) => ({ ...p, x: middle })) };
    const out = cardsCleared(now, down, extent);
    expect(out.molecules3d![0].at).toEqual({ x: middle, y: middleY });
    expect(out.pictures![0].x).toBe(middle);
    // (the same, held by no set: both eased)
    const free = cardsCleared({ ...now, sets: [] }, { ...down, sets: [] }, extent);
    expect(free.molecules3d![0].at.x).toBeLessThan(room.x0);
    expect(free.pictures![0].x).toBeLessThan(room.x0);
  });

  it("keeps its middle in what the conversation sees where the room left of the card is narrower than it - never carried out of the frame", () => {
    const box = { x0: 0, x1: 20, y0: 0, y1: 2 };
    const f = { x0: 0, y0: 0, x1: 30, y1: 14 };
    const card = { x0: 15, y0: 0, x1: 29, y1: 14 };
    // (20 across, middle at 20: its right edge would go to 15 - 0.75, its middle to 4.25, inside)
    expect(easedOffCard(box, { x: 20, y: 1 }, f, card)).toBeCloseTo(15 - SET_PAD - 20, 9);
    // (80 across, its middle at 20: its right edge would go to 15 - 0.75 and its middle far left of the frame - kept just inside it)
    const wide = easedOffCard({ x0: -20, x1: 60, y0: 0, y1: 2 }, { x: 20, y: 1 }, f, card)!;
    expect(20 + wide).toBeGreaterThan(f.x0);
    expect(20 + wide).toBeCloseTo(f.x0 + 0.01, 9);
    expect(20 + wide).toBeLessThan(card.x0);
    // (not on the card: none)
    expect(easedOffCard(box, { x: 14.99, y: 1 }, f, card)).toBeNull();
    expect(easedOffCard(box, { x: 20, y: 15 }, f, card)).toBeNull();
  });

  it("is part of the settle at the release, and once: what it comes to lie over is not eased in turn", () => {
    const down = withStructure(base(), 5);
    const now = withStructure(down, (room.x0 + room.x1) / 2);
    const out = framesSettled(now, down, extent);
    expect(inScope(out, { frame }).structure).toEqual([1]);
    // (settled again, as the same page: nothing more)
    expect(framesSettled(out, out, extent)).toBe(out);
  });
});
