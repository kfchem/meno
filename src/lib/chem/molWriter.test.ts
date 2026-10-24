import { readSDfile } from "./ctfile";
import { describe, expect, it } from "vitest";
import { overBonded, writeMolfile, writeMolfile3d, writeRxnfile, writeSdf, MOL_BOND_LENGTH, type Atom3D, type Bond3D, type WriterModel } from "./molWriter";
import { readMolfile, readRxnfile } from "./ctfile";
import { NOMINAL_BOND_LENGTH } from "./acs";
import {
  moleculesToEditorModel,
  readMoleculesFromText,
} from "../../utils/importers";

const L = NOMINAL_BOND_LENGTH;

// a stereocentre carrying a wedge, a hashed wedge and a wavy bond, a double
// bond, an O, and a wedge drawn the other way round (narrow at the end atom)
const model: WriterModel = {
  atoms: [
    { id: 10, x: 0, y: 0, el: "C" },
    { id: 11, x: L, y: 0, el: "C" },
    { id: 12, x: -L / 2, y: L * 0.866, el: "C" },
    { id: 13, x: -L / 2, y: -L * 0.866, el: "O" },
    { id: 14, x: 2 * L, y: 0, el: "C" },
    { id: 15, x: 2.5 * L, y: L * 0.866, el: "C" },
    { id: 16, x: 3 * L, y: 0, el: "C" },
  ],
  bonds: [
    { a: 10, b: 11, order: 1, stereo: "up" },
    { a: 10, b: 12, order: 1, stereo: "down" },
    { a: 10, b: 13, order: 1, stereo: "wavy" },
    { a: 11, b: 14, order: 2 },
    { a: 14, b: 15, order: 1, stereo: "up", stereoOrient: "reverse" },
    { a: 14, b: 16, order: 1 },
  ],
};

const reread = (text: string) =>
  moleculesToEditorModel(readMoleculesFromText(text, "mol")).model;

describe("writeMolfile", () => {
  it("writes a V2000 file with a line per atom and bond", () => {
    const mol = writeMolfile(model, { title: "test" });
    const lines = mol.split("\n");
    expect(lines[0]).toBe("test");
    expect(lines[3]).toMatch(/^ {2}7 {2}6( {2}0){8}999 V2000$/);
    expect(lines[4]).toMatch(/^ {4}0\.0000 {4}0\.0000 {4}0\.0000 C {3}0 {2}0/);
    expect(mol).toContain("M  END");
  });

  it("scales the nominal bond to 1.5 Å", () => {
    const lines = writeMolfile(model).split("\n");
    const x = Number(lines[5].slice(0, 10));
    expect(x).toBeCloseTo(MOL_BOND_LENGTH, 4);
  });

  it("puts each wedge's narrow end first, as the drawing has it", () => {
    const lines = writeMolfile(model).split("\n");
    const bond = (k: number) => lines[4 + 7 + k];
    // the stereocentre (atom 1) first, flag 1 for a wedge, 6 hashed, 4 wavy
    expect(bond(0)).toBe("  1  2  1  1  0  0  0");
    expect(bond(1)).toBe("  1  3  1  6  0  0  0");
    expect(bond(2)).toBe("  1  4  1  4  0  0  0");
    expect(bond(3)).toBe("  2  5  2  0  0  0  0");
    // drawn the other way round: its narrow end is atom 6, the end atom
    expect(bond(4)).toBe("  6  5  1  1  0  0  0");
  });

  it("reads back as the same drawing", () => {
    const back = reread(writeMolfile(model));
    expect(back.atoms.map((a) => a.el)).toEqual(model.atoms.map((a) => a.el));
    const byIndex = (m: { atoms: { id: number }[] }, id: number) =>
      m.atoms.findIndex((a) => a.id === id);
    const summary = (m: { atoms: { id: number }[]; bonds: any[] }) =>
      m.bonds.map((b) => ({
        pair: [byIndex(m, b.a), byIndex(m, b.b)].sort(),
        order: b.order,
        stereo: b.stereo ?? "none",
      }));
    expect(summary(back)).toEqual(summary(model));
    // and where the wedge was drawn the other way round, it still is
    const flipped = back.bonds.find((b) => b.stereo === "up" && b.order === 1 && byIndex(back, b.a) !== 0)!;
    const narrowFirst = byIndex(back, flipped.a);
    expect(narrowFirst).toBe(5);
    expect(flipped.stereoOrient).toBe("reverse");
    // the shape is kept too: the same bond lengths once scaled back
    const d = (m: any, i: number, j: number) =>
      Math.hypot(m.atoms[i].x - m.atoms[j].x, m.atoms[i].y - m.atoms[j].y);
    expect(d(back, 0, 1) / d(back, 1, 4)).toBeCloseTo(d(model, 0, 1) / d(model, 1, 4), 6);
  });

  it("switches to V3000 for a dative bond, which V2000 cannot carry", () => {
    const dative: WriterModel = {
      atoms: [
        { id: 1, x: 0, y: 0, el: "N" },
        { id: 2, x: L, y: 0, el: "B" },
      ],
      bonds: [{ a: 1, b: 2, order: 1, dative: true }],
    };
    const mol = writeMolfile(dative);
    expect(mol).toContain("V3000");
    expect(mol).toContain("M  V30 1 9 1 2");
    const back = reread(mol);
    expect(back.bonds[0].dative).toBe(true);
  });

  it("writes V3000 on request, with wedges as CFG", () => {
    const mol = writeMolfile(model, { version: "V3000" });
    expect(mol).toContain("M  V30 COUNTS 7 6 0 0 0");
    expect(mol).toContain("M  V30 1 1 1 2 CFG=1");
    expect(mol).toContain("M  V30 2 1 1 3 CFG=3");
    expect(mol).toContain("M  V30 3 1 1 4 CFG=2");
    const back = reread(mol);
    expect(back.bonds.map((b) => b.stereo)).toEqual(["up", "down", "wavy", "none", "up", "none"]);
  });

  it("closes an SD file record", () => {
    expect(writeSdf(model).endsWith("M  END\n$$$$\n")).toBe(true);
  });
});

