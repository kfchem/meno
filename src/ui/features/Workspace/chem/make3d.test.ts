import { describe, expect, it } from "vitest";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { layoutOptionsFor, MENO } from "../../../../lib/chem/style";
import type { ChemClient, Conformers } from "../../../../lib/roles/client";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import { factor } from "../../../../lib/units";
import type { Model } from "../store/types";
import { solidOf } from "../utils/molecule3d";
import { FEW_CONFORMERS, RING_CONFORMERS } from "../../../../lib/chem/conformersSought";
import { bareAtomsOf, bareWords, blocksOf, blocksStill, conformersOf, pageCount, drawnBlocksOf, formulaOf, standsForMolecule, likeOf, linkOf, moleculeOf, placeRow, rowFrom, signatureOf, takenOnPage, turnedOver, withinWindow, type Box, type Turned } from "./make3d";

/** Ethanol drawn: C1-C2-O3, a bond's length apart. */
const ethanol: Model = {
  atoms: [
    { id: 11, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 12, x: 1.56, y: 0.9, r: 0.9, el: "C" },
    { id: 13, x: 3.12, y: 0, r: 0.9, el: "O" },
  ],
  bonds: [
    { id: 21, a: 11, b: 12, order: 1 },
    { id: 22, a: 12, b: 13, order: 1 },
  ],
};

/** What RDKit answers for it: the drawn atoms, then two of the hydrogens, two conformers. */
const answer: Conformers = {
  atoms: [{ el: "C", charge: 0 }, { el: "C", charge: 0 }, { el: "O", charge: 0 }, { el: "H", charge: 0 }, { el: "H", charge: 0 }],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 0, a2: 3, order: 1 },
    { a1: 2, a2: 4, order: 1 },
  ],
  frames: [
    [0, 0, 0, 1.3, 0.75, 0.1, 2.6, 0, -0.1, -0.9, 0.5, 0, 3.4, 0.5, 0],
    [0, 0, 0.1, 1.3, 0.75, 0, 2.6, 0, 0.2, -0.9, 0.5, 0, 3.4, 0.5, 0],
  ],
  energies: [-0.001, 0.002],
  field: "MMFF94",
  cip: { atoms: {}, bonds: {} },
  chosen: { atoms: {}, bonds: {} },
  smiles: "CCO",
};

