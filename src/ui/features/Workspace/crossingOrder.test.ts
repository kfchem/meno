// Which bond is in front where two cross, said by the chemist (chem/crossings; docs/EDITOR-2D.md, *A bond in front of another*): the known
// answers of the page - the gap where it was said, kept as the drawing is edited, saved, copied and turned over, and in every writer.
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "./store";
import { createWorkspaceDocument, placeAtoms } from "./document";
import { readRecord, recordText } from "./utils/copyPaste";
import { readWorkspace, workspaceText } from "./utils/workspace";
import { layoutAtomOf, layoutBonds } from "./layoutOptions";
import { buildAllPrimitives, createSVG, layoutMolecule, type LineSeg, type Poly } from "../../../lib/chem/layout2d";
import { layoutEmf, emfRecords } from "../../../lib/chem/emf";
import { acsWorldOptions } from "../../../lib/chem/acs";
import { crossingsOf } from "./chem/crossings";
import { numberedApart } from "./workflow/run";
import { inRow } from "./components/structureDrag";
import type { Model } from "./store/types";

/** A norbornane-like crossing drawn by hand: a ring of four (A-B-C-D) with the bond A-C across it and B-D across that - the two cross at the middle. */
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const a = st().addAtom(0, 0, "C");
  const b = st().addAtom(2, 0, "C");
  const c = st().addAtom(2, 2, "C");
  const d = st().addAtom(0, 2, "C");
  st().addBond(a, b);
  st().addBond(b, c);
  st().addBond(c, d);
  st().addBond(d, a);
  const ac = st().addBond(a, c);
  const bd = st().addBond(b, d);
  return { doc, store, st, ac, bd, atoms: { a, b, c, d } };
}
const bondOf = (m: Model, id: number) => m.bonds.find((x) => x.id === id)!;

/** Whether a line runs along a diagonal: rising (AC, from (0, 0) to (2, 2)) or falling (BD, from (2, 0) to (0, 2)). */
const along = (l: LineSeg, sign: 1 | -1) => Math.abs(l.x2 - l.x1) > 1e-9 && Math.sign((l.y2 - l.y1) / (l.x2 - l.x1)) === sign;
/** Where a shape's points lie, on the mean. */
const centreOf = (p: Poly) => ({ x: p.points.reduce((s, q) => s + q.x, 0) / p.points.length, y: p.points.reduce((s, q) => s + q.y, 0) / p.points.length });
/** How far a shape reaches from end to end. */
const reachOf = (p: Poly) => Math.max(...p.points.flatMap((q) => p.points.map((r) => Math.hypot(q.x - r.x, q.y - r.y))));
/** Whether a shape is a piece of a diagonal: its centre on the rising line y = x, or the falling x + y = 2 - and a piece of a bond, not the small fill of a join at an atom. */
const on = (p: Poly, sign: 1 | -1) => {
  const c = centreOf(p);
  return reachOf(p) > 0.3 && (sign === 1 ? Math.abs(c.y - c.x) < 0.05 : Math.abs(c.x + c.y - 2) < 0.05);
};

/**
 * What the layout draws for the model, and each diagonal's pieces among it: a bond drawn whole is a line; one cut where it passes behind
 * another is drawn as the shapes it fills, each piece of it one (the gap a band along the bond in front: lib/chem/layout2d).
 */
function drawn(model: Model) {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const atoms = model.atoms.map((a) => layoutAtomOf(a));
  const bonds = layoutBonds(model.bonds, index);
  const opts = acsWorldOptions(atoms, bonds, { units: "world", minLinePx: 0 });
  const { lines, polys } = buildAllPrimitives(atoms, bonds, opts, 40);
  const pieces = (sign: 1 | -1) => [...lines.filter((l) => along(l, sign)), ...polys.filter((p) => on(p, sign))];
  return { lines, polys, ac: pieces(1), bd: pieces(-1), atoms, bonds, opts };
}

