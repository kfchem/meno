import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { createWorkspaceDocument, emptyWorkspaceDocument, expandAbbreviation } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { readDrawn, recordText } from "../utils/copyPaste";
import { keptBondMoved, keptBondRead, keptCentreMoved, keptCentreRead, keptFrom, keptReading, withKept } from "./kept";
import { notesOf, watchConfiguration } from "./watch";
import { configurationChanges, readingOf } from "./changes";
import { chair } from "../../../../lib/chem/perception/projection/solids";
import { drawn } from "../../../../lib/chem/perception/projection/views";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { measured } from "../../../../testing/timeouts";

// Foundation part 15, phase 2, its second half: the configuration kept on the drawing's own atoms and bonds, in the step that made it, saved
// and copied with it, and what an edit changed said against what is kept.

/** (R)-butan-2-ol drawn flat: C2 (id 1), its methyl (2), its ethyl's CH2 (3) and CH3 (5), its OH (4) on a wedge. */
function butanol(): Model {
  const p = (deg: number, r = L) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  const at = (id: number, q: { x: number; y: number }, el = "C") => ({ id, ...q, r: 0.9, el });
  const c3 = p(330);
  return {
    atoms: [at(1, p(0, 0)), at(2, p(210)), at(3, c3), at(4, p(90), "O"), at(5, { x: c3.x + L * Math.cos(Math.PI / 6), y: c3.y + L * Math.sin(Math.PI / 6) })],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 1, b: 3, order: 1 },
      { id: 12, a: 1, b: 4, order: 1, stereo: "up", narrow: 1 },
      { id: 13, a: 3, b: 5, order: 1 },
    ],
  };
}

function page() {
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model: butanol(), nextId: 100 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const stop = watchConfiguration(store, doc);
  const notes = () => store.getState().configurationNotes.map((n) => n.text);
  const centre = () => doc.getState().model.atoms.find((a) => a.id === 1)!.config;
  return { doc, store, stop, notes, centre };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the configuration kept on the drawing (part 15, phase 2)", () => {
  it("is kept in the step of the change that made it - none for a drawing just opened - and an undo takes it back with the drawing", async () => {
    const { store, doc, centre, stop } = page();
    await vi.runAllTimersAsync();
    // (just opened: nothing kept yet, no step made to keep it)
    expect([centre(), doc.history().undoDepth]).toEqual([undefined, 0]);
    // (a change: what it states kept, in the change's own step - one step, its name the change's)
    store.getState().addAtom(20 * L, 0, "N");
    await vi.runAllTimersAsync();
    expect(doc.history().undoDepth).toBe(1);
    // (the change touched the N alone: the butanol's centre is kept with the first change made to it)
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-1");
    await vi.runAllTimersAsync();
    expect(centre()).toEqual({ set: { neighbours: [2, 3, 4, -1], sense: 1 } });
    expect([doc.history().undoDepth, doc.history().undoLabel]).toEqual([2, "move atoms"]);
    doc.undo();
    expect(centre()).toBeUndefined();
    stop();
  });

  it("says what an edit changed against what is kept: a kept sense that no longer reads so is said inverted", async () => {
    const { store, doc, notes, stop } = page();
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-2");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    // (what is kept made the other sense - as a fault of keeping would leave it, set as the drawing stands, no edit of the chemist's - and
    //  the structure touched: the difference said)
    const d0 = doc.getState();
    doc.reset({ ...d0, model: { ...d0.model, atoms: d0.model.atoms.map((a) => (a.id === 1 ? { ...a, config: { set: { neighbours: [2, 3, 4, -1], sense: -1 as const } } } : a)) } });
    store.getState().moveAtoms([{ id: 5, x: 2.7 * L, y: 0 }], "drag-3");
    await vi.runAllTimersAsync();
    // (the drawing read R before and after the touch: no descriptor tells the two apart, so it is said turned - a fault of keeping, shown)
    expect(notes()).toEqual(["C2: inverted"]);
    stop();
  });

  it("is saved and copied with the drawing, read back only where it is whole and of the drawing's own atoms", async () => {
    const { store, doc, stop } = page();
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-4");
    await vi.runAllTimersAsync();
    const model = doc.getState().model;
    const back = readDrawn(JSON.parse(recordText({ ...model })))!;
    expect(back.atoms.find((a) => a.id === 1)!.config).toEqual({ set: { neighbours: [2, 3, 4, -1], sense: 1 } });
    const ids = new Set([1, 2, 3, 4]);
    expect(keptCentreRead({ set: { neighbours: [2, 3, 99, -1], sense: 1 } }, ids)).toBeUndefined();
    expect(keptCentreRead({ set: { neighbours: [2, 3, 4, -1], sense: 2 } }, ids)).toBeUndefined();
    expect(keptCentreRead("open", ids)).toBe("open");
    expect(keptBondRead({ set: { refs: [1, 4], cis: true } }, ids)).toEqual({ set: { refs: [1, 4], cis: true } });
    expect(keptBondRead({ set: { refs: [1], cis: true } }, ids)).toBeUndefined();
    stop();
  });

  it("goes with a drawing pasted, on its new ids: the copy's centre keeps its own atoms", async () => {
    const { store, doc, stop } = page();
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-5");
    await vi.runAllTimersAsync();
    const copied = readDrawn(JSON.parse(recordText({ ...doc.getState().model })))!;
    store.getState().pasteModel(copied);
    await vi.runAllTimersAsync();
    const m = doc.getState().model;
    const pasted = m.atoms.filter((a) => a.id > 5);
    const centre = pasted.find((a) => a.config && a.config !== "open" && "set" in a.config)!;
    const ns = (centre.config as { set: { neighbours: number[] } }).set.neighbours;
    expect(ns.filter((n) => n !== -1).every((n) => pasted.some((a) => a.id === n))).toBe(true);
    expect(store.getState().configurationNotes).toEqual([]);
    stop();
  });
});

