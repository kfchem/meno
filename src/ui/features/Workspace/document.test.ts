import { describe, expect, it } from "vitest";
import * as ops from "./document";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "./document";
import { pt } from "../../../lib/chem/style";
import type { Model } from "./store/types";

const doc = () => emptyWorkspaceDocument();

/** Two bonded carbons, as a starting point. */
function ethane(): WorkspaceDocument {
  return ops.addBondedPair(doc(), { x: 0, y: 0 }, { x: 1.5, y: 0 });
}

describe("structure document operations", () => {
  it("hands out ids from one counter and keeps atoms and bonds apart", () => {
    const d = ethane();
    expect(d.model.atoms.map((a) => a.id)).toEqual([1, 2]);
    expect(d.model.bonds).toHaveLength(1);
    expect(d.model.bonds[0]).toMatchObject({ id: 3, a: 1, b: 2, order: 1 });
    expect(d.nextId).toBe(4);
  });

  it("adds an atom with its bond in one operation", () => {
    const d = ops.addAtomBonded(ethane(), 2, 3, 0, "O");
    expect(d.model.atoms).toHaveLength(3);
    expect(d.model.atoms[2]).toMatchObject({ el: "O", x: 3, y: 0 });
    expect(d.model.bonds[1]).toMatchObject({ a: 2, b: d.model.atoms[2].id });
  });

  it("refuses to bond an atom to itself or to repeat a bond", () => {
    const d = ethane();
    expect(ops.connectAtoms(d, 1, 1)).toBe(d);
    expect(ops.connectAtoms(d, 1, 2)).toBe(d);
    expect(ops.connectAtoms(d, 2, 1)).toBe(d);
    // a genuinely new bond does change the document
    const three = ops.addAtom(d, 3, 0, "N");
    expect(ops.connectAtoms(three, 2, three.nextId - 1)).not.toBe(three);
  });

  it("adds a stroke in one operation, closing onto atoms it reaches", () => {
    const d = ops.addAtom(doc(), 0, 0);
    // a square drawn out of atom 1 and back to it, then on to a new atom
    const next = ops.addStroke(d, 1, [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0, atomId: 1 },
      { x: -1, y: 0 },
    ]);
    expect(next.model.atoms).toHaveLength(5);
    expect(next.model.bonds).toHaveLength(5);
    // and back onto a node of its own, not a new atom
    const loop = ops.addStroke(d, 1, [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 0, pathIndex: 0 },
    ]);
    expect(loop.model.atoms).toHaveLength(4);
    expect(loop.model.bonds).toHaveLength(4);
    // from an atom that is not there: nothing
    expect(ops.addStroke(d, 99, [{ x: 1, y: 0 }])).toBe(d);
  });

  it("deletes an atom with its bonds, and the carbons left on their own", () => {
    // propanol: C1-C2-C3-O; the middle carbon goes
    let d = ops.addBondedPair(doc(), { x: 0, y: 0 }, { x: 1.5, y: 0 });
    d = ops.addAtomBonded(d, 2, 3, 0);
    d = ops.addAtomBonded(d, d.nextId - 2, 4.5, 0, "O");
    const [c1, c2, c3, o] = d.model.atoms.map((a) => a.id);
    const next = ops.deleteParts(d, [c2], []);
    // C1 is left with nothing and goes; C3 keeps its bond to O
    expect(next.model.atoms.map((a) => a.id)).toEqual([c3, o]);
    expect(next.model.atoms.some((a) => a.id === c1)).toBe(false);
    expect(next.model.bonds).toHaveLength(1);
    expect(next.model.bonds[0]).toMatchObject({ a: c3, b: o });
  });

  it("deletes a bond, keeping a labelled atom it leaves alone", () => {
    let d = ops.addBondedPair(doc(), { x: 0, y: 0 }, { x: 1.5, y: 0, el: "O" });
    d = ops.addAtomBonded(d, 1, -1.5, 0);
    const bond = d.model.bonds[0].id; // C1-O
    const next = ops.deleteParts(d, [], [bond]);
    // the O stays, on its own; C1 still has its other bond
    expect(next.model.atoms.map((a) => a.el)).toEqual(["C", "O", "C"]);
    expect(next.model.bonds).toHaveLength(1);
    // nothing to delete, nothing changed
    expect(ops.deleteParts(d, [99], [98])).toBe(d);
  });

  it("deletes everything selected in a large drawing looking at each atom a few times, not once for every bond", () => {
    // (a hundred rings of six carbons side by side, all selected)
    const atoms: Model["atoms"] = [];
    const bonds: Model["bonds"] = [];
    for (let r = 0; r < 100; r++) {
      for (let k = 0; k < 6; k++) {
        const id = 6 * r + k + 1;
        atoms.push({ id, x: 3 * r + Math.cos(k), y: Math.sin(k), r: 0.9, el: "C" });
        bonds.push({ id: 1_000_000 + id, a: id, b: 6 * r + ((k + 1) % 6) + 1, order: 1 });
      }
    }
    const seen = counted(atoms);
    const next = ops.deleteParts({ ...doc(), model: { atoms: seen.list, bonds } }, atoms.map((a) => a.id), bonds.map((b) => b.id));
    expect(next.model.atoms).toHaveLength(0);
    // (where each bond's ends were looked for among every atom, it was some
    // 360 000 reads: 10.5 s for 28 000 atoms)
    expect(seen.reads()).toBeLessThan(20 * atoms.length);
  });

  it("lays some of the structure out afresh in one operation", () => {
    const d = ops.updateBond(ethane(), 3, { stereo: "up" });
    const next = ops.relayout(d, {
      atoms: [
        { id: 1, x: 0, y: 0 }, // where it is already
        { id: 2, x: 1.3, y: 0.75 },
      ],
      bonds: [{ id: 3, stereo: "down", stereoOrient: "reverse" }],
    });
    expect(next.model.atoms[0]).toBe(d.model.atoms[0]);
    expect(next.model.atoms[1]).toMatchObject({ x: 1.3, y: 0.75 });
    expect(next.model.bonds[0]).toMatchObject({
      stereo: "down",
      stereoOrient: "reverse",
    });
    // nothing to change, nothing changed
    expect(
      ops.relayout(d, { atoms: [{ id: 1, x: 0, y: 0 }], bonds: [] }),
    ).toBe(d);
  });

  it("adds and takes away the H a new layout draws, and gives atoms a depth", () => {
    let d = ethane();
    d = ops.addAtomBonded(d, 1, -1, 1, "H");
    const h = d.model.atoms[2].id;
    const next = ops.relayout(d, {
      atoms: [{ id: 1, x: 0, y: 0, z: 0.5, stereoCentre: true }],
      bonds: [],
      added: [{ x: 0, y: 1.5, on: 2, stereo: "up", stereoOrient: "principle" }],
      removed: [h],
    });
    expect(next.model.atoms.map((a) => a.el)).toEqual(["C", "C", "H"]);
    expect(next.model.atoms[0]).toMatchObject({ z: 0.5, stereoCentre: true });
    const added = next.model.atoms[2];
    expect(added.id).not.toBe(h);
    // the H's own bond gone with it; the new one wedged from atom 2
    expect(next.model.bonds.map((b) => [b.a, b.b, b.stereo])).toEqual([
      [1, 2, "none"],
      [2, added.id, "up"],
    ]);
    // and laid out again flat, the depth goes
    const flat = ops.relayout(next, { atoms: [{ id: 1, x: 0, y: 0 }], bonds: [] });
    expect(flat.model.atoms[0].z).toBeUndefined();
    expect(flat.model.atoms[0].stereoCentre).toBeUndefined();
  });

  it("returns the same document when nothing changes, so no undo step is made", () => {
    const d = ethane();
    expect(ops.moveAtom(d, 1, 0, 0)).toBe(d);
    expect(ops.moveAtom(d, 999, 5, 5)).toBe(d);
    expect(ops.setAtomChemistry(d, 1, { el: "C" })).toBe(d);
    expect(ops.updateBond(d, d.model.bonds[0].id, { order: 1 })).toBe(d);
    expect(ops.updateBond(d, 999, { order: 2 })).toBe(d);
    expect(ops.removeArrow(d, 1)).toBe(d);
    expect(ops.setAromaticEnabled(d, false)).toBe(d);
    expect(ops.setRingEnabled(d, "ring", false)).toBe(d);
    expect(ops.appendModel(d, { atoms: [], bonds: [] })).toBe(d);
  });

  it("moves and relabels atoms without touching the rest", () => {
    const d = ethane();
    const moved = ops.moveAtom(d, 2, 4, 1);
    expect(moved.model.atoms[1]).toMatchObject({ x: 4, y: 1 });
    expect(moved.model.atoms[0]).toBe(d.model.atoms[0]);
    expect(moved.model.bonds).toBe(d.model.bonds);

    const named = ops.setAtomChemistry(moved, 2, { el: "O" });
    expect(named.model.atoms[1].el).toBe("O");
    expect(named.model.atoms[1].x).toBe(4);
  });

  it("changes bond properties", () => {
    const d = ethane();
    const id = d.model.bonds[0].id;
    const double = ops.updateBond(d, id, { order: 2 });
    expect(double.model.bonds[0].order).toBe(2);
    // (a wedge says something of a single bond's end alone: a double bond takes none, 2026-10-13)
    const wedge = ops.updateBond(double, id, { stereo: "up" });
    expect(wedge.model.bonds[0]).toMatchObject({ order: 2, stereo: "none" });
    const single = ops.updateBond(ops.updateBond(double, id, { order: 1 }), id, { stereo: "up" });
    expect(single.model.bonds[0]).toMatchObject({ order: 1, stereo: "up" });
  });

  it("merges a dragged atom into its target, rewiring bonds", () => {
    // chain: 1-2, plus 3 bonded to 1; dropping 3 onto 2 should bond 2-1 only once
    let d = ethane();
    d = ops.addAtomBonded(d, 1, -1.5, 0, "C");
    const draggedId = d.model.atoms[2].id;
    const merged = ops.replaceDraggedAtomWith(d, draggedId, 2);

    expect(merged.model.atoms.map((a) => a.id)).toEqual([1, 2]);
    // the rewired bond would duplicate 1-2, so it is dropped
    expect(merged.model.bonds).toHaveLength(1);
    expect(merged.model.bonds[0]).toMatchObject({ a: 1, b: 2 });
  });

  it("keeps a rewired bond when it is not a duplicate", () => {
    // 1-2 and 3-4; dropping 3 onto 2 should leave 1-2 and 2-4
    let d = ethane();
    d = ops.addAtom(d, 5, 0, "C");
    const third = d.nextId - 1;
    d = ops.addAtomBonded(d, third, 6.5, 0, "C");
    const fourth = d.model.atoms[3].id;
    const merged = ops.replaceDraggedAtomWith(d, third, 2);

    expect(merged.model.atoms.map((a) => a.id)).toEqual([1, 2, fourth]);
    expect(merged.model.bonds).toHaveLength(2);
    expect(merged.model.bonds[1]).toMatchObject({ a: 2, b: fourth });
  });

  it("replaces the whole model on import and renumbers from it", () => {
    const d = ops.addArrow(ethane(), 0, 0, 0, 2);
    const replaced = ops.replaceModel(d, {
      atoms: [{ id: 7, x: 0, y: 0, r: 0.9, el: "N" }],
      bonds: [],
    });
    expect(replaced.model.atoms).toHaveLength(1);
    expect(replaced.nextId).toBe(8);
    // an import starts a clean sheet
    expect(replaced.arrows).toEqual([]);
    expect(replaced.aromaticRings).toEqual({});
  });

  it("renumbers an appended structure so ids stay unique", () => {
    const d = ethane();
    const appended = ops.appendModel(d, {
      atoms: [
        { id: 1, x: 5, y: 0, r: 0.9, el: "O" },
        { id: 2, x: 6, y: 0, r: 0.9, el: "O" },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 2 }],
    });
    const ids = appended.model.atoms.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const added = appended.model.bonds[1];
    expect(added.a).toBe(ids[2]);
    expect(added.b).toBe(ids[3]);
    expect(added.order).toBe(2);
  });

  it("keeps arrows in their own numbering", () => {
    let d = ops.addArrow(ethane(), 1, 2, 0, 3);
    expect(d.arrows[0]).toMatchObject({ id: 1, x: 1, y: 2, length: 3 });
    d = ops.updateArrow(d, 1, { x: 9 });
    expect(d.arrows[0].x).toBe(9);
    d = ops.removeArrow(d, 1);
    expect(d.arrows).toEqual([]);
  });

  it("gives an arrow its own look, and takes it away again", () => {
    let d = ops.addArrow(ethane(), 1, 2, 0, 3);
    d = ops.setArrowLook(d, 1, { reactionArrowHeadInset: 0.3, reactionArrowThickness: pt(1) });
    expect(d.arrows[0].look).toEqual({ reactionArrowHeadInset: 0.3, reactionArrowThickness: pt(1) });
    // in place of what it had, not over it
    d = ops.setArrowLook(d, 1, { reactionArrowHeadInset: 0.5 });
    expect(d.arrows[0].look).toEqual({ reactionArrowHeadInset: 0.5 });
    // nothing of its own, and the arrow is as it was
    d = ops.setArrowLook(d, 1, {});
    expect(d.arrows[0]).toEqual({ id: 1, x: 1, y: 2, angle: 0, length: 3 });
    expect(ops.setArrowLook(d, 9, { reactionArrowHeadInset: 0.5 })).toBe(d);
  });

  it("gives arrows a kind, heads, dashes, a weight, corners and a colour - and takes each away again", () => {
    let d = ops.addArrow(ops.addArrow(ethane(), 1, 2, 0, 3), 5, 2, 0, 3);
    d = ops.setArrowForm(d, [1, 2], { kind: "equilibrium", full: true, dash: true, weight: "thick", corners: [{ along: 0.5, across: 1 }], color: "#c44848" });
    for (const a of d.arrows) expect(a).toMatchObject({ kind: "equilibrium", full: true, dash: true, weight: "thick", corners: [{ along: 0.5, across: 1 }], color: "#c44848" });
    d = ops.setArrowForm(d, [1], { kind: null, full: false, dash: false, weight: "regular", corners: null, color: null, heads: 2 });
    expect(d.arrows[0]).toEqual({ id: 1, x: 1, y: 2, angle: 0, length: 3, heads: 2 });
    expect(ops.setArrowForm(d, [1], { heads: 2 })).toBe(d);
    // (brought with a paste: as it was, each new id)
    const pasted = ops.withImportedScheme(ethane(), ops.schemeOf({ ...ethane().model, arrows: d.arrows }));
    expect(pasted.arrows[1]).toMatchObject({ kind: "equilibrium", corners: [{ along: 0.5, across: 1 }], color: "#c44848" });
  });

  it("takes the words by an arrow along with its line as it is bent, the corner moved, and straightened", () => {
    // an arrow from (0, 0) to (8, 0), words over its middle and under its first quarter
    let d = ops.addArrow(ethane(), 4, 0, 0, 8);
    d = ops.addCaption(d, { x: 4, y: 0.8, text: "NaH", arrow: 1 });
    d = ops.addCaption(d, { x: 2, y: -0.8, text: "THF", arrow: 1 });
    // bent up at its middle: the words over the middle stay over it, over the corner, as far off
    d = ops.updateArrow(d, 1, { corners: [{ along: 0.5, across: 2 }] });
    expect(d.captions![0].x).toBeCloseTo(4, 6);
    expect(d.captions![0].y).toBeCloseTo(2.8, 6);
    // (those under the first quarter, by the first stretch, halfway along it)
    expect(d.captions![1].x).toBeCloseTo(2, 6);
    expect(d.captions![1].y).toBeCloseTo(0.2, 6);
    // the corner moved on, frame by frame as a drag moves it: they go with it, and do not wander
    for (const across of [2.2, 2.6, 3, -1, 2.4, 2]) d = ops.updateArrow(d, 1, { corners: [{ along: 0.5, across }] });
    expect(d.captions![0].x).toBeCloseTo(4, 6);
    expect(d.captions![0].y).toBeCloseTo(2.8, 6);
    // its point drawn up to (8, 4): the words over the corner go with it, as far off it, across the arrow as it now runs
    const turned = ops.updateArrow(d, 1, { x: 4, y: 2, angle: Math.atan2(4, 8), length: Math.hypot(8, 4) });
    const n = { x: -4 / Math.hypot(8, 4), y: 8 / Math.hypot(8, 4) };
    expect(turned.captions![0].x).toBeCloseTo(4 + n.x * 2.8, 6);
    expect(turned.captions![0].y).toBeCloseTo(2 + n.y * 2.8, 6);
    // straightened from the menu: back where they began
    d = ops.setArrowForm(d, [1], { corners: null });
    expect(d.captions![0].x).toBeCloseTo(4, 6);
    expect(d.captions![0].y).toBeCloseTo(0.8, 6);
    expect(d.captions![1].x).toBeCloseTo(2, 6);
    expect(d.captions![1].y).toBeCloseTo(-0.8, 6);
    // a straight arrow moved takes them with its middle, as before
    d = ops.updateArrow(d, 1, { x: 5, y: 1 });
    expect(d.captions![0].x).toBeCloseTo(5, 6);
    expect(d.captions![0].y).toBeCloseTo(1.8, 6);
  });

  it("toggles aromatic circles", () => {
    let d = ops.setAromaticEnabled(doc(), true);
    expect(d.aromaticEnabled).toBe(true);
    d = ops.setRingEnabled(d, "ring-a", true);
    expect(d.aromaticRings).toEqual({ "ring-a": true });
  });
});