describe("a lone atom made in 3D", () => {
  // (the maintainer, 2026-10-13: a lone atom that stands for a molecule is made in 3D - it was left
  // out, and nothing said; a bare atom is not, and Meno says so in words)
  const lone = (el: string, charge?: number): Model => ({ atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el, ...(charge ? { charge } : {}) }], bonds: [] });

  it("stands for a molecule where it carries H, or is a label Meno knows: CH4, H2O, NH3, THF, Et3N", () => {
    for (const el of ["C", "O", "N", "Cl", "THF", "DMSO", "MeOH", "Et3N"]) expect(standsForMolecule(lone(el)), el).toBe(true);
    // (bare: an ion with no H, a lone metal, a label of nothing known)
    expect(standsForMolecule(lone("Na", 1))).toBe(false);
    expect(standsForMolecule(lone("Cl", -1))).toBe(false);
    expect(standsForMolecule(lone("Fe"))).toBe(false);
    expect(standsForMolecule(lone("R"))).toBe(false);
    expect(standsForMolecule(ethanol)).toBe(true);
  });

  it("is a structure to ask the plugin about where it stands for a molecule, and none where it is bare", () => {
    const [methane] = blocksOf(lone("C"), [1]);
    expect(methane.atoms).toEqual([1]);
    expect(methane.molblock).toContain("V3000");
    expect(blocksOf(lone("Na", 1), [1])).toEqual([]);
  });

  it("is a part of a structure drawn as a step on structures drawn is asked about it, where it is an element's - with no hydrogens a reader would add", () => {
    // (Na+, Cl-, a lone metal: each a block of its own, its valence written as none - a lone Na read as NaH otherwise)
    for (const [el, charge] of [["Na", 1], ["Cl", -1], ["Fe", 0], ["Ca", 2]] as const) {
      const [block, ...more] = drawnBlocksOf(lone(el, charge), [1]);
      expect(more, el).toEqual([]);
      expect(block.molblock, el).toMatch(new RegExp(`M {2}V30 1 ${el} 0\\.0000 0\\.0000 0 0${charge ? ` CHG=${charge}` : ""} VAL=-1\\n`));
    }
    // (one that stands for a molecule as before - HCl - and a label of nothing known, none)
    expect(drawnBlocksOf(lone("Cl"), [1])[0].molblock).not.toContain("VAL=");
    expect(drawnBlocksOf(lone("R"), [1])).toEqual([]);
    // (a salt drawn as its ions: each a part, the cation's and the anion's)
    const salt: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 1.5, y: 0, r: 0.9, el: "N", charge: 1 },
        { id: 3, x: 4, y: 0, r: 0.9, el: "Cl", charge: -1 },
      ],
      bonds: [{ id: 11, a: 1, b: 2, order: 1 }],
    };
    expect(drawnBlocksOf(salt, [1, 2, 3]).map((b) => b.atoms)).toEqual([[1, 2], [3]]);
    expect(blocksOf(salt, [1, 2, 3]).map((b) => b.atoms)).toEqual([[1, 2]]);
  });

  it("is told of, where bare: by itself alone, and named beside others made", () => {
    // (sodium acetate drawn as ions, and chloride beside it)
    const salt: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 1.5, y: 0, r: 0.9, el: "C" },
        { id: 3, x: 2.3, y: 1.2, r: 0.9, el: "O" },
        { id: 4, x: 2.3, y: -1.2, r: 0.9, el: "O", charge: -1 },
        { id: 5, x: 5, y: 0, r: 0.9, el: "Na", charge: 1 },
        { id: 6, x: 7, y: 0, r: 0.9, el: "Cl", charge: -1 },
        { id: 7, x: 9, y: 0, r: 0.9, el: "Ca", charge: 2 },
      ],
      bonds: [
        { id: 11, a: 1, b: 2, order: 1 },
        { id: 12, a: 2, b: 3, order: 2 },
        { id: 13, a: 2, b: 4, order: 1 },
      ],
    };
    const all = [1, 2, 3, 4, 5, 6, 7];
    expect(blocksOf(salt, all)).toHaveLength(1);
    const bare = bareAtomsOf(salt, all);
    expect(bare.map((a) => a.id)).toEqual([5, 6, 7]);
    expect(bareWords(bare, true)).toBe("Na+, Cl\u2212 and Ca2+ were left out: one atom alone has no 3D structure.");
    expect(bareWords(bare.slice(0, 1), true)).toBe("Na+ was left out: one atom alone has no 3D structure.");
    expect(bareWords(bare.slice(0, 1), false)).toBe("One atom alone has no 3D structure.");
  });
});