describe("known answers of the chemistry check (part 15, phase 2)", () => {
  /** 2,3,4-trihydroxypentanedioic acid drawn as a zigzag, C1 (id 1) to C5 (id 5), an OH on each of C2, C3, C4 - on a wedge each, `ups` saying which way. */
  function acid(ups: [boolean, boolean, boolean]): Model {
    const at = (id: number, x: number, y: number, el = "C") => ({ id, x: x * L * 0.866, y: y * L, r: 0.9, el });
    const atoms = [
      at(1, 0, 0),
      at(2, 1, 0.5),
      at(3, 2, 0),
      at(4, 3, 0.5),
      at(5, 4, 0),
      at(6, 1, 1.5, "O"),
      at(7, 2, -1, "O"),
      at(8, 3, 1.5, "O"),
      at(9, -1, 0.5, "O"),
      at(10, 0, -1, "O"),
      at(11, 5, 0.5, "O"),
      at(12, 4, -1, "O"),
    ];
    const w = (up: boolean) => (up ? "up" : "down") as "up" | "down";
    const bonds = [
      { id: 20, a: 1, b: 2, order: 1 as const },
      { id: 21, a: 2, b: 3, order: 1 as const },
      { id: 22, a: 3, b: 4, order: 1 as const },
      { id: 23, a: 4, b: 5, order: 1 as const },
      { id: 24, a: 2, b: 6, order: 1 as const, stereo: w(ups[0]), narrow: 2 },
      { id: 25, a: 3, b: 7, order: 1 as const, stereo: w(ups[1]), narrow: 3 },
      { id: 26, a: 4, b: 8, order: 1 as const, stereo: w(ups[2]), narrow: 4 },
      { id: 27, a: 1, b: 9, order: 2 as const },
      { id: 28, a: 1, b: 10, order: 1 as const },
      { id: 29, a: 5, b: 11, order: 2 as const },
      { id: 30, a: 5, b: 12, order: 1 as const },
    ];
    return { atoms, bonds };
  }

  it("2,3,4-trihydroxypentanedioic acid, C2 turned: only C2 said turned - C3's label follows, said by its mark, not as a change", async () => {
    const before = acid([true, true, true]);
    const after = acid([false, true, true]);
    const changes = configurationChanges(before, after);
    expect(changes).toEqual([{ unit: { kind: "centre", at: 2 }, how: "inverted" }]);
    const notes = await notesOf(before, after, changes, undefined);
    expect(notes.map((n) => n.text)).toEqual([expect.stringMatching(/^C2: [RS], now [RS]$/)]);
  });

  it("says a chair atom's group dragged to the atom's other free position: its centre turned", async () => {
    // (a chair as the solids draw it, carrying its depth; a methyl on C1 and on C2, each at its atom's equatorial place)
    const d = drawn(chair(), 1)!;
    const ring = d.atoms.map((p, k) => ({ id: k + 1, el: "C", r: 0.9, x: p.x * L, y: p.y * L, z: p.z * L, stereoCentre: true }));
    const placeOf = (k: number, kind: string) => {
      const f = d.free.find((x) => x.free.at === k && x.free.kind === kind)!;
      return { x: ring[k].x + f.x * L, y: ring[k].y + f.y * L };
    };
    const methyl = (id: number, k: number) => ({ id, el: "C", r: 0.9, ...placeOf(k, "equatorial") });
    const model: Model = {
      atoms: [...ring, methyl(7, 0), methyl(8, 1)],
      bonds: [...ring.map((_, k) => ({ id: 20 + k, a: k + 1, b: ((k + 1) % 6) + 1, order: 1 as const })), { id: 30, a: 1, b: 7, order: 1 as const }, { id: 31, a: 2, b: 8, order: 1 as const }],
    };
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model, nextId: 100 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const stop = watchConfiguration(store, doc);
    await vi.runAllTimersAsync();
    // (C1's methyl dragged to C1's axial place: the other face - C1 turned, C2 as it was)
    store.getState().moveAtoms([{ id: 7, ...placeOf(0, "axial") }], "drag-chair");
    await vi.runAllTimersAsync();
    const notes = store.getState().configurationNotes.map((n) => n.text);
    expect(notes).toEqual([expect.stringMatching(/^C1: [RS], now [RS]$/)]);
    stop();
  });

  it("says nothing for a structure put down from a SMILES", async () => {
    const { store, notes, stop } = page();
    store.getState().pasteModel(drawnFromSmiles("C[C@H](O)CC"));
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    stop();
  });

  it("says nothing for a drawing pasted or opened, and keeps its configuration bit for bit through a save and an open", async () => {
    const { store, doc, notes, stop } = page();
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-6");
    await vi.runAllTimersAsync();
    const kept = JSON.stringify(doc.getState().model.atoms.map((a) => a.config ?? null));
    // (pasted beside it, as copied: no note)
    store.getState().pasteModel(readDrawn(JSON.parse(recordText({ ...doc.getState().model })))!);
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    // (saved and opened: what is kept, as it was)
    const opened = readDrawn(JSON.parse(recordText({ ...doc.getState().model })))!;
    expect(JSON.stringify(opened.atoms.filter((a) => a.id <= 5).map((a) => a.config ?? null))).toBe(kept);
    // (opened as a new drawing: nothing said)
    store.getState().replaceModel(opened);
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    stop();
  });
});