describe("charges, radicals and isotopes", () => {
  const charged: WriterModel = {
    atoms: [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: L, y: 0, el: "N", charge: 1 },
      { id: 3, x: 1.5 * L, y: L * 0.866, el: "O" },
      { id: 4, x: 1.5 * L, y: -L * 0.866, el: "O", charge: -1 },
      { id: 5, x: 4 * L, y: 0, el: "C", radical: "doublet", isotope: 13 },
      { id: 6, x: 6 * L, y: 0, el: "Fe", charge: 2 },
    ],
    bonds: [
      { a: 1, b: 2, order: 1 },
      { a: 2, b: 3, order: 2 },
      { a: 2, b: 4, order: 1 },
    ],
  };

  it("writes them as a V2000 block's property lines", () => {
    const text = writeMolfile(charged, { version: "V2000" });
    expect(text).toContain("M  CHG  3   2   1   4  -1   6   2");
    expect(text).toContain("M  RAD  1   5   2");
    expect(text).toContain("M  ISO  1   5  13");
  });

  it("writes them as a V3000 atom's properties", () => {
    const text = writeMolfile(charged, { version: "V3000" });
    expect(text).toContain("M  V30 2 N");
    expect(text).toMatch(/M {2}V30 2 N .* CHG=1\n/);
    expect(text).toMatch(/M {2}V30 5 C .* RAD=2 MASS=13\n/);
  });

  for (const version of ["V2000", "V3000"] as const) {
    it(`reads back what it writes, ${version}`, () => {
      const [m] = readMoleculesFromText(writeMolfile(charged, { version }), "mol");
      expect(m.atoms.map((a) => [a.el, a.charge, a.radical, a.isotope])).toEqual(
        charged.atoms.map((a) => [a.el, a.charge, a.radical, a.isotope]),
      );
      // and on into the editor
      const { model: editor } = moleculesToEditorModel([m]);
      expect(editor.atoms.map((a) => a.charge)).toEqual([undefined, 1, undefined, -1, undefined, 2]);
    });
  }
});

describe("bonds besides plain ones, through a file and back", () => {
  const atoms = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, x: i * L, y: 0, el: "C" }));
  // a V2000 block: a double bond of either configuration, the four query bonds
  const v2000 = [
    "",
    "  Meno",
    "",
    "  6  5  0  0  0  0  0  0  0  0999 V2000",
    ...Array.from({ length: 6 }, (_, i) => `${(i * 1.5).toFixed(4).padStart(10)}    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0`),
    "  1  2  2  3  0  0  0",
    "  2  3  5  0  0  0  0",
    "  3  4  6  0  0  0  0",
    "  4  5  7  0  0  0  0",
    "  5  6  8  0  0  0  0",
    "M  END",
  ].join("\n");

  it("reads them into the editor's bonds", () => {
    const { model } = moleculesToEditorModel(readMoleculesFromText(v2000, "mol"));
    expect(model.bonds.map((b) => [b.order, b.stereo, b.query])).toEqual([
      [2, "either", undefined],
      [1, "none", "single-or-double"],
      [1, "none", "single-or-aromatic"],
      [2, "none", "double-or-aromatic"],
      [1, "none", "any"],
    ]);
  });

  it("writes them as they were read", () => {
    const { model } = moleculesToEditorModel(readMoleculesFromText(v2000, "mol"));
    const out = writeMolfile(model);
    const bondLines = out.split("\n").slice(10, 15).map((l) => [l.slice(6, 9).trim(), l.slice(9, 12).trim()]);
    expect(bondLines).toEqual([
      ["2", "3"],
      ["5", "0"],
      ["6", "0"],
      ["7", "0"],
      ["8", "0"],
    ]);
  });

  it("reads and writes a hydrogen bond and a coordination bond shown plainly, in V3000", () => {
    const v3000 = [
      "",
      "  Meno",
      "",
      "  0  0  0     0  0            999 V3000",
      "M  V30 BEGIN CTAB",
      "M  V30 COUNTS 4 2 0 0 0",
      "M  V30 BEGIN ATOM",
      "M  V30 1 O 0 0 0 0",
      "M  V30 2 O 1.5 0 0 0",
      "M  V30 3 Cu 3 0 0 0",
      "M  V30 4 N 4.5 0 0 0",
      "M  V30 END ATOM",
      "M  V30 BEGIN BOND",
      "M  V30 1 10 1 2",
      "M  V30 2 9 3 4 DISP=COORD",
      "M  V30 END BOND",
      "M  V30 END CTAB",
      "M  END",
    ].join("\n");
    const { model } = moleculesToEditorModel(readMoleculesFromText(v3000, "mol"));
    expect(model.bonds.map((b) => [b.hydrogen, b.coordination, b.dative])).toEqual([
      [true, undefined, undefined],
      [undefined, true, undefined],
    ]);
    const out = writeMolfile(model);
    expect(out).toContain("V3000");
    expect(out).toMatch(/M {2}V30 1 10 1 2\n/);
    expect(out).toMatch(/M {2}V30 2 9 \d \d DISP=COORD\n/);
  });

  it("writes a double bond of either configuration as V3000's CFG=2", () => {
    const out = writeMolfile(
      { atoms: atoms(2), bonds: [{ a: 1, b: 2, order: 2, stereo: "either" }] },
      { version: "V3000" },
    );
    expect(out).toMatch(/M {2}V30 1 2 1 2 CFG=2\n/);
  });
});

