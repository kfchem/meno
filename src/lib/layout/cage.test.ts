import { describe, expect, it } from "vitest";
import { cageCore, keepsConfigurations, projectCage } from "./cage";
import { readSmiles } from "../chem/smiles";
import { kekuleOrders } from "../chem/kekulize";
import { implicitHydrogens } from "../chem/molecule";
import { layout2D } from "./engine";
import { perceive, type LayoutInput } from "./perceive";

/** Carbons joined by the bonds given. */
const carbons = (n: number, bonds: [number, number, number?][]): LayoutInput => ({
  atoms: Array.from({ length: n }, () => ({ el: "C" })),
  bonds: bonds.map(([a, b, order]) => ({ a, b, order: order ?? 1 })),
});

// norbornane (0-6, the bridge 6 between 0 and 3) with a benzene ring fused on its side 1-2
const norbornane: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3]];
const benzoNorbornene = carbons(11, [...norbornane, [1, 7, 2], [7, 8], [8, 9, 2], [9, 10], [10, 2, 2]]);

describe("a cage within a ring system", () => {
  it("is the rings bridged to one another, without the rings fused to them", () => {
    const mol = perceive(benzoNorbornene);
    const core = cageCore(mol, mol.systems[0])!;
    expect(core.atoms.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("is none in a cage as a whole, or in rings only fused", () => {
    const cage = perceive(carbons(7, norbornane));
    expect(cageCore(cage, cage.systems[0])).toBeNull();
    const naphthalene = perceive(carbons(10, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [4, 6], [6, 7], [7, 8], [8, 9], [9, 5]]));
    expect(cageCore(naphthalene, naphthalene.systems[0])).toBeNull();
  });

  it("is drawn flat where the whole lies flat without a fault", () => {
    expect(layout2D(benzoNorbornene).solid.some(Boolean)).toBe(false);
  });

  it("is drawn in perspective where the whole will not lie flat - adamantane with a ring fused on its side - every bond whole", () => {
    const fused: [number, number, number?][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [5, 6], [6, 7], [7, 8], [8, 1], [7, 9], [9, 3],
      [0, 10], [10, 11, 2], [11, 12], [12, 13, 2], [13, 14], [14, 1],
    ];
    const input = carbons(15, fused);
    const { x, y, solid } = layout2D(input);
    expect(solid.slice(0, 10).every(Boolean)).toBe(true);
    for (const { a, b } of input.bonds) expect(Math.hypot(x[a] - x[b], y[a] - y[b])).toBeGreaterThan(0.6);
  });
});

describe("a solid's configurations", () => {
  // a centre and three of its neighbours, the fourth an H not drawn
  const input: LayoutInput = {
    atoms: [{ el: "C", tetra: { neighbours: [1, 2, 3, -1], volume: 1 } }, { el: "C" }, { el: "C" }, { el: "C" }],
    bonds: [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
      { a: 0, b: 3, order: 1 },
    ],
  };
  const mol = perceive(input);
  const pos = new Map([
    [0, { x: 0, y: 0 }],
    [1, { x: 1, y: 0 }],
    [2, { x: 0, y: 1 }],
    [3, { x: -0.5, y: -0.5 }],
  ]);

  it("are as given in a solid found from bond distances, a ring fusion those make trans turned cis", () => {
    // tetrodotoxin: its guanidine ring joins its cage at C4a, whose
    // configuration the distances alone leave the wrong way round
    const s = readSmiles("C([C@@]1([C@H]2[C@@H]3[C@H](N=C(N[C@@]34[C@@H]([C@@H]1O[C@]([C@H]4O)(O2)O)O)N)O)O)O");
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    const ttx = perceive({
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    });
    const sys = ttx.systems.find((x) => x.atoms.length === 14)!;
    const view = projectCage(ttx, sys);
    expect(keepsConfigurations(ttx, sys.atoms, view.pos, view.depth)).toBe(true);
  });

  it("are kept where the solid has the centre as given, and not where it has its mirror image", () => {
    const near = new Map([[0, 0], [1, 0], [2, 0], [3, 1]]);
    const far = new Map([[0, 0], [1, 0], [2, 0], [3, -1]]);
    expect(keepsConfigurations(mol, [0, 1, 2, 3], pos, near)).toBe(true);
    expect(keepsConfigurations(mol, [0, 1, 2, 3], pos, far)).toBe(false);
  });
});
