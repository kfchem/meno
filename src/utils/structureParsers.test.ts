import { describe, expect, it } from "vitest";
import { atomsTogether, bondedPairs, bondsByDistance, bondRadii, BOND_REACH, parseSDF, parseXYZ } from "./structureParsers";
import samplePdbText from "../samples/cholesterol.pdb?raw";
import { readStructures } from "../lib/io/structures";
import sampleXyz from "../samples/cholesterol.xyz?raw";
import { measured } from "../testing/timeouts";

describe("parseXYZ", () => {
  it("parses the sample and infers bonds", () => {
    const frames = parseXYZ(sampleXyz);
    expect(frames).toHaveLength(1);
    expect(frames[0].atoms).toHaveLength(74);
    expect(frames[0].bonds.length).toBeGreaterThan(0);
  });

  it("parses multiple frames", () => {
    const frame = "2\ncomment\nC 0 0 0\nC 1.54 0 0";
    const frames = parseXYZ(`${frame}\n${frame}`);
    expect(frames).toHaveLength(2);
    expect(frames[1].bonds).toEqual([{ a1: 0, a2: 1, order: 1 }]);
  });

  it("reads an element in any case, or as its atomic number - so its bonds are found by its own radius", () => {
    // (C-Cl 1.75 A: bonded; Cl-Cl 3.2 A apart, which a radius not known - 1.5 A each - would bond)
    for (const [c, cl] of [["C", "CL"], ["c", "cl"], ["6", "17"]]) {
      const [m] = parseXYZ(`3\n\n${c} 0 0 0\n${cl} 1.75 0 0\n${cl} -1.45 0 0`);
      expect(m.atoms.map((a) => a.el)).toEqual(["C", "Cl", "Cl"]);
      expect(m.bonds).toEqual([
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ]);
    }
    // (what is neither is left as it is)
    expect(parseXYZ("1\n\nQq 0 0 0")[0].atoms[0].el).toBe("Qq");
  });

  it("stops at a line that gives no count of atoms - what follows not read (a frame left out, said)", () => {
    const frame = "2\ncomment\nC 0 0 0\nC 1.54 0 0";
    expect(parseXYZ(`${frame}\n${frame}\nEND`)).toHaveLength(2);
  });
});

describe("parseXYZ, on a file as it may be left", () => {
  const frame = (z: string) => `2\nE = -1.0\nC 0 0 0\nC 1.54 0 ${z}`;

  it("leaves out a frame the file ends in the middle of, but for the first", () => {
    expect(parseXYZ(`${frame("0")}\n${frame("0")}\n2\nE = -1.0\nC 0 0 0`)).toHaveLength(2);
    expect(() => parseXYZ("3\nwater\nO 0 0 0\nH 0.76 0.59 0")).toThrow("The XYZ file could not be read: its first frame ends before its atoms do (it says 3, and gives 2).");
  });

  it("reads no place that is not a number - Fortran's D exponent, nan, infinity, a missing one - and says which line", () => {
    expect(parseXYZ(frame("1.5e-1"))[0].atoms[1].z).toBe(0.15);
    expect(() => parseXYZ(frame("1.19D-01"))).toThrow('The XYZ file could not be read: line 4 gives C a place that is not a number: "1.19D-01".');
    for (const z of ["nan", "Infinity", "0x10"]) expect(() => parseXYZ(frame(z))).toThrow(/could not be read: line 4 .* not a number/);
    expect(() => parseXYZ("2\nc\nC 0 0 0\nC 1.54 0")).toThrow('The XYZ file could not be read: line 4 gives C a place that is not a number: "".');
  });
});

describe("bondsByDistance", () => {
  it("finds the same bonds, in the same order, cube by cube in a big structure as pair by pair", () => {
    // (a lattice of carbons, oxygens and hydrogens 1 to 1.6 apart, shaken)
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const els = ["C", "O", "H", "N", "S"];
    const atoms = Array.from({ length: 1200 }, (_, i) => ({
      el: els[i % els.length],
      x: (i % 12) * 1.3 + rand() * 0.4 - 50,
      y: (Math.floor(i / 12) % 10) * 1.3 + rand() * 0.4,
      z: Math.floor(i / 120) * 1.3 + rand() * 0.4,
    }));
    const byPairs: { a1: number; a2: number; order: number }[] = [];
    for (let m = 0; m < atoms.length; m++) {
      for (let n = m + 1; n < atoms.length; n++) {
        if (bondsByDistance([atoms[m], atoms[n]]).length) byPairs.push({ a1: m, a2: n, order: 1 });
      }
    }
    const found = bondsByDistance(atoms);
    expect(found.length).toBeGreaterThan(1000);
    expect(found).toEqual(byPairs);
  }, measured(450));
});