describe("writeRxnfile", () => {
  const methane: WriterModel = { atoms: [{ id: 1, x: 0, y: 0, el: "C" }], bonds: [] };
  const ethanol: WriterModel = {
    atoms: [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: L, y: 0, el: "C" },
      { id: 3, x: 2 * L, y: 0, el: "O", map: 3 },
    ],
    bonds: [
      { a: 1, b: 2, order: 1 },
      { a: 2, b: 3, order: 1, reactingCentre: 4 },
    ],
  };
  const water: WriterModel = { atoms: [{ id: 7, x: 0, y: 0, el: "O" }], bonds: [] };

  it("writes V2000 as the format has it: header, counts, a MOL file for each molecule in order", () => {
    const text = writeRxnfile({ reactants: [ethanol, methane], products: [water], reagents: [methane] }, { title: "step 1" });
    const lines = text.split("\n");
    expect(lines.slice(0, 5)).toEqual(["$RXN", "step 1", "      Meno", "", "  2  1  1"]);
    expect(lines.filter((l) => l === "$MOL")).toHaveLength(4);
    expect(lines.filter((l) => l === "M  END")).toHaveLength(4);
    // each block a MOL file: its three header lines, then its counts
    const first = lines.indexOf("$MOL");
    expect(lines[first + 4]).toMatch(/^ {2}3 {2}2 .* V2000$/);
  });

  it("leaves the reagents' count out when there are none", () => {
    const text = writeRxnfile({ reactants: [ethanol], products: [water], reagents: [] });
    expect(text.split("\n")[4]).toBe("  1  1");
  });

  it("reads back as the reaction it was, V2000 and V3000 alike", () => {
    for (const version of ["V2000", "V3000"] as const) {
      const r = readRxnfile(writeRxnfile({ reactants: [ethanol, methane], products: [water], reagents: [methane] }, { version }));
      expect([r.reactants.length, r.products.length, r.reagents.length], version).toEqual([2, 1, 1]);
      expect(r.reactants[0].atoms.map((a) => a.symbol), version).toEqual(["C", "C", "O"]);
      expect(r.reactants[0].atoms[2].map, version).toBe(3);
      expect(r.reactants[0].bonds[1].reactingCentre, version).toBe(4);
      expect(r.products[0].atoms.map((a) => a.symbol), version).toEqual(["O"]);
      expect(r.reactants[0].version, version).toBe(version);
    }
  });

  it("is V3000 where a molecule cannot be written V2000, and V3000 as the format has it", () => {
    const bonded: WriterModel = {
      atoms: [
        { id: 1, x: 0, y: 0, el: "O" },
        { id: 2, x: L, y: 0, el: "H" },
      ],
      bonds: [{ a: 1, b: 2, order: 1, hydrogen: true }],
    };
    const text = writeRxnfile({ reactants: [bonded], products: [water], reagents: [] });
    const lines = text.split("\n");
    expect(lines[0]).toBe("$RXN V3000");
    expect(lines[4]).toBe("M  V30 COUNTS 1 1");
    expect(lines.filter((l) => l === "M  V30 BEGIN CTAB")).toHaveLength(2);
    expect(text).toMatch(/M {2}V30 BEGIN REACTANT\nM {2}V30 BEGIN CTAB\n/);
    expect(text).toMatch(/M {2}V30 END CTAB\nM {2}V30 END PRODUCT\nM {2}END\n$/);
    expect(text).not.toMatch(/REAGENT/);
    // one M  END, at the end
    expect(lines.filter((l) => l === "M  END")).toHaveLength(1);
    expect(readRxnfile(text).reactants[0].bonds[0].type).toBe(10);
  });
});

