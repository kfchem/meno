import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { mapReaction } from "../../../../lib/chem/reactionMap";
import { dielsAlder } from "../../../../lib/chem/reactionMap.fixtures";
import * as ops from "../document";
import { createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Atom, Bond, Model, Molecule3D } from "../store/types";
import { signatureOf } from "../utils/drawnLink";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { keptMap, mapMarks, mapShows, mapStanding, unpairedSaid } from "./atomMap";
import { readStructureMaps, sideMolecules, sideNumbers } from "./structureMaps";

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