describe("making a drawn structure in 3D", () => {
  it("knows whether the drawing still holds what it was asked for, as the molecules come back: an undo meanwhile adds none", () => {
    const blocks = blocksOf(ethanol, [12]);
    expect(blocksStill(blocks, ethanol)).toBe(true);
    // moved: still the same structure
    const moved = { ...ethanol, atoms: ethanol.atoms.map((a) => ({ ...a, x: a.x + 5 })) };
    expect(blocksStill(blocks, moved)).toBe(true);
    // something else drawn beside it: still the same
    expect(blocksStill(blocks, { ...ethanol, atoms: [...ethanol.atoms, { id: 99, x: 9, y: 9, r: 0.9, el: "N" }] })).toBe(true);
    // an atom of it undone away, or another element, or a bond gone: not
    expect(blocksStill(blocks, { atoms: ethanol.atoms.filter((a) => a.id !== 13), bonds: ethanol.bonds.filter((b) => b.a !== 13 && b.b !== 13) })).toBe(false);
    expect(blocksStill(blocks, { ...ethanol, atoms: ethanol.atoms.map((a) => (a.id === 13 ? { ...a, el: "N" } : a)) })).toBe(false);
    expect(blocksStill(blocks, { ...ethanol, bonds: ethanol.bonds.slice(1) })).toBe(false);
  });

  it("asks RDKit about each structure the atoms are in, its atoms and bonds known by their ids", () => {
    const [block] = blocksOf(ethanol, [12]);
    expect(block.atoms).toEqual([11, 12, 13]);
    expect(block.bonds).toEqual([21, 22]);
    expect(block.molblock).toContain("V3000");
  });

  it("makes the lowest conformer its atoms and the rest its frames, tied to the drawing's atoms", () => {
    const m = moleculeOf(answer, blocksOf(ethanol, [11])[0]);
    expect(m.atoms.map((a) => a.el)).toEqual(["C", "C", "O", "H", "H"]);
    expect(m.atoms[1]).toMatchObject({ x: 1.3, y: 0.75, z: 0.1 });
    expect(m.frames).toEqual([answer.frames[1]]);
    expect(m.energies).toEqual(answer.energies);
    expect(m.drawnFrom).toEqual([11, 12, 13, null, null]);
    expect(m.stereo).toEqual({ atoms: {}, bonds: {} });
    // (what its energies are: the force field the plugin named, as it named it)
    expect(m.made).toEqual({ how: [], energies: "MMFF94" });
    // (none named - "none" - or no energies: nothing said of them, and nothing kept where the plugin says nothing else)
    expect(moleculeOf({ ...answer, field: "none" }, blocksOf(ethanol, [11])[0]).made).toBeUndefined();
    expect(moleculeOf({ ...answer, energies: undefined }, blocksOf(ethanol, [11])[0]).made).toBeUndefined();
    const how = [{ label: "Optimised", text: "MMFF94s, at most 300 steps" }];
    expect(moleculeOf({ ...answer, how }, blocksOf(ethanol, [11])[0]).made).toEqual({ how, energies: "MMFF94" });
    // (and its method, the one line the plugin says it in, kept with it)
    const method = "ETKDG v3 + MMFF94";
    expect(moleculeOf({ ...answer, how, method }, blocksOf(ethanol, [11])[0]).made).toEqual({ method, how, energies: "MMFF94" });
  });

  it("keeps each centre's label, and - made with the other stereoisomers - which were left open, so that they are told apart", () => {
    const iso = { ...answer, cip: { atoms: { "1": "R" }, bonds: {} }, chosen: { atoms: { "1": "R" }, bonds: {} } };
    expect(moleculeOf(iso, blocksOf(ethanol, [11])[0], true).stereo).toEqual({ atoms: { 1: "R" }, bonds: {}, chosen: { atoms: [1], bonds: [] } });
    // (made alone: R and S shown only when asked for, as on the drawing)
    expect(moleculeOf(iso, blocksOf(ethanol, [11])[0]).stereo).toEqual({ atoms: { 1: "R" }, bonds: {} });
  });

  it("made again, gives RDKit the atoms the one before has where it has them, by their index in the block", () => {
    const before = moleculeOf(answer, blocksOf(ethanol, [11])[0]);
    // (the drawing grown by a chlorine on the carbon, which the one before has not)
    const grown: Model = {
      atoms: [...ethanol.atoms, { id: 14, x: -1.56, y: 0.9, r: 0.9, el: "Cl" }],
      bonds: [...ethanol.bonds, { id: 23, a: 11, b: 14, order: 1 }],
    };
    const [block] = blocksOf(grown, [11]);
    const like = likeOf(block, before);
    expect(Object.keys(like).map(Number).map((k) => block.atoms[k]).sort()).toEqual([11, 12, 13]);
    expect(like[block.atoms.indexOf(12)]).toEqual([1.3, 0.75, 0.1]);
    expect(likeOf(block, { atoms: before.atoms })).toEqual({});
  });

  it("starts each atom on its drawing's atom - a hydrogen on the atom it is bonded to - and lies over the drawing", () => {
    const m = moleculeOf(answer, blocksOf(ethanol, [11])[0]);
    const t = turnedOver(m, ethanol, STYLE_3D);
    const places = solidOf({ ...m, id: 0, at: { x: 0, y: 0 } }, STYLE_3D).frames[0];
    expect(t.flat).toHaveLength(places.length);
    // the hydrogens start where their carbon and oxygen do
    expect(t.flat.slice(9, 12)).toEqual(t.flat.slice(0, 3));
    expect(t.flat.slice(12, 15)).toEqual(t.flat.slice(6, 9));
    // over the drawing: its centre near the drawn atoms' middle
    expect(Math.abs(t.start.x - 1.56)).toBeLessThan(1);
    expect(Math.abs(t.start.y - 0.3)).toBeLessThan(1);
  });
});

