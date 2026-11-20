// Held beside fitFrames.test.ts: what counts as a set emptied, the frame it goes back to by its exit and where it was made, a numbered structure's room for each structure of a set, and a structure that stays by any one of its atoms.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { addMolecule3d, createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnRecord, Model, Molecule3D, WorkflowSet } from "../store/types";
import type { Frame } from "./entries";
import { emptied, framesFitted, framesSettled, memberBoxes } from "./fitFrames";
import { CARD_H, CARD_W } from "./look";
import { addSet, addStep, holdMembers, membersSettled } from "./model";
import { NUMBER_ROOM, type RunWith } from "./run";

const R = 1.2;
const reach: RunWith["extentOf"] = () => ({ x0: -R, x1: R, y0: -R, y1: R });
const mol = (x: number, y: number): Omit<Molecule3D, "id"> => ({
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
});
const frameOf = (d: WorkspaceDocument, id: number): Frame => {
  const { x0, y0, x1, y1 } = d.sets!.find((b) => b.id === id)!;
  return { x0, y0, x1, y1 };
};

describe("a step's result set counts as emptied only when it holds nothing at all", () => {
  const made = { step: 7, exit: "out", holds: "molecules" } as const;
  const set = (more: object = {}, members: unknown[] = []) => ({ id: 1, x0: 0, y0: 0, x1: 1, y1: 1, made, members, ...more }) as unknown as WorkflowSet;

  it("is emptied with no member and nothing else; not with a member, nor a chemist's set", () => {
    expect(emptied(set())).toBe(true);
    expect(emptied(set({}, [{ molecule: 1 }]))).toBe(false);
    expect(emptied({ ...set(), made: undefined } as WorkflowSet)).toBe(false);
  });

  it("is not emptied while it holds a table, a number, a chart, molecules or structures of its own, or entries not read", () => {
    for (const more of [{ table: {} }, { number: 3 }, { chart: {} }, { collection: [{}] }, { drawnCollection: [{}] }, { unread: 2 }]) expect(emptied(set(more))).toBe(false);
  });
});

describe("a step's result set emptied goes back to the size its exit was made", () => {
  /** A conformers step (an exit "out" a card high, an exit "failed" half as high), the set of `exit` made tall by a molecule held and fitted, then emptied: its frame as it was tall, and now. */
  const emptiedOf = (exit: string) => {
    const doc = createWorkspaceDocument(undefined, undefined, undefined, () => reach);
    doc.edit("step", (d) => addStep(d, "conformers", 0, 0));
    const set = doc.getState().sets!.find((s) => s.made?.exit === exit)!;
    doc.edit("place", (d) => addMolecule3d(d, mol((set.x0 + set.x1) / 2, (set.y0 + set.y1) / 2)));
    const placed = doc.getState().molecules3d!;
    const id = placed[placed.length - 1].id;
    doc.edit("hold", (d) => holdMembers(d, set.id, [{ molecule: id }]));
    doc.edit("fit", (d) => framesSettled(d, d, reach));
    const tall = frameOf(doc.getState(), set.id);
    doc.edit("delete", (d) => ({ ...d, molecules3d: (d.molecules3d ?? []).filter((m) => m.id !== id) }));
    return { tall, now: frameOf(doc.getState(), set.id), doc, set };
  };

  it("a card wide and a card high for the first exit, half as high for an exit of its others, its top-left where it was", () => {
    for (const [exit, high] of [["out", CARD_H], ["failed", CARD_H / 2]] as const) {
      const { tall, now } = emptiedOf(exit);
      expect(tall.y1 - tall.y0).toBeGreaterThan(high);
      expect(now.x0).toBeCloseTo(tall.x0, 9);
      expect(now.y1).toBeCloseTo(tall.y1, 9);
      expect(now.x1 - now.x0).toBeCloseTo(CARD_W, 9);
      expect(now.y1 - now.y0).toBeCloseTo(high, 9);
    }
  });

  it("is left alone when it is already that size: the document comes back as it was", () => {
    const { doc, set } = emptiedOf("out");
    const now = doc.getState();
    const before = { ...now, sets: now.sets!.map((s) => (s.id === set.id ? { ...s, members: [{ molecule: 1 }] } : s)) };
    expect(framesFitted(now, before, reach)).toBe(now);
  });

  it("is not made of a set that held nothing before: a made set left empty from the first keeps its frame", () => {
    const doc = createWorkspaceDocument(undefined, undefined, undefined, () => reach);
    doc.edit("set", (d) => addSet(d, { x0: -3, y0: -3, x1: 3, y1: 3 }, { step: 7, exit: "out", holds: "molecules" }));
    doc.edit("place", (d) => addMolecule3d(d, mol(20, 20)));
    expect(frameOf(doc.getState(), 1)).toEqual({ x0: -3, y0: -3, x1: 3, y1: 3 });
  });
});

