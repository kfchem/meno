import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { mapReaction } from "../../../../lib/chem/reactionMap";
import { dielsAlder } from "../../../../lib/chem/reactionMap.fixtures";
import * as ops from "../document";
import { createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Atom, Bond, Model, Molecule3D } from "../store/types";
import { signatureOf } from "../utils/drawnLink";
import { atomNumbersOf } from "../utils/atomNumbers";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { readSDfile } from "../../../../lib/chem/ctfile";
import { beforeNumbers, exportRefusal, keptMap, mappedPairSdf, mapMarks, mapShows, mapStanding, renumbered, unpairedSaid } from "./atomMap";
import { conformersSaid, numbers3d, readStructureMaps, sideMolecules, sideNumbers } from "./structureMaps";

/**
 * A Diels-Alder pair drawn with no arrow - butadiene and ethylene, and the
 * cyclohexene they give - each with its molecule in 3D on the page, still
 * its drawing's (lib/chem/reactionMap.fixtures): each heavy atom the drawn
 * atom of its name, the hydrogens made for them.
 */
const R_ID: Record<string, number> = { C1: 1, C2: 2, C3: 3, C4: 4, C5: 5, C6: 6 };
const P_ID: Record<string, number> = { C1: 11, C2: 12, C3: 13, C4: 14, C5: 15, C6: 16 };
const R_NAMES = ["C1", "C2", "C3", "C4", "H2", "H3", "H1a", "H1b", "H4a", "H4b", "C5", "C6", "H5a", "H5b", "H6a", "H6b"];

let partial: ReturnType<typeof keptMap>;

function page(): { doc: WorkspaceDocument; kept: ReturnType<typeof keptMap> } {
  const at = (id: number, x: number, y: number): Atom => ({ id, el: "C", x: x * L, y: y * L, r: 0 }) as Atom;
  const bond = (id: number, a: number, b: number, order: 1 | 2): Bond => ({ id, a, b, order }) as Bond;
  const atoms: Atom[] = [
    at(1, -9, 0), at(2, -8.5, 0.87), at(3, -7.5, 0.87), at(4, -7, 0), at(5, -5, 0), at(6, -4, 0),
    at(11, 4, 0), at(12, 4.5, 0.87), at(13, 5.5, 0.87), at(14, 6, 0), at(16, 5.5, -0.87), at(15, 4.5, -0.87),
  ];
  const bonds: Bond[] = [
    bond(21, 1, 2, 2), bond(22, 2, 3, 1), bond(23, 3, 4, 2), bond(24, 5, 6, 2),
    bond(31, 11, 12, 1), bond(32, 12, 13, 2), bond(33, 13, 14, 1), bond(34, 14, 16, 1), bond(35, 16, 15, 1), bond(36, 15, 11, 1),
  ];
  const model = { atoms, bonds } as Model;
  const da = dielsAlder();
  const rFrom = R_NAMES.map((k) => R_ID[k] ?? null);
  const pFrom = da.productOrder.map((k) => P_ID[k] ?? null);
  const in3d = (id: number, m: typeof da.product, drawnFrom: (number | null)[]): Molecule3D => ({
    id,
    atoms: m.atoms.map((a) => ({ ...a })),
    bonds: m.bonds.map((b) => ({ ...b })),
    at: { x: id * 10, y: 0 },
    drawnFrom,
    drawnAs: signatureOf(model, drawnFrom.filter((x): x is number => x != null)),
  }) as Molecule3D;
  const result = mapReaction({ reactants: [da.reactants[0]], products: [da.product] });
  if ("error" in result) throw new Error(result.message);
  const kept = keptMap(model, result, [{ molecule: da.reactants[0], drawnFrom: rFrom }], [{ molecule: da.product, drawnFrom: pFrom }]);
  // (the same, as a map that pairs all but the product's C1 - each map so cut, none complete)
  const c1 = da.productOrder.indexOf("C1");
  const cut = { ...result, maps: result.maps.map((m) => m.map((r, j) => (j === c1 ? -1 : r))), complete: result.maps.map(() => false) };
  partial = keptMap(model, cut, [{ molecule: da.reactants[0], drawnFrom: rFrom }], [{ molecule: da.product, drawnFrom: pFrom }]);
  const doc = { ...emptyWorkspaceDocument(), model, nextId: 100, molecules3d: [in3d(1, da.reactants[0], rFrom), in3d(2, da.product, pFrom)], nextMolecule3dId: 3 };
  return { doc, kept };
}