describe("placeRow", () => {
  const item = (w: number, height = 1): Turned => ({ turn: [0, 0, 0, 1], start: { x: 0, y: 0 }, reach: { x0: -w / 2, x1: w / 2, y0: -1, y1: 1 }, flat: [], height });
  const drawing: Box = { x0: 0, x1: 4, y0: 0, y1: 2 };

  it("rests beside the drawing, to its right, where that is in view", () => {
    const row = placeRow([item(2), item(2)], drawing, { x0: -20, x1: 20, y0: -20, y1: 20 });
    expect(row.inView).toBe(true);
    expect(row.at[0].x).toBeGreaterThan(4);
    expect(row.at[1].x).toBeGreaterThan(row.at[0].x + 2);
    expect(row.at[0].y).toBe(1);
  });

  it("goes to the left, then below, where the right is out of view", () => {
    const left = placeRow([item(2)], drawing, { x0: -10, x1: 5, y0: -10, y1: 10 });
    expect(left.inView).toBe(true);
    expect(left.at[0].x).toBeLessThan(0);
    const below = placeRow([item(2)], drawing, { x0: -0.5, x1: 4.5, y0: -10, y1: 3 });
    expect(below.inView).toBe(true);
    expect(below.at[0].y).toBeLessThan(0);
  });

  it("counts on a molecule standing up off the page being seen larger, further out, by a camera in perspective", () => {
    const view = { x0: -6, x1: 14, y0: -10, y1: 10 };
    expect(placeRow([item(6, 1)], drawing, view, 60).at[0].x).toBeGreaterThan(4);
    // (standing tall, it would be seen past the view's right edge: so it goes elsewhere)
    expect(placeRow([item(6, 12)], drawing, view, 60).at[0].x).toBeLessThan(4);
    // straight from above (the canvas's camera) it is seen as it is, however tall
    expect(placeRow([item(6, 12)], drawing, view).at[0].x).toBeGreaterThan(4);
  });

  it("keeps clear of what stands on the page, going on out past it, or to another side", () => {
    const view = { x0: -30, x1: 30, y0: -20, y1: 20 };
    // (a molecule in 3D just right of the drawing: the row goes on past it)
    const past = placeRow([item(2)], drawing, view, undefined, [{ x0: 5, x1: 12, y0: -1, y1: 3 }]);
    expect(past.inView).toBe(true);
    // (a gap of a bond and a half beyond it, as beside the drawing)
    expect(past.box.x0).toBeCloseTo(12 + 1.5 * NOMINAL_BOND_LENGTH);
    // (two in a row in its way: past both)
    const both = placeRow([item(2)], drawing, view, undefined, [{ x0: 5, x1: 9, y0: -1, y1: 3 }, { x0: 9.5, x1: 20, y0: 0, y1: 2 }]);
    expect(both.box.x0).toBeGreaterThanOrEqual(20);
    // (so far right it would be out of view: to the left instead)
    const left = placeRow([item(2)], drawing, view, undefined, [{ x0: 5, x1: 29, y0: -1, y1: 3 }]);
    expect(left.at[0].x).toBeLessThan(0);
    // (what is not in its way - above the row - changes nothing)
    expect(placeRow([item(2)], drawing, view, undefined, [{ x0: 5, x1: 12, y0: 5, y1: 8 }]).at).toEqual(placeRow([item(2)], drawing, view).at);
  });

  it("says so where it is in view nowhere, and goes to the right", () => {
    const row = placeRow([item(30)], drawing, { x0: -1, x1: 5, y0: -1, y1: 3 });
    expect(row.inView).toBe(false);
    expect(row.at[0].x).toBeGreaterThan(4);
  });
});

