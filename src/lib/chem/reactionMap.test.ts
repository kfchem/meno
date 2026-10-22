import { describe, expect, it } from "vitest";
import type { Molecule } from "./molecule";
import { dielsAlder, molecule, sn2, trueMap } from "./reactionMap.fixtures";
import { heavyAtomPairs, mapProducts, mapReaction, withMapNumbers, type ReactionMap } from "./reactionMap";

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
    // the search's 64 differ only in which of a ring CH2's hydrogens is which; placed for the least motion
    // about each CH2's frame (localLeastTurn), they come to 4, each once
    expect(result.maps.length).toBe(4);
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

  it("will not map flat drawings, their hydrogens implicit", () => {
    const flat = (m: Molecule): Molecule => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, z: 0 })) });
    const heavy = (m: Molecule): Molecule => {
      const keep = m.atoms.map((a, i) => (a.el === "H" ? -1 : i)).filter((i) => i >= 0);
      return { atoms: keep.map((i) => m.atoms[i]), bonds: m.bonds.filter((b) => keep.includes(b.a1) && keep.includes(b.a2)).map((b) => ({ ...b, a1: keep.indexOf(b.a1), a2: keep.indexOf(b.a2) })) };
    };
    const r = mapReaction({ reactants: [flat(heavy(da.reactants[0]))], products: [flat(heavy(da.product))] });
    expect("error" in r && r.error).toBe("2d");
  });

  it("maps small molecules that lie flat at z = 0 with all their atoms", () => {
    const water = (x: number) => molecule({ O: ["O", [x, 0, 0]], Ha: ["H", [x + 0.96, 0, 0]], Hb: ["H", [x - 0.24, 0.93, 0]] }, [["O", "Ha", 1], ["O", "Hb", 1]], undefined, { jitter: false });
    const r = mapReaction({ reactants: [water(0), water(3)], products: [water(3), water(0)] });
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.complete.every(Boolean)).toBe(true);
  });
});

describe("a complete map", () => {
  it("pairs each atom with one of its own element: an H pinned to the reactants' Cl leaves the map incomplete", () => {
    const { reactant, product, productOrder } = sn2();
    const r = mapReaction({ reactants: [reactant], products: [product], knownPairs: [[2, productOrder.indexOf("H0")]] });
    if ("error" in r) throw new Error(r.message);
    expect(r.maps[0][productOrder.indexOf("H0")]).toBe(2);
    expect(r.complete.every((c) => !c)).toBe(true);
  });
});