describe("a molecule in 3D as a molfile", () => {
  const ammonium = {
    atoms: [
      { el: "N", x: 0, y: 0, z: 0, charge: 1, isotope: 15 },
      { el: "H", x: 1.02, y: 0, z: 0 },
      { el: "H", x: -0.34, y: 0.96, z: 0 },
      { el: "H", x: -0.34, y: -0.48, z: 0.83 },
      { el: "H", x: -0.34, y: -0.48, z: -0.83 },
    ],
    bonds: [1, 2, 3, 4].map((i) => ({ a1: 0, a2: i, order: 1 })),
  };

  it("is written as before, in V2000, where V2000 holds it", () => {
    expect(writeMolfile3d(ammonium.atoms, ammonium.bonds, { title: "ammonium" })).toBe(
      [
        "ammonium",
        "  Meno              3D",
        "",
        "  5  4  0  0  0  0  0  0  0  0999 V2000",
        // (15N+: its mass difference 1 and charge code 3 in the atom block too, beside M  CHG and M  ISO - "CTfile Formats" p. 66)
        "    0.0000    0.0000    0.0000 N   1  3  0  0  0  0  0  0  0  0  0  0",
        "    1.0200    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0",
        "   -0.3400    0.9600    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0",
        "   -0.3400   -0.4800    0.8300 H   0  0  0  0  0  0  0  0  0  0  0  0",
        "   -0.3400   -0.4800   -0.8300 H   0  0  0  0  0  0  0  0  0  0  0  0",
        "  1  2  1  0  0  0  0",
        "  1  3  1  0  0  0  0",
        "  1  4  1  0  0  0  0",
        "  1  5  1  0  0  0  0",
        "M  CHG  1   1   1",
        "M  ISO  1   1  15",
        "M  END",
        "",
      ].join("\n"),
    );
  });

  it("is read with its charges, radicals and isotopes from the atom block alone, as an older reader reads it", () => {
    // ("CTfile Formats" (Chemistry 2026) p. 66: a writer writes values in the old range in both places)
    const atoms = [
      { el: "C", x: 0, y: 0, z: 0, isotope: 13 },
      { el: "N", x: 1.4, y: 0, z: 0, charge: 1 },
      { el: "O", x: 2.8, y: 0, z: 0, charge: -1 },
      { el: "C", x: 0, y: 1.4, z: 0, radical: "doublet" as const },
      { el: "Fe", x: 0, y: 3, z: 0, charge: 4 },
    ];
    const text = writeMolfile3d(atoms, [{ a1: 0, a2: 1, order: 1 }], { title: "old" });
    const bare = text.split("\n").filter((l) => !/^M {2}(CHG|ISO|RAD)/.test(l)).join("\n");
    const [m] = readSDfile(bare);
    expect(m.atoms.map((a) => [a.symbol, a.mass, a.charge, a.radical])).toEqual([
      ["C", 13, undefined, undefined],
      ["N", undefined, 1, undefined],
      ["O", undefined, -1, undefined],
      ["C", undefined, undefined, "doublet"],
      // (a charge of 4 is past the atom block's: in M  CHG alone)
      ["Fe", undefined, undefined, undefined],
    ]);
    // (and with the properties' lines, as before)
    expect(readSDfile(text)[0].atoms.map((a) => a.charge)).toEqual([undefined, 1, -1, undefined, 4]);
  });

  it("says it is 3D, and is read back where its atoms were, in depth", () => {
    const text = writeMolfile3d(ammonium.atoms, ammonium.bonds, { title: "ammonium" });
    const lines = text.split("\n");
    expect(lines[0]).toBe("ammonium");
    expect(lines[1].substring(20, 22)).toBe("3D");
    expect(text).toContain("M  CHG  1   1   1");
    expect(text).toContain("M  ISO  1   1  15");
    const [m] = readMoleculesFromText(text, "mol");
    expect(m.atoms[3].z).toBeCloseTo(0.83, 4);
    expect(m.atoms[0]).toMatchObject({ el: "N", charge: 1, isotope: 15 });
    expect(m.bonds).toHaveLength(4);
  });

  it("writes its radicals as the format codes them - M  RAD lines in V2000, RAD on the atoms in V3000 - and is read back with them", () => {
    // (a methyl radical, and a carbon-13 carbene beside it, a triplet)
    const atoms: Atom3D[] = [
      { el: "C", x: 0, y: 0, z: 0, radical: "doublet" },
      { el: "H", x: 1.08, y: 0, z: 0 },
      { el: "H", x: -0.54, y: 0.94, z: 0 },
      { el: "H", x: -0.54, y: -0.94, z: 0 },
      { el: "C", x: 4, y: 0, z: 0, radical: "triplet", isotope: 13 },
    ];
    const bonds: Bond3D[] = [1, 2, 3].map((i) => ({ a1: 0, a2: i, order: 1 }));
    const v2000 = writeMolfile3d(atoms, bonds);
    expect(v2000).toContain("M  RAD  2   1   2   5   3\nM  ISO  1   5  13\n");
    const v3000 = writeMolfile3d(atoms, bonds, { version: "V3000" });
    expect(v3000).toContain("M  V30 1 C 0.0000 0.0000 0.0000 0 RAD=2\n");
    expect(v3000).toContain("M  V30 5 C 4.0000 0.0000 0.0000 0 RAD=3 MASS=13\n");
    for (const text of [v2000, v3000]) {
      const [m] = readMoleculesFromText(text, "mol");
      expect(m.atoms.map((a) => a.radical)).toEqual(["doublet", undefined, undefined, undefined, "triplet"]);
    }
  });
});

