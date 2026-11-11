import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { gestureStep } from "../../../../lib/doc/document";
import type { DocumentStore } from "../../../../lib/doc";
import { addMolecule3d, addPicture, createWorkspaceDocument, moveMolecule3d, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import type { Frame } from "./entries";
import { easedOut, frameAround, framesFitted, framesSettled, holdsToFit, memberBoxes, structureBox } from "./fitFrames";
import { CHIP, PX, SET_PAD, SET_TOP } from "./look";
import { addSet, markMade } from "./model";
import { LEAST_W, roomOf, type RunWith } from "./run";

/** Each molecule reaching R about its middle, as a look draws it: 2.4 across, less than a name's room (LEAST_W). */
const R = 1.2;
const reach: RunWith["extentOf"] = () => ({ x0: -R, x1: R, y0: -R, y1: R });

/** A molecule in 3D at (x, y): a water, alone - or of three frames, which say so in a chip below it. */
function mol(x: number, y: number, frames = false): Omit<Molecule3D, "id"> {
  return {
    at: { x, y },
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: -0.24, y: 0.93, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...(frames ? { frames: [[0, 0, 0, 0.97, 0, 0, -0.24, 0.94, 0.2], [0, 0, 0, 0.98, 0, 0, -0.24, 0.95, 0.4]] } : {}),
  };
}

/** A workspace whose molecules reach R. */
const workspace = () => createWorkspaceDocument(undefined, undefined, undefined, () => reach);
const frameOf = (d: WorkspaceDocument, id = 1): Frame => {
  const { x0, y0, x1, y1 } = d.sets!.find((b) => b.id === id)!;
  return { x0, y0, x1, y1 };
};
const at = (d: WorkspaceDocument, id: number) => d.molecules3d!.find((m) => m.id === id)!.at;
/** The frame round a lone molecule reaching R at the middle (0, 0): its padding about it, a name's room above, never narrower than a name needs. */
const AROUND_A: Frame = { x0: -(LEAST_W + 2 * SET_PAD) / 2, x1: (LEAST_W + 2 * SET_PAD) / 2, y0: -R - SET_PAD, y1: R + SET_TOP };
const close = (a: Frame, b: Frame) => {
  expect(a.x0).toBeCloseTo(b.x0, 9);
  expect(a.x1).toBeCloseTo(b.x1, 9);
  expect(a.y0).toBeCloseTo(b.y0, 9);
  expect(a.y1).toBeCloseTo(b.y1, 9);
};

/** Molecule 1 at (0, 0) in set 1, its frame fitted to it; the rest `others` as molecules 2, 3, ... where they are given. */
function fitted(...others: { x: number; y: number }[]): DocumentStore<WorkspaceDocument> {
  const doc = workspace();
  doc.edit("place", (d) => addMolecule3d(d, mol(0, 0)));
  doc.edit("set", (d) => addSet(d, { x0: -3, y0: -3, x1: 3, y1: 3 }));
  for (const o of others) doc.edit("place", (d) => addMolecule3d(d, mol(o.x, o.y)));
  doc.edit("fit", (d) => framesSettled(d, d, reach));
  return doc;
}

/** A gesture that drags molecule `id` to `to`, and its release: the document before it was pressed, as it comes up. */
function dragged(doc: DocumentStore<WorkspaceDocument>, id: number, to: { x: number; y: number }, key = "drag") {
  const down = doc.getState();
  doc.edit("move", (d) => moveMolecule3d(d, id, to), gestureStep(key));
  const during = doc.getState();
  doc.edit("fit frames", (d) => framesSettled(d, down, reach), { joinTop: true });
  return { down, during };
}

describe("a set's frame", () => {
  it("is its members' room: their padding about them, a name's room above, never narrower than a name needs", () => {
    const doc = fitted();
    close(frameOf(doc.getState()), AROUND_A);
    // (the least width is the name's: a molecule wider than it takes more)
    const wide = framesFitted(doc.getState(), undefined, () => ({ x0: -4, x1: 4, y0: -R, y1: R }));
    expect(frameOf(wide).x1).toBeCloseTo(4 + SET_PAD, 9);
    expect(frameOf(wide).x0).toBeCloseTo(-4 - SET_PAD, 9);
  });

  it("reaches as far below a molecule as its frames chip does: the chip's height more", () => {
    const plain = fitted();
    const doc = workspace();
    doc.edit("place", (d) => addMolecule3d(d, mol(0, 0, true)));
    doc.edit("set", (d) => addSet(d, { x0: -3, y0: -3, x1: 3, y1: 3 }));
    doc.edit("fit", (d) => framesSettled(d, d, reach));
    expect(frameOf(doc.getState()).y0).toBeCloseTo(frameOf(plain.getState()).y0 - CHIP, 9);
    expect(frameOf(doc.getState()).y1).toBeCloseTo(frameOf(plain.getState()).y1, 9);
  });

  it("keeps room for each of a number of members, pictures and structures among them", () => {
    let d = workspace().getState();
    d = addMolecule3d(d, mol(0, 0));
    d = addPicture(d, { name: "p", sha256: "00", media: "image/png" as never, px: [10, 10], x: 6, y: -1, w: 2, h: 1 });
    d = { ...d, model: { atoms: [{ id: 1, x: 10, y: 3, r: 0.9, el: "C" }, { id: 2, x: 11.3, y: 3, r: 0.9, el: "C" }], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] }, nextId: 3 };
    d = addSet(d, { x0: -3, y0: -3, x1: 13, y1: 5 });
    const boxes = memberBoxes(d, d.sets![0], reach)!;
    expect(boxes).toHaveLength(3);
    const frame = framesFitted(d, undefined, reach).sets![0];
    // (the structure's, its labels as drawn; the picture's corners; the molecule's reach)
    const m = d.model;
    close(frame, frameAround([structureBox(m, new Map(m.atoms.map((a) => [a.id, a])), [1, 2]), { x0: 5, x1: 7, y0: -1.5, y1: -0.5 }, { x0: -R, x1: R, y0: -R, y1: R }]));
    expect(frame.x1).toBeGreaterThan(11.3 + SET_PAD - 1e-9);
  });

  it("is left as it is where it holds nothing a frame fits: no member, a table, a number, a large set's own molecules", () => {
    const empty = { id: 1, x0: 0, y0: 0, x1: 3, y1: 3, members: [] };
    expect(holdsToFit(empty)).toBe(false);
    expect(holdsToFit({ ...empty, members: [{ molecule: 1 }], table: { rows: [] } as never })).toBe(false);
    expect(holdsToFit({ ...empty, members: [{ molecule: 1 }], number: 3 as never })).toBe(false);
    expect(holdsToFit({ ...empty, members: [{ molecule: 1 }], collection: [{}] as never })).toBe(false);
    expect(holdsToFit({ ...empty, members: [{ molecule: 1 }] })).toBe(true);
    // (and one without members known)
    expect(holdsToFit({ id: 1, x0: 0, y0: 0, x1: 3, y1: 3 })).toBe(false);
  });

  it("is the same as a workspace opens as after an edit: a hand-sized frame is fitted, as the edit that moved a member would leave it", () => {
    const doc = workspace();
    doc.edit("place", (d) => addMolecule3d(addMolecule3d(d, mol(0, 0)), mol(4, 0)));
    doc.edit("set", (d) => addSet(d, { x0: -10, y0: -10, x1: 20, y1: 10 }));
    const opened = framesFitted(doc.getState(), undefined, reach);
    // (an edit that changes a molecule's look, nothing moved: the frame follows at once)
    doc.edit("look", (d) => ({ ...d, molecules3d: d.molecules3d!.map((m) => ({ ...m })) }));
    close(frameOf(doc.getState()), frameOf(opened));
    // (and as the pointer is let go after a drag)
    const after = dragged(doc, 2, { x: 5, y: 1 });
    void after;
    close(frameOf(doc.getState()), frameOf(framesFitted(doc.getState(), undefined, reach)));
    expect(frameOf(doc.getState()).x1).toBeCloseTo(5 + R + SET_PAD, 9);
  });
});