describe("a numbered structure's room is its own, each structure of a set by its own record", () => {
  it("the first of two structures numbered, the second not: the room is below the first only; and the second numbered, the first not: below the second only", () => {
    const model: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, el: "C", r: 0.9 },
        { id: 2, x: 1.5, y: 0, el: "O", r: 0.9 },
        { id: 3, x: 10, y: 0, el: "C", r: 0.9 },
        { id: 4, x: 11.5, y: 0, el: "O", r: 0.9 },
      ],
      bonds: [
        { id: 5, a: 1, b: 2, order: 1 },
        { id: 6, a: 3, b: 4, order: 1 },
      ],
    };
    const base = { ...createWorkspaceDocument(undefined, undefined, undefined, () => reach).getState(), model };
    const numbered: DrawnRecord = { properties: { number: { value: 4 } } } as unknown as DrawnRecord;
    const of = (first?: DrawnRecord, second?: DrawnRecord) =>
      memberBoxes(base, { id: 9, x0: -3, y0: -3, x1: 14, y1: 3, members: [{ structure: [1, 2], ...(first ? { record: first } : {}) }, { structure: [3, 4], ...(second ? { record: second } : {}) }] } as never, reach)!;
    const plain = of();
    const one = of(numbered);
    expect([one[0].y0, one[1].y0]).toEqual([expect.closeTo(plain[0].y0 - NUMBER_ROOM, 9), expect.closeTo(plain[1].y0, 9)]);
    const two = of(undefined, numbered);
    expect([two[0].y0, two[1].y0]).toEqual([expect.closeTo(plain[0].y0, 9), expect.closeTo(plain[1].y0 - NUMBER_ROOM, 9)]);
  });
});

describe("a structure stays in a set while any one of its atoms is in the frame", () => {
  /** A page with a chain of two carbons, atoms 1 and 2, at x and x + 1.3, in a set whose frame is x from -2 to 2. */
  const start = () => {
    const doc = { ...emptyWorkspaceDocument(), model: { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "C" }, { id: 2, x: 1.3, y: 0, r: 0.9, el: "C" }], bonds: [{ id: 1, a: 1, b: 2, order: 1 as const }] } };
    return membersSettled(addSet(doc, { x0: -2, y0: -2, x1: 2, y1: 2 }), doc);
  };
  const shifted = (doc: WorkspaceDocument, dx: number) => ({ ...doc, model: { ...doc.model, atoms: doc.model.atoms.map((a) => ({ ...a, x: a.x + dx })) } });
  const members = (doc: WorkspaceDocument) => doc.sets![0].members!.map((m) => ("structure" in m ? { structure: m.structure } : m));

  it("its second atom in and its first out: still a member; both out: it leaves", () => {
    const doc = start();
    expect(members(doc)).toEqual([{ structure: [1, 2] }]);
    // (atoms at -2.8 and -1.5: the middle -2.15 is out, atom 2 in)
    expect(members(membersSettled(shifted(doc, -2.8), doc))).toEqual([{ structure: [1, 2] }]);
    expect(members(membersSettled(shifted(doc, -4), doc))).toEqual([]);
  });

  it("is asked of the frame as the page has it now: a set moved far with all it holds keeps them", () => {
    const doc = start();
    const set = doc.sets![0];
    // (the frame and its structure moved together by 10: the atoms are in the frame as it is now, not in the one it was)
    const moved = { ...shifted(doc, 10), sets: [{ ...set, x0: set.x0 + 10, x1: set.x1 + 10 }] };
    expect(members(membersSettled(moved, doc))).toEqual([{ structure: [1, 2] }]);
  });

  it("leaves once every atom is out, over two moves whichever atom was the last in: the second atom in first, then both out", () => {
    const doc = start();
    // (moved left by 2.8: atoms at -2.8 and -1.5, the second in; then by 1.5 more: both out)
    const half = membersSettled(shifted(doc, -2.8), doc);
    expect(members(half)).toEqual([{ structure: [1, 2] }]);
    expect(members(membersSettled(shifted(half, -1.5), half))).toEqual([]);
  });

  it("is asked of the frame as it was before the edit: a frame moved off a structure that stays where it is takes it out", () => {
    const doc = start();
    const set = doc.sets![0];
    // (the frame x from 1.8 to 5.8: the atoms at 0 and 1.3 were in the frame as it was, are in none now)
    const moved = { ...doc, sets: [{ ...set, x0: 1.8, x1: 5.8 }] };
    expect(members(membersSettled(moved, doc))).toEqual([]);
  });
});
