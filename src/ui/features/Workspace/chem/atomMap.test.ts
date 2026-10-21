import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { readSDfile } from "../../../../lib/chem/ctfile";
import { mapReaction, type ReactionMap } from "../../../../lib/chem/reactionMap";
import { dielsAlder } from "../../../../lib/chem/reactionMap.fixtures";
import * as ops from "../document";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Arrow, Atom, Bond, Model } from "../store/types";
import { keptMap, mapMarks, mappedPairSdf, mapStanding, reactionOf, type Side3D } from "./atomMap";
import { reactionFileText } from "./reactionFile";

/**
 * A Diels-Alder reaction drawn: butadiene + ethylene -> cyclohexene, with
 * its arrow; and its structures in 3D (lib/chem/reactionMap.fixtures), each
 * heavy atom the drawn atom of its name, the hydrogens made for them.
 */
const NAMES = ["C1", "C2", "C3", "C4", "C5", "C6"];
const R_ID: Record<string, number> = { C1: 1, C2: 2, C3: 3, C4: 4, C5: 5, C6: 6 };
const P_ID: Record<string, number> = { C1: 11, C2: 12, C3: 13, C4: 14, C5: 15, C6: 16 };

function drawn(): WorkspaceDocument {
  const at = (id: number, x: number, y: number): Atom => ({ id, el: "C", x: x * L, y: y * L, r: 0 }) as Atom;
  const bond = (id: number, a: number, b: number, order: 1 | 2): Bond => ({ id, a, b, order }) as Bond;
  // butadiene, then ethylene beside it, before the arrow; the ring after it
  const atoms: Atom[] = [
    at(1, -9, 0), at(2, -8.5, 0.87), at(3, -7.5, 0.87), at(4, -7, 0),
    at(5, -5, 0), at(6, -4, 0),
    at(11, 4, 0), at(12, 4.5, 0.87), at(13, 5.5, 0.87), at(14, 6, 0), at(16, 5.5, -0.87), at(15, 4.5, -0.87),
  ];
  const bonds: Bond[] = [
    bond(21, 1, 2, 2), bond(22, 2, 3, 1), bond(23, 3, 4, 2), bond(24, 5, 6, 2),
    bond(31, 11, 12, 1), bond(32, 12, 13, 2), bond(33, 13, 14, 1), bond(34, 14, 16, 1), bond(35, 16, 15, 1), bond(36, 15, 11, 1),
  ];
  const arrow: Arrow = { id: 1, x: 0, y: 0, angle: 0, length: 3 * L };
  return { ...emptyWorkspaceDocument(), model: { atoms, bonds } as Model, arrows: [arrow], nextId: 100 };
}

function sides(): { reactants: Side3D[]; products: Side3D[]; result: ReactionMap } {
  const da = dielsAlder();
  const rNames = ["C1", "C2", "C3", "C4", "H2", "H3", "H1a", "H1b", "H4a", "H4b", "C5", "C6", "H5a", "H5b", "H6a", "H6b"];
  const reactants = [{ molecule: da.reactants[0], drawnFrom: rNames.map((k) => R_ID[k] ?? null) }];
  const products = [{ molecule: da.product, drawnFrom: da.productOrder.map((k) => P_ID[k] ?? null) }];
  const result = mapReaction({ reactants: [da.reactants[0]], products: [da.product] });
  if ("error" in result) throw new Error(result.message);
  return { reactants, products, result };
}

describe("reactionOf", () => {
  it("takes the structures standing on from the arrow's tail and point, a + apart", () => {
    const d = drawn();
    const { reactants, products } = reactionOf(d.model, d.arrows[0], d.pluses);
    expect(reactants.map((ids) => [...ids].sort((p, q) => p - q))).toEqual([
      [1, 2, 3, 4],
      [5, 6],
    ]);
    expect(products.map((ids) => [...ids].sort((p, q) => p - q))).toEqual([[11, 12, 13, 14, 15, 16]]);
  });

  it("leaves out a structure standing far off", () => {
    const d = drawn();
    const far = { ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => (a.id === 1 || a.id === 2 || a.id === 3 || a.id === 4 ? { ...a, x: a.x - 20 * L } : a)) } };
    expect(reactionOf(far.model, far.arrows[0], far.pluses).reactants).toEqual([[5, 6]]);
  });
});

