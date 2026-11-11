import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { mayBecome, mergeTarget, SNAP_CLEAR } from "./dropMerge";
import { computeMoveSnap, onAnotherAtom } from "./moveSnap";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Model } from "../store/types";

const L = NOMINAL_BOND_LENGTH;
const atom = (id: number, x: number, y: number) => ({ id, x, y, r: 0.9, el: "C" });
const bond = (id: number, a: number, b: number) => ({ id, a, b, order: 1 as const, stereo: "none" as const });

/** A tert-butyl on a carbon: the centre (1) with its parent (2) and three methyls (3, 4, 5), drawn as a cross. */
function tBu(): Model {
  return {
    atoms: [atom(1, 0, 0), atom(2, -L, 0), atom(3, L, 0), atom(4, 0, L), atom(5, 0, -L)],
    bonds: [bond(11, 1, 2), bond(12, 1, 3), bond(13, 1, 4), bond(14, 1, 5)],
  };
}

describe("dragging the centre of a tert-butyl", () => {
  it("never snaps onto, or all but onto, one of its methyls, wherever the pointer goes", () => {
    const model = tBu();
    for (let x = -2 * L; x <= 2 * L; x += L / 8) {
      for (let y = -2 * L; y <= 2 * L; y += L / 8) {
        const snap = computeMoveSnap(model, 1, { x, y });
        expect(onAnotherAtom(model, 1, { x: snap.px, y: snap.py }, L, SNAP_CLEAR)).toBe(false);
      }
    }
  });

  it("does not become a methyl or its parent, dropped with the pointer on one", () => {
    const model = tBu();
    for (const id of [2, 3, 4, 5]) {
      const a = model.atoms.find((x) => x.id === id)!;
      expect(mergeTarget(model, 1, { x: a.x, y: a.y })).toBeNull();
    }
  });
});

describe("an atom with one bond", () => {
  it("snaps to the nearest angle where no atom stands, never onto one", () => {
    // 1 bonded to 2 (to its right); 3 stands where 1 would snap to, 30 degrees up from 2's axis
    const turn = Math.PI / 6;
    const model: Model = {
      atoms: [atom(1, 0, 0), atom(2, L, 0), atom(3, L + L * Math.cos(turn), L * Math.sin(turn))],
      bonds: [bond(11, 1, 2)],
    };
    // (the pointer up and to the right of 2: the snap that is taken is the neighbour's)
    const snap = computeMoveSnap(model, 1, { x: L + L * Math.cos(turn), y: L * Math.sin(turn) + 0.01 });
    expect(onAnotherAtom(model, 1, { x: snap.px, y: snap.py }, L)).toBe(false);
    expect(Math.hypot(snap.px - L, snap.py)).toBeCloseTo(L);
  });
});

describe("a bond onto a bond", () => {
  // 1-3 and 2-3: atom 1 dragged onto atom 2 would fold two bonds into one
  const model: Model = { atoms: [atom(1, 0, 0), atom(2, 2 * L, 0), atom(3, L, L)], bonds: [bond(11, 1, 3), bond(12, 2, 3)] };

  it("is no merge: an atom sharing a neighbour is not become", () => {
    expect(mayBecome(model, 1, 2)).toBe(false);
    expect(mergeTarget(model, 1, { x: 2 * L, y: 0 })).toBeNull();
  });

  it("leaves both bonds when the drop is made anyway", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const a = st().addAtom(0, 0, "C");
    const b = st().addAtom(2 * L, 0, "C");
    const c = st().addAtom(L, L, "C");
    st().connectAtoms(a, c, 1);
    st().connectAtoms(b, c, 1);
    const before = st().model;
    st().replaceDraggedAtomWith(a, b);
    expect(st().model.atoms).toHaveLength(3);
    expect(st().model.bonds).toHaveLength(2);
    expect(st().model.bonds).toEqual(before.bonds);
  });
});

describe("a ring closed by a drag", () => {
  // a chain 1-2-3-4 with its end 4 dragged onto 1: the one merge that is meant
  const chain: Model = {
    atoms: [atom(1, 0, 0), atom(2, L, 0), atom(3, L, L), atom(4, 0.1 * L, L)],
    bonds: [bond(11, 1, 2), bond(12, 2, 3), bond(13, 3, 4)],
  };

  it("is shown as the drop will do it: the pointer on the atom, no neighbour of the dragged one", () => {
    expect(mergeTarget(chain, 4, { x: 0.05, y: 0.05 })).toBe(1);
    // (near the atom, but not on it)
    expect(mergeTarget(chain, 4, { x: 0.6 * L, y: 0 })).toBeNull();
  });

  it("becomes that atom as one undo step, and undo puts everything back", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const ids = chain.atoms.map((a) => st().addAtom(a.x, a.y, "C"));
    st().connectAtoms(ids[0], ids[1], 1);
    st().connectAtoms(ids[1], ids[2], 1);
    st().connectAtoms(ids[2], ids[3], 1);
    const before = JSON.parse(JSON.stringify(st().model));
    const depth = doc.history().undoDepth;
    st().replaceDraggedAtomWith(ids[3], ids[0]);
    expect(st().model.atoms.map((a) => a.id)).toEqual(ids.slice(0, 3));
    expect(st().model.bonds).toHaveLength(3);
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect(JSON.parse(JSON.stringify(st().model))).toEqual(before);
  });
});
