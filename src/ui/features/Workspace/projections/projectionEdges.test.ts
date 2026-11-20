// Held beside projection.test.ts: a cage or a bridged ring system drawn by hand in perspective, with no depth, is not asked after - fitting it to the engine's views takes too long for a menu; none of the flat drawings Meno makes is one; and plain Clean-up marks no centre open on a chair drawn between axial and equatorial - only Draw flat does.
import { describe, expect, it, vi } from "vitest";
import { measured } from "../../../../testing/timeouts";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { cleanUp } from "../chem/cleanUp";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { chair } from "../../../../lib/layout/testdata/projections";
import { isProjection } from "./projection";

const all = (m: Model) => new Set(m.atoms.map((a) => a.id));
/** A structure as it is drawn by hand: the places of the engine's drawing of it, no atom with a depth. */
const byHand = (smiles: string): Model => {
  const m = drawnFromSmiles(smiles);
  return { ...m, atoms: m.atoms.map((a) => ({ ...a, z: undefined })) };
};

describe("a structure drawn by hand whose ring system is a cage or a bridged system in perspective", () => {
  it("is not asked after - norbornane, adamantane and cubane, drawn with no depth, offer no Draw flat, and are answered at once", () => {
    for (const smiles of ["C1CC2CCC1C2", "C1C2CC3CC1CC(C2)C3", "C12C3C4C1C5C2C3C45"]) {
      const m = byHand(smiles);
      expect(isProjection(m, all(m))).toBe(false);
    }
  }, measured(6_000));
});

describe("a flat drawing Meno makes holds no projection", () => {
  it("a cyclohexanol, a pyranose, a decalin, a steroid, a naphthalene and a spiro ring, drawn flat, offer no Draw flat", () => {
    for (const smiles of ["OC1CCCCC1", "OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O", "C1CCC2CCCCC2C1", "C[C@]12CC[C@H]3[C@@H](CCC4=CC(=O)CC[C@]34C)[C@@H]1CC[C@@H]2O", "c1ccc2ccccc2c1", "C1CCC2(CC1)CCCC2"]) {
      const m = drawnFromSmiles(smiles);
      expect(isProjection(m, all(m))).toBe(false);
    }
  });
});

/** A chair drawn by hand, no depth: methyls equatorial at ring atom 0, axial at 1, and at 3 one slanted half way between its places; ring atom k has id k + 1. */
function slanted() {
  const ax = chair({ 0: "equatorial", 1: "axial", 3: "axial" });
  const eq = chair({ 0: "equatorial", 1: "axial", 3: "equatorial" });
  const g = ax.atoms.length - 1;
  const at = ax.atoms[3];
  const unit = (p: { x: number; y: number }) => { const l = Math.hypot(p.x - at.x, p.y - at.y); return { x: (p.x - at.x) / l, y: (p.y - at.y) / l }; };
  const [u, v] = [unit(ax.atoms[g]), unit(eq.atoms[g])];
  const half = { x: u.x + v.x, y: u.y + v.y };
  const l = Math.hypot(half.x, half.y);
  const bond = Math.hypot(ax.atoms[g].x - at.x, ax.atoms[g].y - at.y);
  const atoms = ax.atoms.map((a, i) => ({ id: i + 1, el: "C", r: 0.9, x: i === g ? at.x + (half.x / l) * bond : a.x, y: i === g ? at.y + (half.y / l) * bond : a.y }));
  const bonds = ax.bonds.map((b, k) => ({ id: 100 + k, a: b.a + 1, b: b.b + 1, order: 1 as const }));
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().pasteModel({ atoms, bonds });
  return { doc, store };
}

describe("a centre of a chair drawn between axial and equatorial is marked open by Draw flat only", () => {
  it("Clean-up keeps the chair and puts no note on the atom; Draw flat puts one, on that atom alone", async () => {
    const { doc, store } = slanted();
    await cleanUp(store, null);
    expect(doc.getState().model.atoms.filter((a) => a.unsure).map((a) => a.id)).toEqual([]);
    await cleanUp(store, null, true);
    expect(doc.getState().model.atoms.filter((a) => a.unsure).map((a) => a.id)).toEqual([4]);
  });
});
