import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { workspaceText } from "../utils/workspace";
import type { Grown3D, Molecule3D } from "./types";
import type { Conformers } from "../../../../lib/roles/client";
import { Growing, type ShownWith } from "../chem/growing";
import { CHLOROETHANE, chloroethane, roundOf } from "../chem/testdata/turnedConformers";

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

  it("does nothing once its search has ended - written, its molecule gone or edited - nor is begun again by it", () => {
    const { state, id } = editor();
    state().grow3d(id, grown([0, 1, 2], 2));
    state().settleGrown3d(id);
    const before = state().molecules3d;
    expect(() => state().grow3d(id, grown([0, 1, 2, 3], 3))).not.toThrow();
    expect(state().growing3d[id]).toBeUndefined();
    expect(state().molecules3d).toBe(before);
  });

  it("ends where a conformer of its molecule is taken away meanwhile, its atoms as they were", () => {
    const { state, id } = editor();
    state().grow3d(id, grown([0, 1, 2], 2));
    state().changeMolecule3d("Take a conformer away", id, (m) => ({ ...m, frames: [] }));
    expect(state().growing3d[id]).toBeUndefined();
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

  it("keeps the conformer shown shown, each atom where it was, as a later round finds a lower one: chloroethane, its methyl turned", () => {
    // (what the page is given as it grows, made as the page makes it (chem/growing) - A at 60, 180 and 300 degrees, S at 30, 150, 270;
    //  then B, lower, its H's named from another: by hand, S is third and nothing of it moves)
    const plain = { open: { drawn: { atoms: [], bonds: [] } }, checks: null, parts: [[0, 1, 2, 3, 4, 5, 6, 7]], reflect: false } as unknown as ShownWith;
    const g = new Growing(CHLOROETHANE.atoms, CHLOROETHANE.bonds, 5, plain);
    const asGrown = (c: Conformers): Grown3D => ({
      atoms: c.atoms.map((a, i) => ({ el: a.el, x: c.frames[0][3 * i], y: c.frames[0][3 * i + 1], z: c.frames[0][3 * i + 2] })),
      frames: c.frames.slice(1),
      energies: c.energies,
      made: searching(1),
    });
    const one = roundOf(CHLOROETHANE, [chloroethane([60, 180, 300]), chloroethane([30, 150, 270])], [-500, -499.9999]);
    g.add(one, one.energies!);
    const before = asGrown(g.shown()!);
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const state = () => store.getState();
    const m = { ...before, bonds: CHLOROETHANE.bonds, at: { x: 0, y: 0 }, conformerSet: true } as Omit<Molecule3D, "id">;
    const [id] = state().riseMolecules3d([{ m, turn: [0, 0, 0, 1], from: { x: 0, y: 0 } }], [], "made3d:1");
    state().startGrowing3d(id, before, "made3d:1");
    state().setFrame3d(id, 1);
    const two = roundOf(CHLOROETHANE, [chloroethane([120, 240, 0])], [-500.0001]);
    g.add(two, two.energies!);
    state().grow3d(id, asGrown(g.shown()!));
    expect(state().frames3d[id]).toBe(2);
    const shown = state().molecules3d[0].frames![1];
    before.frames![0].forEach((v, i) => expect(Math.abs(shown[i] - v)).toBeLessThan(1e-3));
  });
});

