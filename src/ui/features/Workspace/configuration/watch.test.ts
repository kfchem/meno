import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { configurationChanges } from "./changes";
import { MENO_MOVES, watchConfiguration } from "./watch";
import { cleanUp } from "../chem/cleanUp";
import { cipMarksAsked } from "../chem/cipRun";
import { cipMarksOf } from "../chem/cipMarks";

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
    expect(notes()).toEqual(["C2: R, now S"]);
    // (the step named with what it did: the note's words, as an undo would take it back)
    expect(doc.history().undoLabel).toBe("move atoms: C2: R, now S");
    doc.undo();
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C2: R, now S"]);
    stop();
  });

  it("says the wedge clicked through its cycle: drawn, nothing; the other way, inverted; plain, now unspecified", async () => {
    const { store, notes, stop } = page(butanol(null));
    store.getState().setBondStereo(12, "up");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    store.getState().setBondStereo(12, "down");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C2: R, now S"]);
    store.getState().setBondStereo(12, "none");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C2: R, now S", "C2: S, now unspecified"]);
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
    expect(notes()).toEqual(["C2: R, now unclear: two of its bonds in line or on top of each other"]);
    store.getState().moveAtoms(butanol().atoms.filter((a) => [2, 3, 5].includes(a.id)).map(({ id, x, y }) => ({ id, x, y })), "drag-3");
    await vi.runAllTimersAsync();
    expect(notes()[1]).toBe("C2: now R");
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
    expect(notes()).toEqual(["C2: R, now S"]);
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

  it("says nothing where the document is put in anew - a file opened - though its atoms have the ids of the drawing before", async () => {
    const { doc, notes, stop } = page(butanol());
    // (another drawing, the same ids, its OH on a hash: what an opened file brings, nothing done to it)
    const other = { ...butanol(), bonds: butanol().bonds.map((b) => (b.id === 12 ? { ...b, stereo: "down" as const } : b)) };
    doc.reset({ ...doc.getState(), model: other, nextId: 100 });
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    // (nor where the history is rewritten in place)
    doc.amend((d) => ({ ...d, model: butanol() }));
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    stop();
  });

  it("says each of two steps made in one moment as its own: a chemist's turn named on its step, never on the next one's", async () => {
    const { store, doc, notes, stop } = page(butanol());
    // (the turn, then an atom put down apart, before the page is idle: the turn is the first step's)
    store.getState().moveAtoms([{ id: 2, x: L * 0.9, y: L * 0.5 }], "drag-6");
    store.getState().addAtom(20 * L, 0, "N");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C2: R, now S"]);
    // (the atom's step keeps its own name; the turn's step, no longer the one undo takes back, is not renamed)
    expect(doc.history().undoLabel).toBe("add atom");
    stop();
  });

  it("says a centre drawn wavy now marked unknown, though its bonds would leave its marks unread: the drawing says it is not known", () => {
    const t = butanol();
    t.atoms = t.atoms.map((x) => (x.id === 3 ? { ...x, x: L, y: 0 } : x.id === 2 ? { ...x, x: -L, y: 0 } : x));
    t.bonds = t.bonds.map((b) => (b.id === 12 ? { ...b, stereo: "wavy" as const } : b));
    expect(configurationChanges(butanol(), t)).toEqual([{ unit: { kind: "centre", at: 1 }, how: "unknown" }]);
  });

  it("says nothing of an edit undone before the page was idle, and one note for a drag's frames, one step", async () => {
    const { store, doc, notes, stop } = page(butanol());
    store.getState().moveAtoms([{ id: 2, x: L * 0.9, y: L * 0.5 }], "drag-7");
    doc.undo();
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    // (two frames of one drag - one step, gone on with: said once)
    store.getState().moveAtoms([{ id: 2, x: L * 0.5, y: L * 0.2 }], "drag-8");
    store.getState().moveAtoms([{ id: 2, x: L * 0.9, y: L * 0.5 }], "drag-8");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual(["C2: R, now S"]);
    stop();
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
    expect(notes()).toEqual(["changed by Turn over: C2: R, now S"]);
    // (a move of Meno's keeps its own step's name)
    expect(doc.history().undoLabel).toBe("turn over");
    expect(warn).toHaveBeenCalledWith("Meno: Turn over changed a configuration");
    expect(MENO_MOVES["clean up"]).toBe("Clean-up");
    warn.mockRestore();
    stop();
  });
});

