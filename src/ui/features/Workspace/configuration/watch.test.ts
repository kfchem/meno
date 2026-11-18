import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { configurationChanges } from "./changes";
import { MENO_MOVES, watchConfiguration } from "./watch";
import { cleanUp } from "../chem/cleanUp";
import { cipMarksAsked } from "../chem/cipRun";

// Foundation part 15, phase 2: a change of what the drawing states, said at its unit once the edit is done (the brief's known answers).

/** (R)-butan-2-ol drawn flat (its OH on a wedge toward the viewer: R; on a hash: S): C2 (id 1) with its methyl (2), its ethyl's CH2 (3) and CH3 (5), and its OH (4) on a wedge. */
function butanol(wedge: "up" | "down" | null = "up"): Model {
  const p = (deg: number, r = L) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  const at = (id: number, q: { x: number; y: number }, el = "C") => ({ id, ...q, r: 0.9, el });
  const c3 = p(330);
  return {
    atoms: [at(1, p(0, 0)), at(2, p(210)), at(3, c3), at(4, p(90), "O"), at(5, { x: c3.x + L * Math.cos(Math.PI / 6), y: c3.y + L * Math.sin(Math.PI / 6) })],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 1, b: 3, order: 1 },
      { id: 12, a: 1, b: 4, order: 1, ...(wedge ? { stereo: wedge, narrow: 1 } : {}) },
      { id: 13, a: 3, b: 5, order: 1 },
    ],
  };
}