describe("an atom map between structures on the page", () => {
  it("numbers Before's drawn heavy atoms first, as the drawing does, then its hydrogens; After's atoms take their Before atoms'", () => {
    const { kept } = page();
    const n = sideNumbers(kept);
    // (C1 to C6 are Before's first six, its drawn heavy atoms: 1 to 6, then the ten hydrogens 7 to 16)
    expect(n.before.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(n.before.slice(10, 12)).toEqual([5, 6]);
    expect([...n.before].sort((p, q) => p - q)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    const mapping = kept.maps[kept.chosen];
    n.after.forEach((k, j) => expect(k).toBe(n.before[mapping[j]]));
  });

  it("finds each side's molecules in 3D on the page, still its drawing's, where they stand in the side", () => {
    const { doc, kept } = page();
    expect([...sideMolecules(kept.reactant, doc.molecules3d!, doc.model)]).toEqual([[1, 0]]);
    expect([...sideMolecules(kept.product, doc.molecules3d!, doc.model)]).toEqual([[2, 0]]);
    // (its drawing changed since: no longer its)
    const moved = { ...doc.model, atoms: doc.model.atoms.map((a) => (a.id === 1 ? { ...a, el: "N" } : a)) };
    expect(sideMolecules(kept.reactant, doc.molecules3d!, moved).size).toBe(0);
  });

  it("is shown on the drawing as an arrow's is, and on the molecules in 3D every atom numbered - then hidden, as one step each", () => {
    const { doc, kept } = page();
    const { doc: shown } = ops.addStructureMaps(doc, [kept]);
    expect(shown.structureMaps!.map((m) => m.id)).toEqual([1]);
    expect(shown.nextStructureMapId).toBe(2);
    const marks = mapMarks(kept, doc.model);
    for (const a of shown.model.atoms) expect(a.map).toBe(marks.numbers.get(a.id));
    const n = sideNumbers(kept);
    const [before3d, after3d] = shown.molecules3d!;
    expect(before3d.atoms.map((a) => a.map)).toEqual(n.before);
    expect(after3d.atoms.map((a) => a.map)).toEqual(n.after);
    expect(before3d.atomNumbers).toEqual({ kind: "map" });
    expect(after3d.atomNumbers).toEqual({ kind: "map" });
    // (hidden: off the drawing and off the molecules)
    const hidden = ops.setStructureMaps(shown, [{ id: 1, map: { ...kept, shown: false } }]);
    expect(hidden.model.atoms.every((a) => a.map == null)).toBe(true);
    expect(hidden.molecules3d!.every((m) => m.atoms.every((a) => a.map == null) && m.atomNumbers == null)).toBe(true);
    expect(hidden.structureMaps![0].map.shown).toBe(false);
  });

  it("keeps a molecule's own numbers of another kind, and takes off only those it put", () => {
    const { doc, kept } = page();
    const ordered = { ...doc, molecules3d: doc.molecules3d!.map((m) => (m.id === 2 ? { ...m, atomNumbers: { kind: "order" as const } } : m)) };
    const shown = ops.addStructureMaps(ordered, [kept]).doc;
    const gone = ops.setStructureMaps(shown, []);
    expect(gone.molecules3d!.find((m) => m.id === 1)!.atomNumbers).toBeUndefined();
    expect(gone.structureMaps).toBeUndefined();
  });

  it("fails closed: an edit to either structure takes its numbers off the drawing and the molecules in 3D at once - undo gives them back", () => {
    const { doc, kept } = page();
    const store = createWorkspaceDocument();
    store.reset(ops.addStructureMaps(doc, [kept]).doc);
    const numbered = (d: WorkspaceDocument) => ({
      drawn: d.model.atoms.filter((a) => a.map).length,
      centres: d.model.bonds.filter((b) => b.reactingCentre).length,
      in3d: d.molecules3d!.map((m) => m.atoms.filter((a) => a.map).length),
      shown: d.molecules3d!.map((m) => m.atomNumbers?.kind ?? null),
    });
    const before = numbered(store.getState());
    expect(before.drawn).toBe(12);
    expect(before.in3d).toEqual([16, 16]);
    // (After's carbon C5 made an N: the map is of the structure before the edit)
    store.edit("element", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => (a.id === 15 ? { ...a, el: "N" } : a)) } }));
    expect(numbered(store.getState())).toEqual({ drawn: 0, centres: 0, in3d: [0, 0], shown: [null, null] });
    expect(store.getState().structureMaps!.length).toBe(1);
    store.undo();
    expect(numbered(store.getState())).toEqual(before);
    // (and redone: off again)
    store.redo();
    expect(numbered(store.getState())).toEqual({ drawn: 0, centres: 0, in3d: [0, 0], shown: [null, null] });
    store.undo();
    // (an edit elsewhere on the page leaves it as it is)
    store.edit("atom", (d) => ({ ...d, model: { ...d.model, atoms: [...d.model.atoms, { id: 99, el: "C", x: 0, y: 9, r: 0 } as Atom] } }));
    expect(numbered(store.getState())).toEqual(before);
  });

  it("is made again in the place of the one before", () => {
    const { doc, kept } = page();
    const once = ops.addStructureMaps(doc, [kept]).doc;
    const again = ops.addStructureMaps(once, [kept], [1]);
    expect(again.doc.structureMaps!.map((m) => m.id)).toEqual([2]);
    expect(again.ids).toEqual([2]);
  });

  it("keeps a partial map where none is complete, and shows the atoms it pairs - naming the rest, telling no bond's change", () => {
    const { doc } = page();
    expect(partial.complete).toBe(false);
    expect(partial.maps.length).toBeGreaterThan(0);
    expect(mapStanding({ atomMap: partial }, doc.model)).toBe("incomplete");
    expect(mapShows("incomplete")).toBe(true);
    const marks = mapMarks(partial, doc.model);
    // (the product's C1, paired with nothing: no number; nor its reactant atom, now paired with nothing; the other ten carbons numbered)
    expect(marks.numbers.has(11)).toBe(false);
    expect(marks.numbers.size).toBe(10);
    expect(marks.centres.size).toBe(0);
    expect(unpairedSaid(partial, ["Before", "After"])).toBe("Not mapped: C of Before; C of After");
    expect(unpairedSaid(page().kept, ["Before", "After"])).toBeNull();
    const n = sideNumbers(partial);
    expect(n.after.filter((k) => k === 0).length).toBe(1);
    expect(n.before.filter((k) => k === 0).length).toBe(1);
    // (shown on the page, the molecules' numbers but the two unpaired)
    const shown = ops.addStructureMaps(doc, [partial]).doc;
    expect(shown.molecules3d!.map((m) => m.atoms.filter((a) => a.map).length)).toEqual([15, 15]);
    // (read back from a file as partial, its -1 kept; a complete map with one is no map)
    expect(readStructureMaps([{ map: partial }]).maps[0].map).toEqual(partial);
    expect(readStructureMaps([{ map: { ...partial, complete: true } }]).left).toBe(1);
  });

  it("is kept in the workspace's file and read back as it was; one that does not read is left out", () => {
    const { doc, kept } = page();
    const shown = ops.addStructureMaps(doc, [kept]).doc;
    const text = workspaceText({
      model: shown.model,
      arrows: shown.arrows,
      pluses: shown.pluses,
      captions: [],
      molecules3d: shown.molecules3d!,
      turns3d: {},
      frames3d: {},
      lists3d: {},
      aromaticEnabled: false,
      aromaticRings: {},
      structureMaps: shown.structureMaps!,
    });
    const back = readWorkspace(text)!;
    expect(back.structureMaps).toEqual(shown.structureMaps);
    const read = readStructureMaps([{ map: kept }, { map: { ...kept, maps: [[999]] } }, null]);
    expect(read.maps.map((m) => m.id)).toEqual([1]);
    expect(read.left).toBe(2);
  });
});