describe("a bond the file made more than plain", () => {
  it("is the bond it is made once its order or stereo is changed", () => {
    let d = emptyWorkspaceDocument();
    d = ops.addAtom(d, 0, 0);
    d = ops.addAtom(d, 1, 0);
    const [a, b] = d.model.atoms.map((x) => x.id);
    d = ops.addBond(d, a, b, 2);
    const id = d.model.bonds[0].id;
    d = { ...d, model: { ...d.model, bonds: [{ ...d.model.bonds[0], stereo: "either", query: "double-or-aromatic" }] } };
    // (a change that is not to its order or stereo leaves it)
    d = ops.updateBond(d, id, { doubleMode: "center" });
    expect(d.model.bonds[0]).toMatchObject({ stereo: "either", query: "double-or-aromatic" });
    d = ops.updateBond(d, id, { order: 1 });
    expect(d.model.bonds[0].query).toBeUndefined();
    expect(d.model.bonds[0].stereo).toBe("none");
  });
});

describe("an abbreviation", () => {
  const L = 1.8;
  // a C bonded to an atom labelled OMe, to its right
  const withOMe = (abbrev?: WorkspaceDocument["model"]["atoms"][number]["abbrev"]) => {
    let d = emptyWorkspaceDocument();
    d = ops.addAtom(d, 0, 0);
    d = ops.addAtom(d, L, 0, "OMe");
    const [c, o] = d.model.atoms.map((a) => a.id);
    d = ops.addBond(d, c, o, 1);
    if (abbrev) d = { ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => (a.id === o ? { ...a, abbrev } : a)) } };
    return { d, c, o };
  };

  it("is drawn out as the dictionary has it, on from its bond", () => {
    const { d, c, o } = withOMe();
    const out = ops.expandAbbreviation(d, o);
    const atoms = out.model.atoms;
    expect(atoms.map((a) => a.el)).toEqual(["C", "O", "C"]);
    // the labelled atom is its O, where it was; the methyl a bond further on
    expect(atoms[1]).toMatchObject({ id: o, el: "O", x: L, y: 0 });
    expect(Math.hypot(atoms[2].x - L, atoms[2].y)).toBeCloseTo(L, 6);
    expect(atoms[2].x).toBeGreaterThan(L);
    expect(out.model.bonds.map((b) => [b.a, b.b])).toEqual([
      [c, o],
      [o, atoms[2].id],
    ]);
  });

  it("is drawn out as the file gave it, turned with its bond", () => {
    // as a file had it: its bond out pointing down, the methyl straight up
    const { d, o } = withOMe({
      atoms: [
        { el: "O", x: 0, y: 0 },
        { el: "C", x: 0, y: L },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      attach: [0],
      toward: { x: 0, y: -L },
    });
    const out = ops.expandAbbreviation(d, o);
    // its bond out now points left: turned a quarter, the methyl to the right
    const methyl = out.model.atoms[2];
    expect(methyl.x).toBeCloseTo(2 * L, 6);
    expect(methyl.y).toBeCloseTo(0, 6);
  });

  it("is gone with what it stood for once relabelled", () => {
    const { d, o } = withOMe({ atoms: [{ el: "O", x: 0, y: 0 }], bonds: [], attach: [0] });
    const out = ops.setAtomChemistry(d, o, { el: "N" });
    expect(out.model.atoms[1].abbrev).toBeUndefined();
    expect(out.model.atoms[1].el).toBe("N");
  });
});

