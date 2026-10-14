import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { readStereo, sameConfiguration, wedgesForFlat } from "../../../../lib/layout/drawn";
import { layout2D, type LayoutInput } from "../../../../lib/layout/engine";
import { layoutMetrics } from "../../../../lib/layout/metrics";
import cages from "../../../../lib/layout/testdata/cages.json";
import { kekuleOrders } from "../../../../lib/chem/kekulize";
import { readSmiles } from "../../../../lib/chem/smiles";
import { createWorkspaceDocument, emptyWorkspaceDocument, expandAbbreviation } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Bond, Model } from "../store/types";
import { cleanUp, fragmentOf, fragmentsHolding, fragmentsOf, laidOut, partOf } from "./cleanUp";
import { degrees, drawingOf, forFlatReaders, orientFor } from "./drawing";
import { labelBox, labelSetOf } from "../../../../lib/chem/layout2d";
import { MENO } from "../../../../lib/chem/style";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { drawingLayout, drawnOf } from "../fileActions";
import { editorModelOf } from "../utils/io";
import messyTaxol from "../../../../../scripts/gui/fixtures/messy-taxol.mol?raw";

const atom = (id: number, x: number, y: number, el = "C") => ({ id, x, y, r: 0.9, el });

/**
 * How many times as long `run` takes on `large` as on `small`: the least
 * processor time of five runs of each, taken by turns - so that a machine
 * busy with other work, or a pause to collect garbage, slows neither alone.
 */
function slower<T>(small: T, large: T, run: (x: T) => void): number {
  const least = [Infinity, Infinity];
  run(small);
  run(large);
  for (let k = 0; k < 5; k++) {
    [small, large].forEach((x, i) => {
      const started = process.cpuUsage();
      run(x);
      const used = process.cpuUsage(started);
      least[i] = Math.min(least[i], used.user + used.system);
    });
  }
  return least[1] / least[0];
}

// a methyl on a wedge from a CH with two more carbons, and apart from them
// an ethane
const model: Model = {
  atoms: [
    atom(1, 0, 0),
    atom(2, 1, 0),
    atom(3, -1, 0),
    atom(4, 0, 1),
    atom(5, 10, 0),
    atom(6, 11, 0),
  ],
  bonds: [
    { id: 7, a: 1, b: 2, order: 1 },
    { id: 8, a: 1, b: 3, order: 1 },
    { id: 9, a: 1, b: 4, order: 1, stereo: "up" },
    { id: 10, a: 5, b: 6, order: 1 },
  ],
};

/** A canvas holding `m`, the way a workspace tab is put together. */
function canvas(m: Model) {
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model: m, nextId: 2000 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store };
}

/** The stereochemistry `m` shows, by atom id, an H drawn on its own counted as its centre's. */
function stereo(m: Model) {
  const d = drawingOf(m);
  const ids = m.atoms.map((a) => a.id);
  const degree = degrees(m.bonds);
  const asId = (n: number) => (n === -1 || (m.atoms[n].el === "H" && degree.get(ids[n]) === 1) ? -1 : ids[n]);
  return new Map(
    [...readStereo(d.atoms, d.bonds).tetra].map(([c, t]) => [ids[c], { neighbours: t.neighbours.map(asId), volume: t.volume }]),
  );
}

const centroid = (m: Model, ids: Set<number>) => {
  const as = m.atoms.filter((a) => ids.has(a.id));
  return { x: as.reduce((s, a) => s + a.x, 0) / as.length, y: as.reduce((s, a) => s + a.y, 0) / as.length };
};

/**
 * A structure drawn flat, as a file or RDKit would have it: laid out by the
 * engine, and a cage it draws in perspective given the wedges that say its
 * stereochemistry instead.
 */