describe("how a molecule in 3D stands to its drawing", () => {
  const m = moleculeOf(answer, blocksOf(ethanol, [11])[0]);

  it("is its drawing's while the drawing says the same, wherever its atoms are drawn", () => {
    expect(m.drawnAs).toBe(signatureOf(ethanol, [11, 12, 13]));
    expect(linkOf(m, ethanol)).toBe("live");
    const moved = { ...ethanol, atoms: ethanol.atoms.map((a) => ({ ...a, x: a.x + 5 })) };
    expect(linkOf(m, moved)).toBe("live");
  });

  it("is changed once an atom, a bond or a wedge is, or something is added to it", () => {
    const sulfur = { ...ethanol, atoms: ethanol.atoms.map((a) => (a.id === 13 ? { ...a, el: "S" } : a)) };
    expect(linkOf(m, sulfur)).toBe("changed");
    const double = { ...ethanol, bonds: ethanol.bonds.map((b) => (b.id === 22 ? { ...b, order: 2 as const } : b)) };
    expect(linkOf(m, double)).toBe("changed");
    const wedged = { ...ethanol, bonds: ethanol.bonds.map((b) => (b.id === 21 ? { ...b, stereo: "up" as const } : b)) };
    expect(linkOf(m, wedged)).toBe("changed");
    const longer: Model = {
      atoms: [...ethanol.atoms, { id: 14, x: 4.7, y: 0.9, r: 0.9, el: "C" }],
      bonds: [...ethanol.bonds, { id: 23, a: 13, b: 14, order: 1 }],
    };
    expect(linkOf(m, longer)).toBe("changed");
  });

  it("is gone with its drawing, and is nothing for a molecule made from none", () => {
    expect(linkOf(m, { atoms: [], bonds: [] })).toBe("gone");
    expect(linkOf({ drawnFrom: undefined }, ethanol)).toBeNull();
  });

  it("is made again in a row from where the one before stood", () => {
    const t = (w: number): Turned => ({ turn: [0, 0, 0, 1], start: { x: 0, y: 0 }, reach: { x0: -w / 2, x1: w / 2, y0: -1, y1: 1 }, flat: [], height: 1 });
    const at = rowFrom([t(2), t(4)], { x: 10, y: 3 });
    expect(at[0]).toEqual({ x: 10, y: 3 });
    expect(at[1].x).toBeGreaterThan(10 + 1 + 2);
    expect(at[1].y).toBe(3);
  });
});

describe("takenOnPage", () => {
  it("is each other structure drawn, each arrow and \"+\", and the molecules in 3D given", () => {
    const atom = (id: number, x: number, y: number) => ({ id, x, y, r: 0.9, el: "C" });
    const model = {
      atoms: [atom(1, 0, 0), atom(2, 1.5, 0), atom(3, 10, 0), atom(4, 11.5, 0), atom(5, 20, 0)],
      bonds: [
        { id: 6, a: 1, b: 2, order: 1 as const, stereo: "none" as const, stereoOrient: "principle" as const },
        { id: 7, a: 3, b: 4, order: 1 as const, stereo: "none" as const, stereoOrient: "principle" as const },
      ],
    };
    const solid = { x0: 30, x1: 35, y0: -2, y1: 2 };
    const boxes = takenOnPage({ model: model as never, arrows: [{ id: 1, x: 5, y: 5, angle: 0, length: 4 } as never], pluses: [{ id: 1, x: 5, y: -5 } as never] }, [1, 2], [solid]);
    // (the drawing it was made from left out; the other two structures, the arrow, the "+" and the molecule)
    expect(boxes).toHaveLength(5);
    // (each structure as far as its ink: the C-C its bond, from atom to atom, half its line's width round it - no room added; the lone carbon its letters, CH4, written to the right of it)
    const half = layoutOptionsFor(MENO, NOMINAL_BOND_LENGTH, { units: "world" }).lineWidthPx / 2;
    for (const [got, want] of [[boxes[0].x0, 10 - half], [boxes[0].x1, 11.5 + half], [boxes[0].y0, -half], [boxes[0].y1, half]]) expect(got).toBeCloseTo(want, 9);
    expect(boxes[1].x0).toBeLessThan(20);
    expect(boxes[1].x1 - 20).toBeGreaterThan(NOMINAL_BOND_LENGTH / 2);
    // (an arrow and a "+" kept as they were)
    const pad = 0.4 * NOMINAL_BOND_LENGTH;
    expect(boxes[2].x0).toBeCloseTo(3 - pad);
    expect(boxes[2].x1).toBeCloseTo(7 + pad);
    expect(boxes[4]).toBe(solid);
  });
});