// Turn over keeps every configuration (docs/EDITOR-2D.md, *The configuration kept*): the same compound, seen from its other side. The answers
// are worked by hand from the places, y up, the compound viewed with its lowest group (an H, drawn or not) away: OH > C3 (ethyl) > C1 (methyl).
// Butan-2-ol as above: C2 (id 1) at the origin, the O (4) at 90 degrees, the methyl C1 (2) at 210, the ethyl's C3 (3) at 330.
// Before: the O behind (hashes stating C2): O (top) -> C3 (lower right) -> C1 (lower left) runs clockwise seen from the front, the H in
// front, so counterclockwise from the side away from the H: S. The O in front (a solid wedge stating C2): R.
describe("Turn over keeps every configuration", () => {
  const shown = (m: Model): Model => ({ ...m, atoms: m.atoms.map((a) => (a.id === 1 ? { ...a, stereoShown: true as const } : a)) });
  async function turned(m: Model, atoms: number[], bonds: number[], axis: "vertical" | "horizontal") {
    const pg = page(shown(m));
    // (an edit first, so that what the drawing states is kept)
    pg.doc.edit("move atoms", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => ({ ...a, x: a.x + 0.001 })) } }));
    await vi.runAllTimersAsync();
    const label = (id = 1) => cipMarksOf(pg.doc.getState().model).centres.get(id) ?? null;
    const before = label();
    pg.store.setState({ configurationNotes: [], sel: { atoms: new Set(atoms), bonds: new Set(bonds) } });
    pg.store.getState().turnSelectionOver(axis);
    await vi.runAllTimersAsync();
    const model = pg.doc.getState().model;
    const out = { before, after: label(), notes: pg.notes(), model, bond: (id: number) => model.bonds.find((b) => b.id === id)!, label };
    pg.stop();
    return out;
  }
  const with12 = (w: Partial<Model["bonds"][number]>): Model => ({ ...butanol(null), bonds: butanol(null).bonds.map((b) => (b.id === 12 ? { ...b, ...w } : b)) });
  const whole = [[1, 2, 3, 4, 5], [10, 11, 12, 13]] as const;

  for (const axis of ["vertical", "horizontal"] as const) {
    it(`keeps S where the hashes are narrow at C2, the whole structure turned over (${axis})`, async () => {
      // (turned over, the O is in front and the order of the three is reversed in the page: O -> C3 -> C1 counterclockwise seen from the
      //  front, the H behind: S)
      const r = await turned(with12({ stereo: "down", narrow: 1 }), [...whole[0]], [...whole[1]], axis);
      expect([r.before, r.after, r.notes]).toEqual(["S", "S", []]);
      expect(r.bond(12)).toMatchObject({ stereo: "up", narrow: 1 });
    });

    it(`keeps S where the hashes are narrow at the O, stating C2 at their wide end (${axis})`, async () => {
      // (a hashed wedge narrow at the O, an end group, states C2 with the O behind - S, as the hashes narrow at C2 do. Turned over, the O is
      //  in front: a solid wedge narrow at C2, as in the case before - S. Today it became a solid wedge narrow at the O, which states
      //  nothing: "C2: S, now unspecified")
      const r = await turned(with12({ stereo: "down", narrow: 4 }), [...whole[0]], [...whole[1]], axis);
      expect([r.before, r.after, r.notes]).toEqual(["S", "S", []]);
      expect(r.bond(12)).toMatchObject({ stereo: "up", narrow: 1 });
    });

    it(`states nothing where a solid wedge narrow at the O stated nothing (${axis})`, async () => {
      // (a solid wedge the wrong way round, narrow at the O, states nothing at C2; turned over it must not start to: today it became
      //  hashes narrow at the O, read as stating C2 - R, a configuration that was never drawn)
      const r = await turned(with12({ stereo: "up", narrow: 4 }), [...whole[0]], [...whole[1]], axis);
      expect([r.before, r.after, r.notes]).toEqual([null, null, []]);
      expect(r.bond(12)).toMatchObject({ stereo: "up", narrow: 4 });
    });
  }

  it("keeps S where a line of hashes states C2, made a solid wedge narrow at C2", async () => {
    // (a line of hashes from C2 to the O, an end group, is read as hashes narrow at C2: S. Turned over, the O is in front: a wedge narrow
    //  at C2 - S, as above. Kept a line, it would state the O behind still, in the page's reversed order: R)
    const r = await turned(with12({ display: "hashed" }), [...whole[0]], [...whole[1]], "vertical");
    expect([r.before, r.after, r.notes]).toEqual(["S", "S", []]);
    expect(r.bond(12)).toMatchObject({ stereo: "up", narrow: 1 });
    expect(r.bond(12).display).toBeUndefined();
  });

  // (the structure's middle: x from -0.866 L to 1.732 L, y from -0.5 L (C1, C3) to L (the O) - so 0.25 L; top to bottom, each y goes to
  //  0.5 L - y: C2 to 0.5 L, C1 and C3 to L, the O to -0.5 L, C4 (5) to 0.5 L; each x as it was)
  const placesTurned = (m: Model) => {
    const y = Object.fromEntries(m.atoms.map((a) => [a.id, a.y / L]));
    expect(y[1]).toBeCloseTo(0.5);
    expect(y[2]).toBeCloseTo(1);
    expect(y[3]).toBeCloseTo(1);
    expect(y[4]).toBeCloseTo(-0.5);
    expect(y[5]).toBeCloseTo(0.5);
  };
  for (const [what, atoms, bonds] of [["the wedge's bond alone, with its two atoms (its menu)", [1, 4], [12]], ["one atom alone", [5], []]] as const)
    it(`turns the whole structure over where the selection is ${what}, and keeps S`, async () => {
      // (today a bond alone swapped its two atoms, C2 and the O, and exchanged the hashes: "C2: S, now R"; an atom alone did not move)
      const r = await turned(with12({ stereo: "down", narrow: 1 }), [...atoms], [...bonds], "horizontal");
      placesTurned(r.model);
      expect([r.before, r.after, r.notes]).toEqual(["S", "S", []]);
      expect(r.bond(12)).toMatchObject({ stereo: "up", narrow: 1 });
    });
});
