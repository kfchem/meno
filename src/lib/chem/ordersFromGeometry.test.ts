import { describe, expect, it } from "vitest";
import { orderFromLength, ordersFromGeometry, work, type GeoAtom } from "./ordersFromGeometry";

// Molecules as RDKit's ETKDG and MMFF lay them out in 3D, hydrogens taken
// away but where said; each bond with the order its SMILES gives.
type Fixture = { atoms: [string, number, number, number][]; bonds: [number, number, number][] };
const MOLECULES: Record<string, Fixture> = {
  pyridine: { atoms: [["C", 0.091, 1.18, 0.026], ["C", 1.234, 0.387, 0.027], ["C", 1.077, -0.989, -0.004], ["N", -0.124, -1.608, -0.036], ["C", -1.215, -0.812, -0.036], ["C", -1.16, 0.572, -0.006]], bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]] },
  "acetic acid": { atoms: [["C", -0.934, -0.06, -0.23], ["C", 0.494, 0.279, 0.047], ["O", 1.033, 1.357, -0.136], ["O", 1.181, -0.764, 0.546]], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1]] },
  acetonitrile: { atoms: [["C", -0.486, 0.008, -0.009], ["C", 0.975, -0.015, 0.018], ["N", 2.135, -0.033, 0.039]], bonds: [[0, 1, 1], [1, 2, 3]] },
  "dimethyl sulfone": { atoms: [["C", -1.286, -0.337, -0.514], ["S", 0.013, 0.787, -0.065], ["C", 1.276, -0.291, 0.565], ["O", 0.515, 1.394, -1.282], ["O", -0.465, 1.602, 1.035]], bonds: [[0, 1, 1], [1, 2, 1], [1, 3, 2], [1, 4, 2]] },
  "N-methylacetamide": { atoms: [["C", -1.888, -0.103, -0.007], ["N", -0.489, -0.408, -0.172], ["C", 0.48, 0.434, 0.324], ["C", 1.886, 0.025, -0.024], ["O", 0.239, 1.441, 0.981]], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [2, 4, 2]] },
  "benzene, with its hydrogens": { atoms: [["C", 0.804, -1.14, -0.008], ["C", 1.389, 0.126, -0.028], ["C", 0.585, 1.266, -0.02], ["C", -0.804, 1.14, 0.008], ["C", -1.389, -0.126, 0.028], ["C", -0.585, -1.266, 0.02], ["H", 1.43, -2.028, -0.015], ["H", 2.471, 0.224, -0.05], ["H", 1.041, 2.252, -0.035], ["H", -1.43, 2.028, 0.015], ["H", -2.471, -0.224, 0.05], ["H", -1.041, -2.252, 0.035]], bonds: [[0, 1, 1], [1, 2, 2], [2, 3, 1], [3, 4, 2], [4, 5, 1], [5, 0, 2], [0, 6, 1], [1, 7, 1], [2, 8, 1], [3, 9, 1], [4, 10, 1], [5, 11, 1]] },
};
const nitromethane: Fixture = { atoms: [["C", -0.642, -0.085, -0.09], ["N", 0.82, 0.108, 0.107], ["O", 1.496, -0.904, 0.327], ["O", 1.245, 1.268, 0.055]], bonds: [[0, 1, 1], [1, 2, 1], [1, 3, 2]] };

const atomsOf = (f: Fixture): GeoAtom[] => f.atoms.map(([el, x, y, z]) => ({ el, x, y, z }));
const bondsOf = (f: Fixture) => f.bonds.map(([a1, a2]) => ({ a1, a2 }));
/** Each atom's double bonds, as given: a ring's Kekulé structures are all right. */
const doubles = (f: Fixture, orders: number[]) => f.atoms.map((_, i) => f.bonds.filter(([a, b], k) => (a === i || b === i) && orders[k] === 2).length);