/** The frames chip's notice that a later round found a lower conformer (docs/WORKSPACE.md, *As its search goes on*): the view's, by molecule. */
describe("a 3D structure whose search finds a lower conformer", () => {
  // (the places shown: its own geometry's, or its frame's)
  const shownPlaces = (st: ReturnType<ReturnType<typeof editor>["state"]>) => {
    const m = st.molecules3d[0];
    const f = st.frames3d[m.id] ?? 0;
    return f === 0 ? m.atoms.flatMap((a) => [a.x, a.y, a.z]) : [...m.frames![f - 1]];
  };

  it("no conformer picked, shows the lowest found - round after round - and marks nothing", () => {
    const { state, id } = editor();
    expect(state().following3d[id]).toBe(true);
    state().grow3d(id, grown([-1, 0, 1], 2));
    expect(state().frames3d[id] ?? 0).toBe(0);
    expect(shownPlaces(state())).toEqual(places(-1));
    expect(state().lowerFound3d).toEqual({});
    state().grow3d(id, grown([-2, -1, 0, 1], 3));
    expect(state().frames3d[id] ?? 0).toBe(0);
    expect(shownPlaces(state())).toEqual(places(-2));
    expect(state().lowerFound3d).toEqual({});
  });

  it("while the chemist turns or moves it, keeps the one shown, and shows the lowest at the release", () => {
    const { state, id } = editor();
    state().setInHand3d([id]);
    state().grow3d(id, grown([-1, 0, 1], 2));
    expect(state().frames3d[id]).toBe(1);
    expect(shownPlaces(state())).toEqual(places(0));
    state().grow3d(id, grown([-1, 0, 1, 2], 3));
    expect(state().frames3d[id]).toBe(1);
    state().setInHand3d([]);
    expect(state().frames3d[id]).toBe(0);
    expect(shownPlaces(state())).toEqual(places(-1));
    expect(state().lowerFound3d).toEqual({});
  });

  it("a conformer picked - even the lowest - stays shown as a lower one comes, its number up by one, and the chip is marked", () => {
    const { state, id } = editor();
    state().setFrame3d(id, 0);
    expect(state().following3d[id]).toBeUndefined();
    state().grow3d(id, grown([-1, 0, 1], 2));
    expect(state().frames3d[id]).toBe(1);
    expect(shownPlaces(state())).toEqual(places(0));
    expect(state().lowerFound3d[id]).toBe("lower");
  });

  it("marks it too where another was picked, which stays shown", () => {
    const { state, id } = editor();
    state().setFrame3d(id, 1);
    state().grow3d(id, grown([-1, 0, 1], 2));
    expect(state().frames3d[id]).toBe(2);
    expect(state().lowerFound3d[id]).toBe("lower");
  });

  it("changes nothing and marks nothing where what comes is higher than the lowest, picked or not", () => {
    const { state, id } = editor();
    state().grow3d(id, grown([0, 1, 2], 2));
    expect(state().frames3d[id]).toBeUndefined();
    expect(state().lowerFound3d).toEqual({});
    state().setFrame3d(id, 1);
    state().grow3d(id, grown([0, 1, 2, 3], 3));
    expect(state().frames3d[id]).toBe(1);
    expect(state().lowerFound3d).toEqual({});
  });

  it("keeps the mark as yet another lower one comes and as the search ends, the one picked moving on with them", () => {
    const { state, id } = editor();
    state().setFrame3d(id, 0);
    state().grow3d(id, grown([-1, 0, 1], 2));
    state().grow3d(id, grown([-2, -1, 0, 1], 3));
    expect(state().lowerFound3d[id]).toBe("lower");
    expect(state().frames3d[id]).toBe(2);
    state().grow3d(id, null);
    state().settleGrown3d(id);
    expect(state().lowerFound3d[id]).toBe("lower");
  });

  it("the dot pressed: shows the lowest, the mark goes, and the lowest is followed again", () => {
    const { state, id } = editor();
    state().setFrame3d(id, 1);
    state().grow3d(id, grown([-1, 0, 1], 2));
    state().followLowest3d(id);
    expect(state().frames3d[id]).toBe(0);
    expect(state().lowerFound3d).toEqual({});
    expect(state().following3d[id]).toBe(true);
    state().grow3d(id, grown([-2, -1, 0, 1], 3));
    expect(state().frames3d[id]).toBe(0);
    expect(shownPlaces(state())).toEqual(places(-2));
    expect(state().lowerFound3d).toEqual({});
  });

  it("the mark goes as the chemist picks any conformer - the one shown too", () => {
    const { state, id } = editor();
    state().setFrame3d(id, 0);
    state().grow3d(id, grown([-1, 0, 1], 2));
    state().setFrame3d(id, state().frames3d[id]);
    expect(state().lowerFound3d).toEqual({});
    expect(state().following3d[id]).toBeUndefined();
  });

  it("a conformer picked that leaves the energy window: the lowest shown, the chip marked so; a lower one after it marks that", () => {
    const { state, id } = editor();
    state().setFrame3d(id, 1);
    // (conformer 1, shown, left out: a lower one took the window past it)
    state().grow3d(id, grown([-1, 0], 2));
    expect(state().frames3d[id]).toBe(0);
    expect(state().lowerFound3d[id]).toBe("window");
    expect(state().following3d[id]).toBeUndefined();
    // (the lowest it shows now no longer the lowest, kept shown: marked as a lower one found)
    state().grow3d(id, grown([-2, -1, 0], 3));
    expect(state().frames3d[id]).toBe(1);
    expect(state().lowerFound3d[id]).toBe("lower");
  });

  it("the lowest picked that leaves the window: the lowest shown and marked; following, it is shown and nothing marked", () => {
    const { state, id } = editor();
    state().grow3d(id, grown([-9, -8], 2));
    expect(state().frames3d[id] ?? 0).toBe(0);
    expect(state().lowerFound3d).toEqual({});
    const other = editor();
    other.state().setFrame3d(other.id, 0);
    other.state().grow3d(other.id, grown([-9, -8], 2));
    expect(other.state().frames3d[other.id]).toBe(0);
    expect(other.state().lowerFound3d[other.id]).toBe("window");
  });

  it("is forgotten as its structure's search begins afresh, as its molecule goes, and is never saved", () => {
    const { doc, state, id } = editor();
    state().setFrame3d(id, 0);
    state().grow3d(id, grown([-1, 0, 1], 2));
    expect(workspaceText(state())).not.toContain("lowerFound");
    expect(workspaceText(state())).not.toContain("following");
    state().followLowest3d(id);
    state().startGrowing3d(id, grown([0, 1], 1), "made3d:2");
    expect(state().lowerFound3d).toEqual({});
    expect(state().following3d[id]).toBe(true);
    state().grow3d(id, grown([-1, 0, 1], 2));
    doc.undo();
    expect(state().lowerFound3d).toEqual({});
    expect(state().following3d).toEqual({});
  });
});