describe("a molecule in 3D drawn as a formula", () => {
  /** The worker as these tests have it: what it was asked, and ethane drawn back - its orders found, or not. */
  const worker = (perceived: boolean) => {
    const asked: { perceive?: boolean; molblock?: string }[] = [];
    const ethane = writeMolfile3d([{ el: "C", x: 0, y: 0, z: 0 }, { el: "C", x: 1.5, y: 0, z: 0 }], [{ a1: 0, a2: 1, order: 1 }]);
    const chem = { request: async (_op: string, args: { perceive?: boolean; molblock?: string }) => (asked.push(args), { molblock: ethane, perceived }) } as unknown as ChemClient;
    return { chem, asked };
  };
  /** A chain of carbons, every bond single, as a file of coordinates gives it - said whole without hydrogens, so that these tests are of how a formula is drawn (a skeleton is not: below). */
  const chain = (n: number) => ({
    id: 1,
    atoms: Array.from({ length: n }, (_, i) => ({ el: "C", x: 1.5 * i, y: 0, z: 0 })),
    bonds: Array.from({ length: n - 1 }, (_, i) => ({ a1: i, a2: i + 1, order: 1 })),
    at: { x: 0, y: 0 },
    wholeWithoutH: true as const,
  });

  it("is not drawn of a skeleton - its hydrogens not there - and nothing is asked", async () => {
    const asked = worker(true);
    const { wholeWithoutH: _said, ...skeleton } = chain(2);
    await expect(formulaOf(asked.chem, skeleton, 0)).rejects.toThrow(/no hydrogens, so its charge and spin are not known/);
    expect(asked.asked).toEqual([]);
  });

  it("has its bond orders sought where its file gave none - and says where they are still unknown", async () => {
    const found = worker(true);
    expect((await formulaOf(found.chem, chain(4), 0)).ordersUnknown).toBe(false);
    expect(found.asked[0].perceive).toBe(true);
    // (sought, and not found)
    expect((await formulaOf(worker(false).chem, chain(4), 0)).ordersUnknown).toBe(true);
    // (its file gave them: nothing to seek, nothing unknown)
    const given = { ...chain(2), bonds: [{ a1: 0, a2: 1, order: 2 }] };
    const known = worker(false);
    expect((await formulaOf(known.chem, given, 0)).ordersUnknown).toBe(false);
    expect(known.asked[0].perceive).toBe(false);
  });

  it("is drawn with the bonds the frame drawn has, where they go frame by frame", async () => {
    // (two carbons bonded, then 3 Å apart: an XYZ file's frames, bonds by distance)
    const parting = { ...chain(2), frames: [[0, 0, 0, 3, 0, 0]], bondsFrom: "distance" as const };
    const asked = worker(true);
    await formulaOf(asked.chem, parting, 0);
    await formulaOf(asked.chem, parting, 1);
    expect(asked.asked.map((a) => a.molblock!.split("\n")[3].slice(0, 6))).toEqual(["  2  1", "  2  0"]);
    // (no bonds in it: none whose orders to seek)
    expect(asked.asked[1].perceive).toBe(false);
  });

  it("is drawn with its radicals", async () => {
    const asked = worker(true);
    const radical = { ...chain(2), atoms: chain(2).atoms.map((a, i) => (i === 0 ? { ...a, radical: "doublet" as const } : a)) };
    await formulaOf(asked.chem, radical, 0);
    expect(asked.asked[0].molblock).toContain("M  RAD  1   1   2\n");
  });
});

