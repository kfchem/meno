import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { fragmentOf, fragmentsHolding, fragmentsOf, partOf } from "../chem/cleanUp";
import { identityOfDrawn } from "../chem/identityOf";
import * as ops from "../document";
import { createWorkspaceDocument, emptyWorkspaceDocument } from "../document";
import type { Atom, Bond, Model } from "../store/types";
import { structuresOf } from "../workflow/entries";
import { blocksOf } from "../chem/make3d";
import { joinedAdded, joinedStructures, joinsSettled, separatedStructures } from "./joinedParts";
import { readWorkspace, workspaceText } from "./workspace";

/** Sodium acetate drawn as two structures - the acetate (ids 1-4), Na+ (5) beside it - and ethanol (11-13) apart. */
function page(): Model {
  const at = (id: number, el: string, x: number, y: number, charge?: number): Atom => ({ id, el, x: x * L, y: y * L, r: 0, ...(charge ? { charge } : {}) }) as Atom;
  const bond = (id: number, a: number, b: number, order: 1 | 2): Bond => ({ id, a, b, order }) as Bond;
  return {
    atoms: [at(1, "C", 0, 0), at(2, "C", 0.87, 0.5), at(3, "O", 1.73, 0), at(4, "O", 0.87, 1.5, -1), at(5, "Na", 3, 0.5, 1), at(11, "C", 0, 5), at(12, "C", 0.87, 5.5), at(13, "O", 1.73, 5)],
    bonds: [bond(21, 1, 2, 1), bond(22, 2, 3, 2), bond(23, 2, 4, 1), bond(31, 11, 12, 1), bond(32, 12, 13, 1)],
  } as Model;
}
const sorted = (s: Iterable<number>) => [...s].sort((p, q) => p - q);