describe("a crossing drawn by hand, which bond is in front said", () => {
  it("is drawn whole until it is said; Behind on one breaks that one, In front on it breaks the other, the chosen again leaves no gap", () => {
    const { st, ac, bd } = editor();
    expect(drawn(st().model).ac).toHaveLength(1);
    expect(drawn(st().model).bd).toHaveLength(1);
    st().orderCrossing(ac, bd, "behind");
    expect(drawn(st().model).ac).toHaveLength(2);
    expect(drawn(st().model).bd).toHaveLength(1);
    st().orderCrossing(ac, bd, "front");
    expect(drawn(st().model).ac).toHaveLength(1);
    expect(drawn(st().model).bd).toHaveLength(2);
    st().orderCrossing(ac, bd, "front");
    expect(drawn(st().model).ac).toHaveLength(1);
    expect(drawn(st().model).bd).toHaveLength(1);
    expect(st().model.bonds.some((b) => b.behind)).toBe(false);
  });

  it("is one step, undone and done again, named for what was done", () => {
    const { doc, st, ac, bd } = editor();
    st().orderCrossing(ac, bd, "behind");
    expect(doc.history().undoLabel).toBe("bond behind");
    st().orderCrossing(ac, bd, "front");
    expect(doc.history().undoLabel).toBe("bond in front");
    doc.undo();
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
    doc.undo();
    expect(st().model.bonds.some((b) => b.behind)).toBe(false);
    doc.redo();
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
  });

  it("is kept while a move goes on - drawn whole while the bonds are apart, the gap again where they cross - and goes with a move that ENDS with them apart, in the move's own step", () => {
    const { doc, st, ac, bd, atoms } = editor();
    st().orderCrossing(ac, bd, "behind");
    // (C dragged up and left until AC no longer crosses BD, and back across it, in one drag: the mark held all the way)
    st().moveAtoms([{ id: atoms.c, x: -1, y: 0.5 }], "one");
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
    const apart = drawn(st().model);
    expect(apart.lines.length).toBe(st().model.bonds.length);
    expect(apart.polys.filter((p) => reachOf(p) > 0.3)).toHaveLength(0);
    st().moveAtoms([{ id: atoms.c, x: 2, y: 2 }], "one");
    st().settleMove("one", [atoms.c]);
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
    expect(drawn(st().model).ac).toHaveLength(2);
    // (a drag that ends with them apart: the mark gone with it, one step; undone, both back - C where it was and the mark)
    st().moveAtoms([{ id: atoms.c, x: -1, y: 0.5 }], "two");
    st().settleMove("two", [atoms.c]);
    expect(bondOf(st().model, ac).behind).toBeUndefined();
    expect(doc.history().undoLabel).toBe("move atoms");
    doc.undo();
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
    expect(st().model.atoms.find((a) => a.id === atoms.c)).toMatchObject({ x: 2, y: 2 });
    // (dragged across again later, no gap comes back that nobody said)
    st().moveAtoms([{ id: atoms.c, x: -1, y: 0.5 }], "three");
    st().settleMove("three", [atoms.c]);
    st().moveAtoms([{ id: atoms.c, x: 2, y: 2 }], "four");
    st().settleMove("four", [atoms.c]);
    expect(drawn(st().model).ac).toHaveLength(1);
  });

  it("goes with any command that sets places and leaves the two apart - no drag, so in that command's own step - and is kept by one that leaves them crossing", () => {
    const { doc, st, ac, bd, atoms } = editor();
    st().orderCrossing(ac, bd, "behind");
    // (C put elsewhere at once, as Clean-up or a tool puts atoms: still crossing - kept)
    doc.edit("place", (d) => placeAtoms(d, [{ id: atoms.c, x: 2.2, y: 1.8 }]));
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
    // (put clear of BD: gone, in that step; undone, back)
    doc.edit("place", (d) => placeAtoms(d, [{ id: atoms.c, x: -1, y: 0.5 }]));
    expect(bondOf(st().model, ac).behind).toBeUndefined();
    expect(doc.history().undoLabel).toBe("place");
    doc.undo();
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
  });

  it("goes with an edit that gives a marked bond's end another atom - a new one, or one already there - leaving the two apart", () => {
    // (C's bond to A given a new end out to the left: AC no longer crosses BD)
    const one = editor();
    one.st().orderCrossing(one.ac, one.bd, "behind");
    one.doc.edit("new end", (d) => ({
      ...d,
      nextId: d.nextId + 1,
      model: { atoms: [...d.model.atoms, { id: d.nextId, el: "C", r: 0.9, x: -1, y: 0.5 }], bonds: d.model.bonds.map((b) => (b.id === one.ac ? { ...b, b: d.nextId } : b)) },
    }));
    expect(bondOf(one.st().model, one.ac).behind).toBeUndefined();
    // (AC's end C put on E, an atom already there at (-2, 0), none of the four atoms moved: A-E runs clear of BD)
    const two = editor();
    two.st().orderCrossing(two.ac, two.bd, "behind");
    const e = two.st().addAtom(-2, 0, "C");
    two.doc.edit("re-attach", (d) => ({ ...d, model: { ...d.model, bonds: d.model.bonds.map((b) => (b.id === two.ac ? { ...b, b: e } : b)) } }));
    expect(bondOf(two.st().model, two.ac).behind).toBeUndefined();
    // (and one that leaves them crossing, an end given another atom across: kept)
    const three = editor();
    three.st().orderCrossing(three.ac, three.bd, "behind");
    const f = three.st().addAtom(3, 3, "C");
    three.doc.edit("further", (d) => ({ ...d, model: { ...d.model, bonds: d.model.bonds.map((b) => (b.id === three.ac ? { ...b, b: f } : b)) } }));
    expect(bondOf(three.st().model, three.ac).behind).toEqual([three.bd]);
  });

  it("is kept through the frames of a turn that carries drawing with molecules in 3D, apart and back across, until it ends", () => {
    const { st, ac, bd, atoms } = editor();
    st().orderCrossing(ac, bd, "behind");
    st().turnMolecules3d([], "turn", [{ id: atoms.c, x: -1, y: 0.5 }]);
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
    st().turnMolecules3d([], "turn", [{ id: atoms.c, x: 2, y: 2 }]);
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
  });

  it("is left by a move that did not touch its bonds: only a mark with an atom the move moved is taken away", () => {
    const { st, ac, bd, atoms } = editor();
    st().orderCrossing(ac, bd, "behind");
    // (C dragged apart and the drag not ended - a mark between bonds apart, as a file may hold one)
    st().moveAtoms([{ id: atoms.c, x: -1, y: 0.5 }], "held");
    // (another structure moved and let go: the mark is not its, and stays)
    const o = st().addAtom(20, 20, "C");
    st().moveAtoms([{ id: o, x: 25, y: 20 }], "other");
    st().settleMove("other", [o]);
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
    st().settleMove("held", [atoms.c]);
    expect(bondOf(st().model, ac).behind).toBeUndefined();
  });

  it("goes when an edit gives all four atoms a depth, in that edit's step, and does not come back when the depth goes; with only some deep, the mark says it", () => {
    const { doc, st, ac, bd } = editor();
    st().orderCrossing(ac, bd, "behind");
    // (three of the four given a depth: the mark still says it, and is drawn)
    doc.edit("some depth", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a, i) => (i < 3 ? { ...a, z: 0 } : a)) } }));
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
    expect(drawn(st().model).ac).toHaveLength(2);
    // (all four: the depth says it, the mark gone in that step)
    doc.edit("all depth", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => ({ ...a, z: 0 })) } }));
    expect(st().model.bonds.some((b) => b.behind)).toBe(false);
    // (the depth taken away again: the mark does not come back)
    doc.edit("no depth", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map(({ z: _z, ...a }) => a) } }));
    expect(st().model.bonds.some((b) => b.behind)).toBe(false);
    expect(drawn(st().model).ac).toHaveLength(1);
    // (undone to before the depth: back)
    doc.undo();
    doc.undo();
    expect(bondOf(st().model, ac).behind).toEqual([bd]);
  });

  it("goes with either bond: the other deleted, the bond is whole and names no bond that is gone", () => {
    const { store, st, ac, bd } = editor();
    st().orderCrossing(ac, bd, "behind");
    store.setState({ sel: { atoms: new Set(), bonds: new Set([bd]) } });
    st().deleteSelection();
    expect(st().model.bonds.find((b) => b.id === bd)).toBeUndefined();
    expect(bondOf(st().model, ac).behind).toBeUndefined();
    expect(drawn(st().model).ac).toHaveLength(1);
  });

  it("is saved and opened, and carried on the clipboard and pasted onto new ids, still between the same two bonds", () => {
    const { st, ac, bd } = editor();
    st().orderCrossing(ac, bd, "behind");
    const ws = readWorkspace(workspaceText(st()))!;
    expect(ws.drawn.bonds.find((b) => b.id === ac)?.behind).toEqual([bd]);
    const record = readRecord(recordText({ atoms: st().model.atoms, bonds: st().model.bonds }))!;
    expect(record.bonds.find((b) => b.id === ac)?.behind).toEqual([bd]);
    // (pasted beside it: the copy's bond behind names the copy's other bond)
    const before = new Set(st().model.bonds.map((b) => b.id));
    st().pasteModel({ atoms: record.atoms.map((a) => ({ ...a, x: a.x + 10 })), bonds: record.bonds });
    const added = st().model.bonds.filter((b) => !before.has(b.id));
    const marked = added.filter((b) => b.behind?.length);
    expect(marked).toHaveLength(1);
    expect(added.map((b) => b.id)).toContain(marked[0].behind![0]);
    expect(marked[0].behind![0]).not.toBe(bd);
  });

  it("reads from a file only ids of the record's own bonds, each once, one way", () => {
    const { st, ac, bd } = editor();
    const text = JSON.parse(recordText({ atoms: st().model.atoms, bonds: st().model.bonds }));
    for (const b of text.bonds) {
      if (b.id === ac) b.behind = [bd, bd, 999, "x", ac];
      if (b.id === bd) b.behind = [ac];
    }
    const read = readRecord(JSON.stringify(text))!;
    const said = read.bonds.filter((b) => b.behind);
    expect(said).toHaveLength(1);
    expect(said[0].behind).toHaveLength(1);
  });

  it("drops a mark whose other bond is not among what is copied", () => {
    const { st, ac, bd, atoms } = editor();
    st().orderCrossing(ac, bd, "behind");
    // (AC and its atoms copied alone: BD did not come)
    const part = { atoms: st().model.atoms.filter((a) => a.id === atoms.a || a.id === atoms.c), bonds: [bondOf(st().model, ac)] };
    const before = new Set(st().model.bonds.map((b) => b.id));
    st().pasteModel(part);
    const added = st().model.bonds.filter((b) => !before.has(b.id));
    expect(added).toHaveLength(1);
    expect(added[0].behind).toBeUndefined();
  });

  it("is turned over with the structure: front and behind exchanged, as its depth would be", () => {
    const { store, st, ac, bd, atoms } = editor();
    st().orderCrossing(ac, bd, "behind");
    store.setState({ sel: { atoms: new Set(Object.values(atoms)), bonds: new Set(st().model.bonds.map((b) => b.id)) } });
    st().turnSelectionOver("vertical");
    expect(bondOf(st().model, ac).behind).toBeUndefined();
    expect(bondOf(st().model, bd).behind).toEqual([ac]);
    // (mirrored left to right, BD now runs from (0, 0) to (2, 2): the rising diagonal, in two pieces; AC the falling one, whole)
    expect(drawn(st().model).ac).toHaveLength(2);
    expect(drawn(st().model).bd).toHaveLength(1);
  });

  it("is not offered where all four atoms carry a depth, and there the depth says which is behind, whatever is said", () => {
    const { st, ac, bd } = editor();
    st().orderCrossing(ac, bd, "behind");
    // (the same drawing with depth: B and D near, A and C far - AC is behind by its depth; said behind too, it is the same; said in front, the depth still wins)
    const deep: Model = { ...st().model, atoms: st().model.atoms.map((a) => ({ ...a, z: a.x === a.y ? -1 : 1 })) };
    expect(crossingsOf(deep, ac)).toEqual([]);
    const front: Model = { ...deep, bonds: deep.bonds.map((b) => (b.id === ac ? { ...b, behind: undefined } : b.id === bd ? { ...b, behind: [ac] } : b)) };
    expect(drawn(front).ac).toHaveLength(2);
    expect(drawn(front).bd).toHaveLength(1);
  });

  describe("in every writer: the marked crossing has its gap, and nothing is painted over it - five bonds drawn whole, the one behind in two pieces", () => {
    const { st, ac, bd } = editor();
    st().orderCrossing(ac, bd, "behind");
    const { atoms, bonds } = drawn(st().model);
    const opts = acsWorldOptions(atoms, bonds, { units: "world", bondColor: "#224466" });
    const layout = layoutMolecule(atoms, bonds, opts, 40);

    it("the layout the page draws: five lines and the two pieces of AC, and nothing over the gap at the middle", () => {
      expect(layout.lines).toHaveLength(5);
      expect(layout.lines.filter((l) => along(l, 1))).toHaveLength(0);
      expect(layout.polys.filter((p) => on(p, 1))).toHaveLength(2);
      expect(layout.polys.filter((p) => reachOf(p) > 0.3)).toHaveLength(2);
      for (const p of layout.polys) for (const q of p.points) expect(Math.hypot(q.x - 1, q.y - 1)).toBeGreaterThan(0.1);
      for (const f of layout.fills) expect(Math.hypot(f.c.x - 1, f.c.y - 1)).toBeGreaterThan(0.1);
    });

    it("the SVG: five lines, and a filled shape for each the layout has - AC's two pieces and the joins - in the bonds' colour", () => {
      const svg = createSVG(layout, opts);
      expect([...svg.matchAll(/<line /g)]).toHaveLength(5);
      expect([...svg.matchAll(/<line [^>]*stroke="([^"]+)"/g)].every((m) => m[1] === "#224466")).toBe(true);
      const shapes = [...svg.matchAll(/<path [^>]*fill="([^"]+)"[^>]*stroke="none"/g)];
      expect(shapes).toHaveLength(layout.polys.length);
      expect(shapes.every((m) => m[1] === "#224466")).toBe(true);
    });

    it("the EMF: five polylines, and a filled polygon for each shape the layout has", () => {
      const types = emfRecords(layoutEmf(layout, opts).emf)!.map((r) => r.type);
      expect(types.filter((t) => t === 4)).toHaveLength(5);
      expect(types.filter((t) => t === 3)).toHaveLength(layout.polys.length);
    });
  });
});

