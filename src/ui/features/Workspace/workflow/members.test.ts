import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Member, Molecule3D } from "../store/types";
import { collectionHash, setMembers } from "./entries";
import { addSet, fitSets, markMade, membersSettled, resizeSet } from "./model";

/** Water at `at` on the page. */
function water(at: { x: number; y: number }): Omit<Molecule3D, "id"> {
  return {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: -0.24, y: 0.93, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    at,
  };
}

/** A page with a chain of two carbons (atoms `id`, `id + 1`) at each of `at`. */
function page(...at: { x: number; y: number; id: number }[]): WorkspaceDocument {
  const doc = emptyWorkspaceDocument();
  return {
    ...doc,
    model: {
      atoms: at.flatMap((p) => [
        { id: p.id, x: p.x, y: p.y, r: 0.9, el: "C" },
        { id: p.id + 1, x: p.x + 1.3, y: p.y, r: 0.9, el: "C" },
      ]),
      bonds: at.map((p) => ({ id: p.id, a: p.id, b: p.id + 1, order: 1 as const })),
    },
  };
}

/** An edit as the document settles it: sets fitted to what they hold, then their members. */
const settled = (next: WorkspaceDocument, before: WorkspaceDocument) => membersSettled(fitSets(next, before), before);
/** The molecule `id` moved to `at`. */
const movedTo = (doc: WorkspaceDocument, id: number, at: { x: number; y: number }) => ({ ...doc, molecules3d: doc.molecules3d!.map((m) => (m.id === id ? { ...m, at } : m)) });
const membersOfSet = (doc: WorkspaceDocument, id = 1) => doc.sets!.find((b) => b.id === id)!.members;

