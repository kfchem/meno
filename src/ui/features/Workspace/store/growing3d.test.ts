import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { workspaceText } from "../utils/workspace";
import type { Grown3D, Molecule3D } from "./types";

/** A 3D structure whose search goes on (docs/WORKSPACE.md, *As its search goes on*): what it brings shown over the document, written into it once. */

/** Ethanol's heavy atoms, its O-H's H at `k` along: each k a conformer of its own. */
const places = (k: number) => [0, 0, 0, 1.52, 0, 0, 2.0, 1.35, 0, 2.9 + 0.3 * k, 1.5, 0.2 * k];
const atomsAt = (xyz: number[]) => ["C", "C", "O", "H"].map((el, i) => ({ el, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] }));
const searching = (rounds: number) => ({ how: [{ label: "Rounds", text: `${rounds} round${rounds === 1 ? "" : "s"}, ${10 * rounds} tried so far: searching on` }] });
/** Its conformers `ks`, the first its own places, as the page shows them. */
const grown = (ks: number[], rounds: number): Grown3D => ({
  atoms: atomsAt(places(ks[0])),
  ...(ks.length > 1 ? { frames: ks.slice(1).map(places) } : {}),
  energies: ks.map((k) => -154 + k * 0.001),
  made: searching(rounds),
});
const first: Omit<Molecule3D, "id"> = {
  ...grown([0, 1], 1),
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 2, a2: 3, order: 1 },
  ],
  at: { x: 0, y: 0 },
  conformerSet: true,
} as Omit<Molecule3D, "id">;

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const state = () => store.getState();
  const [id] = state().riseMolecules3d([{ m: first, turn: [0, 0, 0, 1], from: { x: 0, y: 0 } }], [], "made3d:1");
  state().startGrowing3d(id, grown([0, 1], 1), "made3d:1");
  return { doc, state, id };
}

describe("a 3D structure whose search goes on", () => {
  it("shows what it brings over the document, which holds what was first made until the search ends", () => {
    const { doc, state, id } = editor();
    state().grow3d(id, grown([0, 1, 2], 2));
    expect(state().molecules3d[0].frames).toHaveLength(2);
    expect(doc.getState().molecules3d?.[0].frames).toHaveLength(1);
    expect(state().growing3d[id]).toBeDefined();
  });

  it("is written into the document once, as it ends: one step with its making where nothing came between", () => {
    const { doc, state, id } = editor();
    state().grow3d(id, grown([0, 1, 2], 2));
    state().settleGrown3d(id);
    expect(state().growing3d[id]).toBeUndefined();
    expect(doc.getState().molecules3d?.[0].frames).toHaveLength(2);
    expect(state().molecules3d[0].made?.how[0].text).toBe("2 rounds, 20 tried so far: searching on");
    expect(doc.history().undoDepth).toBe(1);
    doc.undo();
    expect(state().molecules3d).toEqual([]);
  });

  it("is a step of its own where the chemist did something between, an undo of which leaves what was first made", () => {
    const { doc, state, id } = editor();
    state().grow3d(id, grown([0, 1, 2], 2));
    doc.edit("something else", (d) => ({ ...d, nextId: (d.nextId ?? 1) + 1 }));
    state().settleGrown3d(id);
    expect(doc.history().undoDepth).toBe(3);
    doc.undo();
    expect(state().molecules3d[0].frames).toHaveLength(1);
  });

  it("ends where its molecule goes: an undo that takes it away lets its search go, nothing written", () => {
    const { doc, state, id } = editor();
    doc.undo();
    expect(state().growing3d[id]).toBeUndefined();
    // (what it would bring after: nowhere to go)
    state().grow3d(id, grown([0, 1, 2], 2));
    expect(state().growing3d[id]).toBeUndefined();
    state().settleGrown3d(id);
    expect(doc.getState().molecules3d ?? []).toEqual([]);
  });

  it("keeps the conformer shown shown as more come, a lower one put before it", () => {
    const { state, id } = editor();
    state().setFrame3d(id, 1);
    // (one lower: first; the one shown, conformer 1, now third)
    state().grow3d(id, grown([3, 0, 1], 2));
    expect(state().frames3d[id]).toBe(2);
  });

  it("is said cut short where it is saved while it searches - never taken up again", () => {
    const { state, id } = editor();
    state().grow3d(id, grown([0, 1, 2], 2));
    const rounds = () => (JSON.parse(workspaceText(state())).molecules3d[0].made.how as { label: string; text: string }[]).find((r) => r.label === "Rounds")?.text;
    expect(rounds()).toBe("2 rounds, 20 tried: cut short while it searched");
    // (ended: as it was written, which it ends with)
    state().settleGrown3d(id);
    expect(rounds()).toBe("2 rounds, 20 tried so far: searching on");
  });

  it("ends where its molecule's atoms are edited meanwhile: the edit kept, nothing of the search written over it", () => {
    const { doc, state, id } = editor();
    state().grow3d(id, grown([0, 1, 2], 2));
    state().changeMolecule3d("Move an atom", id, (m) => ({ ...m, atoms: m.atoms.map((a, i) => (i === 3 ? { ...a, x: a.x + 0.5 } : a)) }));
    expect(state().growing3d[id]).toBeUndefined();
    state().grow3d(id, grown([0, 1, 2, 3], 3));
    state().settleGrown3d(id);
    const m = doc.getState().molecules3d![0];
    expect(m.atoms[3].x).toBeCloseTo(places(0)[9] + 0.5, 9);
    expect(m.frames).toHaveLength(1);
    // (moved on the page, its atoms as they were: it goes on)
    const again = editor();
    again.state().changeMolecule3d("Move it", again.id, (x) => ({ ...x, at: { x: 5, y: 5 } }));
    expect(again.state().growing3d[again.id]).toBeDefined();
  });

  it("is written whole as it ends: frames it no longer has gone - one conformer, none after its own", () => {
    const { doc, state, id } = editor();
    state().grow3d(id, grown([0], 2));
    state().settleGrown3d(id);
    expect(doc.getState().molecules3d![0].frames).toBeUndefined();
  });

  it("shows what it brings through a talk's look switched, and lets it go where told to", () => {
    const { state, id } = editor();
    state().grow3d(id, grown([0, 1, 2], 2));
    state().switchTalkLook3d(id);
    expect(state().molecules3d[0].frames).toHaveLength(2);
    state().endTalkLooks();
    expect(state().molecules3d[0].frames).toHaveLength(2);
    state().grow3d(id, null);
    expect(state().growing3d[id]).toBeUndefined();
    expect(state().molecules3d[0].frames).toHaveLength(1);
  });
});
