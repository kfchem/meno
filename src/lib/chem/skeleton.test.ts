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

  it("is a crowded methine's heavy atoms, its carbon all but flat - CHI3, HC(CCl3)3, HC(C6F5)3, tri-tert-butylmethane", () => {
    // (laid out by RDKit's ETKDG and MMFF, hydrogens taken away: their methine carbons' angles sum to 322-347 degrees,
    // above the 338 that once told them - its bonds' lengths, each a single bond's, tell them now)
    const methines: Record<string, { atoms: [string, number, number, number][]; bonds: [number, number][] }> = {
    "CHI3": { atoms: [["I", 1.958, -0.109, -0.546], ["C", 0.002, -0.005, 0.243], ["I", -0.881, 1.771, -0.481], ["I", -1.090, -1.627, -0.554]], bonds: [[0, 1], [1, 2], [1, 3]] },
    "HC(CCl3)3": { atoms: [["Cl", -1.527, 2.434, -0.424], ["C", -0.175, 1.471, 0.340], ["Cl", 1.228, 2.594, 0.082], ["Cl", -0.446, 1.459, 2.116], ["C", -0.070, 0.053, -0.321], ["C", -1.169, -0.957, 0.159], ["Cl", -2.816, -0.268, 0.493], ["Cl", -1.563, -2.152, -1.168], ["Cl", -0.745, -1.894, 1.632], ["C", 1.381, -0.542, -0.328], ["Cl", 1.541, -2.291, -0.786], ["Cl", 2.388, 0.246, -1.635], ["Cl", 2.273, -0.379, 1.223]], bonds: [[0, 1], [1, 2], [1, 3], [1, 4], [4, 5], [5, 6], [5, 7], [5, 8], [4, 9], [9, 10], [9, 11], [9, 12]] },
    "HC(C6F5)3": { atoms: [["F", 5.444, 1.124, -0.573], ["C", 4.167, 0.823, -0.303], ["C", 3.594, 1.226, 0.892], ["F", 4.314, 1.923, 1.782], ["C", 2.266, 0.909, 1.169], ["F", 1.726, 1.321, 2.325], ["C", 1.478, 0.180, 0.264], ["C", 0.022, -0.115, 0.621], ["C", -0.919, 1.084, 0.517], ["C", -2.035, 1.149, 1.366], ["F", -2.243, 0.163, 2.252], ["C", -2.940, 2.206, 1.306], ["F", -3.993, 2.232, 2.135], ["C", -2.752, 3.226, 0.388], ["F", -3.619, 4.246, 0.328], ["C", -1.664, 3.185, -0.471], ["F", -1.477, 4.167, -1.363], ["C", -0.761, 2.124, -0.409], ["F", 0.270, 2.115, -1.266], ["C", -0.530, -1.416, 0.040], ["C", -1.405, -1.474, -1.053], ["F", -1.820, -0.348, -1.648], ["C", -1.862, -2.694, -1.553], ["F", -2.705, -2.712, -2.594], ["C", -1.446, -3.884, -0.976], ["F", -1.886, -5.055, -1.457], ["C", -0.572, -3.858, 0.098], ["F", -0.158, -5.002, 0.658], ["C", -0.120, -2.638, 0.597], ["F", 0.738, -2.634, 1.628], ["C", 2.081, -0.204, -0.942], ["F", 1.381, -0.883, -1.861], ["C", 3.411, 0.110, -1.221], ["F", 3.957, -0.281, -2.380]], bonds: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [4, 6], [6, 7], [7, 8], [8, 9], [9, 10], [9, 11], [11, 12], [11, 13], [13, 14], [13, 15], [15, 16], [15, 17], [17, 18], [7, 19], [19, 20], [20, 21], [20, 22], [22, 23], [22, 24], [24, 25], [24, 26], [26, 27], [26, 28], [28, 29], [6, 30], [30, 31], [30, 32], [32, 33], [32, 1], [17, 8], [28, 19]] },
    "tri-tert-butylmethane": { atoms: [["C", 2.238, -0.347, -0.858], ["C", 1.395, -0.707, 0.382], ["C", 2.194, -0.288, 1.654], ["C", 1.410, -2.253, 0.476], ["C", -0.111, -0.045, 0.374], ["C", -0.173, 1.590, 0.190], ["C", -1.441, 2.191, 0.870], ["C", -0.150, 2.050, -1.281], ["C", 0.975, 2.353, 0.896], ["C", -1.264, -0.899, -0.431], ["C", -1.591, -2.239, 0.297], ["C", -2.648, -0.206, -0.486], ["C", -0.891, -1.222, -1.892]], bonds: [[0, 1], [1, 2], [1, 3], [1, 4], [4, 5], [5, 6], [5, 7], [5, 8], [4, 9], [9, 10], [9, 11], [9, 12]] },
    };
    for (const [name, m] of Object.entries(methines)) {
      const atoms = m.atoms.map(([el, x, y, z]) => ({ el, x, y, z }));
      expect([name, lacksHydrogens(atoms, m.bonds.map(([a1, a2]) => ({ a1, a2, order: 1 })), true)]).toEqual([name, true]);
    }
  });

  it("is hydrogen cyanide's heavy atoms - which are a cyanide ion's too: which, they do not say", () => {
    const hcn = fromCoordinates([["C", 0, 0, 0], ["N", 1.15, 0, 0]], reach);
    expect(lacksHydrogens(hcn.atoms, hcn.bonds, true)).toBe(true);
    // (a metal's cyanide is whole: its carbon between the metal and the nitrogen, in a line)
    const bound = fromCoordinates([["Fe", -1.9, 0, 0], ["C", 0, 0, 0], ["N", 1.15, 0, 0]], () => 2.0);
    expect(lacksHydrogens(bound.atoms, bound.bonds.filter((b) => !(b.a1 === 0 && b.a2 === 2)), true)).toBe(false);
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