describe("a member being dragged", () => {
  it("keeps its frame where it is until the pointer is let go: a member dragged outward never drags its frame with it, and so can leave", () => {
    const doc = fitted({ x: 1, y: 0 });
    doc.edit("set", (d) => ({ ...d, sets: d.sets!.map((b) => ({ ...b, members: [{ molecule: 1 }, { molecule: 2 }] })) }));
    doc.edit("fit", (d) => framesSettled(d, d, reach));
    const was = frameOf(doc.getState());
    const { during } = dragged(doc, 2, { x: 30, y: 0 });
    // (its middle out of the frame: it left, the frame as it was)
    expect(during.sets![0].members).toEqual([{ molecule: 1 }]);
    close(frameOf(during), was);
    // (let go: the frame is what is left to it - the one molecule's room)
    close(frameOf(doc.getState()), AROUND_A);
    expect(at(doc.getState(), 2)).toEqual({ x: 30, y: 0 });
  });

  it("is a member by its middle: 1 px inside the frame's edge joins - and the frame grows round it whole; 1 px outside, it does not", () => {
    const edge = AROUND_A.x1;
    const inn = fitted({ x: 20, y: 0 });
    const { during } = dragged(inn, 2, { x: edge - PX, y: 0 });
    expect(during.sets![0].members).toEqual([{ molecule: 1 }, { molecule: 2 }]);
    close(frameOf(during), AROUND_A);
    // (let go: whole inside, its padding beyond)
    const now = inn.getState();
    expect(frameOf(now).x1).toBeCloseTo(edge - PX + R + SET_PAD, 9);
    const out = fitted({ x: 20, y: 0 });
    expect(dragged(out, 2, { x: edge + PX, y: 0 }).during.sets![0].members).toEqual([{ molecule: 1 }]);
  });

  it("is one step to undo with its gesture: the frame and what was eased out come back with it, and go again with a redo", () => {
    const doc = fitted({ x: 20, y: 0 });
    const depth = doc.history().undoDepth;
    const before = doc.getState();
    dragged(doc, 2, { x: AROUND_A.x1 - PX, y: 0 });
    expect(doc.history().undoDepth).toBe(depth + 1);
    const after = doc.getState();
    expect(frameOf(after).x1).toBeGreaterThan(AROUND_A.x1);
    doc.undo();
    expect(doc.getState()).toBe(before);
    doc.redo();
    expect(doc.getState()).toBe(after);
  });
});