describe("withinWindow", () => {
  // (four conformers, lowest first, as the plugin gives them: 0, 1.2, 66 and 77 kcal/mol up - cyclooctane's two trapped MMFF94 minima)
  const kcal = factor("kcal/mol", "Eh");
  const made = (energies?: number[]): Conformers => ({
    atoms: [{ el: "C", charge: 0 }],
    bonds: [],
    frames: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]],
    ...(energies ? { energies } : {}),
    field: energies ? "MMFF94" : "none",
    how: [{ label: "Embedded", text: "ETKDG v3" }],
    cip: { atoms: {}, bonds: {} },
    chosen: { atoms: {}, bonds: {} },
    smiles: "C",
  });
  const four = [-0.1, -0.1 + 1.2 * kcal, -0.1 + 66 * kcal, -0.1 + 77 * kcal];

  it("keeps those within the window of the lowest, in their order, and says what it set aside", () => {
    const kept = withinWindow(made(four), 30);
    expect(kept.frames).toEqual([[0, 0, 0], [1, 0, 0]]);
    expect(kept.energies).toEqual(four.slice(0, 2));
    expect(kept.how).toEqual([
      { label: "Embedded", text: "ETKDG v3" },
      { label: "Energy window", text: "within 30 kcal/mol of the lowest, 2 above it set aside" },
    ]);
    // (wide enough: none set aside, the window still said)
    const all = withinWindow(made(four), 100);
    expect(all.frames).toHaveLength(4);
    expect(all.how?.[1]).toEqual({ label: "Energy window", text: "within 100 kcal/mol of the lowest" });
    // (one just at the edge is kept; nothing below the lowest is lost at 0)
    expect(withinWindow(made(four), 66).frames).toHaveLength(3);
    expect(withinWindow(made(four), 0).frames).toEqual([[0, 0, 0]]);
  });

  it("sets none aside without energies, and says so; a conformer whose energy is not a number is kept", () => {
    const none = withinWindow(made(), 30);
    expect(none.frames).toHaveLength(4);
    expect(none.how?.[1]).toEqual({ label: "Energy window", text: "none: no energies" });
    const odd = withinWindow(made([-0.1, Number.NaN, -0.1 + 66 * kcal, -0.1]), 30);
    expect(odd.frames).toEqual([[0, 0, 0], [1, 0, 0], [3, 0, 0]]);
  });

  it("is said with how the molecule in 3D was made", () => {
    const [block] = blocksOf(ethanol, [12]);
    const m = moleculeOf(withinWindow(made(four), 30), block);
    expect(m.made?.how[1]).toEqual({ label: "Energy window", text: "within 30 kcal/mol of the lowest, 2 above it set aside" });
    expect(m.frames).toHaveLength(1);
  });
});

describe("conformers made for the page", () => {
  it("asks the plugin for them as the page shows them, and for nothing else", async () => {
    const asked: { op: string; args: Record<string, unknown> }[] = [];
    const chem = { request: async (op: string, args: Record<string, unknown>) => (asked.push({ op, args }), { isomers: [] }) } as unknown as ChemClient;
    await conformersOf(chem, { molblock: "M  END", atoms: [], bonds: [], part: {} } as unknown as Parameters<typeof conformersOf>[1], "one", { count: 3 });
    expect(asked).toEqual([{ op: "conformers", args: { molblock: "M  END", isomers: "one", options: { count: 3 }, onPage: true } }]);
    // (how many to try, as the page works it out, sent beside the plugin's options)
    asked.length = 0;
    await conformersOf(chem, { molblock: "M  END", atoms: [], bonds: [], part: {} } as unknown as Parameters<typeof conformersOf>[1], "one", {}, 40);
    expect(asked[0].args).toEqual({ molblock: "M  END", isomers: "one", count: 40, options: {}, onPage: true });
  });

  it("tries as many as Settings says: the chemist's number, or as many as the molecule needs", () => {
    const [block] = blocksOf(ethanol, [12]);
    // (ethanol: nothing in it turns - lib/chem/conformersSought)
    expect(pageCount(block, {})).toBe(FEW_CONFORMERS);
    expect(pageCount(block, { sought3d: "fixed", count3d: 40 })).toBe(40);
    expect(pageCount(block, { sought3d: "fixed" })).toBe(RING_CONFORMERS);
  });
});