function flatDrawing(input: LayoutInput): Model {
  const out = layout2D(input);
  const k = NOMINAL_BOND_LENGTH;
  const atoms = input.atoms.map((a, i) => atom(i + 1, out.x[i] * k, out.y[i] * k, a.el));
  const bonds: Bond[] = input.bonds.map((b, i) => ({ id: 100 + i, a: b.a + 1, b: b.b + 1, order: b.order as 1 | 2 | 3 }));
  const wedge = (from: number, to: number, stereo: "up" | "down") => {
    const i = bonds.findIndex((b) => (b.a === from && b.b === to) || (b.a === to && b.b === from));
    bonds[i] = { ...bonds[i], stereo, stereoOrient: orientFor(bonds[i], from, degrees(bonds)) };
  };
  const addH = (on: number, at: { x: number; y: number }) => {
    const id = 500 + atoms.length;
    atoms.push(atom(id, at.x * k, at.y * k, "H"));
    bonds.push({ id: id + 1000, a: on + 1, b: id, order: 1 });
    return id;
  };
  const hOf = new Map(out.hydrogens.map((h) => [h.on, addH(h.on, h.at)]));
  for (const w of out.wedges) wedge(w.from + 1, w.to === -1 ? hOf.get(w.from)! : w.to + 1, w.stereo);
  // the cage's own stereocentres, said with wedges on the drawing as it is
  const perspective: Model = {
    atoms: atoms.map((a, i) => ({
      ...a,
      ...(i < input.atoms.length && out.depth[i] != null ? { z: out.depth[i]! * k } : {}),
      ...(i < input.atoms.length && out.solid[i] && input.atoms[i].tetra ? { stereoCentre: true } : {}),
    })),
    bonds,
  };
  const flat = forFlatReaders(perspective);
  return { atoms: flat.atoms.map(({ id, x, y, el }) => atom(id, x, y, el)), bonds: flat.bonds as Bond[] };
}

describe("fragmentOf and partOf", () => {
  it("find the atoms bonded to an atom, and the bonds among them", () => {
    expect([...fragmentOf(model, 4)].sort()).toEqual([1, 2, 3, 4]);
    expect([...fragmentOf(model, 6)].sort()).toEqual([5, 6]);
    const part = partOf(model, fragmentOf(model, 5));
    expect(part.atoms.map((a) => a.id)).toEqual([5, 6]);
    expect(part.bonds.map((b) => b.id)).toEqual([10]);
  });

  it("finds every structure on the canvas, a lone atom not among them", () => {
    const withLone: Model = { ...model, atoms: [...model.atoms, atom(20, 5, 5, "O")] };
    expect(fragmentsOf(withLone).map((f) => [...f].sort())).toEqual([
      [1, 2, 3, 4],
      [5, 6],
    ]);
  });

  it("finds the structures a selection's atoms are in, each once", () => {
    expect(fragmentsHolding(model, [2, 3, 99]).map((f) => [...f].sort())).toEqual([[1, 2, 3, 4]]);
    expect(fragmentsHolding(model, [6, 1]).map((f) => [...f].sort())).toEqual([
      [5, 6],
      [1, 2, 3, 4],
    ]);
  });

  it("find the structures of a large drawing in time in step with its size", () => {
    // (toluenes side by side: each structure found went over every bond of
    // the drawing again, and each atom asked for was looked for among every
    // atom - 17 s for a thousand structures. Eight times the structures now
    // take about eight times as long, not sixty-four)
    const page = (n: number): Model => {
      const atoms: Model["atoms"] = [];
      const bonds: Model["bonds"] = [];
      for (let m = 0; m < n; m++) {
        const first = 7 * m + 1;
        for (let k = 0; k < 7; k++) atoms.push(atom(first + k, 4 * m + Math.cos(k), Math.sin(k)));
        for (let k = 0; k < 6; k++) bonds.push({ id: 1_000_000 + first + k, a: first + k, b: first + ((k + 1) % 6), order: k % 2 ? 1 : 2 });
        bonds.push({ id: 1_000_000 + first + 6, a: first, b: first + 6, order: 1 });
      }
      return { atoms, bonds };
    };
    const found = (m: Model) => {
      expect(fragmentsOf(m)).toHaveLength(m.atoms.length / 7);
      const held = fragmentsHolding(m, m.atoms.map((a) => a.id));
      expect(held).toHaveLength(m.atoms.length / 7);
      expect([...held[1]]).toEqual([8, 9, 13, 14, 12, 11, 10]);
    };
    expect(slower(page(250), page(2000), found)).toBeLessThan(24);
  });
});

