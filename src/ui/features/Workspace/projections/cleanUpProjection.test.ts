import { describe, expect, it } from "vitest";
import { cleanUp } from "../chem/cleanUp";
import { identityOfDrawn } from "../chem/identityOf";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { chair } from "../../../../lib/layout/testdata/projections";
import { chairDrawing, seenPlaces } from "./chair";

/** A trans-1,2-dimethylcyclohexane drawn as a chair, on a page. */
function page() {
  const d = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 });
  const atoms = [...d.atoms];
  const bonds = [...d.bonds];
  [[0, 1], [1, -1]].forEach(([k, face], i) => {
    const free = d.solid.free.find((f) => f.at === k && f.face === face)!;
    const place = seenPlaces(d, k).find((p) => p.free === free)!;
    atoms.push({ id: 20 + i, el: "C", r: 0.9, x: place.place.x, y: place.place.y });
    bonds.push({ id: 30 + i, a: d.ring[k], b: 20 + i, order: 1 });
  });
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().pasteModel({ atoms, bonds });
  return { doc, store };
}

describe("Clean-up and a projection", () => {
  it("keeps a chair where it is drawn, its depth with it, the compound the same", async () => {
    const { doc, store } = page();
    const was = doc.getState().model;
    const ring = (m: typeof was) => m.atoms.filter((a) => a.id < 20).map((a) => [a.id, a.x, a.y, a.z]);
    await cleanUp(store, null);
    const now = doc.getState().model;
    expect(ring(now)).toEqual(ring(was));
    expect(identityOfDrawn(now).text).toBe(identityOfDrawn(was).text);
  });

  it("leaves open, by Draw flat, a centre of a chair drawn by hand whose group is drawn neither axial nor equatorial: no wedge guessed (found in review)", async () => {
    // (a chair drawn by hand, no depth: methyls equatorial at ring atom 0 and axial at 1, and at 3 one slanted halfway between its two places)
    const ax = chair({ 0: "equatorial", 1: "axial", 3: "axial" });
    const eq = chair({ 0: "equatorial", 1: "axial", 3: "equatorial" });
    const g = ax.atoms.length - 1;
    const at = ax.atoms[3];
    const unit = (p: { x: number; y: number }) => {
      const l = Math.hypot(p.x - at.x, p.y - at.y);
      return { x: (p.x - at.x) / l, y: (p.y - at.y) / l };
    };
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
    const was = identityOfDrawn(doc.getState().model).text;
    await cleanUp(store, null, true);
    const now = doc.getState().model;
    const wedgedAt = (ring: number) => now.bonds.some((b) => b.stereo && (b.a === ring + 1 || b.b === ring + 1));
    expect([0, 1, 3].map(wedgedAt)).toEqual([true, true, false]);
    expect(identityOfDrawn(now).text).toBe(was);
  });

  it("is laid out flat by Draw flat: no depth left, the compound the same", async () => {
    const { doc, store } = page();
    const was = identityOfDrawn(doc.getState().model).text;
    await cleanUp(store, null, true);
    const now = doc.getState().model;
    expect(now.atoms.every((a) => a.z == null)).toBe(true);
    expect(identityOfDrawn(now).text).toBe(was);
  });
});