function page(model: Model) {
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model, nextId: 100 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const stop = watchConfiguration(store, doc);
  const notes = () => store.getState().configurationNotes.map((n) => n.text);
  return { doc, store, stop, notes };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("a change of configuration said where an edit made it (part 15, phase 2)", () => {
  it("says a substituent dragged across its centre's other bond turned it - R, now S - and nothing for the undo that gives it back", async () => {
    const { store, doc, notes, stop } = page(butanol());
    // (the methyl dragged over to the other side of the C2-C3 bond)
    store.getState().moveAtoms([{ id: 2, x: L * 0.9, y: L * 0.5 }], "drag-1");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C1: R, now S"]);
    doc.undo();
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C1: R, now S"]);
    stop();
  });

  it("says the wedge clicked through its cycle: drawn, nothing; the other way, turned; plain, now open", async () => {
    const { store, notes, stop } = page(butanol(null));
    store.getState().setBondStereo(12, "up");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    store.getState().setBondStereo(12, "down");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C1: R, now S"]);
    store.getState().setBondStereo(12, "none");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C1: R, now S", "C1: now open"]);
    stop();
  });

  it("says nothing for a bond added at the wedge's wide end, nor for an atom deleted at the centre", async () => {
    const { store, notes, stop } = page(butanol());
    const o = store.getState().addAtom(0, 2.5 * L, "C");
    store.getState().addBond(4, o, 1);
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    store.getState().deleteAtom(2);
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    stop();
  });

  it("says nothing where a centre lost one of its groups: deleted, it took the configuration with it", async () => {
    // (a fourth group, Cl, where the H was: a centre of four drawn groups; the Cl deleted, an H is back)
    const four = butanol();
    four.atoms.push({ id: 6, x: 0, y: -L, r: 0.9, el: "Cl" });
    four.bonds.push({ id: 14, a: 1, b: 6, order: 1 });
    const { store, notes, stop } = page(four);
    store.getState().deleteAtom(6);
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    stop();
  });

  it("drops what it would say where the drawing changed again before the descriptors came", async () => {
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model: butanol(), nextId: 100 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    // (each answer held back until the test lets them go)
    const held: (() => void)[] = [];
    const answer = () => held.splice(0).forEach((go) => go());
    const ask = (m: Model, units?: { atoms: readonly number[]; bonds: readonly number[] }) =>
      new Promise<Awaited<ReturnType<typeof cipMarksAsked>>>((done) => held.push(() => void cipMarksAsked(m, units).then(done)));
    const stop = watchConfiguration(store, doc, ask);
    store.getState().moveAtoms([{ id: 2, x: L * 0.9, y: L * 0.5 }], "drag-5");
    await vi.runAllTimersAsync();
    expect(held).toHaveLength(2);
    // (another edit before the answer: an atom put down apart)
    store.getState().addAtom(20 * L, 0, "N");
    answer();
    await vi.runAllTimersAsync();
    expect(store.getState().configurationNotes).toEqual([]);
    stop();
  });

  it("says a centre no longer read where a drag puts two of its bonds in line, with the reader's words, and read again", async () => {
    const { store, notes, stop } = page(butanol());
    store.getState().moveAtoms([{ id: 2, x: -L, y: 0 }, { id: 3, x: L, y: 0 }, { id: 5, x: 2 * L, y: 0.5 * L }], "drag-2");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C1: no longer read: two of its bonds in line or on top of each other"]);
    store.getState().moveAtoms(butanol().atoms.filter((a) => [2, 3, 5].includes(a.id)).map(({ id, x, y }) => ({ id, x, y })), "drag-3");
    await vi.runAllTimersAsync();
    expect(notes()[1]).toBe("C1: now read: R");
    stop();
  });

  it("says a drag once, as it ends: nothing while the atom is still being dragged", async () => {
    const { store, notes, stop } = page(butanol());
    store.setState({ moveDrag: { ...store.getState().moveDrag, active: true, atomId: 2 } });
    store.getState().moveAtoms([{ id: 2, x: L * 0.9, y: L * 0.5 }], "drag-4");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    store.setState({ moveDrag: { ...store.getState().moveDrag, active: false } });
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C1: R, now S"]);
    stop();
  });

  it("says a structure whose every unit turned once: its mirror image", () => {
    // (two centres, each turned: the drawing mirrored by the chemist)
    const two = butanol();
    const mirrored = (m: Model): Model => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, x: -a.x })) });
    const pair: Model = { atoms: [...two.atoms, ...two.atoms.map((a) => ({ ...a, id: a.id + 20, y: a.y - 6 * L }))], bonds: [...two.bonds, ...two.bonds.map((b) => ({ ...b, id: b.id + 20, a: b.a + 20, b: b.b + 20, ...(b.narrow ? { narrow: b.narrow + 20 } : {}) }))] };
    // (joined into one structure: a bond between the two ethyls' ends)
    const one: Model = { ...pair, bonds: [...pair.bonds, { id: 40, a: 5, b: 25, order: 1 }] };
    const changes = configurationChanges(one, mirrored(one));
    expect(changes).toEqual([{ unit: { kind: "centre", at: 1 }, how: "mirror" }]);
  });

  it("says nothing after Clean-up, which keeps every configuration", async () => {
    const { store, notes, stop } = page(butanol());
    vi.useRealTimers();
    await cleanUp(store);
    await new Promise((r) => setTimeout(r, 20));
    expect(notes()).toEqual([]);
    stop();
  });

  it("says nothing after Turn over, which exchanges solid and hashed wedges as it turns a drawing (Brecher 2008, GR-3)", async () => {
    const { store, notes, stop } = page(butanol());
    store.setState({ sel: { atoms: new Set([1, 2, 3, 4, 5]), bonds: new Set([10, 11, 12, 13]) } });
    store.getState().turnSelectionOver("vertical");
    await vi.runAllTimersAsync();
    expect(store.getState().model.bonds.find((b) => b.id === 12)!.stereo).toBe("down");
    expect(notes()).toEqual([]);
    stop();
  });

  it("says a change one of Meno's moves made as that move's, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { doc, notes, stop } = page(butanol());
    // (a move that turned the drawing over and kept its wedges as they were: what Turn over must never do)
    doc.edit("turn over", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => ({ ...a, x: -a.x })) } }));
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["changed by Turn over: C1: R, now S"]);
    expect(warn).toHaveBeenCalledWith("Meno: Turn over changed a configuration");
    expect(MENO_MOVES["clean up"]).toBe("Clean-up");
    warn.mockRestore();
    stop();
  });
});