describe("a kept map and what it shows", () => {
  it("numbers each heavy atom the same on both sides, and marks the bonds made and changed", () => {
    const d = drawn();
    const { reactants, products, result } = sides();
    const kept = keptMap(d.model, result, reactants, products);
    expect(kept.complete).toBe(true);
    // the maps that differ in more than which of a ring CH2's hydrogens is which (src/lib/chem/reactionMap.test.ts)
    expect(kept.maps.length).toBe(4);
    const { numbers, centres } = mapMarks(kept, d.model);
    for (const k of NAMES) expect(numbers.get(P_ID[k])).toBe(numbers.get(R_ID[k]));
    expect(new Set(NAMES.map((k) => numbers.get(R_ID[k]))).size).toBe(6);
    // C1-C5 and C4-C6 made; the double bonds moved; ethylene's double bond now single
    expect(centres.get(36)).toBe(4);
    expect(centres.get(34)).toBe(4);
    expect([21, 22, 23, 24, 31, 32, 33, 35].map((id) => centres.get(id))).toEqual([8, 8, 8, 8, 8, 8, 8, 8]);
  });

  it("is put on the drawing as one change, hidden, and another taken", () => {
    const d = drawn();
    const { reactants, products, result } = sides();
    const kept = keptMap(d.model, result, reactants, products);
    const shown = ops.setAtomMap(d, 1, kept);
    expect(shown.model.atoms.find((a) => a.id === 11)!.map).toBe(shown.model.atoms.find((a) => a.id === 1)!.map);
    expect(shown.model.bonds.find((b) => b.id === 36)!.reactingCentre).toBe(4);
    expect(shown.arrows[0].atomMap).toBe(kept);
    const hidden = ops.setAtomMap(shown, 1, { ...kept, shown: false });
    expect(hidden.model.atoms.every((a) => a.map === undefined)).toBe(true);
    expect(hidden.model.bonds.every((b) => b.reactingCentre === undefined)).toBe(true);
    const other = ops.setAtomMap(shown, 1, { ...kept, chosen: 1 });
    expect(other.arrows[0].atomMap!.chosen).toBe(1);
    const gone = ops.setAtomMap(shown, 1, null);
    expect(gone.arrows[0].atomMap).toBeUndefined();
    expect(gone.model.atoms.every((a) => a.map === undefined)).toBe(true);
  });

  it("stands as changed once the drawing is, and then shows nothing", () => {
    const d = drawn();
    const { reactants, products, result } = sides();
    const kept = keptMap(d.model, result, reactants, products);
    const changed = { ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => (a.id === 5 ? { ...a, el: "N" } : a)) } };
    expect(mapStanding({ atomMap: kept }, d.model)).toBe("ready");
    expect(mapStanding({ atomMap: kept }, changed.model)).toBe("changed");
    expect(ops.setAtomMap(changed, 1, kept).model.atoms.every((a) => a.map === undefined)).toBe(true);
  });

  it("is written into the RXN file, shown or not", () => {
    const d = drawn();
    const { reactants, products, result } = sides();
    const hidden = ops.setAtomMap(d, 1, { ...keptMap(d.model, result, reactants, products), shown: false });
    const rxn = reactionFileText({ ...hidden.model, arrows: hidden.arrows, pluses: hidden.pluses });
    // V2000 atom lines: the mapping number in the atom block's 61st-63rd columns
    const maps = rxn
      .split("\n")
      .filter((l) => /^\s+-?\d+\.\d{4}\s+-?\d+\.\d{4}\s+-?\d+\.\d{4} C/.test(l))
      .map((l) => Number(l.slice(60, 63)));
    expect(maps.length).toBe(12);
    expect(maps.every((n) => n >= 1 && n <= 6)).toBe(true);
  });

  it("writes the reaction in 3D: the product's atoms in the reactants' order", () => {
    const d = drawn();
    const { reactants, products, result } = sides();
    const kept = keptMap(d.model, result, reactants, products);
    const records = readSDfile(mappedPairSdf(kept, "da"));
    expect(records.length).toBe(2);
    expect(records[1].atoms.map((a) => a.symbol)).toEqual(records[0].atoms.map((a) => a.symbol));
    // reactant atom 11 (C5) bonds reactant atom 1 (C1) in the product
    expect(records[1].bonds.some((b) => (b.a1 === 0 && b.a2 === 10) || (b.a1 === 10 && b.a2 === 0))).toBe(true);
  });
});
