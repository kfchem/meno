import { describe, expect, it } from "vitest";
import { lacksHydrogens, type SkeletonAtom, type SkeletonBond } from "./skeleton";

/** Atoms as a file of coordinates gives them, and their bonds as Meno finds them there: each pair nearer than `reach`, its order single (unknown). */
function fromCoordinates(atoms: [string, number, number, number][], reach: (a: string, b: string) => number): { atoms: SkeletonAtom[]; bonds: SkeletonBond[] } {
  const out = atoms.map(([el, x, y, z]) => ({ el, x, y, z }));
  const bonds: SkeletonBond[] = [];
  out.forEach((a, i) =>
    out.forEach((b, j) => {
      if (j > i && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= reach(a.el, b.el)) bonds.push({ a1: i, a2: j, order: 1 });
    }),
  );
  return { atoms: out, bonds };
}
const reach = () => 2.0;

// (the vertices of a truncated icosahedron, edge 2: the even permutations of (0, ±1, ±3φ), (±1, ±(2 + φ), ±2φ)
// and (±φ, ±2, ±(2φ + 1)) - scaled to C60's mean C-C bond, 1.42 Å)
function c60(): [string, number, number, number][] {
  const p = (1 + Math.sqrt(5)) / 2;
  const seeds = [
    [0, 1, 3 * p],
    [1, 2 + p, 2 * p],
    [p, 2, 2 * p + 1],
  ];
  const points = new Map<string, number[]>();
  for (const s of seeds) {
    for (const signs of [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]]) {
      const v = s.map((x, k) => x * signs[k]);
      for (const q of [[v[0], v[1], v[2]], [v[1], v[2], v[0]], [v[2], v[0], v[1]]]) points.set(q.map((x) => x.toFixed(6)).join(" "), q);
    }
  }
  return [...points.values()].map((q) => ["C", ...(q.map((x) => (x * 1.42) / 2) as [number, number, number])]);
}

describe("a skeleton: a molecule in 3D whose hydrogens are not there", () => {
  it("is not what is whole without hydrogens: CO2, SF6, CCl4, C60 and Fe(CO)5, from their coordinates alone", () => {
    const t = 1.77 / Math.sqrt(3);
    const whole: Record<string, [string, number, number, number][]> = {
      "carbon dioxide": [["C", 0, 0, 0], ["O", 0, 0, 1.16], ["O", 0, 0, -1.16]],
      "sulfur hexafluoride": [["S", 0, 0, 0], ["F", 1.56, 0, 0], ["F", -1.56, 0, 0], ["F", 0, 1.56, 0], ["F", 0, -1.56, 0], ["F", 0, 0, 1.56], ["F", 0, 0, -1.56]],
      "carbon tetrachloride": [["C", 0, 0, 0], ["Cl", t, t, t], ["Cl", t, -t, -t], ["Cl", -t, t, -t], ["Cl", -t, -t, t]],
      C60: c60(),
      // (a trigonal bipyramid: Fe-C 1.81 axial, 1.83 equatorial, C-O 1.15)
      "iron pentacarbonyl": [
        ["Fe", 0, 0, 0],
        ...[0, 120, 240].flatMap((deg): [string, number, number, number][] => {
          const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
          return [["C", 1.83 * c, 1.83 * s, 0], ["O", 2.98 * c, 2.98 * s, 0]];
        }),
        ["C", 0, 0, 1.81], ["O", 0, 0, 2.96], ["C", 0, 0, -1.81], ["O", 0, 0, -2.96],
      ],
    };
    expect(c60()).toHaveLength(60);
    for (const [name, atoms] of Object.entries(whole)) {
      const m = fromCoordinates(atoms, (a, b) => (a === "Fe" || b === "Fe" ? 2.0 : a === "S" || b === "S" || a === "Cl" || b === "Cl" ? 1.9 : 1.5));
      expect([name, lacksHydrogens(m.atoms, m.bonds, true)]).toEqual([name, false]);
    }
  });

  it("is methylamine's, ethane's and benzene's heavy atoms - from coordinates, or with their orders given", () => {
    const skeletons: Record<string, [string, number, number, number][]> = {
      methylamine: [["C", 0, 0, 0], ["N", 1.47, 0, 0]],
      ethane: [["C", 0, 0, 0], ["C", 1.54, 0, 0]],
      benzene: Array.from({ length: 6 }, (_, k): [string, number, number, number] => ["C", 1.39 * Math.cos((k * Math.PI) / 3), 1.39 * Math.sin((k * Math.PI) / 3), 0]),
    };
    for (const [name, atoms] of Object.entries(skeletons)) {
      const m = fromCoordinates(atoms, reach);
      expect([name, lacksHydrogens(m.atoms, m.bonds, true)]).toEqual([name, true]);
    }
    // (benzene with its orders given, as a MOL file of its heavy atoms has them)
    const benzene = fromCoordinates(skeletons.benzene, reach);
    expect(lacksHydrogens(benzene.atoms, benzene.bonds.map((b, k) => ({ ...b, order: k % 2 ? 1 : 2 })), false)).toBe(true);
  });

  it("is a carboxylate whose carbon carries no hydrogen: trifluoroacetate's heavy atoms are not taken for a whole molecule", () => {
    // (CF3-CO2: no carbon of it has room for a hydrogen, but one of its oxygens has - an acid's, or an anion's: which, the heavy atoms do not say)
    const t = 1.33;
    const tfa = fromCoordinates(
      [["C", 0, 0, 0], ["C", 1.54, 0, 0], ["O", 2.17, 1.07, 0], ["O", 2.17, -1.07, 0], ["F", -0.44, t * 0.94, 0], ["F", -0.44, -t * 0.47, t * 0.82], ["F", -0.44, -t * 0.47, -t * 0.82]],
      (a, b) => (a === "F" || b === "F" ? 1.5 : 1.6),
    );
    expect(lacksHydrogens(tfa.atoms, tfa.bonds, true)).toBe(true);
  });

  it("is nothing with a hydrogen among its atoms", () => {
    const water = fromCoordinates([["O", 0, 0, 0], ["H", 0.96, 0, 0], ["H", -0.24, 0.93, 0]], () => 1.1);
    expect(lacksHydrogens(water.atoms, water.bonds, true)).toBe(false);
  });
});