describe("a set's members", () => {
  it("are what lies inside its frame as it is made, in reading order: row by row, each left to right", () => {
    let doc = page({ x: 6, y: 0, id: 1 }, { x: 0, y: 0, id: 3 }, { x: 0, y: 4, id: 5 });
    doc = addMolecule3d(doc, water({ x: 3, y: -4 }));
    doc = addSet(doc, { x0: -2, y0: -6, x1: 10, y1: 6 });
    expect(membersOfSet(doc)).toEqual([{ structure: [5, 6] }, { structure: [3, 4] }, { structure: [1, 2] }, { molecule: 1 }]);
  });

  it("take in what is dropped into a chemist's set, at its place in reading order, and let go of what is dragged out", () => {
    let doc = addMolecule3d(addMolecule3d(emptyWorkspaceDocument(), water({ x: 0, y: 0 })), water({ x: 8, y: 0 }));
    doc = addMolecule3d(doc, water({ x: 30, y: 0 }));
    doc = addSet(doc, { x0: -2, y0: -2, x1: 10, y1: 2 });
    expect(membersOfSet(doc)).toEqual([{ molecule: 1 }, { molecule: 2 }]);
    // dropped in between the two: it joins between them
    const dropped = settled(movedTo(doc, 3, { x: 4, y: 0 }), doc);
    expect(membersOfSet(dropped)).toEqual([{ molecule: 1 }, { molecule: 3 }, { molecule: 2 }]);
    // dragged out again: it leaves
    const out = settled(movedTo(dropped, 3, { x: 30, y: 0 }), dropped);
    expect(membersOfSet(out)).toEqual([{ molecule: 1 }, { molecule: 2 }]);
  });

  it("keep their order when moved within the frame - the order is the set's, not the page's", () => {
    let doc = addMolecule3d(addMolecule3d(emptyWorkspaceDocument(), water({ x: 0, y: 0 })), water({ x: 8, y: 0 }));
    doc = addSet(doc, { x0: -2, y0: -2, x1: 10, y1: 2 });
    const swapped = settled(movedTo(movedTo(doc, 1, { x: 8.5, y: 0 }), 2, { x: 0.5, y: 0 }), doc);
    expect(membersOfSet(swapped)).toEqual([{ molecule: 1 }, { molecule: 2 }]);
  });

  it("follow a resized frame in one edit: what newly lies inside joins, what newly lies outside leaves", () => {
    let doc = addMolecule3d(addMolecule3d(emptyWorkspaceDocument(), water({ x: 0, y: 0 })), water({ x: 8, y: 0 }));
    doc = addMolecule3d(doc, water({ x: 14, y: 0 }));
    doc = addSet(doc, { x0: -2, y0: -2, x1: 10, y1: 2 });
    const resized = settled(resizeSet(doc, 1, { x0: 6, y0: -2, x1: 16, y1: 2 }), doc);
    expect(membersOfSet(resized)).toEqual([{ molecule: 2 }, { molecule: 3 }]);
  });

  it("drop a member deleted from the page, with nothing asked", () => {
    let doc = addMolecule3d(addMolecule3d(emptyWorkspaceDocument(), water({ x: 0, y: 0 })), water({ x: 8, y: 0 }));
    doc = addSet(doc, { x0: -2, y0: -2, x1: 10, y1: 2 });
    const gone = settled({ ...doc, molecules3d: doc.molecules3d!.filter((m) => m.id !== 1) }, doc);
    expect(membersOfSet(gone)).toEqual([{ molecule: 2 }]);
    expect(setMembers(gone, gone.sets![0]).molecules).toEqual([2]);
  });

  it("follow a structure's atoms: drawn on, it stays one member; joined to another inside, the two are one", () => {
    let doc = page({ x: 0, y: 0, id: 1 }, { x: 0, y: 4, id: 3 });
    doc = addSet(doc, { x0: -2, y0: -2, x1: 6, y1: 6 });
    expect(membersOfSet(doc)).toEqual([{ structure: [3, 4] }, { structure: [1, 2] }]);
    // a bond between them: one structure
    const joined = { ...doc, model: { ...doc.model, bonds: [...doc.model.bonds, { id: 9, a: 2, b: 3, order: 1 as const }] } };
    const after = settled(joined, doc);
    expect(membersOfSet(after)).toHaveLength(1);
    expect(setMembers(after, after.sets![0]).structures.map((ids) => [...ids].sort())).toEqual([[1, 2, 3, 4]]);
  });

  it("of a step's result set take nothing in: what it holds is its step's", () => {
    let doc = addMolecule3d(addMolecule3d(emptyWorkspaceDocument(), water({ x: 0, y: 0 })), water({ x: 30, y: 0 }));
    doc = addSet(doc, { x0: -2, y0: -2, x1: 10, y1: 2 });
    doc = markMade(doc, 1, { step: 7, holds: "molecules" as never }, undefined);
    const dropped = settled(movedTo(doc, 2, { x: 4, y: 0 }), doc);
    expect(membersOfSet(dropped)).toEqual([{ molecule: 1 }]);
  });

  it("are what lies inside the frame, once, for a set that has none yet - one read from a file saved before sets kept them", () => {
    let doc = addMolecule3d(emptyWorkspaceDocument(), water({ x: 0, y: 0 }));
    doc = { ...doc, sets: [{ id: 1, x0: -2, y0: -2, x1: 2, y1: 2 }], nextWorkflowId: 2 };
    const read = settled({ ...doc, pageId: doc.pageId }, { ...doc, sets: [] });
    expect(membersOfSet(read)).toEqual([{ molecule: 1 }] satisfies Member[]);
  });
});

describe("a set's collection hash", () => {
  it("is the same for the same members, and another for another order or another geometry", () => {
    let doc = addMolecule3d(addMolecule3d(emptyWorkspaceDocument(), water({ x: 0, y: 0 })), water({ x: 8, y: 0 }));
    doc = addSet(doc, { x0: -2, y0: -2, x1: 10, y1: 2 });
    const set = doc.sets![0];
    const hash = collectionHash(doc, set);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(collectionHash(doc, { ...set })).toBe(hash);
    // (moved on the page, the same: where it lies is no part of what it is)
    expect(collectionHash(movedTo(doc, 1, { x: 1, y: 0 }), set)).toBe(hash);
    const bent = { ...doc, molecules3d: doc.molecules3d!.map((m, i) => (i === 0 ? { ...m, atoms: m.atoms.map((a, k) => (k === 2 ? { ...a, y: 1.2 } : a)) } : m)) };
    expect(collectionHash(bent, set)).not.toBe(hash);
    // (two waters alike in another order: their geometries alike, the same hash - one of a different geometry first, another)
    expect(collectionHash(bent, { ...set, members: [{ molecule: 2 }, { molecule: 1 }] })).not.toBe(collectionHash(bent, set));
  });
});