describe("molecules in 3D on the page", () => {
  const water = {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.76, y: 0.59, z: 0 },
      { el: "H", x: -0.76, y: 0.59, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
  };

  it("come with a file's scheme, each given an id of its own", () => {
    const d = ops.withImportedScheme(doc(), {
      molecules3d: [
        { ...water, at: { x: 0, y: 0 } },
        { ...water, at: { x: 5, y: 0 } },
      ],
    });
    expect(d.molecules3d!.map((m) => m.id)).toEqual([1, 2]);
    expect(d.nextMolecule3dId).toBe(3);
  });

  it("are moved and taken away by id", () => {
    let d = ops.addMolecule3d(doc(), { ...water, at: { x: 0, y: 0 } });
    d = ops.moveMolecule3d(d, 1, { x: 2, y: -1 });
    expect(d.molecules3d![0].at).toEqual({ x: 2, y: -1 });
    expect(ops.removeMolecule3d(d, 1).molecules3d).toEqual([]);
  });

  it("go when a file is opened over them", () => {
    const d = ops.addMolecule3d(ethane(), { ...water, at: { x: 0, y: 0 } });
    const next = ops.replaceModel(d, { atoms: [], bonds: [] });
    expect(next.molecules3d).toEqual([]);
    expect(next.nextMolecule3dId).toBe(1);
  });

  it("move with the drawing they are selected with, in the same edit", () => {
    const d = ops.addMolecule3d(doc(), { ...water, at: { x: 0, y: 0 } });
    const moved = ops.placeMarks(d, { molecules3d: [{ id: 1, at: { x: 3, y: -2 } }] });
    expect(moved.molecules3d![0].at).toEqual({ x: 3, y: -2 });
    expect(ops.placeMarks(d, {})).toBe(d);
  });

  it("move together, and go together", () => {
    let d = ops.addMolecule3d(doc(), { ...water, at: { x: 0, y: 0 } });
    d = ops.addMolecule3d(d, { ...water, at: { x: 5, y: 0 } });
    d = ops.moveMolecules3d(d, [
      { id: 1, at: { x: 1, y: 1 } },
      { id: 2, at: { x: 6, y: 1 } },
    ]);
    expect(d.molecules3d!.map((m) => m.at)).toEqual([
      { x: 1, y: 1 },
      { x: 6, y: 1 },
    ]);
    expect(ops.removeMolecules3d(d, [2, 1]).molecules3d).toEqual([]);
    // (none of them there: the same document)
    expect(ops.removeMolecules3d(d, [7])).toBe(d);
  });

  it("are drawn in the 3D style's primary look or its secondary, each its own way - several at once", () => {
    let d = ops.addMolecule3d(doc(), { ...water, at: { x: 0, y: 0 } });
    d = ops.addMolecule3d(d, { ...water, at: { x: 9, y: 0 } });
    const second = ops.setLook3d(d, [1, 2], "secondary");
    expect(second.molecules3d!.map((m) => m.look)).toEqual(["secondary", "secondary"]);
    expect(ops.setLook3d(d, [1, 2], "primary")).toBe(d);
    // (back to the primary: no look of its own left)
    expect("look" in ops.setLook3d(second, [1], "primary").molecules3d![0]).toBe(false);
  });

  it("take new places in the frame shown - an edit of their shape - with their stereo labels as they now are", () => {
    let d = ops.addMolecule3d(doc(), { ...water, at: { x: 0, y: 0 }, frames: [[0, 0, 0, 1, 0, 0, 0, 1, 0]] });
    const moved = [0, 0, 0, 2, 0, 0, 0, 2, 0];
    d = ops.setPlaces3d(d, 1, 1, moved, { atoms: { 0: "S" }, bonds: {} });
    expect(d.molecules3d![0].frames).toEqual([moved]);
    expect(d.molecules3d![0].atoms).toEqual(water.atoms);
    expect(d.molecules3d![0].stereo).toEqual({ atoms: { 0: "S" }, bonds: {} });
    d = ops.setPlaces3d(d, 1, 0, moved);
    expect(d.molecules3d![0].atoms[1]).toMatchObject({ el: "H", x: 2, y: 0, z: 0 });
    // (too few places: as it was)
    expect(ops.setPlaces3d(d, 1, 0, [1, 2])).toBe(d);
  });

  it("keep a measurement's atoms in another order - the same measurement - and no other", () => {
    let d = ops.addMolecule3d(doc(), { ...water, at: { x: 0, y: 0 } });
    d = ops.addMeasure3d(d, 1, [1, 0, 2]);
    d = ops.orderMeasure3d(d, 1, 1, [2, 0, 1]);
    expect(d.molecules3d![0].measures).toEqual([{ id: 1, atoms: [2, 0, 1] }]);
    expect(ops.orderMeasure3d(d, 1, 1, [0, 1, 2])).toBe(d);
  });

  it("keep measurements of two, three or four of their atoms, each once", () => {
    let d = ops.addMolecule3d(doc(), { ...water, at: { x: 0, y: 0 } });
    d = ops.addMeasure3d(d, 1, [1, 0, 2]);
    d = ops.addMeasure3d(d, 1, [0, 1]);
    expect(d.molecules3d![0].measures).toEqual([
      { id: 1, atoms: [1, 0, 2] },
      { id: 2, atoms: [0, 1] },
    ]);
    // the same atoms the other way round, one alone, one twice, one it has not: none
    for (const atoms of [[2, 0, 1], [0], [0, 0], [0, 3]]) expect(ops.addMeasure3d(d, 1, atoms)).toBe(d);
    d = ops.removeMeasure3d(d, 1, 1);
    expect(d.molecules3d![0].measures).toEqual([{ id: 2, atoms: [0, 1] }]);
    // (a new one is numbered past every one there is)
    expect(ops.addMeasure3d(d, 1, [1, 2]).molecules3d![0].measures!.map((x) => x.id)).toEqual([2, 3]);
  });
});