describe("cleanUp", () => {
  it("lays each structure out afresh where it was, keeping its stereochemistry, in one step", async () => {
    const { doc, store } = canvas(model);
    const before = store.getState().model;
    await cleanUp(store);
    const after = store.getState().model;
    expect(doc.history().undoDepth).toBe(1);
    for (const ids of fragmentsOf(before)) {
      const [p, q] = [centroid(before, ids), centroid(after, ids)];
      expect(q.x).toBeCloseTo(p.x, 6);
      expect(q.y).toBeCloseTo(p.y, 6);
    }
    // at the drawing's own bond length, every bond alike
    for (const b of after.bonds) {
      const [p, q] = [b.a, b.b].map((id) => after.atoms.find((a) => a.id === id)!);
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(1, 3);
    }
    const [s0, s1] = [stereo(before), stereo(after)];
    expect([...s1.keys()]).toEqual([...s0.keys()]);
    for (const [c, t] of s0) expect(sameConfiguration(t, s1.get(c)!)).toBe(true);
  });

  it("lays out only the structure an atom is in, when asked about one", async () => {
    const { store } = canvas(model);
    await cleanUp(store, 5);
    const after = store.getState().model;
    for (const id of [1, 2, 3, 4]) {
      expect(after.atoms.find((a) => a.id === id)).toEqual(model.atoms.find((a) => a.id === id));
    }
  });

  it("draws a cage in perspective, its stereocentres shown by the drawing and still read as they were", async () => {
    for (const [name, g] of Object.entries(cages)) {
      const flat = flatDrawing(g as LayoutInput);
      const { store } = canvas(flat);
      await cleanUp(store);
      const after = store.getState().model;
      expect(after.atoms.some((a) => a.z != null), name).toBe(true);
      expect(after.atoms.some((a) => a.stereoCentre), name).toBe(true);
      const [s0, s1] = [stereo(flat), stereo(after)];
      for (const [c, t] of s0) {
        expect(s1.get(c), `${name} ${c}`).toBeDefined();
        expect(sameConfiguration(t, s1.get(c)!), `${name} ${c}`).toBe(true);
      }
      // and a reader of wedges is told the same
      const told = forFlatReaders(after);
      const s2 = stereo({ atoms: told.atoms.map(({ id, x, y, el }) => atom(id, x, y, el)), bonds: told.bonds as Bond[] });
      for (const [c, t] of s0) expect(sameConfiguration(t, s2.get(c)!), `${name} ${c}, flat`).toBe(true);
    }
    // (every cage cleaned up in turn: under a second on a quiet machine, past
    // the 5 s default on a slow CI runner - 5.2 to 5.4 s seen there, with
    // the layout tests all as much slower)
  }, 30_000);

  it("takes away an H it no longer draws, and keeps one it does", async () => {
    // cocaine drawn flat has an H on each bridgehead, to carry its wedge;
    // in perspective the cage shows them, and they go
    const flat = flatDrawing(cages.Cocaine as LayoutInput);
    const hs = flat.atoms.filter((a) => a.el === "H").length;
    expect(hs).toBeGreaterThan(0);
    const { store } = canvas(flat);
    await cleanUp(store);
    expect(store.getState().model.atoms.filter((a) => a.el === "H")).toHaveLength(0);
    expect(wedgesForFlat(drawingOf(store.getState().model).atoms, drawingOf(store.getState().model).bonds).hydrogens.length).toBe(hs);
  });

  it("lays out a structure that has just arrived, before it is added", async () => {
    // RDKit's drawing of a SMILES, as it comes: flat, wedged
    const flat = flatDrawing(cages.Quinine as LayoutInput);
    const laid = await laidOut(flat);
    expect(laid.atoms.some((a) => a.z != null)).toBe(true);
    const [s0, s1] = [stereo(flat), stereo(laid)];
    for (const [c, t] of s0) expect(sameConfiguration(t, s1.get(c)!), `${c}`).toBe(true);
  });

  it("lays out phenyl azide that has just arrived with its azide bent: no cis or trans to keep there", async () => {
    // RDKit's drawing as it may come, N(-)=N(+)=N off a straight line
    const ring = Array.from({ length: 6 }, (_, i) => atom(i + 1, 1.8 * Math.cos((i * Math.PI) / 3), 1.8 * Math.sin((i * Math.PI) / 3)));
    const model: Model = {
      atoms: [...ring, atom(7, 3.6, 0, "N"), { ...atom(8, 5.2, 0.6, "N"), charge: 1 }, { ...atom(9, 6.8, 0.2, "N"), charge: -1 }],
      bonds: [
        ...ring.map((_, i): Bond => ({ id: 100 + i, a: i + 1, b: ((i + 1) % 6) + 1, order: i % 2 ? 1 : 2 })),
        { id: 106, a: 1, b: 7, order: 1 },
        { id: 107, a: 7, b: 8, order: 2 },
        { id: 108, a: 8, b: 9, order: 2 },
      ],
    };
    const laid = await laidOut(model);
    expect(laid.atoms).toHaveLength(9);
    // and drawn straight, as an azide is: N-N-N 180 degrees
    const at = (id: number) => laid.atoms.find((a) => a.id === id)!;
    const [p, q, r] = [at(7), at(8), at(9)];
    const cos = ((p.x - q.x) * (r.x - q.x) + (p.y - q.y) * (r.y - q.y)) / Math.hypot(p.x - q.x, p.y - q.y) / Math.hypot(r.x - q.x, r.y - q.y);
    const t = Math.acos(Math.max(-1, Math.min(1, cos)));
    expect((t * 180) / Math.PI).toBeGreaterThan(175);
  });

  it("refuses, rather than lose it, a configuration it cannot carry", async () => {
    // methyl phenyl sulfoxide's S, wedged: its fourth group a lone pair
    const sulfoxide: Model = {
      atoms: [atom(1, 0, 0, "S"), atom(2, 0, 1, "O"), atom(3, -1, -0.5), atom(4, 1, -0.5)],
      bonds: [
        { id: 5, a: 1, b: 2, order: 2 },
        { id: 6, a: 1, b: 3, order: 1, stereo: "up" },
        { id: 7, a: 1, b: 4, order: 1 },
      ],
    };
    const { store } = canvas(sulfoxide);
    await expect(cleanUp(store)).rejects.toThrow(/nothing was moved/);
    expect(store.getState().model).toEqual(sulfoxide);
  });

  it("drops a wedge that says nothing, on a CH2", async () => {
    const propane: Model = {
      atoms: [atom(1, 0, 0), atom(2, 1, 0.5), atom(3, 2, 0)],
      bonds: [
        { id: 4, a: 2, b: 1, order: 1, stereo: "up" },
        { id: 5, a: 2, b: 3, order: 1 },
      ],
    };
    const { store } = canvas(propane);
    await cleanUp(store);
    expect(store.getState().model.bonds.every((b) => b.stereo !== "up")).toBe(true);
  });

  it("writes taxol's esters and amide by name, their letters clear of everything", async () => {
    const read = readSmiles(
      "CC1=C2[C@H](C(=O)[C@@]3([C@H](C[C@@H]4[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C[C@@H]1OC(=O)[C@@H]([C@H](C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C",
    );
    const orders = kekuleOrders(read.atoms, read.bonds);
    const drawn = flatDrawing({
      atoms: read.atoms.map((a) => ({ el: a.el, ...(a.hs != null ? { hs: a.hs } : {}), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: read.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    });
    const { store } = canvas(drawn);
    await cleanUp(store);
    const m = store.getState().model;
    expect(m.atoms.filter((a) => !/^[A-Z][a-z]?$/.test(a.el)).map((a) => a.el).sort()).toEqual(["NHBz", "OAc", "OAc", "OBz"]);
    const index = new Map(m.atoms.map((a, i) => [a.id, i]));
    const crowding = (nameRoom: number) =>
      layoutMetrics({
        x: m.atoms.map((a) => a.x),
        y: m.atoms.map((a) => -a.y),
        edges: m.bonds.map((b) => [index.get(b.a)!, index.get(b.b)!] as [number, number]),
        elements: m.atoms.map((a) => a.el),
        labelled: m.atoms.map((a) => a.el !== "C"),
        nameRoom,
      }).crowdedLabels;
    // (OBz and OAc side by side on a line, a hair - 0.005 of a bond - within
    // the space reckoned between two names: not letters running together)
    expect(crowding(1) - crowding(0)).toBeLessThan(0.05);
    // (the whole engine on taxol, each of its ways of being written: about a
    // second alone, a few times that on a machine busy with the rest of the
    // tests)
  }, 30_000);

  it("cleans up taxol drawn any which way with its names and its ring-fusion H clear of one another", async () => {
    // (a drawing a reader cleaned up to find C3's H standing on the A of
    // C4's AcO, and that AcO on C2's OBz, with no paper between them)
    const model = editorModelOf(moleculesToEditorModel(readMoleculesFromText(messyTaxol, "mol")).model);
    const { store } = canvas(model);
    await cleanUp(store);
    const s = store.getState();
    expect(s.model.atoms.filter((a) => !/^[A-Z][a-z]?$/.test(a.el)).map((a) => a.el).sort()).toEqual(["NHBz", "OAc", "OAc", "OBz"]);
    // every two labels' letters, as the picture draws them, a quarter of a
    // letter apart or more
    const { layout, opts } = drawingLayout(drawnOf(s), s, MENO);
    const set = labelSetOf(opts);
    const boxes = layout.texts.map((t) => {
      const b = labelBox(t, t.fontPx, set);
      return { text: t.text, x0: t.x - b.left, x1: t.x + b.right, y0: t.y - b.bottom, y1: t.y + b.top };
    });
    for (const [i, p] of boxes.entries()) {
      for (const q of boxes.slice(i + 1)) {
        const gap = Math.max(q.x0 - p.x1, p.x0 - q.x1, q.y0 - p.y1, p.y0 - q.y1);
        expect(gap, `${p.text} and ${q.text}`).toBeGreaterThan(0.25 * opts.fontPx);
      }
    }
  }, 30_000);

  it("cleans up Stryker's reagent just drawn out, and writes its phosphines by name the next time", async () => {
    const model = expandAbbreviation(
      { ...emptyWorkspaceDocument(), model: { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "Stryker's reagent" }], bonds: [] }, nextId: 10 },
      1,
    ).model;
    // (as a file has it: its metals' contacts plain bonds)
    const plain: Model = { atoms: model.atoms, bonds: model.bonds.map(({ display: _d, ...b }) => b) };
    const { doc, store } = canvas(plain);
    // drawn out just now
    doc.edit("expand abbreviation", (d) => ({ ...d, expanded: plain.atoms.map((a) => a.id) }));
    await cleanUp(store);
    const drawn = store.getState().model;
    expect(drawn.atoms.filter((a) => a.el === "PPh3")).toHaveLength(0);
    const cus = new Set(drawn.atoms.filter((a) => a.el === "Cu").map((a) => a.id));
    expect(drawn.bonds.filter((b) => cus.has(b.a) && cus.has(b.b) && b.display === "dashed")).toHaveLength(12);
    await cleanUp(store);
    expect(store.getState().model.atoms.filter((a) => a.el === "PPh3")).toHaveLength(6);
    // (the first Clean-up lays the reagent out drawn out in full - 126 atoms,
    // eighteen phenyl rings round six coppers - scoring some 2,400 drawings
    // of it on the way: 3 to 4 s on a quiet machine, and many times that on
    // one busy with other work, 37 s seen)
  }, 90_000);

  it("writes a protecting group by name, in the same step, and leaves one just drawn out drawn", async () => {
    // tert-butyldimethylsilyl ethyl ether, drawn atom by atom
    const read = readSmiles("CCO[Si](C)(C)C(C)(C)C");
    const orders = kekuleOrders(read.atoms, read.bonds);
    const drawn = flatDrawing({
      atoms: read.atoms.map((a) => ({ el: a.el })),
      bonds: read.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    });
    const { doc, store } = canvas(drawn);
    const labels = () => store.getState().model.atoms.filter((a) => !/^[A-Z][a-z]?$/.test(a.el)).map((a) => a.el);
    await cleanUp(store);
    expect(labels()).toEqual(["OTBS"]);
    expect(store.getState().model.atoms).toHaveLength(3);
    expect(doc.history().undoDepth).toBe(1);
    // drawn out, and cleaned up straight after: left drawn out, and laid out
    const label = store.getState().model.atoms.find((a) => a.el === "OTBS")!;
    store.getState().expandAbbreviation(label.id);
    expect(store.getState().justExpanded().size).toBe(8);
    await cleanUp(store);
    expect(labels()).toEqual([]);
    expect(store.getState().justExpanded().size).toBe(0);
    // and by the next Clean-up, written by name again
    await cleanUp(store);
    expect(labels()).toEqual(["OTBS"]);
    // undone, the label's atoms are back
    doc.undo();
    expect(labels()).toEqual([]);
  });
});