describe("the guards of an atom map between structures", () => {
  /** A map as a workspace's file holds it, made plain - JSON - and changed by `change`. */
  // (the map worked out once - mapping it takes a while - each bad copy made from its JSON)
  const once = JSON.stringify(page().kept);
  const saved = (change: (m: Record<string, unknown> & { reactant: { atoms: Record<string, unknown>[]; bonds: Record<string, unknown>[]; drawnFrom: unknown[] }; product: { atoms: unknown[] }; maps: number[][] }) => void) => {
    const m = JSON.parse(once);
    change(m);
    return { map: m };
  };

  it("reads a saved map only within its bounds: each one broken leaves that map out, and a good one reads", () => {
    const nR = (JSON.parse(once) as { reactant: { atoms: unknown[] } }).reactant.atoms.length;
    const bad = [
      saved((m) => (m.chosen = m.maps.length)),
      saved((m) => (m.chosen = -1)),
      saved((m) => m.maps[0].pop()),
      saved((m) => (m.maps[0][0] = nR)),
      saved((m) => (m.maps[0][0] = -1)),
      saved((m) => (m.reactant.bonds[0].a1 = nR)),
      saved((m) => m.reactant.drawnFrom.pop()),
      saved((m) => (m.reactant.atoms[0].x = "far")),
      saved((m) => (m.reactant.atoms[0].charge = 0.5)),
      saved((m) => delete m.drawnAs),
    ];
    for (const b of bad) expect(readStructureMaps([b]).left, JSON.stringify(b).slice(0, 0)).toBe(1);
    const good = readStructureMaps([saved(() => {}), saved((m) => (m.shown = false)), saved((m) => delete m.shown)]);
    expect(good.left).toBe(0);
    expect(good.maps.map((m) => m.map.shown)).toEqual([true, false, true]);
    expect(good.maps.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("numbers by the map chosen, not the first", () => {
    const { kept } = page();
    // (a second map, the first with two of the product's hydrogens' reactant atoms swapped)
    const hs = kept.product.atoms.flatMap((a, j) => (a.el === "H" ? [j] : []));
    const other = [...kept.maps[0]];
    [other[hs[0]], other[hs[1]]] = [other[hs[1]], other[hs[0]]];
    const two = { ...kept, maps: [kept.maps[0], other], chosen: 1 };
    const n = sideNumbers(two);
    two.product.atoms.forEach((_, j) => expect(n.after[j]).toBe(n.before[other[j]]));
    expect(n.after[hs[0]]).not.toBe(sideNumbers(kept).after[hs[0]]);
  });

  it("takes a map's numbers off the drawing and its molecules once it is gone", () => {
    const { doc, kept } = page();
    const shown = ops.addStructureMaps(doc, [kept]).doc;
    const gone = ops.setStructureMaps(shown, []);
    expect(gone.model.atoms.every((a) => a.map == null)).toBe(true);
    expect(gone.model.bonds.every((b) => b.reactingCentre == null)).toBe(true);
    expect(gone.molecules3d!.every((m) => m.atoms.every((a) => a.map == null))).toBe(true);
  });

  it("finds a side's molecule only where both its elements and its drawn atoms are the side's, in order", () => {
    const { doc, kept } = page();
    const [m1] = doc.molecules3d!;
    const otherElement = { ...m1, atoms: m1.atoms.map((a, i) => (i === 4 ? { ...a, el: "D" } : a)) };
    // (C3 and C4 told by each other's drawn atoms: the same elements in order, the side's first atom where it was - only the drawn atoms differ)
    const swapped = [...m1.drawnFrom!];
    [swapped[2], swapped[3]] = [swapped[3], swapped[2]];
    const otherAtoms = { ...m1, drawnFrom: swapped };
    expect(sideMolecules(kept.reactant, [otherElement], doc.model).size).toBe(0);
    expect(sideMolecules(kept.reactant, [otherAtoms], doc.model).size).toBe(0);
    expect(sideMolecules(kept.reactant, [m1], doc.model).size).toBe(1);
  });

  it("puts no numbers on a molecule no longer its drawing's, and takes off those it had", () => {
    const { doc, kept } = page();
    const shown = ops.addStructureMaps(doc, [kept]).doc;
    // (the product's molecule tied to a drawing as it was before, not as it is: no longer its)
    const untied = { ...shown, molecules3d: shown.molecules3d!.map((m) => (m.id === 2 ? { ...m, drawnAs: "another drawing" } : m)) };
    const { numbers, touched } = numbers3d(untied.structureMaps!, untied.molecules3d!, untied.model);
    expect(numbers.has(2)).toBe(false);
    expect(touched.has(2)).toBe(true);
    const again = ops.setStructureMaps(untied, untied.structureMaps!);
    const m2 = again.molecules3d!.find((m) => m.id === 2)!;
    expect(m2.atoms.every((a) => a.map == null)).toBe(true);
    expect(m2.atomNumbers).toBeUndefined();
    expect(again.molecules3d!.find((m) => m.id === 1)!.atoms.every((a) => (a.map ?? 0) > 0)).toBe(true);
  });
});

describe("a partial atom map", () => {
  it("is put on the drawing, a page's and an arrow's alike: its paired heavy atoms numbered, the others bare, no reacting centres", () => {
    const { doc } = page();
    const shown = ops.addStructureMaps(doc, [partial]).doc;
    const numbered = shown.model.atoms.filter((a) => a.map).map((a) => a.id);
    expect(numbered.length).toBe(10);
    // (the product's C1, paired with nothing, bare - and the one Before atom it was paired with in the whole map)
    expect(numbered).not.toContain(11);
    expect(shown.model.bonds.every((b) => b.reactingCentre == null)).toBe(true);
    const arrowed = ops.setAtomMap({ ...doc, arrows: [{ id: 1, x: 0, y: 0, angle: 0, length: 3 * L }] }, 1, partial);
    expect(arrowed.model.atoms.filter((a) => a.map).map((a) => a.id).sort()).toEqual([...numbered].sort());
    expect(arrowed.model.bonds.every((b) => b.reactingCentre == null)).toBe(true);
  });

  it("is not written in 3D, said why; a complete one is", () => {
    const { doc, kept } = page();
    expect(exportRefusal(partial, doc.model)).toMatch(/Every atom must be mapped.*partial/);
    expect(exportRefusal(kept, doc.model)).toBeNull();
    expect(exportRefusal(undefined, doc.model)).toMatch(/no atom map/);
  });

  it("is not kept beside a complete one: where any map is complete, only the complete ones are", () => {
    const { doc } = page();
    const da = dielsAlder();
    const result = mapReaction({ reactants: [da.reactants[0]], products: [da.product] });
    if ("error" in result) throw new Error(result.message);
    const c1 = da.productOrder.indexOf("C1");
    // (a second map, the first's with C1 paired with none, put first: partial, beside the complete one)
    const mixed = { ...result, maps: [result.maps[0].map((r, j) => (j === c1 ? -1 : r)), result.maps[0]], complete: [false, true] };
    const rFrom = R_NAMES.map((k) => R_ID[k] ?? null);
    const pFrom = da.productOrder.map((k) => P_ID[k] ?? null);
    const k = keptMap(doc.model, mixed, [{ molecule: da.reactants[0], drawnFrom: rFrom }], [{ molecule: da.product, drawnFrom: pFrom }]);
    expect(k.complete).toBe(true);
    expect(k.maps).toEqual([result.maps[0]]);
  });

  it("counts the atoms it does not pair, by element", () => {
    const da = dielsAlder();
    const hs = da.productOrder.flatMap((n, j) => (n.startsWith("H") ? [j] : [])).slice(0, 2);
    const two = { ...partial, maps: [partial.maps[0].map((r, j) => (hs.includes(j) ? -1 : r))], chosen: 0 };
    expect(unpairedSaid(two, ["Before", "After"])).toBe("Not mapped: C, 2 H of Before; C, 2 H of After");
    // (with no carbon among them, all alphabetically, as Hill has it: H before O)
    const noCarbon = { ...two, reactant: { ...two.reactant, atoms: two.reactant.atoms.map((a) => (a.el === "C" ? { ...a, el: "O" } : a)) }, product: { ...two.product, atoms: two.product.atoms.map((a) => (a.el === "C" ? { ...a, el: "O" } : a)) } };
    expect(unpairedSaid(noCarbon, ["Before", "After"])).toBe("Not mapped: 2 H, O of Before; 2 H, O of After");
  });
});

describe("an atom map's numbers on a molecule's conformers", () => {
  it("number each frame as the geometry the map was made on: a conformer with a CH2's hydrogens in each other's places has their numbers swapped too", () => {
    const { doc, kept } = page();
    const [m1] = doc.molecules3d!;
    const h1a = R_NAMES.indexOf("H1a");
    const h1b = R_NAMES.indexOf("H1b");
    // (frame 1: as the first, the two hydrogens of C1 each where the other was)
    const xyz = m1.atoms.flatMap((a) => [a.x, a.y, a.z]);
    const swapped = [...xyz];
    for (let d = 0; d < 3; d++) [swapped[3 * h1a + d], swapped[3 * h1b + d]] = [swapped[3 * h1b + d], swapped[3 * h1a + d]];
    const withFrames = { ...doc, molecules3d: doc.molecules3d!.map((m) => (m.id === 1 ? { ...m, frames: [xyz, swapped] } : m)) };
    const shown = ops.addStructureMaps(withFrames, [kept]).doc;
    const m = shown.molecules3d!.find((x) => x.id === 1)!;
    const first = Array.from(atomNumbersOf(m, "map", 0));
    expect(Array.from(atomNumbersOf(m, "map", 1))).toEqual(first);
    const second = Array.from(atomNumbersOf(m, "map", 2));
    expect([second[h1a], second[h1b]]).toEqual([first[h1b], first[h1a]]);
    second.forEach((k, i) => i !== h1a && i !== h1b && expect(k).toBe(first[i]));
    // (Before's three frames by After's one: three pairs, said before any is made)
    expect(conformersSaid(kept, shown.molecules3d!, shown.model)).toEqual(["Conformers: 3 × 1 = 3 pairs"]);
    // (a frame not numbered: said, of its side)
    const unresolved = { ...shown, molecules3d: shown.molecules3d!.map((x) => (x.id === 1 ? { ...x, mapFrames: [x.mapFrames![0], null] } : x)) };
    expect(conformersSaid(kept, unresolved.molecules3d!, unresolved.model)).toEqual(["Conformers: 3 × 1 = 3 pairs", "Not numbered: 1 of 3 conformers of Before"]);
  });

  it("numbers the new conformers of a mapped structure's molecule as they come, in the same step - 3D structure made again", () => {
    const { doc, kept } = page();
    const store = createWorkspaceDocument();
    store.reset(ops.addStructureMaps(doc, [kept]).doc);
    const h1a = R_NAMES.indexOf("H1a");
    const h1b = R_NAMES.indexOf("H1b");
    store.edit("conformers", (d) => ({
      ...d,
      molecules3d: d.molecules3d!.map((m) => {
        if (m.id !== 1) return m;
        const xyz = m.atoms.flatMap((a) => [a.x, a.y, a.z]);
        for (let k = 0; k < 3; k++) [xyz[3 * h1a + k], xyz[3 * h1b + k]] = [xyz[3 * h1b + k], xyz[3 * h1a + k]];
        return { ...m, frames: [xyz] };
      }),
    }));
    const m = store.getState().molecules3d!.find((x) => x.id === 1)!;
    const first = Array.from(atomNumbersOf(m, "map", 0));
    const second = Array.from(atomNumbersOf(m, "map", 1));
    expect(m.mapFrames?.length).toBe(1);
    expect([second[h1a], second[h1b]]).toEqual([first[h1b], first[h1a]]);
  });

  it("show none on a frame whose numbering is not resolved, nor on a frame past those numbered", () => {
    const m = { atoms: [{ el: "C", x: 0, y: 0, z: 0, map: 1 }, { el: "O", x: 1, y: 0, z: 0, map: 2 }], mapFrames: [null, [2, 1]] };
    expect(Array.from(atomNumbersOf(m as never, "map", 0))).toEqual([1, 2]);
    expect(Array.from(atomNumbersOf(m as never, "map", 1))).toEqual([0, 0]);
    expect(Array.from(atomNumbersOf(m as never, "map", 2))).toEqual([2, 1]);
    expect(Array.from(atomNumbersOf(m as never, "map", 3))).toEqual([0, 0]);
    // (another kind: the atoms' own, whatever the frame)
    expect(Array.from(atomNumbersOf(m as never, "order", 2))).toEqual([1, 2]);
  });
});

describe("an atom map renumbered", () => {
  /** The drawing's order of atoms, by id: as `page` draws them, or with Before's six carbons taken in reverse. */
  const drawnOrder = (reverse = false) => {
    const ids = [1, 2, 3, 4, 5, 6];
    return new Map((reverse ? [...ids].reverse() : ids).map((id, i) => [id, i]));
  };
  const named = (numbers: readonly number[]) => Object.fromEntries(R_NAMES.map((k, i) => [k, numbers[i]]));

  it("numbers Before's heavy atoms in the drawing's order, then each one's hydrogens in its turn - every number once", () => {
    const { kept } = page();
    // (as drawn: C1 to C6 are 1 to 6, then C1's two H, C2's, C3's, C4's two, C5's two and C6's two)
    expect(named(renumbered(kept, drawnOrder()))).toMatchObject({ C1: 1, C2: 2, C3: 3, C4: 4, C5: 5, C6: 6, H1a: 7, H1b: 8, H2: 9, H3: 10, H4a: 11, H4b: 12, H5a: 13, H6b: 16 });
    // (Before's carbons drawn the other way round: C6 first, its hydrogens first after the heavy atoms)
    expect(named(renumbered(kept, drawnOrder(true)))).toMatchObject({ C6: 1, C5: 2, C4: 3, C1: 6, H6a: 7, H6b: 8, H1b: 16 });
    const all = renumbered(kept, drawnOrder(true));
    expect([...all].sort((p, q) => p - q)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("is what the drawing, 3D and the export show, After's atoms taking their partners' - but not on a partial map", () => {
    const { kept } = page();
    const numbers = renumbered(kept, drawnOrder(true));
    const map = { ...kept, numbers };
    expect(beforeNumbers(map)).toEqual(numbers);
    const n = sideNumbers(map);
    const mapping = map.maps[map.chosen];
    n.after.forEach((k, j) => expect(k).toBe(numbers[mapping[j]]));
    // (on the drawing: C6 numbered 1)
    expect(mapMarks(map, page().doc.model).numbers.get(R_ID.C6)).toBe(1);
    // (in the export, C6 written first, where it is in 3D)
    const records = readSDfile(mappedPairSdf(map, "da"));
    const c6 = kept.reactant.atoms[R_NAMES.indexOf("C6")];
    expect([records[0].atoms[0].x, records[0].atoms[0].y, records[0].atoms[0].z]).toEqual([c6.x, c6.y, c6.z].map((v) => Number(v.toFixed(4))));
    // (a partial map keeps its own: those it pairs, as it holds them)
    expect(beforeNumbers({ ...partial, numbers })).toEqual(beforeNumbers(partial));
  });

  it("is kept in the workspace's file, and numbers that are not each of 1 to n once are left out", () => {
    const { kept } = page();
    const numbers = renumbered(kept, drawnOrder(true));
    expect(readStructureMaps([{ map: { ...kept, numbers } }]).maps[0].map.numbers).toEqual(numbers);
    expect(readStructureMaps([{ map: { ...kept, numbers: numbers.map(() => 1) } }]).maps[0].map.numbers).toBeUndefined();
    expect(readStructureMaps([{ map: { ...kept, numbers: numbers.slice(1) } }]).maps[0].map.numbers).toBeUndefined();
  });
});