describe("the gap on its way open or closed", () => {
  it("is as wide as it has come: half open, half the break; not at all, none", () => {
    const { st, ac, bd } = editor();
    st().orderCrossing(ac, bd, "behind");
    const { atoms, bonds, opts } = drawn(st().model);
    // (the gap along AC: from the cut end of its lower piece to that of its upper, each measured along AC from the crossing at (1, 1))
    const at = (share: number) => {
      const eased = bonds.map((b) => (b.id === ac ? { ...b, behindShare: { [bd]: share } } : b));
      const pieces = buildAllPrimitives(atoms, eased, opts, 40).polys.filter((p) => on(p, 1));
      if (pieces.length < 2) return 0;
      const t = (q: { x: number; y: number }) => (q.x - 1 + (q.y - 1)) / Math.SQRT2;
      const below = pieces.filter((p) => t(centreOf(p)) < 0).flatMap((p) => p.points.map(t));
      const above = pieces.filter((p) => t(centreOf(p)) > 0).flatMap((p) => p.points.map(t));
      return Math.min(...above) - Math.max(...below);
    };
    const full = at(1);
    expect(full).toBeGreaterThan(0.2);
    expect(at(0.5)).toBeCloseTo(full / 2, 9);
    expect(at(0)).toBe(0);
  });
});

