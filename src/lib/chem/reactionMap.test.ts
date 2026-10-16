import { describe, expect, it } from "vitest";
import type { Molecule } from "./molecule";
import { dielsAlder, molecule, sn2, trueMap } from "./reactionMap.fixtures";
import { heavyAtomPairs, mapReaction, withMapNumbers, type ReactionMap } from "./reactionMap";

const DA_REACTANT_NAMES = ["C1", "C2", "C3", "C4", "H2", "H3", "H1a", "H1b", "H4a", "H4b", "C5", "C6", "H5a", "H5b", "H6a", "H6b"];

function mapped(reactants: Molecule[], products: Molecule[]): ReactionMap {
  const r = mapReaction({ reactants, products });
  if ("error" in r) throw new Error(r.message);
  return r;
}

describe("mapReaction", () => {
  const da = dielsAlder();
  const result = mapped(da.reactants, [da.product]);

  it("maps every atom, hydrogens included, one to one", () => {
    expect(result.maps.length).toBe(64);
    expect(result.complete.every(Boolean)).toBe(true);
    expect(result.maps[0]).toEqual(trueMap(DA_REACTANT_NAMES, da.productOrder));
  });

  it("writes the product in the reactant's numbering, where its own atoms stand", () => {
    const p = result.productsInReactantNumbering[0];
    expect(p.atoms.map((a) => a.el)).toEqual(result.reactant.atoms.map((a) => a.el));
    // reactant atom 11 (C5) is product atom 2 (index of "C5" in the product's order)
    const i = da.productOrder.indexOf("C5");
    expect(p.atoms[10]).toMatchObject({ x: da.product.atoms[i].x, y: da.product.atoms[i].y, z: da.product.atoms[i].z });
    // the new ring bond C1-C5, in the reactant's numbering
    expect(p.bonds.some((b) => b.a1 === 0 && b.a2 === 10 && b.order === 1)).toBe(true);
    expect(result.productsInReactantNumbering.length).toBe(result.maps.length);
  });

  it("tells the bonds made, broken and changed in order", () => {
    expect(result.changes.formed.map((b) => [b.a1, b.a2, b.after])).toEqual([
      [0, 10, 1],
      [3, 11, 1],
    ]);
    expect(result.changes.broken).toEqual([]);
    expect(result.changes.orderChanged.map((b) => [b.a1, b.a2, b.before, b.after])).toEqual([
      [0, 1, 2, 1],
      [1, 2, 1, 2],
      [2, 3, 2, 1],
      [10, 11, 2, 1],
    ]);
  });

  it("reads off a heavy-atom map from the full one, for a drawing", () => {
    const heavy = heavyAtomPairs(result);
    expect(heavy.length).toBe(6);
    for (const [r, p] of heavy) {
      expect(result.reactant.atoms[r].el).toBe("C");
      expect(result.maps[0][p]).toBe(r);
    }
  });

  it("numbers every atom with its map number", () => {
    const numbered = withMapNumbers({ reactants: da.reactants, products: [da.product] }, result);
    const r = numbered.reactants[0].atoms.map((a) => a.map);
    expect(r).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    const p = numbered.products[0].atoms;
    p.forEach((a, i) => {
      expect(a.map).toBe(result.maps[0][i] + 1);
      expect(a.el).toBe(numbered.reactants[0].atoms[a.map! - 1].el);
    });
  });

  it("sets several structures on a side beside one another, numbered on from the first", () => {
    const diene = molecule(
      {
        C1: ["C", [-1.4, -0.56, 0]],
        C2: ["C", [-0.73, 0.6, 0]],
      },
      [["C1", "C2", 2]],
    );
    const ethylene = molecule({ C5: ["C", [-0.67, -1.0, 2.6]] }, []);
    const r = mapped([diene, ethylene], [molecule({ C5: ["C", [0, 0, 0]], C1: ["C", [1.5, 0, 0]], C2: ["C", [2.2, 1.2, 0]] }, [["C1", "C2", 1], ["C1", "C5", 1]])]);
    expect(r.reactant.atoms.length).toBe(3);
    // the second structure moved past the first's far corner
    expect(r.reactant.atoms[2].x).toBeGreaterThan(-0.73);
    expect(r.complete[0]).toBe(true);
  });

  it("says when a map leaves atoms out, and then rewrites nothing", () => {
    const { reactant } = sn2();
    const partial = molecule({ C: ["C", [0, 0, 0]], Cl: ["Cl", [-1.79, 0, 0]] }, [["C", "Cl", 1]]);
    const r = mapped([reactant], [partial]);
    expect(r.complete.some(Boolean)).toBe(false);
    expect(r.productsInReactantNumbering).toEqual([]);
    const numbered = withMapNumbers({ reactants: [reactant], products: [partial] }, r);
    expect(numbered.products[0].atoms.every((a) => a.map === undefined)).toBe(true);
  });

  it("will not map flat drawings", () => {
    const flat = (m: Molecule): Molecule => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, z: 0 })) });
    const r = mapReaction({ reactants: [flat(da.reactants[0])], products: [flat(da.product)] });
    expect("error" in r && r.error).toBe("2d");
  });
});