describe("mapProducts (the Reaction step)", () => {
  const da = dielsAlder();
  const reactant = da.reactants[0];
  const at = (name: string) => DA_REACTANT_NAMES.indexOf(name);
  /** The product's atoms in another order: the same structure, as another file might hold it. */
  const reordered = (m: Molecule, order: number[]): Molecule => {
    const place = new Map(order.map((old, i) => [old, i]));
    return { atoms: order.map((i) => m.atoms[i]), bonds: m.bonds.map((b) => ({ ...b, a1: place.get(b.a1)!, a2: place.get(b.a2)! })) };
  };

  it("writes the product in the reactants' numbering, every atom where it stands in the product", () => {
    const { mapped, notMapped } = mapProducts(reactant, [da.product]);
    expect(notMapped).toEqual([]);
    expect(mapped).toHaveLength(1);
    const truth = trueMap(DA_REACTANT_NAMES, da.productOrder);
    const m = mapped[0].molecule;
    truth.forEach((r, j) => expect(m.atoms[r]).toEqual(da.product.atoms[j]));
  });

  it("gives the known bond changes of a Diels-Alder: two bonds formed, the diene's and the ene's orders changed, nothing broken", () => {
    const rows = mapProducts(reactant, [da.product]).mapped[0].changes;
    const pair = (p: string, q: string) => [at(p), at(q)].sort((x, y) => x - y);
    expect(rows.map((r) => [r.change, ...[r.a1, r.a2], r.before, r.after])).toEqual([
      ["formed", ...pair("C1", "C5"), 0, 1],
      ["formed", ...pair("C4", "C6"), 0, 1],
      ["order", ...pair("C1", "C2"), 2, 1],
      ["order", ...pair("C2", "C3"), 1, 2],
      ["order", ...pair("C3", "C4"), 2, 1],
      ["order", ...pair("C5", "C6"), 2, 1],
    ]);
    expect(rows.every((r) => r.element1 === "C" && r.element2 === "C")).toBe(true);
  });

  it("gives the same answer whatever order the product's atoms come in", () => {
    const n = da.product.atoms.length;
    const order = Array.from({ length: n }, (_, i) => (i * 7 + 3) % n);
    const a = mapProducts(reactant, [da.product]).mapped[0];
    const b = mapProducts(reactant, [reordered(da.product, order)]).mapped[0];
    expect(b.changes).toEqual(a.changes);
    expect(b.molecule.atoms).toEqual(a.molecule.atoms);
  });

  it("maps each product on its own, numbered by its place, and can give every map", () => {
    const { reactant: r, product: p } = sn2();
    const two = mapProducts(r, [p, p]);
    expect(two.mapped.map((x) => x.product)).toEqual([0, 1]);
    // SN2: the C-Cl bond formed, C-Br broken
    expect(two.mapped[0].changes.map((c) => [c.change, c.element1, c.element2])).toEqual([
      ["formed", "C", "Cl"],
      ["broken", "C", "Br"],
    ]);
    const every = mapProducts(reactant, [da.product], { every: true });
    // the Diels-Alder's maps, each once (see "maps every atom, hydrogens included, one to one")
    expect(every.mapped.map((x) => x.map)).toEqual(Array.from({ length: 4 }, (_, i) => i));
  });

  it("says why a product that cannot map atom for atom is not passed on, and passes on nothing of it", () => {
    const short: Molecule = { atoms: da.product.atoms.slice(0, -1), bonds: da.product.bonds.filter((b) => b.a1 < da.product.atoms.length - 1 && b.a2 < da.product.atoms.length - 1) };
    const { mapped, notMapped } = mapProducts(reactant, [short, da.product]);
    expect(mapped.map((x) => x.product)).toEqual([1]);
    expect(notMapped).toEqual([{ product: 0, reason: expect.stringMatching(/15 atoms and the reactants 16/) }]);
    const flat: Molecule = { atoms: da.product.atoms.map((a) => ({ ...a, z: 0 })).filter((a) => a.el !== "H"), bonds: [] };
    const flatReactant: Molecule = { atoms: reactant.atoms.map((a) => ({ ...a, z: 0 })).filter((a) => a.el !== "H"), bonds: [] };
    expect(mapProducts(flatReactant, [flat]).notMapped[0].reason).toMatch(/flat drawings/);
  });

  it("refuses a product of other elements, as many atoms or not, and says which", () => {
    // SN2's product with its carbon made a fluorine: six atoms either side, but no carbon for the reactants' to map to
    const { reactant: r, product: p, productOrder } = sn2();
    const fluorine = { ...p, atoms: p.atoms.map((a, i) => (productOrder[i] === "C" ? { ...a, el: "F" } : a)) };
    expect(mapProducts(r, [fluorine])).toEqual({
      mapped: [],
      notMapped: [{ product: 0, reason: "The product has 1 F more and 1 C fewer than the reactants: every atom must map to one of its own element." }],
    });
  });

  it("pairs every atom with one of its own element: an H and a Cl trading places in the product is still CH3Cl, mapped Cl to Cl", () => {
    const { reactant: r, product: p, productOrder } = sn2();
    const [h, cl] = [productOrder.indexOf("H0"), productOrder.indexOf("Cl")];
    const swapped = { ...p, atoms: p.atoms.map((a, i) => (i === h ? { ...a, el: "Cl" } : i === cl ? { ...a, el: "H" } : a)) };
    const { mapped, notMapped } = mapProducts(r, [swapped], { every: true });
    expect(notMapped).toEqual([]);
    for (const x of mapped) x.molecule.atoms.forEach((a, i) => expect(a.el).toBe(r.atoms[i].el));
    expect(mapped[0].changes.map((c) => [c.change, c.element1, c.element2])).toEqual([
      ["formed", "C", "Cl"],
      ["broken", "C", "Br"],
    ]);
  });
});