describe("a mark carried onto new ids, between the same two bonds", () => {
  /** A model with its crossing marked, its ids shifted by `k`: AC behind BD. */
  const marked = (k: number): Model => {
    const { st, ac, bd } = editor();
    st().orderCrossing(ac, bd, "behind");
    const m = st().model;
    return { atoms: m.atoms.map((a) => ({ ...a, id: a.id + k })), bonds: m.bonds.map((b) => ({ ...b, id: b.id + k, a: b.a + k, b: b.b + k, ...(b.behind ? { behind: b.behind.map((x) => x + k) } : {}) })) };
  };
  /** Each mark of `out` as the two bonds' atom pairs, by where those atoms lie: the same crossing whatever the ids. */
  const marks = (out: Model) => {
    const at = new Map(out.atoms.map((a) => [a.id, a]));
    const ends = (id: number) => {
      const b = out.bonds.find((x) => x.id === id)!;
      return [at.get(b.a)!, at.get(b.b)!].map((a) => `${Math.round(a.y * 10)}`).sort().join("-");
    };
    return out.bonds.flatMap((b) => (b.behind ?? []).map((o) => `${ends(b.id)} behind ${ends(o)}`));
  };

  it("through a run's structures numbered apart (workflow/run `numberedApart`)", () => {
    const out = numberedApart([marked(0), marked(100)]);
    const ms = marks(out);
    expect(ms).toHaveLength(2);
    // (AC rises from y 0 to y 2, BD falls from y 2 to y 0: each mark AC behind BD, its bond named by its new id)
    for (const m of ms) expect(m).toBe("0-20 behind 0-20");
    for (const b of out.bonds.filter((x) => x.behind)) {
      const other = out.bonds.find((x) => x.id === b.behind![0])!;
      expect(other).toBeDefined();
      // (the other is the same structure's: an atom in common with this bond's neighbours, none with the other copy)
      expect(Math.abs(other.id - b.id)).toBeLessThan(10);
    }
  });

  it("through structures dragged into a row (structureDrag `inRow`)", () => {
    const out = inRow([marked(0), marked(100)], 2);
    expect(marks(out)).toHaveLength(2);
    for (const b of out.bonds.filter((x) => x.behind)) {
      const other = out.bonds.find((x) => x.id === b.behind![0])!;
      const at = new Map(out.atoms.map((a) => [a.id, a]));
      // (the other bond crosses this one on the page: the same copy's)
      const xs = (id: number) => [at.get(out.bonds.find((x) => x.id === id)!.a)!.x, at.get(out.bonds.find((x) => x.id === id)!.b)!.x];
      expect(Math.max(...xs(b.id))).toBeGreaterThan(Math.min(...xs(other.id)));
      expect(Math.min(...xs(b.id))).toBeLessThan(Math.max(...xs(other.id)));
    }
  });
});

describe("where only some of the four atoms carry a depth", () => {
  it("draws the gap the mark says, the back bond's atoms deep and the front's not, and the other way round", () => {
    for (const deep of [["a", "c"], ["b", "d"]] as const) {
      const { st, ac, bd, atoms } = editor();
      st().orderCrossing(ac, bd, "behind");
      const ids = new Set(deep.map((k) => atoms[k]));
      const m: Model = { ...st().model, atoms: st().model.atoms.map((a) => (ids.has(a.id) ? { ...a, z: 1 } : a)) };
      expect(drawn(m).ac, deep.join("")).toHaveLength(2);
      expect(drawn(m).bd, deep.join("")).toHaveLength(1);
    }
  });
});