describe("parseSDF", () => {
  it("reads V2000 bond stereo codes", () => {
    const mol = [
      "wedge",
      "",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0",
      "    1.0000    0.0000    0.0000 O   0  0",
      "  1  2  1  6",
      "M  END",
    ].join("\n");
    const [m] = parseSDF(mol);
    expect(m.atoms.map((a) => a.el)).toEqual(["C", "O"]);
    expect(m.bonds[0]).toEqual({ a1: 0, a2: 1, order: 1, stereoCode: 6 });
  });

  it("splits multi-record SDF on $$$$", () => {
    const rec = [
      "r",
      "",
      "",
      "  1  0  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 N   0  0",
      "M  END",
    ].join("\n");
    expect(parseSDF(`${rec}\n$$$$\n${rec}\n$$$$\n`)).toHaveLength(2);
  });

  it("reads V3000 atoms, bonds and CFG stereo", () => {
    const mol = [
      "v3000",
      "",
      "",
      "  0  0  0     0  0            999 V3000",
      "M  V30 BEGIN CTAB",
      "M  V30 COUNTS 2 1 0 0 0",
      "M  V30 BEGIN ATOM",
      "M  V30 1 C 0 0 0 0",
      "M  V30 2 Cl 1.5 0 0 0",
      "M  V30 END ATOM",
      "M  V30 BEGIN BOND",
      "M  V30 1 1 1 2 CFG=1",
      "M  V30 END BOND",
      "M  V30 END CTAB",
      "M  END",
    ].join("\n");
    const [m] = parseSDF(mol);
    expect(m.atoms.map((a) => a.el)).toEqual(["C", "Cl"]);
    expect(m.bonds).toEqual([{ a1: 0, a2: 1, order: 1, stereoCode: 1 }]);
  });

  it("reads charges, radicals and isotopes from a V2000 block", () => {
    const mol = [
      "nitromethane, a methyl radical's 13C, and an ammonium",
      "",
      "",
      "  6  3  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 N   0  0  0  0  0  0",
      "    2.2500    1.3000    0.0000 O   0  0  0  0  0  0",
      "    2.2500   -1.3000    0.0000 O   0  0  0  0  0  0",
      "    5.0000    0.0000    0.0000 C   0  0  0  0  0  0",
      "    8.0000    0.0000    0.0000 N   0  0  3  0  0  0",
      "  1  2  1  0",
      "  2  3  2  0",
      "  2  4  1  0",
      "M  CHG  2   2   1   4  -1",
      "M  RAD  1   5   2",
      "M  ISO  1   5  13",
      "M  END",
    ].join("\n");
    const [m] = parseSDF(mol);
    expect(m.atoms.map((a) => [a.el, a.charge, a.radical, a.isotope])).toEqual([
      ["C", undefined, undefined, undefined],
      ["N", 1, undefined, undefined],
      ["O", undefined, undefined, undefined],
      ["O", -1, undefined, undefined],
      ["C", undefined, "doublet", 13],
      // (a CHG line clears the atom block's charges, by the format)
      ["N", undefined, undefined, undefined],
    ]);
  });

  it("reads the atom block's charge field where there are no CHG lines", () => {
    const mol = [
      "ammonium",
      "",
      "",
      "  1  0  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 N   0  3  0  0  0  0",
      "M  END",
    ].join("\n");
    // (the charge field follows the mass difference: 3 is +1)
    expect(parseSDF(mol)[0].atoms[0].charge).toBe(1);
    expect(parseSDF(mol.replace("N   0  3  0", "N   0  5  0"))[0].atoms[0].charge).toBe(-1);
    expect(parseSDF(mol.replace("N   0  3  0", "N   0  4  0"))[0].atoms[0].radical).toBe("doublet");
  });

  it("reads charges, radicals and isotopes from a V3000 block", () => {
    const mol = [
      "",
      "  RDKit          2D",
      "",
      "  0  0  0     0  0  0  0  0  0999 V3000",
      "M  V30 BEGIN CTAB",
      "M  V30 COUNTS 3 2 0 0 0",
      "M  V30 BEGIN ATOM",
      "M  V30 1 C 0 0 0 0 MASS=13 RAD=2",
      "M  V30 2 N 1.5 0 0 0 CHG=1",
      "M  V30 3 O 2.25 1.3 0 0 CHG=-1",
      "M  V30 END ATOM",
      "M  V30 BEGIN BOND",
      "M  V30 1 1 1 2",
      "M  V30 2 1 2 3",
      "M  V30 END BOND",
      "M  V30 END CTAB",
      "M  END",
    ].join("\n");
    const [m] = parseSDF(mol);
    expect(m.atoms.map((a) => [a.el, a.charge, a.radical, a.isotope])).toEqual([
      ["C", undefined, "doublet", 13],
      ["N", 1, undefined, undefined],
      ["O", -1, undefined, undefined],
    ]);
  });
});

