import { describe, expect, it } from "vitest";
import { atomsTogether, bondedPairs, bondsByDistance, bondRadii, parseSDF, parseXYZ } from "./structureParsers";
import samplePdbText from "../samples/cholesterol.pdb?raw";
import { readStructures } from "../lib/io/structures";
import sampleXyz from "../samples/cholesterol.xyz?raw";

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

  it("stops at a line that gives no count of atoms", () => {
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
  });
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
  it("bonds H2 (0.741 A, beyond its radii's tenth over), and no bond of cholesterol's that its radii's tenth over does not", () => {
    expect(bondsByDistance([{ el: "H", x: 0, y: 0, z: 0 }, { el: "H", x: 0.741, y: 0, z: 0 }])).toEqual([{ a1: 0, a2: 1, order: 1 }]);
    // (cholesterol from its XYZ and its PDB: the same bonds as the radii's tenth over gives, worked out pair by pair here)
    for (const kind of ["xyz", "pdb"] as const) {
      const atoms = readStructures(kind, `c.${kind}`, kind === "xyz" ? sampleXyz : samplePdbText).molecules3d![0].atoms;
      const r = bondRadii(atoms.map((a) => a.el));
      const tenth: string[] = [];
      for (let m = 0; m < atoms.length; m++)
        for (let n = m + 1; n < atoms.length; n++) {
          const d = Math.hypot(atoms[m].x - atoms[n].x, atoms[m].y - atoms[n].y, atoms[m].z - atoms[n].z);
          if (d < (r[m] + r[n]) * 1.1) tenth.push(`${m} ${n}`);
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