describe("bond orders estimated from where atoms stand", () => {
  it("reads a bond's length as an order, by the bond-type covalent radii", () => {
    expect(orderFromLength("C", "C", 1.54)).toBe(1);
    expect(orderFromLength("C", "C", 1.34)).toBeCloseTo(2, 1);
    expect(orderFromLength("C", "C", 1.2)).toBeCloseTo(3, 1);
    const ring = orderFromLength("C", "C", 1.39)!;
    expect(ring).toBeGreaterThan(1.5);
    expect(ring).toBeLessThan(2);
    // (hydrogen has no double-bond radius)
    expect(orderFromLength("C", "H", 1.09)).toBeNull();
  });

  it.each(Object.entries(MOLECULES))("gives %s its orders", (_, f) => {
    const r = ordersFromGeometry(atomsOf(f), bondsOf(f));
    expect(r.decided).toBe(true);
    expect(doubles(f, r.orders)).toEqual(doubles(f, f.bonds.map((b) => b[2])));
    expect(r.orders.filter((o) => o === 3).length).toBe(f.bonds.filter((b) => b[2] === 3).length);
  });

  it("gives a nitro group its N=O, the charge on its nitrogen and back on its other oxygen", () => {
    const r = ordersFromGeometry(atomsOf(nitromethane), bondsOf(nitromethane));
    expect(r.orders.slice(1).sort()).toEqual([1, 2]);
    expect(r.charges[1]).toBe(1);
    expect(r.charges.reduce((s, c) => s + c, 0)).toBe(0);
  });

  it("gives an azide, its hydrogens not there, N=N+=N- - neutral, as phenyl azide and zidovudine are", () => {
    // (laid out by RDKit's ETKDG and MMFF, hydrogens taken away; azides are neutral, R-N=N+=N-: the
    // terminal nitrogen carries the charge back - left without it, it reads as R-N=N+=NH, a cation)
    const phenylAzide: Fixture = { atoms: [["N", 3.631, 0.136, 0.99], ["N", 2.906, -0.075, 0.135], ["N", 2.125, -0.31, -0.808], ["C", 0.784, -0.152, -0.433], ["C", 0.055, -1.239, 0.061], ["C", -1.286, -1.087, 0.421], ["C", -1.909, 0.152, 0.277], ["C", -1.195, 1.237, -0.231], ["C", 0.145, 1.083, -0.59]], bonds: [[0, 1, 2], [1, 2, 2], [2, 3, 1], [3, 4, 1], [4, 5, 2], [5, 6, 1], [6, 7, 2], [7, 8, 1], [8, 3, 2]] };
    const zidovudine: Fixture = { atoms: [["C", 3.531, -1.629, -1.15], ["C", 2.841, -0.482, -0.487], ["C", 1.559, -0.49, -0.103], ["N", 0.959, 0.592, 0.513], ["C", -0.447, 0.577, 0.903], ["C", -1.337, 1.38, -0.038], ["C", -2.671, 0.676, 0.078], ["N", -3.456, 1.273, 1.186], ["N", -3.371, 0.798, 2.333], ["N", -3.294, 0.368, 3.385], ["C", -2.257, -0.784, 0.284], ["C", -2.11, -1.552, -1.037], ["O", -3.358, -1.639, -1.71], ["O", -0.973, -0.764, 0.94], ["C", 1.663, 1.762, 0.768], ["O", 1.171, 2.76, 1.289], ["N", 2.978, 1.76, 0.389], ["C", 3.635, 0.743, -0.239], ["O", 4.808, 0.837, -0.582]], bonds: [[0, 1, 1], [1, 2, 2], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1], [6, 7, 1], [7, 8, 2], [8, 9, 2], [6, 10, 1], [10, 11, 1], [11, 12, 1], [10, 13, 1], [3, 14, 1], [14, 15, 2], [14, 16, 1], [16, 17, 1], [17, 18, 2], [17, 1, 1], [13, 4, 1]] };
    for (const [f, [inner, middle, end]] of [[phenylAzide, [2, 1, 0]], [zidovudine, [7, 8, 9]]] as [Fixture, number[]][]) {
      const r = ordersFromGeometry(atomsOf(f), bondsOf(f));
      expect(r.decided).toBe(true);
      expect(doubles(f, r.orders)).toEqual(doubles(f, f.bonds.map((b) => b[2])));
      expect([r.charges[inner], r.charges[middle], r.charges[end]]).toEqual([0, 1, -1]);
      expect(r.charges.reduce((s, c) => s + c, 0)).toBe(0);
    }
  });

  it("holds through the noise of an X-ray structure's coordinates", () => {
    const f = MOLECULES.pyridine;
    // (each coordinate moved by up to 0.02 A, the same way each run)
    const shaken = atomsOf(f).map((a, i) => ({ ...a, x: a.x + 0.02 * Math.sin(i * 1.7), y: a.y + 0.02 * Math.cos(i * 2.3), z: a.z + 0.02 * Math.sin(i * 0.9) }));
    const r = ordersFromGeometry(shaken, bondsOf(f));
    expect(r.decided).toBe(true);
    expect(doubles(f, r.orders)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("leaves a bond to a metal single, and the rest as without it", () => {
    const f = MOLECULES.pyridine;
    // (zinc 2.0 A out from the nitrogen, away from the ring's centre)
    const zinc = { el: "Zn", x: -0.25, y: -3.6, z: -0.07 };
    const r = ordersFromGeometry([...atomsOf(f), zinc], [...bondsOf(f), { a1: 3, a2: 6 }]);
    expect(r.decided).toBe(true);
    expect(r.orders[6]).toBe(1);
    expect(doubles(f, r.orders.slice(0, 6))).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("is not decided where a carbon's shape asks a double bond it cannot have", () => {
    // (a carbon flat among three chlorines: a radical, as drawn, or a cation)
    const atoms: GeoAtom[] = [
      { el: "C", x: 0, y: 0, z: 0 },
      { el: "Cl", x: 1.76, y: 0, z: 0 },
      { el: "Cl", x: -0.88, y: 1.524, z: 0 },
      { el: "Cl", x: -0.88, y: -1.524, z: 0 },
    ];
    const r = ordersFromGeometry(atoms, [{ a1: 0, a2: 1 }, { a1: 0, a2: 2 }, { a1: 0, a2: 3 }]);
    expect(r.decided).toBe(false);
    expect(r.orders).toEqual([1, 1, 1]);
  });
  it("estimates a large molecule in time in step with its size", () => {
    // (copies of an amide, pyridine and nitromethane 10 A apart, no H: each
    // part looked through every flat ring, and each oxygen held singly
    // through every bond - 7 s for 88 000 atoms of a protein. Eight times the
    // copies now take about eight times as long, not sixty-four)
    const parts = [MOLECULES["N-methylacetamide"], MOLECULES.pyridine, nitromethane];
    const many = (n: number) => {
      const atoms: GeoAtom[] = [];
      const bonds: { a1: number; a2: number }[] = [];
      for (let k = 0; k < n; k++) {
        const f = parts[k % parts.length];
        const first = atoms.length;
        for (const [el, x, y, z] of f.atoms) atoms.push({ el, x: x + 10 * (k % 40), y: y + 10 * Math.floor(k / 40), z });
        for (const [a1, a2] of f.bonds) bonds.push({ a1: first + a1, a2: first + a2 });
      }
      return { atoms, bonds, nitro: Math.floor(n / parts.length) };
    };
    const run = (m: ReturnType<typeof many>) => {
      const r = ordersFromGeometry(m.atoms, m.bonds);
      // (each nitro group's nitrogen charged, and an oxygen of each, as on its own)
      expect(r.charges.filter((c) => c === 1).length).toBe(m.nitro);
      expect(r.charges.filter((c) => c === -1).length).toBe(m.nitro);
    };
    // (steps counted, not time: a ratio of seconds is missed on a busy machine)
    const steps = (m: ReturnType<typeof many>) => {
      work.steps = 0;
      run(m);
      return work.steps;
    };
    const small = steps(many(240));
    const large = steps(many(1920));
    expect(small).toBeGreaterThan(0);
    // (eight times the copies: about eight times the steps, not sixty-four)
    expect(large / small).toBeLessThan(10);
  });
});