describe("bonds by distance, at their edges", () => {
  // (peroxides laid out by ETKDG and MMFF in RDKit - O-O 1.46 to 1.47 A - and their bonds as RDKit has them: a tenth over the radii left out each O-O)
  const PEROXIDES = [
  { name: "tBuOOH", smiles: "CC(C)(C)OO", atoms: [["C", -0.5792, 0.0714, 1.3769], ["C", -0.0475, -0.1556, -0.0419], ["C", 0.5649, 1.1239, -0.6210], ["C", -1.1963, -0.6200, -0.9445], ["O", 0.9157, -1.2252, -0.0531], ["O", 2.0315, -0.8305, 0.7977], ["H", -0.9511, -0.8652, 1.8073], ["H", -1.3906, 0.8068, 1.3878], ["H", 0.2088, 0.4318, 2.0471], ["H", -0.1839, 1.9168, -0.7211], ["H", 1.0051, 0.9328, -1.6062], ["H", 1.3729, 1.5040, 0.0136], ["H", -0.8359, -0.8267, -1.9590], ["H", -1.6293, -1.5563, -0.5738], ["H", -1.9927, 0.1291, -1.0062], ["H", 2.7075, -0.8371, 0.0965]], bonds: "0-1 0-6 0-7 0-8 1-2 1-3 1-4 2-9 2-10 2-11 3-12 3-13 3-14 4-5 5-15" },
  { name: "DTBP", smiles: "CC(C)(C)OOC(C)(C)C", atoms: [["C", -2.3196, -1.8001, 0.6806], ["C", -1.7003, -0.4596, 0.2688], ["C", -1.7322, -0.3374, -1.2580], ["C", -2.4758, 0.6813, 0.9356], ["O", -0.3464, -0.4923, 0.7506], ["O", 0.2850, 0.7718, 0.3783], ["C", 1.6875, 0.5179, 0.1915], ["C", 1.9128, -0.4851, -0.9444], ["C", 2.3196, 0.0302, 1.4992], ["C", 2.3051, 1.8663, -0.1963], ["H", -1.7590, -2.6372, 0.2484], ["H", -2.2794, -1.9305, 1.7683], ["H", -3.3637, -1.8807, 0.3607], ["H", -2.7548, -0.4068, -1.6437], ["H", -1.3115, 0.6169, -1.5929], ["H", -1.1309, -1.1258, -1.7242], ["H", -2.0803, 1.6597, 0.6416], ["H", -2.3894, 0.6245, 2.0266], ["H", -3.5373, 0.6547, 0.6677], ["H", 1.4119, -0.1541, -1.8609], ["H", 1.4986, -1.4690, -0.6988], ["H", 2.9790, -0.6142, -1.1587], ["H", 3.4071, -0.0617, 1.4090], ["H", 2.0943, 0.7195, 2.3208], ["H", 1.9240, -0.9477, 1.7948], ["H", 2.1291, 2.6149, 0.5849], ["H", 1.8422, 2.2584, -1.1094], ["H", 3.3845, 1.7862, -0.3622]], bonds: "0-1 0-10 0-11 0-12 1-2 1-3 1-4 2-13 2-14 2-15 3-16 3-17 3-18 4-5 5-6 6-7 6-8 6-9 7-19 7-20 7-21 8-22 8-23 8-24 9-25 9-26 9-27" },
  { name: "BPO", smiles: "O=C(OOC(=O)c1ccccc1)c1ccccc1", atoms: [["O", 0.7788, 0.1416, -1.7173], ["C", 1.3088, -0.3175, -0.7157], ["O", 0.6897, -1.0172, 0.2746], ["O", -0.7408, -1.0175, -0.0387], ["C", -1.3189, -0.0804, 0.7621], ["O", -0.7611, 0.5683, 1.6356], ["C", -2.7683, 0.0362, 0.4511], ["C", -3.3404, -0.5312, -0.6963], ["C", -4.7086, -0.3879, -0.9405], ["C", -5.5089, 0.3221, -0.0459], ["C", -4.9453, 0.8949, 1.0933], ["C", -3.5785, 0.7550, 1.3413], ["C", 2.7640, -0.2050, -0.4314], ["C", 3.6035, 0.2513, -1.4574], ["C", 4.9770, 0.3761, -1.2403], ["C", 5.5183, 0.0505, 0.0025], ["C", 4.6892, -0.3968, 1.0308], ["C", 3.3142, -0.5240, 0.8181], ["H", -2.7358, -1.0773, -1.4167], ["H", -5.1495, -0.8267, -1.8326], ["H", -6.5731, 0.4337, -0.2399], ["H", -5.5688, 1.4530, 1.7876], ["H", -3.1477, 1.2096, 2.2317], ["H", 3.1903, 0.5121, -2.4303], ["H", 5.6232, 0.7300, -2.0400], ["H", 6.5879, 0.1505, 0.1718], ["H", 5.1132, -0.6423, 2.0017], ["H", 2.6876, -0.8612, 1.6406]], bonds: "0-1 1-2 1-12 2-3 3-4 4-5 4-6 6-7 6-11 7-8 7-18 8-9 8-19 9-10 9-20 10-11 10-21 11-22 12-13 12-17 13-14 13-23 14-15 14-24 15-16 15-25 16-17 16-26 17-27" },
  { name: "mCPBA", smiles: "OOC(=O)c1cccc(Cl)c1", atoms: [["O", 3.8097, 1.0264, 0.2403], ["O", 2.3441, 1.1468, 0.1352], ["C", 1.8325, -0.1028, -0.0560], ["O", 2.5161, -1.0933, -0.2719], ["C", 0.3482, -0.0959, -0.0103], ["C", -0.3227, -1.3053, -0.2468], ["C", -1.7175, -1.3566, -0.2154], ["C", -2.4489, -0.2003, 0.0532], ["C", -1.7831, 1.0018, 0.2900], ["Cl", -2.6915, 2.4253, 0.6221], ["C", -0.3898, 1.0635, 0.2611], ["H", 3.9270, 0.2313, -0.3209], ["H", 0.2395, -2.2147, -0.4562], ["H", -2.2324, -2.2970, -0.3995], ["H", -3.5352, -0.2423, 0.0775], ["H", 0.1038, 2.0131, 0.4519]], bonds: "0-1 0-11 1-2 2-3 2-4 4-5 4-10 5-6 5-12 6-7 6-13 7-8 7-14 8-9 8-10 10-15" },
  { name: "artemisinin", smiles: "C[C@@H]1CC[C@H]2[C@@H](C)C(=O)O[C@@H]3O[C@@]4(C)CC[C@@H]1[C@]32OO4", atoms: [["C", -1.6745, -3.0626, -0.0339], ["C", -1.0137, -1.7903, -0.5862], ["C", 0.4109, -2.1070, -1.0679], ["C", 1.4790, -1.9002, -0.0052], ["C", 1.4161, -0.5393, 0.7172], ["C", 2.6574, 0.3502, 0.5334], ["C", 3.9489, -0.3293, 0.9975], ["C", 2.7582, 0.8237, -0.8934], ["O", 3.8199, 0.8712, -1.5055], ["O", 1.6169, 1.2458, -1.4680], ["C", 0.2894, 1.0611, -0.9333], ["O", -0.3372, 2.3385, -0.8721], ["C", -1.4474, 2.3648, 0.0186], ["C", -1.9919, 3.7907, -0.0335], ["C", -2.5349, 1.3569, -0.3983], ["C", -2.4667, 0.0531, 0.4049], ["C", -1.0847, -0.6413, 0.4652], ["C", 0.1562, 0.2986, 0.4059], ["O", 0.1274, 1.2971, 1.4554], ["O", -1.0996, 2.0964, 1.3837], ["H", -1.1256, -3.4520, 0.8302], ["H", -2.7063, -2.8746, 0.2782], ["H", -1.7011, -3.8477, -0.7973], ["H", -1.5885, -1.4984, -1.4758], ["H", 0.4694, -3.1350, -1.4470], ["H", 0.6526, -1.4778, -1.9323], ["H", 2.4565, -2.0725, -0.4660], ["H", 1.3673, -2.6909, 0.7486], ["H", 1.3893, -0.7745, 1.7933], ["H", 2.5576, 1.2572, 1.1443], ["H", 3.8408, -0.7240, 2.0130], ["H", 4.7743, 0.3918, 1.0086], ["H", 4.2540, -1.1473, 0.3379], ["H", -0.2267, 0.5171, -1.7286], ["H", -1.2159, 4.5057, 0.2646], ["H", -2.8333, 3.9259, 0.6546], ["H", -2.3079, 4.0597, -1.0471], ["H", -2.4859, 1.1473, -1.4732], ["H", -3.5299, 1.7820, -0.2125], ["H", -2.7789, 0.2734, 1.4356], ["H", -3.2348, -0.6315, 0.0260], ["H", -1.0565, -1.1121, 1.4604]], bonds: "0-1 0-20 0-21 0-22 1-2 1-16 1-23 2-3 2-24 2-25 3-4 3-26 3-27 4-5 4-17 4-28 5-6 5-7 5-29 6-30 6-31 6-32 7-8 7-9 9-10 10-11 10-17 10-33 11-12 12-13 12-14 12-19 13-34 13-35 13-36 14-15 14-37 14-38 15-16 15-39 15-40 16-17 16-41 17-18 18-19" },

  ];
  for (const p of PEROXIDES)
    it(`bonds ${p.name}'s O-O, and exactly its bonds`, () => {
      const atoms = p.atoms.map(([el, x, y, z]) => ({ el: el as string, x: x as number, y: y as number, z: z as number }));
      expect(bondsByDistance(atoms).map((b) => `${b.a1}-${b.a2}`).join(" ")).toBe(p.bonds);
    });


  it("bonds H2 (0.741 A), and no bond of cholesterol's that its radii's fifth over does not", () => {
    expect(bondsByDistance([{ el: "H", x: 0, y: 0, z: 0 }, { el: "H", x: 0.741, y: 0, z: 0 }])).toEqual([{ a1: 0, a2: 1, order: 1 }]);
    // (cholesterol from its XYZ and its PDB: the same bonds as the radii's fifth over gives, worked out pair by pair here)
    for (const kind of ["xyz", "pdb"] as const) {
      const atoms = readStructures(kind, `c.${kind}`, kind === "xyz" ? sampleXyz : samplePdbText).molecules3d![0].atoms;
      const r = bondRadii(atoms.map((a) => a.el));
      const tenth: string[] = [];
      for (let m = 0; m < atoms.length; m++)
        for (let n = m + 1; n < atoms.length; n++) {
          const d = Math.hypot(atoms[m].x - atoms[n].x, atoms[m].y - atoms[n].y, atoms[m].z - atoms[n].z);
          if (d < (r[m] + r[n]) * BOND_REACH) tenth.push(`${m} ${n}`);
        }
      expect(bondsByDistance(atoms).map((b) => `${b.a1} ${b.a2}`)).toEqual(tenth);
    }
  });

  it("finds no bond between atoms in one place - two thousand of them in a damaged file, each pair tried once at most - and counts them", () => {
    const together = Array.from({ length: 2000 }, () => ({ el: "C", x: 0, y: 0, z: 0 }));
    expect(bondsByDistance(together)).toEqual([]);
    // (how many times their places are read, four hundred of them: six for
    // each pair tried - all in one cube, every pair is - and a few for each
    // atom's cube; counted, not timed, so that a busy machine fails nothing)
    const n = 400;
    const seen = counted(new Float64Array(3 * n));
    expect(bondedPairs(seen.list, bondRadii(together.slice(0, n).map((a) => a.el)))).toEqual([]);
    expect(seen.reads()).toBeLessThanOrEqual((6 * n * (n - 1)) / 2 + 12 * n);
    expect(atomsTogether(together.flatMap((a) => [a.x, a.y, a.z]))).toBe(1999);
    // (none in one place in a molecule; two 0.05 A apart are)
    expect(atomsTogether([0, 0, 0, 1.54, 0, 0, 3, 0, 0])).toBe(0);
    expect(atomsTogether([0, 0, 0, 0.05, 0, 0, 3, 0, 0])).toBe(1);
  });
});

/** `xs` read through a count of the times one of them is read by its place - how much of a list a function looks at. */
function counted<T extends ArrayLike<number>>(xs: T): { list: T; reads: () => number } {
  let n = 0;
  const list = new Proxy(xs, {
    get(target, key) {
      if (typeof key === "string" && /^\d+$/.test(key)) n++;
      const v = Reflect.get(target, key);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { list, reads: () => n };
}