describe("what is let go over a frame", () => {
  const edge = AROUND_A.x1;

  it("with its middle 1 px outside is eased out, its edge exactly the padding from the frame's - to the nearer side, in the gesture's step", () => {
    const doc = fitted({ x: 20, y: 0 });
    const depth = doc.history().undoDepth;
    dragged(doc, 2, { x: edge + PX, y: 0 });
    // (right: its left edge the padding beyond the frame's right)
    expect(at(doc.getState(), 2).x - R).toBeCloseTo(edge + SET_PAD, 9);
    expect(at(doc.getState(), 2).y).toBe(0);
    expect(doc.history().undoDepth).toBe(depth + 1);
    close(frameOf(doc.getState()), AROUND_A);
  });

  it.each([
    ["left", { x: AROUND_A.x0 - PX, y: 0 }, { x: AROUND_A.x0 - SET_PAD - R, y: 0 }],
    ["above", { x: 0, y: AROUND_A.y1 + PX }, { x: 0, y: AROUND_A.y1 + SET_PAD + R }],
    ["below", { x: 0.1, y: AROUND_A.y0 - PX }, { x: 0.1, y: AROUND_A.y0 - SET_PAD - R }],
  ])("is eased out %s where that is nearest", (_side, from, to) => {
    const doc = fitted({ x: 20, y: 20 });
    dragged(doc, 2, from);
    expect(at(doc.getState(), 2).x).toBeCloseTo(to.x, 9);
    expect(at(doc.getState(), 2).y).toBeCloseTo(to.y, 9);
  });

  it("lying over it by more than a rounding is eased out; touching it, or by less, stays", () => {
    const over = (by: number) => {
      const doc = fitted({ x: 20, y: 20 });
      // (its left edge `by` over the frame's right edge)
      dragged(doc, 2, { x: edge + R - by, y: 0 });
      return at(doc.getState(), 2).x;
    };
    expect(over(0)).toBeCloseTo(edge + R, 12);
    expect(over(5e-7)).toBeCloseTo(edge + R - 5e-7, 12);
    expect(over(2e-6)).toBeCloseTo(edge + SET_PAD + R, 9);
  });

  it("is not pushed on - once eased out, what it lies over then is not moved, nor is it eased again", () => {
    // (a second set to its right, whose frame lies over where it is eased to)
    const doc = workspace();
    doc.edit("place", (d) => addMolecule3d(addMolecule3d(addMolecule3d(d, mol(0, 0)), mol(8.3, 0)), mol(40, 40)));
    doc.edit("sets", (d) => addSet(addSet(d, { x0: -3, y0: -3, x1: 3, y1: 3 }), { x0: 5, y0: -3, x1: 12, y1: 3 }));
    doc.edit("fit", (d) => framesSettled(d, d, reach));
    const second = frameOf(doc.getState(), 2);
    expect(second.x0).toBeCloseTo(8.3 - (LEAST_W + 2 * SET_PAD) / 2, 9);
    dragged(doc, 3, { x: edge + PX, y: 0 });
    // (it lies over the second now, and stays there; neither frame nor the molecule inside it moved)
    expect(at(doc.getState(), 3).x - R).toBeCloseTo(edge + SET_PAD, 9);
    expect(at(doc.getState(), 3).x + R).toBeGreaterThan(second.x0);
    close(frameOf(doc.getState(), 2), second);
    expect(at(doc.getState(), 2)).toEqual({ x: 8.3, y: 0 });
  });

  it("moves with all its atoms and the marks put by hand on them: a structure eased out keeps its shape", () => {
    const doc = fitted();
    doc.edit("draw", (d) => ({
      ...d,
      model: { atoms: [{ id: 1, x: 8, y: 0, r: 0.9, el: "O", charge: -1, chargeAt: { x: 8.3, y: 0.4 } }, { id: 2, x: 9.3, y: 0, r: 0.9, el: "C" }], bonds: [{ id: 1, a: 1, b: 2, order: 1 as const }] },
      nextId: 3,
    }));
    const down = doc.getState();
    // (dragged half over the frame: its middle past the frame's right edge)
    doc.edit("drag", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => ({ ...a, x: a.x - 4.5, ...(a.chargeAt ? { chargeAt: { x: a.chargeAt.x - 4.5, y: a.chargeAt.y } } : {}) })) } }), gestureStep("g"));
    const dragged = doc.getState();
    doc.edit("fit frames", (d) => framesSettled(d, down, reach), { joinTop: true });
    const now = doc.getState();
    const dx = now.model.atoms[0].x - dragged.model.atoms[0].x;
    expect(dx).toBeGreaterThan(0);
    // (every atom by the same amount, and its charge's mark with it)
    expect(now.model.atoms[1].x - dragged.model.atoms[1].x).toBeCloseTo(dx, 12);
    expect(now.model.atoms[0].chargeAt!.x - dragged.model.atoms[0].chargeAt!.x).toBeCloseTo(dx, 12);
    expect(now.model.atoms[0].y).toBe(0);
    // (its box now clear of the frame by the padding)
    const m = now.model;
    const box = structureBox(m, new Map(m.atoms.map((a) => [a.id, a])), [1, 2]);
    expect(box.x0).toBeCloseTo(AROUND_A.x1 + SET_PAD, 9);
  });

  it("is eased out of a step's result set too, even with its middle inside: a result set takes nothing in", () => {
    const doc = fitted({ x: 20, y: 0 });
    doc.edit("made", (d) => markMade(d, 1, { step: 7, exit: "out", holds: "molecules" }));
    const { during } = dragged(doc, 2, { x: 2, y: 0 });
    expect(during.sets![0].members).toEqual([{ molecule: 1 }]);
    expect(at(doc.getState(), 2).x - R).toBeCloseTo(AROUND_A.x1 + SET_PAD, 9);
  });

  it("is a thing no set holds that is eased: what another set holds is left where it is", () => {
    const doc = workspace();
    doc.edit("place", (d) => addMolecule3d(addMolecule3d(d, mol(0, 0)), mol(30, 0)));
    doc.edit("sets", (d) => addSet(addSet(d, { x0: -3, y0: -3, x1: 3, y1: 3 }), { x0: 27, y0: -3, x1: 33, y1: 3 }));
    doc.edit("fit", (d) => framesSettled(d, d, reach));
    // (the other's member, moved over the first's frame: a member of the second, it is not eased out of the first)
    const down = doc.getState();
    doc.edit("move", (d) => ({ ...d, sets: d.sets!.map((b) => (b.id === 2 ? { ...b, members: [{ molecule: 2 }] } : b)), molecules3d: d.molecules3d!.map((m) => (m.id === 2 ? { ...m, at: { x: 2, y: 0 } } : m)) }), gestureStep("g"));
    const moved = at(doc.getState(), 2);
    doc.edit("fit frames", (d) => framesSettled(d, down, reach), { joinTop: true });
    expect(at(doc.getState(), 2)).toEqual(moved);
  });

  it("lying over a frame as it was, untouched by the gesture, stays: only what the gesture changed, or a frame that grew over it, is eased", () => {
    const doc = fitted({ x: 3, y: 0 });
    // (molecule 2 lies half over the frame, and no gesture put it there)
    const there = at(doc.getState(), 2);
    doc.edit("fit frames", (d) => framesSettled(d, d, reach), { joinTop: true });
    expect(at(doc.getState(), 2)).toEqual(there);
    // (nor does a release with no `down` ease anything)
    expect(at(framesSettled(doc.getState(), undefined, reach), 2)).toEqual(there);
  });

  it("is eased out by a frame growing into it, once: a frame that takes a member in pushes a molecule beside it aside", () => {
    // (molecule 2 clear of the frame by less than the padding; molecule 3 dropped in grows the frame over it)
    const doc = fitted({ x: 5, y: 0 }, { x: 30, y: 0 });
    expect(at(doc.getState(), 2)).toEqual({ x: 5, y: 0 });
    const { during } = dragged(doc, 3, { x: 2.5, y: 0 });
    expect(during.sets![0].members).toEqual([{ molecule: 1 }, { molecule: 3 }]);
    const grown = frameOf(doc.getState());
    expect(grown.x1).toBeCloseTo(2.5 + R + SET_PAD, 9);
    expect(at(doc.getState(), 2).x - R).toBeCloseTo(grown.x1 + SET_PAD, 9);
  });
});