describe("past what V2000 holds", () => {
  /**
   * A zigzag chain of `n` atoms in 3D, every tenth an N, the sixth charged
   * and the eighth a 13C, a bond between each and the next - every fourth a
   * double one.
   */
  const chain3d = (n: number): { atoms: Atom3D[]; bonds: Bond3D[] } => ({
    atoms: Array.from({ length: n }, (_, i) => ({
      el: i % 10 === 9 ? "N" : "C",
      x: 1.26 * i,
      y: i % 2 ? 0.44 : -0.44,
      z: (i % 3) * 0.1,
      ...(i === 5 ? { charge: -1 } : {}),
      ...(i === 7 ? { isotope: 13 } : {}),
    })),
    bonds: Array.from({ length: n - 1 }, (_, i) => ({ a1: i, a2: i + 1, order: i % 4 === 0 ? 2 : 1 })),
  });
  /** The same chain drawn flat, in the editor's units. */
  const chain2d = (n: number): WriterModel => ({
    atoms: Array.from({ length: n }, (_, i) => ({ id: i + 1, el: i % 10 === 9 ? "N" : "C", x: 0.866 * L * i, y: i % 2 ? L / 2 : 0 })),
    bonds: Array.from({ length: n - 1 }, (_, i) => ({ a: i + 1, b: i + 2, order: i % 4 === 0 ? 2 : 1 })),
  });

  it("writes a molecule in 3D in V2000 up to 999 atoms, and in V3000 past them", () => {
    const at999 = writeMolfile3d(chain3d(999).atoms, chain3d(999).bonds).split("\n");
    expect(at999[3]).toBe("999998  0  0  0  0  0  0  0  0999 V2000");
    for (const n of [1000, 1001]) {
      const { atoms, bonds } = chain3d(n);
      const lines = writeMolfile3d(atoms, bonds, { title: `C${n}` }).split("\n");
      expect(lines.slice(0, 6)).toEqual([
        `C${n}`,
        "  Meno              3D",
        "",
        "  0  0  0     0  0  0  0  0  0999 V3000",
        "M  V30 BEGIN CTAB",
        `M  V30 COUNTS ${n} ${n - 1} 0 0 0`,
      ]);
      expect(lines).toContain("M  V30 6 C 6.3000 0.4400 0.2000 0 CHG=-1");
      expect(lines).toContain("M  V30 8 C 8.8200 0.4400 0.1000 0 MASS=13");
      expect(lines).toContain(`M  V30 ${n - 1} 1 ${n - 1} ${n}`);
      expect(lines.slice(-4)).toEqual(["M  V30 END BOND", "M  V30 END CTAB", "M  END", ""]);
    }
  });

  it("writes V3000 past 999 bonds, though the atoms are fewer", () => {
    const ring = chain3d(999);
    ring.bonds.push({ a1: 998, a2: 0, order: 1 });
    expect(writeMolfile3d(ring.atoms, ring.bonds)).toContain("999999  0  0  0  0  0  0  0  0999 V2000");
    ring.bonds.push({ a1: 0, a2: 500, order: 1 });
    expect(writeMolfile3d(ring.atoms, ring.bonds)).toContain("M  V30 COUNTS 999 1000 0 0 0");
  });

  it("writes V3000 for a coordinate wider than V2000's field, a coordination or hydrogen bond, or where asked", () => {
    const pair = (x: number, order = 1): [Atom3D[], Bond3D[]] => [
      [
        { el: "Cu", x, y: 0, z: 0 },
        { el: "N", x: x + 2, y: 0, z: 0 },
      ],
      [{ a1: 0, a2: 1, order }],
    ];
    expect(writeMolfile3d(...pair(-9999.9))).toContain(" V2000\n");
    expect(writeMolfile3d(...pair(99997))).toContain(" V2000\n");
    expect(writeMolfile3d(...pair(-10000))).toContain("M  V30 1 Cu -10000.0000 0.0000 0.0000 0\n");
    expect(writeMolfile3d(...pair(99998))).toContain("M  V30 2 N 100000.0000 0.0000 0.0000 0\n");
    expect(writeMolfile3d(...pair(0, 9))).toContain("M  V30 1 9 1 2\n");
    expect(writeMolfile3d(...pair(0, 10))).toContain("M  V30 1 10 1 2\n");
    expect(writeMolfile3d(...pair(0), { version: "V3000" })).toContain("M  V30 1 1 1 2\n");
    expect(writeMolfile3d(...pair(0, 9), { version: "V2000" })).toContain(" V2000\n");
  });

  it("reads a molecule in 3D past 999 atoms back as it was written, in 3D", () => {
    const { atoms, bonds } = chain3d(1001);
    const text = writeMolfile3d(atoms, bonds, { title: "chain" });
    const ct = readMolfile(text)!;
    expect(ct.version).toBe("V3000");
    expect(ct.name).toBe("chain");
    // (to the four decimals written)
    const at = (v: number) => Math.round(v * 1e4);
    expect(ct.atoms.map((a) => [a.symbol, at(a.x), at(a.y), at(a.z)])).toEqual(atoms.map((a) => [a.el, at(a.x), at(a.y), at(a.z)]));
    expect(ct.bonds.map((b) => [b.a1, b.a2, b.type])).toEqual(bonds.map((b) => [b.a1, b.a2, b.order]));
    const [m] = readMoleculesFromText(text, "mol");
    expect(m.atoms[5]).toMatchObject({ el: "C", charge: -1 });
    expect(m.atoms[7]).toMatchObject({ el: "C", isotope: 13 });
    expect(m.atoms.filter((a) => a.charge || a.isotope)).toHaveLength(2);
    // (the header's second line says it is 3D, as V2000's does)
    expect(text.split("\n")[1].substring(20, 22)).toBe("3D");
  });

  it("writes a drawing in V2000 up to 999 atoms, and in V3000 past them, and reads it back", () => {
    expect(writeMolfile(chain2d(999)).split("\n")[3]).toBe("999998  0  0  0  0  0  0  0  0999 V2000");
    for (const n of [1000, 1001]) {
      const text = writeMolfile(chain2d(n));
      expect(text.split("\n")[3]).toBe("  0  0  0     0  0  0  0  0  0999 V3000");
      expect(text).toContain(`M  V30 COUNTS ${n} ${n - 1} 0 0 0`);
      const back = reread(text);
      expect(back.atoms).toHaveLength(n);
      expect(back.bonds).toHaveLength(n - 1);
      expect(back.atoms[9].el).toBe("N");
      expect(back.bonds.filter((b) => b.order === 2)).toHaveLength(Math.ceil((n - 1) / 4));
    }
  });

  it("writes a drawing in V3000 where a coordinate or a mapping number is wider than V2000's field", () => {
    const far = chain2d(3);
    far.atoms[2].x = (-10000 * L) / MOL_BOND_LENGTH;
    expect(writeMolfile(far)).toContain("M  V30 3 C -10000.0000 ");
    const mapped = chain2d(3);
    mapped.atoms[0].map = 999;
    expect(writeMolfile(mapped)).toContain(" V2000\n");
    mapped.atoms[0].map = 1000;
    expect(writeMolfile(mapped)).toContain("M  V30 1 C 0.0000 0.0000 0 1000\n");
    expect(readMolfile(writeMolfile(mapped))!.atoms[0].map).toBe(1000);
  });

  it("quotes a V3000 string holding a quote, as the format has it", () => {
    const labelled: WriterModel = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0 },
        { id: 2, el: "R'", x: L, y: 0 },
      ],
      bonds: [{ a: 1, b: 2, order: 1 }],
    };
    const text = writeMolfile(labelled, { version: "V3000" });
    expect(text).toContain(`LABEL="R'"`);
    expect(readMolfile(text)!.sgroups[0].label).toBe("R'");
  });

  it("quotes a V3000 string ending in \"-\", which would continue its line, and reads it back as it was", () => {
    // (written bare, a label Nu- at the end of its entry read back as "NuEND", the next line joined to it)
    const on = (label: string): WriterModel => ({ atoms: [{ id: 1, el: label, x: 0, y: 0 }, { id: 2, el: "C", x: L, y: 0 }], bonds: [{ a: 1, b: 2, order: 1 }] });
    for (const label of ["Nu-", "OTf-", "BF4-", "X-"]) {
      const text = writeMolfile(on(label), { version: "V3000" });
      expect(text).toContain(`LABEL="${label}"`);
      expect(reread(text).atoms.map((a) => a.el), label).toEqual([label, "C"]);
    }
    // (a counter-anion's label beside a complex, where Meno chooses V3000 itself for its coordination bond)
    const complex = writeMolfile({
      atoms: [{ id: 1, el: "Nu-", x: 0, y: 0 }, { id: 2, el: "Pd", x: L, y: 0 }, { id: 3, el: "N", x: 2 * L, y: 0 }],
      bonds: [{ a: 1, b: 2, order: 1 }, { a: 3, b: 2, order: 1, dative: true }],
    });
    expect(complex).toContain(" V3000\n");
    expect(reread(complex).atoms.map((a) => a.el)).toEqual(["Nu-", "Pd", "N"]);
    // (a data Sgroup's field name and data)
    const sign = writeMolfile({ atoms: [{ id: 1, el: "C", x: 0, y: 0, sgroups: [{ id: 9, type: "DAT", field: { name: "sign-", data: ["+/-"] } }] }], bonds: [] }, { version: "V3000" });
    expect(readMolfile(sign)!.sgroups[0].field).toMatchObject({ name: "sign-", data: ["+/-"] });
    // (an RXN file's molecule)
    const rxn = writeRxnfile({ reactants: [{ atoms: [{ id: 1, el: "Nu-", x: 0, y: 0 }], bonds: [] }], products: [{ atoms: [{ id: 2, el: "C", x: 0, y: 0 }], bonds: [] }], reagents: [] }, { version: "V3000" });
    expect(readRxnfile(rxn).reactants[0].sgroups[0].label).toBe("Nu-");
  });

  it("writes V3000 where V2000 would cut an atom list past sixteen symbols, a data field's name past 30 characters, its units past 20 or its data past 200, and reads them back whole", () => {
    const symbols = ["F", "Cl", "Br", "I", "O", "S", "Se", "Te", "N", "P", "As", "Sb", "B", "Si", "Ge", "Sn", "Pb"];
    const listed = (n: number): WriterModel => ({ atoms: [{ id: 1, el: "L", x: 0, y: 0, list: { not: false, symbols: symbols.slice(0, n) } }, { id: 2, el: "C", x: L, y: 0 }], bonds: [{ a: 1, b: 2, order: 1 }] });
    expect(writeMolfile(listed(16))).toContain(" V2000\n");
    expect(readMolfile(writeMolfile(listed(17)))!.atoms[0].list?.symbols).toEqual(symbols);
    const dat = (field: { name: string; data: string[]; units?: string; type?: string }): WriterModel => ({ atoms: [{ id: 1, el: "C", x: 0, y: 0, sgroups: [{ id: 9, type: "DAT", field }] }], bonds: [] });
    const name = "a field name longer than thirty characters";
    const data = "d".repeat(250);
    expect(readMolfile(writeMolfile(dat({ name, data: ["1"] })))!.sgroups[0].field).toMatchObject({ name, data: ["1"] });
    expect(readMolfile(writeMolfile(dat({ name: "note", data: [data] })))!.sgroups[0].field?.data).toEqual([data]);
    expect(writeMolfile(dat({ name: "note", data: ["d".repeat(200)] }))).toContain(" V2000\n");
    // (units past V2000's 20 columns too, and with units V3000 holds them all)
    const units = "milligrams per millilitre of solvent";
    expect(readMolfile(writeMolfile(dat({ name, data: ["1"], units })))!.sgroups[0].field).toMatchObject({ name, units });
    // (and with a type but text: V3000 holds it in FIELDINFO, so the name is whole and the type kept)
    expect(readMolfile(writeMolfile(dat({ name, data: ["1"], type: "N" })))!.sgroups[0].field).toMatchObject({ name, type: "N" });
  });

  it("writes a data Sgroup's units, type, display and query as it read them, V2000 and V3000, through the editor and back", () => {
    const display = "    1.0000    2.0000    DA    ALL  1       5";
    const field = { name: "MW", data: ["123.4"], units: "g/mol", type: "N", display, queryType: "mq", queryOp: "<" };
    const m: WriterModel = { atoms: [{ id: 1, el: "C", x: 0, y: 0, sgroups: [{ id: 9, type: "DAT", field }] }, { id: 2, el: "O", x: L, y: 0, sgroups: [{ id: 9, type: "DAT", field }] }], bonds: [{ a: 1, b: 2, order: 1 }] };
    // (written before, V3000 kept the name and data alone, and neither the display)
    const v2 = writeMolfile(m, { version: "V2000" });
    expect(v2).toContain(`M  SDD   1 ${display}\n`);
    expect(readMolfile(v2)!.sgroups[0].field).toEqual(field);
    const v3 = writeMolfile(m, { version: "V3000" });
    // (FIELDINFO as <type><units/format>: CTfile Formats, chapter 2, the V3000 Sgroup fields)
    expect(v3.replace(/-\nM {2}V30 /g, "")).toContain(`FIELDINFO="N g/mol" FIELDDISP="${display}"`);
    const v3000Field = field;
    expect(readMolfile(v3)!.sgroups[0].field).toEqual(v3000Field);
    // (opened in the editor - V2000's and V3000's alike - kept on its atoms, and written back again)
    const opened = (text: string) => reread(text).atoms[0].sgroups![0].field;
    expect(opened(v2)).toEqual(field);
    expect(opened(v3)).toEqual(v3000Field);
    const reopened = reread(v2);
    expect(readMolfile(writeMolfile(reopened, { version: "V2000" }))!.sgroups[0].field).toEqual(field);
    expect(readMolfile(writeMolfile(reopened, { version: "V3000" }))!.sgroups[0].field).toEqual(v3000Field);
    // (a V3000 file's own, opened and written as V2000: its FIELDINFO the type and units, its FIELDDISP the display)
    expect(opened(writeMolfile(reread(v3), { version: "V2000" }))).toEqual(field);
    // (a FIELDINFO that gives no type and units - another program's own - kept as it was, and written back)
    const own = 'M  V30 BEGIN SGROUP\nM  V30 1 DAT 0 ATOMS=(1 1) FIELDNAME=note FIELDINFO="seen by X" FIELDDATA=yes\nM  V30 END SGROUP\n';
    const v3own = v3.replace(/M {2}V30 BEGIN SGROUP[\s\S]*?M {2}V30 END SGROUP\n/, own);
    expect(readMolfile(v3own)!.sgroups[0].field).toEqual({ name: "note", data: ["yes"], info: "seen by X" });
    expect(writeMolfile(reread(v3own), { version: "V3000" }).replace(/-\nM {2}V30 /g, "")).toContain(`FIELDINFO="seen by X"`);
  });

  it("cuts a title at 80 characters, never within one", () => {
    // (a character of two UTF-16 units: an emoji's, or a rare CJK ideograph's)
    const two = "\u{1F9EA}";
    const title = "a".repeat(79) + two + "b";
    expect(writeMolfile(chain2d(2), { title }).split("\n")[0]).toBe("a".repeat(79) + two);
    expect(writeRxnfile({ reactants: [chain2d(2)], products: [chain2d(2)], reagents: [] }, { title }).split("\n")[1]).toBe("a".repeat(79) + two);
  });
});