describe("what readers reading an output as well found", () => {
  const sha = "a".repeat(64);
  const water3d = {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.76, y: 0.59, z: 0 },
      { el: "H", x: -0.76, y: 0.59, z: 0 },
    ],
    bonds: [],
    at: { x: 0, y: 0 },
    calc: { readers: ["cclib 1.9rc1"], source: { name: "w.out", sha256: sha, kind: "orca" } },
  };
  const withWater = () => ops.addMolecule3d(emptyWorkspaceDocument(), water3d);
  const charges = { id: "npa", on: "atoms", group: "Partial charges", label: "Natural", quantity: "charge", values: [-0.9, 0.45, 0.45] };
  const found = { from: "nbo", version: "7", output: { atoms: ["O", "H", "H"], frames: [], results: [charges] } };

  it("is joined to each molecule read from that output, as its own reader's, once", () => {
    const d = ops.withReadings(withWater(), { [sha]: [found] });
    const calc = d.molecules3d![0].calc!;
    expect(calc.readers).toEqual(["cclib 1.9rc1", "nbo 7"]);
    expect(calc.results!.map((r) => [r.id, r.from])).toEqual([["npa", "nbo"]]);
    // (joined again: nothing new)
    expect(ops.withReadings(d, { [sha]: [found] })).toBe(d);
  });

  it("says a reader that could not read it, or read other atoms", () => {
    const d = ops.withReadings(withWater(), {
      [sha]: [
        { from: "pyscf", why: "no basis set in it" },
        { ...found, from: "other", output: { ...found.output, atoms: ["O", "H"] } },
      ],
    });
    expect(d.molecules3d![0].calc!.unread).toEqual([
      { from: "pyscf", why: "no basis set in it" },
      { from: "other", why: "it read other atoms" },
    ]);
  });

  it("of a file of several jobs, joins each job's molecule what the reader read of that job - or, read as one, the last's", () => {
    const job = (number: number) => ({ ...water3d, calc: { ...water3d.calc, job: { number, of: 2 } } });
    const two = () => ops.addMolecule3d(ops.addMolecule3d(emptyWorkspaceDocument(), job(1)), job(2));
    const second = { ...charges, values: [-0.8, 0.4, 0.4] };
    const byJob = { ...found, output: { ...found.output, jobs: [{ ...found.output, job: { number: 1, of: 2 } }, { ...found.output, results: [second], job: { number: 2, of: 2 } }] } };
    const d = ops.withReadings(two(), { [sha]: [byJob] });
    expect(d.molecules3d!.map((m) => m.calc!.results!.map((r) => (r as { values: number[] }).values[0]))).toEqual([[-0.9], [-0.8]]);
    // (read as one: its end, the last job's)
    const asOne = ops.withReadings(two(), { [sha]: [found] });
    expect(asOne.molecules3d!.map((m) => m.calc!.readers)).toEqual([["cclib 1.9rc1"], ["cclib 1.9rc1", "nbo 7"]]);
    expect(ops.readingOfJob(found, undefined)).toBe(found);
  });

  it("leaves a molecule of another output, and a document with nothing to join, as they are", () => {
    const d = withWater();
    expect(ops.withReadings(d, { ["b".repeat(64)]: [found] })).toBe(d);
    expect(ops.withReadings(d, {})).toBe(d);
  });
});

/** `xs` read through a count of the times one of them is read by its place - how much of a list a function looks at. */
function counted<T>(xs: T[]): { list: T[]; reads: () => number } {
  let n = 0;
  const list = new Proxy(xs, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) n++;
      return Reflect.get(target, key, receiver);
    },
  });
  return { list, reads: () => n };
}