describe("easedOut", () => {
  const frame: Frame = { x0: 0, y0: 0, x1: 10, y1: 10 };
  it("takes the smallest of the four moves, the box's edge the padding from the frame's", () => {
    expect(easedOut({ x0: 8, x1: 12, y0: 2, y1: 4 }, frame)).toEqual({ dx: 10 + SET_PAD - 8, dy: 0 });
    expect(easedOut({ x0: -2, x1: 2, y0: 2, y1: 4 }, frame)).toEqual({ dx: 0 - SET_PAD - 2, dy: 0 });
    expect(easedOut({ x0: 2, x1: 4, y0: 8, y1: 12 }, frame)).toEqual({ dx: 0, dy: 10 + SET_PAD - 8 });
    expect(easedOut({ x0: 2, x1: 4, y0: -2, y1: 2 }, frame)).toEqual({ dx: 0, dy: 0 - SET_PAD - 2 });
  });
});

describe("a molecule's room", () => {
  it("is as roomOf has it, its chip's height below it", () => {
    const m = { frames: [[], []] as number[][], calc: undefined, energies: undefined, shares: undefined, numbers: undefined, conformerSet: undefined };
    expect(roomOf(m as never, { x0: -R, x1: R, y0: -R, y1: R }).chip).toBe(CHIP);
  });
});