describe("one structure of several parts", () => {
  it("is made of the structures selected, one number on all their atoms, nothing moved - and taken apart again", () => {
    const m = page();
    const joined = joinedStructures(m, [1, 5]);
    const n = joined.atoms.find((a) => a.id === 1)!.joined;
    expect(n).toBeDefined();
    expect(joined.atoms.filter((a) => a.joined === n).map((a) => a.id)).toEqual([1, 2, 3, 4, 5]);
    expect(joined.atoms.map((a) => [a.x, a.y])).toEqual(m.atoms.map((a) => [a.x, a.y]));
    expect(joined.atoms.find((a) => a.id === 11)!.joined).toBeUndefined();
    // (one structure alone: nothing to join)
    expect(joinedStructures(m, [1, 2])).toBe(m);
    const apart = separatedStructures(joined, [5]);
    expect(apart.atoms.every((a) => a.joined == null)).toBe(true);
  });

  it("is one structure to what asks for one - selecting it, its 3D, a set's entries - but pieces to Clean-up", () => {
    const m = joinedStructures(page(), [1, 5]);
    expect(sorted(fragmentOf(m, 5))).toEqual([1, 2, 3, 4, 5]);
    expect(fragmentsHolding(m, [1]).map(sorted)).toEqual([[1, 2, 3, 4, 5]]);
    expect(fragmentsHolding(m, [1], false).map(sorted)).toEqual([[1, 2, 3, 4]]);
    // (the lone Na+ among the structures once joined; not, as Clean-up asks, a piece of its own - a lone atom never is)
    expect(fragmentsOf(m).map(sorted)).toEqual([[1, 2, 3, 4, 5], [11, 12, 13]]);
    expect(fragmentsOf(m, false).map(sorted)).toEqual([[1, 2, 3, 4], [11, 12, 13]]);
    expect(structuresOf(m).map(sorted)).toEqual([[1, 2, 3, 4, 5], [11, 12, 13]]);
    // (unjoined: each its own, as before)
    expect(structuresOf(page()).map(sorted)).toEqual([[1, 2, 3, 4], [5], [11, 12, 13]]);
  });

  it("has the identity of all its parts and their charges; a single molecule's is unchanged", () => {
    const plain = page();
    const m = joinedStructures(plain, [1, 5]);
    const whole = identityOfDrawn(partOf(m, fragmentOf(m, 1))).text;
    expect(whole).toBe(identityOfDrawn(partOf(plain, new Set([1, 2, 3, 4, 5]))).text);
    expect(whole).not.toBe(identityOfDrawn(partOf(plain, new Set([1, 2, 3, 4]))).text);
    expect(whole).not.toBe(identityOfDrawn(partOf(plain, new Set([5]))).text);
    // (its charge the parts' sum: none)
    expect(partOf(m, fragmentOf(m, 1)).atoms.reduce((t, a) => t + (a.charge ?? 0), 0)).toBe(0);
    // (ethanol, joined to nothing, as it was)
    expect(identityOfDrawn(partOf(m, fragmentOf(m, 11))).text).toBe(identityOfDrawn(partOf(plain, new Set([11, 12, 13]))).text);
  });

  it("keeps its number only while it joins two pieces: left on one - the rest deleted, or read so - it is dropped", () => {
    const m = joinedStructures(page(), [1, 5]);
    expect(joinsSettled(m)).toBe(m);
    const naGone = { ...m, atoms: m.atoms.filter((a) => a.id !== 5) };
    expect(joinsSettled(naGone).atoms.every((a) => a.joined == null)).toBe(true);
    // (in the document: an edit deleting Na+ takes the number off the acetate in the same step; undo gives it back)
    const store = createWorkspaceDocument();
    store.reset({ ...emptyWorkspaceDocument(), model: m, nextId: 100 });
    store.edit("delete", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.filter((a) => a.id !== 5) } }));
    expect(store.getState().model.atoms.every((a) => a.joined == null)).toBe(true);
    store.undo();
    expect(store.getState().model.atoms.filter((a) => a.joined != null).length).toBe(5);
    // (opened from a file so: dropped as it is read - document replaceModel)
    const read = ops.replaceModel(emptyWorkspaceDocument(), naGone);
    expect(read.model.atoms.every((a) => a.joined == null)).toBe(true);
  });

  it("brought in by a paste, joins nothing on the page: its number made fresh", () => {
    const m = joinedStructures(page(), [1, 5]);
    const pasted = joinedAdded(m.atoms.filter((a) => a.joined != null), m.atoms);
    const here = m.atoms.find((a) => a.joined != null)!.joined!;
    expect(new Set(pasted.map((a) => a.joined)).size).toBe(1);
    expect(pasted[0].joined).not.toBe(here);
    const doc = ops.appendModel({ ...emptyWorkspaceDocument(), model: m, nextId: 100 }, { atoms: m.atoms.filter((a) => a.joined != null), bonds: m.bonds.filter((b) => b.a <= 5) });
    const numbers = new Set(doc.model.atoms.map((a) => a.joined).filter((n) => n != null));
    expect(numbers.size).toBe(2);
  });

  it("is made and taken apart as one undo step each", () => {
    const store = createWorkspaceDocument();
    store.reset({ ...emptyWorkspaceDocument(), model: page(), nextId: 100 });
    store.edit("make one structure", (d) => ops.joinStructures(d, [1, 5]));
    expect(store.getState().model.atoms.filter((a) => a.joined != null).length).toBe(5);
    store.edit("separate", (d) => ops.separateStructures(d, [1]));
    expect(store.getState().model.atoms.every((a) => a.joined == null)).toBe(true);
    store.undo();
    expect(store.getState().model.atoms.filter((a) => a.joined != null).length).toBe(5);
  });

  it("is kept in the workspace's file, read back with its number", () => {
    const m = joinedStructures(page(), [1, 5]);
    const text = workspaceText({ model: m, arrows: [], pluses: [], captions: [], molecules3d: [], turns3d: {}, frames3d: {}, lists3d: {}, aromaticEnabled: false, aromaticRings: {} });
    const back = readWorkspace(text)!.drawn;
    expect(back.atoms.filter((a) => a.joined != null).map((a) => a.id).sort((p, q) => p - q)).toEqual([1, 2, 3, 4, 5]);
  });

  it("is one block for its 3D, its parts in it - set side by side as a salt's are (chem/partsApart)", () => {
    const m = joinedStructures(page(), [1, 5]);
    const blocks = blocksOf(m, [1]);
    expect(blocks.length).toBe(1);
    expect(sorted(blocks[0].atoms)).toEqual([1, 2, 3, 4, 5]);
    expect(blocksOf(page(), [1]).map((b) => sorted(b.atoms))).toEqual([[1, 2, 3, 4]]);
  });
});