describe("an axis kept with the neighbours its sense is taken against", () => {
  /** `m` with its atoms renumbered (`to`, by id), its bonds' ends and its kept configuration with them - as a paste renumbers a copy. */
  function renumbered(m: Model, to: (id: number) => number): Model {
    const map = new Map(m.atoms.map((a) => [a.id, to(a.id)]));
    return {
      atoms: m.atoms.map(({ config, ...a }) => {
        const k = config && keptCentreMoved(config, map);
        return { ...a, id: to(a.id), ...(k ? { config: k } : {}) };
      }),
      bonds: m.bonds.map(({ config, ...b }) => {
        const k = config && keptBondMoved(config, map);
        return { ...b, a: to(b.a), b: to(b.b), ...(b.narrow != null ? { narrow: to(b.narrow) } : {}), ...(k ? { config: k } : {}) };
      }),
    };
  }
  /** At one end of `m`'s axis, its two other neighbours' ids swapped: which of them has the lower id is the other way round. */
  function swappedAtOneEnd(m: Model): (id: number) => number {
    const [key] = [...readingOf(m).said.axes.keys()];
    const [p, q] = key.split(",").map(Number);
    const near = (x: number) => m.bonds.flatMap((b) => (b.a === x ? [b.b] : b.b === x ? [b.a] : []));
    // (an end's other neighbours: not the other end, nor what runs on to it - an allene's middle carbon)
    const [r, t] = near(p).filter((n) => n !== q && !near(n).includes(q));
    return (id) => (id === r ? t : id === t ? r : id);
  }
  const allene = () => drawnFromSmiles("OC(Cl)=[C@]=C(C)F");
  const binap = () => expandAbbreviation({ ...emptyWorkspaceDocument(), model: { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "(R)-BINAP" }], bonds: [] }, nextId: 100 }, 1).model;

  it("keeps an allene's and a biaryl's hand through a renumbering against the order of an end's neighbours: no note, the same hand", () => {
    for (const [name, m] of [["an allene", allene()], ["(R)-BINAP", binap()]] as const) {
      const ids = new Set(m.atoms.map((a) => a.id));
      const kept = withKept(m, ids, keptFrom(m, readingOf(m)));
      const axis = kept.bonds.find((b) => b.config && typeof b.config === "object" && "axis" in b.config)!;
      expect(axis.config, name).toMatchObject({ axis: { refs: [expect.any(Number), expect.any(Number)] } });
      const pasted = renumbered(kept, swappedAtOneEnd(m));
      // (the drawing read afresh: the sense against the new lowest neighbour at that end is the other number - the hand is the same)
      const before = [...readingOf(kept).said.axes.values()][0];
      const now = readingOf(pasted).said.axes;
      expect([...now.values()][0], name).toBe(-before);
      // (what is kept, read as the drawing now is: the same - so nothing is said of it)
      expect(keptReading(pasted, readingOf(pasted).said).said.axes, name).toEqual(now);
      expect(configurationChanges(pasted, pasted), name).toEqual([]);
      // (and every id turned round as well, so that the axis's other end is now its lower-id one: each kept ref still its own end's)
      const swap = swappedAtOneEnd(m);
      const turned = renumbered(kept, (id) => 10_000 - swap(id));
      expect(keptReading(turned, readingOf(turned).said).said.axes, name).toEqual(readingOf(turned).said.axes);
    }
  }, measured(460));

  it("keeps a unit whose ends are not bonded - an allene's axis, an odd cumulene's cis or trans - on its run's first bond, its ends named", () => {
    for (const [name, m, kind] of [["an allene", allene(), "axis"], ["a hexatriene's cumulene", drawnFromSmiles("C/C=C=C=C/C"), "set"]] as const) {
      const kept = withKept(m, new Set(m.atoms.map((a) => a.id)), keptFrom(m, readingOf(m)));
      const on = kept.bonds.filter((b) => b.config && typeof b.config === "object" && kind in b.config);
      expect(on, name).toHaveLength(1);
      const unit = (on[0].config as Record<string, { ends?: [number, number] }>)[kind];
      expect(unit.ends, name).toHaveLength(2);
      // (read back as the drawing reads it: nothing said)
      expect(configurationChanges(kept, kept), name).toEqual([]);
      const back = keptReading(kept, readingOf(kept).said).said;
      expect(kind === "axis" ? back.axes : back.doubles, name).toEqual(kind === "axis" ? readingOf(kept).said.axes : readingOf(kept).said.doubles);
    }
  });

  it("reads an axis back from a file or a copy only whole, its refs among the drawing's atoms, and renumbers its refs with them", () => {
    const ids = new Set([1, 2, 3]);
    expect(keptBondRead({ axis: { refs: [1, 3], sense: -1 } }, ids)).toEqual({ axis: { refs: [1, 3], sense: -1 } });
    for (const v of [{ axis: 1 }, { axis: { refs: [1, 9], sense: 1 } }, { axis: { refs: [1], sense: 1 } }, { axis: { refs: [1, 3], sense: 0 } }]) expect(keptBondRead(v, ids)).toBeUndefined();
    expect(keptBondMoved({ axis: { refs: [1, 3], sense: 1 } }, new Map([[1, 7], [3, 8]]))).toEqual({ axis: { refs: [7, 8], sense: 1 } });
    expect(keptBondMoved({ axis: { refs: [1, 3], sense: 1 } }, new Map([[1, 7]]))).toBeUndefined();
    expect(keptBondRead({ axis: { refs: [1, 3], sense: 1, ends: [1, 2] } }, ids)).toEqual({ axis: { refs: [1, 3], sense: 1, ends: [1, 2] } });
    expect(keptBondRead({ axis: { refs: [1, 3], sense: 1, ends: [1, 9] } }, ids)).toBeUndefined();
    expect(keptBondMoved({ set: { refs: [1, 3], cis: true, ends: [1, 2] } }, new Map([[1, 7], [2, 6], [3, 8]]))).toEqual({ set: { refs: [7, 8], cis: true, ends: [7, 6] } });
  });
});