describe("overBonded", () => {
  /** A centre atom (id 1) with the given atoms bonded to it, each by its order. */
  const star = (centre: Partial<WriterModel["atoms"][number]> & { el: string }, around: [string, 1 | 2 | 3, number?][]): WriterModel => ({
    atoms: [{ id: 1, x: 0, y: 0, ...centre }, ...around.map(([el, , charge], k) => ({ id: k + 2, x: Math.cos(k), y: Math.sin(k), el, ...(charge ? { charge } : {}) }))],
    bonds: around.map(([, order], k) => ({ a: 1, b: k + 2, order })),
  });

  it("finds an atom with more bonds than it takes, written out as a file has it: a carbon of five, an oxygen of three, an H double bonded", () => {
    expect([...overBonded(star({ el: "C" }, [["C", 1], ["C", 1], ["C", 1], ["C", 2]]))]).toEqual([1]);
    expect([...overBonded(star({ el: "O" }, [["C", 1], ["C", 1], ["C", 1]]))]).toEqual([1]);
    expect([...overBonded(star({ el: "H" }, [["C", 2]]))]).toEqual([1]);
  });

  it("finds a halogen bonded to two carbons, but not perchlorate's chlorine nor a diaryliodonium's iodine", () => {
    expect([...overBonded(star({ el: "Cl" }, [["C", 1], ["C", 1]]))]).toEqual([1]);
    expect([...overBonded(star({ el: "Cl" }, [["O", 2], ["O", 2], ["O", 2], ["O", 1, -1]]))]).toEqual([]);
    expect([...overBonded(star({ el: "I", charge: 1 }, [["C", 1], ["C", 1]]))]).toEqual([]);
    // (nor an alkynyl benziodoxolone's: two carbons and an oxygen, neutral)
    expect([...overBonded(star({ el: "I" }, [["C", 1], ["C", 1], ["O", 1]]))]).toEqual([]);
    // (nor an iodine(III) with halogens, oxygens or carbons - PhICl2, Ph3I - nor hypervalent silicon: SiF6 2-)
    expect([...overBonded(star({ el: "I" }, [["C", 1], ["Cl", 1], ["Cl", 1]]))]).toEqual([]);
    expect([...overBonded(star({ el: "I" }, [["C", 1], ["C", 1], ["C", 1]]))]).toEqual([]);
    expect([...overBonded(star({ el: "Si", charge: -2 }, [["F", 1], ["F", 1], ["F", 1], ["F", 1], ["F", 1], ["F", 1]]))]).toEqual([]);
    expect([...overBonded(star({ el: "Si", charge: -1 }, [["C", 1], ["O", 1], ["O", 1], ["O", 1], ["O", 1]]))]).toEqual([]);
    // (but an iodine with three bonds to nitrogens, uncharged, is)
    expect([...overBonded(star({ el: "I" }, [["N", 1], ["N", 1], ["N", 1]]))]).toEqual([1]);
  });

  it("finds a halogen with a second bond to a nitrogen or a label, or a dot by it; an H charged and bonded; an O given a third by a bond lent to it", () => {
    expect([...overBonded(star({ el: "Br" }, [["C", 1], ["N", 1]]))]).toEqual([1]);
    expect([...overBonded(star({ el: "Cl" }, [["X1", 2]]))]).toEqual([1]);
    expect([...overBonded(star({ el: "Cl", radical: "doublet" }, [["C", 1]]))]).toEqual([1]);
    expect([...overBonded(star({ el: "H", charge: 1 }, [["Br", 1]]))]).toEqual([1]);
    const lent: WriterModel = { atoms: [{ id: 1, x: 0, y: 0, el: "O" }, { id: 2, x: 1, y: 0, el: "C" }, { id: 3, x: -1, y: 0, el: "C" }, { id: 4, x: 0, y: 1, el: "C" }], bonds: [{ a: 2, b: 1, order: 1, dative: true }, { a: 1, b: 3, order: 1 }, { a: 1, b: 4, order: 1 }] };
    expect([...overBonded(lent)]).toEqual([1]);
    // (but not one lent by an atom no element - a label's - nor a boron lent a pair: H3N->BH3)
    const toLabel: WriterModel = { atoms: [{ id: 1, x: 0, y: 0, el: "O" }, { id: 2, x: 1, y: 0, el: "M1" }, { id: 3, x: -1, y: 0, el: "C" }, { id: 4, x: 0, y: 1, el: "C" }], bonds: [{ a: 2, b: 1, order: 1, dative: true }, { a: 1, b: 3, order: 1 }, { a: 1, b: 4, order: 1 }] };
    expect([...overBonded(toLabel)]).toEqual([]);
    const borane: WriterModel = { atoms: [{ id: 1, x: 0, y: 0, el: "B" }, { id: 2, x: 1, y: 0, el: "N" }], bonds: [{ a: 2, b: 1, order: 1, dative: true }] };
    expect([...overBonded(borane)]).toEqual([]);
  });

  it("finds a label whose atoms, written out, have more bonds than they take - OEt bonded twice - by the label's id", () => {
    expect([...overBonded(star({ el: "OEt" }, [["C", 1], ["C", 1]]))]).toEqual([1]);
    expect([...overBonded(star({ el: "OEt" }, [["C", 1]]))]).toEqual([]);
  });

  it("finds none in what takes its bonds: an ammonium's nitrogen, a sulfone's sulfur, a phosphate's phosphorus, a halide bridging two metals", () => {
    expect([...overBonded(star({ el: "N", charge: 1 }, [["C", 1], ["C", 1], ["C", 1], ["C", 1]]))]).toEqual([]);
    expect([...overBonded(star({ el: "S" }, [["C", 1], ["C", 1], ["O", 2], ["O", 2]]))]).toEqual([]);
    expect([...overBonded(star({ el: "P" }, [["O", 2], ["O", 1], ["O", 1], ["O", 1]]))]).toEqual([]);
    expect([...overBonded(star({ el: "Cl" }, [["Pd", 1], ["Pd", 1]]))]).toEqual([]);
  });
});
