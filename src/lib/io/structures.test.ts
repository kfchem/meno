import { describe, expect, it } from "vitest";
import { checkedStructures, readStructures } from "./structures";
import sampleSdf from "../../samples/cholesterol.sdf?raw";
import sampleRxn from "../../samples/esterification.rxn?raw";
import samplePdb from "../../samples/cholesterol.pdb?raw";

const WATER = "3\nwater\nO 0 0 0\nH 0.76 0.59 0\nH -0.76 0.59 0\n";

describe("a structure's file, as Meno's own reader gives it", () => {
  it("is what the file holds: a drawing, a reaction's arrow, or molecules in 3D", () => {
    expect(readStructures("sdf", "cholesterol.sdf", sampleSdf).model.atoms.length).toBeGreaterThan(20);
    expect(readStructures("rxn", "e.rxn", sampleRxn).arrow).toBeDefined();
    expect(readStructures("xyz", "w.xyz", WATER).molecules3d?.[0]).toMatchObject({ name: "w.xyz", bondsFrom: "distance", atoms: [{ el: "O" }, { el: "H" }, { el: "H" }] });
    expect(() => readStructures("mol", "x.mol", "nothing")).toThrow(/No molecules found in x.mol/);
  });

  it("is checked as the page takes it, as any reader's answer is", () => {
    const read = readStructures("xyz", "w.xyz", WATER);
    expect(checkedStructures(read, "w.xyz")).toBe(read);
    const mol = readStructures("sdf", "c.sdf", sampleSdf);
    expect(checkedStructures(mol, "c.sdf")).toBe(mol);
    const broken = (s: unknown, why: RegExp) => expect(() => checkedStructures(s, "x.mol")).toThrow(why);
    broken(null, /no drawing came back/);
    broken({ ...mol, model: { ...mol.model, atoms: [{ ...mol.model.atoms[0], x: NaN }, ...mol.model.atoms.slice(1)] } }, /atom of its drawing is not placed/);
    broken({ ...mol, model: { ...mol.model, bonds: [{ ...mol.model.bonds[0], b: -9 }] } }, /bond of its drawing joins no atoms/);
    const m = read.molecules3d![0];
    broken({ ...read, molecules3d: [{ ...m, bonds: [{ a1: 0, a2: 7, order: 1 }] }] }, /bond of a molecule in 3D joins no atoms/);
    broken({ ...read, molecules3d: [{ ...m, frames: [[0, 0, 0]] }] }, /frame of a molecule in 3D is not whole/);
    broken({ ...read, molecules3d: [{ ...m, atomsLeftOut: 0 }] }, /says it leaves out atoms, but not how many/);
    broken({ ...read, molecules3d: [{ ...m, atomsLeftOut: 1.5 }] }, /says it leaves out atoms, but not how many/);
    expect(checkedStructures({ ...read, molecules3d: [{ ...m, atomsLeftOut: 2 }] }, "w.xyz").molecules3d![0].atomsLeftOut).toBe(2);
    broken({ ...read, pluses: [{ x: 1 }] }, /"\+" sign is not placed/);
    broken({ ...mol, records: [{ atoms: [mol.model.atoms[0].id] }, { atoms: [-9] }] }, /record of its drawing holds atoms it does not have/);
  });
});

describe("an SD file of records drawn flat, as Meno's own reader gives it", () => {
  // (two records, each a C-O drawn flat, titled on their first lines - one not)
  const record = (title: string) =>
    [title, "  Meno            2D", "", "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0", "M  END", "$$$$"].join("\n");
  it("is one drawing, saying each record's atoms and its title where it gives one: a stack of them on the page", () => {
    const read = readStructures("sdf", "m.sdf", [record("methanol"), record("")].join("\n") + "\n");
    expect(read.records?.map((r) => [r.atoms.length, r.title ?? null])).toEqual([
      [2, "methanol"],
      [2, null],
    ]);
    expect(new Set(read.records!.flatMap((r) => r.atoms))).toEqual(new Set(read.model.atoms.map((a) => a.id)));
    expect(checkedStructures(read, "m.sdf")).toBe(read);
    // (one record: none said)
    expect(readStructures("sdf", "m.sdf", record("methanol") + "\n").records).toBeUndefined();
  });
});

/** A HETATM line, its fields in the format's columns (lib/chem/pdb). */
function het(
  serial: number,
  el: string,
  x: number,
  y: number,
  z: number,
  more: { altLoc?: string; resSeq?: number; name?: string; resName?: string; element?: string } = {},
): string {
  const line = Array(80).fill(" ");
  const put = (from: number, s: string) => [...s].forEach((c, i) => (line[from - 1 + i] = c));
  put(1, "HETATM");
  put(7, String(serial).padStart(5));
  put(14, more.name ?? el);
  put(17, more.altLoc ?? " ");
  put(18, more.resName ?? "LIG");
  put(22, "A");
  put(23, String(more.resSeq ?? 1).padStart(4));
  put(31, x.toFixed(3).padStart(8));
  put(39, y.toFixed(3).padStart(8));
  put(47, z.toFixed(3).padStart(8));
  put(77, (more.element ?? el).padStart(2));
  return line.join("");
}
const conect = (from: number, ...to: number[]) => "CONECT" + [from, ...to].map((n) => String(n).padStart(5)).join("");

describe("an SD file of records in 3D, as Meno's own reader gives it", () => {
  // (two records, each three atoms spread in depth, titled on their first lines - one not)
  const record = (title: string, z: number) =>
    [title, "  Meno            3D", "", "  3  2  0  0  0  0  0  0  0  0999 V2000",
      `    0.0000    0.0000    ${z.toFixed(4)} O   0  0  0  0  0  0  0  0  0  0  0  0`,
      "    0.7600    0.5900    0.5000 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "   -0.7600    0.5900   -0.5000 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0", "  1  3  1  0", "M  END", "$$$$"].join("\n");
  it("is a molecule in 3D for each record, each with its record's title where it gives one", () => {
    const read = readStructures("sdf", "w.sdf", [record("aspirin", 0), record("", 0.2)].join("\n") + "\n");
    expect(read.molecules3d?.map((m) => [m.name, m.title ?? null])).toEqual([
      ["w.sdf", "aspirin"],
      ["w.sdf", null],
    ]);
  });
});

describe("a PDB file, as Meno's own reader gives it", () => {
  it("is a molecule in 3D: its atoms, and its bonds from CONECT records and from its atoms' distances", () => {
    const read = readStructures("pdb", "cholesterol.pdb", samplePdb);
    expect(read.model.atoms).toHaveLength(0);
    expect(read.molecules3d).toHaveLength(1);
    const m = read.molecules3d![0];
    expect(m).toMatchObject({ name: "cholesterol.pdb" });
    expect(m.atoms).toHaveLength(74);
    expect(m.bonds).toHaveLength(77);
    expect(checkedStructures(read, "cholesterol.pdb")).toBe(read);
  });

  it("takes a bond between two atoms CONECT records speak for only where they give it; any other pair by distance", () => {
    const text = [
      het(1, "C", 0, 0, 0),
      het(2, "O", 1.2, 0, 0),
      // (close to the carbon, but CONECT bonds it to the oxygen only)
      het(3, "C", 0, 1.4, 0),
      // (spoken for by no CONECT record: bonded by distance)
      het(4, "C", 0, -1.5, 0),
      conect(1, 2),
      conect(2, 1, 3),
      conect(3, 2),
    ].join("\n");
    const m = readStructures("pdb", "x.pdb", text).molecules3d![0];
    expect(m.bonds.map((b) => [b.a1, b.a2])).toEqual([[0, 1], [0, 3], [1, 2]]);
  });

  it("takes no CONECT record's bond to a serial number two atoms carry, as a file past the format's 99,999 atoms numbers them over again; their bonds are by distance", () => {
    const text = [
      // (three carbons numbered 1 to 3: by distance, the first bonded to the second, the second to the third)
      het(1, "C", 0, 0, 0),
      het(2, "C", 1.5, 0, 0),
      het(3, "C", 1.5, 1.5, 0),
      // (a ligand numbered 1 to 3 over again, its third atom between its first and second, as CONECT says)
      het(1, "C", 10, 0, 0, { resSeq: 2 }),
      het(2, "C", 10, 3, 0, { resSeq: 2 }),
      het(3, "C", 10, 1.5, 0, { resSeq: 2 }),
      conect(1, 3),
      conect(2, 3),
      conect(3, 1, 2),
    ].join("\n");
    const m = readStructures("pdb", "x.pdb", text).molecules3d![0];
    // (not the first carbon to the third, 2.1 A apart, nor the first's bond to the second left out)
    expect(m.bonds.map((b) => [b.a1, b.a2])).toEqual([[0, 1], [1, 2], [3, 5], [4, 5]]);
  });

  it("keeps a protein's chains - its atoms' names and residues, and its helices from HELIX records - with the molecule", () => {
    const atomLine = (serial: number, name: string, el: string, resSeq: number, x: number) => {
      const line = Array(80).fill(" ");
      const put = (from: number, t: string) => [...t].forEach((c, i) => (line[from - 1 + i] = c));
      put(1, "ATOM  ");
      put(7, String(serial).padStart(5));
      put(13, name.length === 1 ? ` ${name}`.padEnd(4) : ` ${name}`.padEnd(4));
      put(18, "ALA");
      put(22, "A");
      put(23, String(resSeq).padStart(4));
      put(31, x.toFixed(3).padStart(8));
      put(39, "0.000".padStart(8));
      put(47, "0.000".padStart(8));
      put(77, el.padStart(2));
      return line.join("");
    };
    const helix = (() => {
      const line = Array(80).fill(" ");
      const put = (from: number, t: string) => [...t].forEach((c, i) => (line[from - 1 + i] = c));
      put(1, "HELIX ");
      put(8, "  1");
      put(16, "ALA");
      put(20, "A");
      put(22, "   1");
      put(28, "ALA");
      put(32, "A");
      put(34, "   3");
      put(39, " 1");
      return line.join("");
    })();
    const text = [helix, ...[1, 2, 3].map((k) => atomLine(k, "CA", "C", k, 3.8 * k))].join("\n");
    const m = readStructures("pdb", "p.pdb", text).molecules3d![0];
    expect(m.biopolymer?.names).toEqual(["CA", "CA", "CA"]);
    expect(m.biopolymer?.structure).toEqual(["helix", "helix", "helix"]);
    // (a hetero group alone: no chains)
    expect(readStructures("pdb", "x.pdb", het(1, "C", 0, 0, 0)).molecules3d![0].biopolymer).toBeUndefined();
  });

  it("shows each atom in one place: its residue's first alternate location", () => {
    const text = [het(1, "C", 0, 0, 0, { altLoc: "A" }), het(2, "C", 0.3, 0, 0, { altLoc: "B" }), het(3, "O", 1.4, 0, 0, { altLoc: "A" }), het(4, "O", 1.5, 0.3, 0, { altLoc: "B" }), het(5, "N", 9, 9, 9)].join("\n");
    const m = readStructures("pdb", "x.pdb", text).molecules3d![0];
    expect(m.atoms.map((a) => [a.el, a.x])).toEqual([["C", 0], ["O", 1.4], ["N", 9]]);
  });

  it("takes a residue's alternate location from its own atoms, listed together - not from another residue of its number, as a file past the format's 9,999 residues numbers them over again", () => {
    const text = [
      het(1, "C", 0, 0, 0, { altLoc: "A", resSeq: 1 }),
      het(2, "C", 0.3, 0, 0, { altLoc: "B", resSeq: 1 }),
      het(3, "O", 1.4, 0, 0, { resSeq: 2 }),
      // (numbered 1 over again, far off: its one place B)
      het(4, "N", 9, 9, 9, { altLoc: "B", resSeq: 1 }),
    ].join("\n");
    const m = readStructures("pdb", "x.pdb", text).molecules3d![0];
    expect(m.atoms.map((a) => [a.el, a.x])).toEqual([["C", 0], ["O", 1.4], ["N", 9]]);
  });

  it("is one molecule's frames where its models hold the same atoms, else a molecule for each model", () => {
    const model = (n: number, atoms: string[]) => [`MODEL     ${String(n).padStart(4)}`, ...atoms, "ENDMDL"];
    const alike = [...model(1, [het(1, "C", 0, 0, 0), het(2, "O", 1.2, 0, 0)]), ...model(2, [het(1, "C", 0, 0, 0.5), het(2, "O", 1.2, 0, 0.5)])].join("\n");
    const one = readStructures("pdb", "x.pdb", alike).molecules3d!;
    expect(one).toHaveLength(1);
    expect(one[0].frames).toEqual([[0, 0, 0.5, 1.2, 0, 0.5]]);
    const unlike = [...model(1, [het(1, "C", 0, 0, 0)]), ...model(2, [het(1, "N", 0, 0, 0), het(2, "O", 1.2, 0, 0)])].join("\n");
    const two = readStructures("pdb", "x.pdb", unlike).molecules3d!;
    expect(two.map((m) => m.atoms.map((a) => a.el))).toEqual([["C"], ["N", "O"]]);
  });

  it("says so where it holds no atoms", () => {
    expect(() => readStructures("pdb", "x.pdb", "REMARK   1\nEND\n")).toThrow(/No molecules found in x.pdb/);
  });

  it("is not read where an atom's coordinates do not read - the file damaged - saying how many and the first by its line", () => {
    const water = (z: number) => [het(1, "O", 0, 0, 0), het(2, "H", 0.957, 0, 0), het(3, "H", -0.24, 0.927, z), "END"].join("\n") + "\n";
    expect(readStructures("pdb", "w.pdb", water(0)).molecules3d![0].atoms).toHaveLength(3);
    expect(() => readStructures("pdb", "w.pdb", water(Number.NaN))).toThrow("w.pdb could not be read: the atom on line 3 does not read (its coordinates, columns 31-54).");
    // (several: how many, and the first - an atom of no element among them not counted)
    const two = ["REMARK   1", het(1, "QQ", 1, 1, 0), het(2, "O", Number.NaN, 0, 0), het(3, "H", 0.957, 0, 0), het(4, "H", Number.NaN, 0, 0)].join("\n");
    expect(() => readStructures("pdb", "w.pdb", two)).toThrow("w.pdb could not be read: 2 of its atoms do not read, the first on line 3 (its coordinates, columns 31-54).");
    // (in a water too)
    expect(() => readStructures("pdb", "w.pdb", het(1, "O", Number.NaN, 0, 0, { resName: "SOL" }))).toThrow(/the atom on line 1 does not read/);
  });

  it("leaves out an atom whose element does not read - a wwPDB entry's unknown atom - and says how many it leaves out", () => {
    const text = [het(1, "C", 0, 0, 0), het(2, "O", 1.2, 0, 0), het(3, "X", 5, 5, 5, { resName: "UNX", resSeq: 2 }), het(4, "QQ", 9, 9, 9, { resName: "UNX", resSeq: 3 }), "END"].join("\n") + "\n";
    const read = readStructures("pdb", "x.pdb", text);
    const m = read.molecules3d![0];
    expect(m.atoms.map((a) => a.el)).toEqual(["C", "O"]);
    expect(m.atomsLeftOut).toBe(2);
    expect(checkedStructures(read, "x.pdb")).toBe(read);
    // (an old file's name, its element columns blank, reading as none: left out the same)
    expect(readStructures("pdb", "x.pdb", [het(1, "C", 0, 0, 0), het(2, "C", 1.5, 0, 0, { name: "", element: "" })].join("\n")).molecules3d![0].atomsLeftOut).toBe(1);
    // (all of them read: none said)
    expect(readStructures("pdb", "x.pdb", [het(1, "C", 0, 0, 0), het(2, "O", 1.2, 0, 0)].join("\n")).molecules3d![0].atomsLeftOut).toBeUndefined();
  });

  it("leaves out a TIP4P or TIP5P water's massless site, no atom, without a word", () => {
    const sol = (resSeq: number, dx: number) => [
      het(4 * resSeq - 3, "O", dx, 0, 0, { name: "OW", resName: "SOL", resSeq }),
      het(4 * resSeq - 2, "H", dx + 0.957, 0, 0, { name: "HW1", resName: "SOL", resSeq }),
      het(4 * resSeq - 1, "H", dx - 0.24, 0.927, 0, { name: "HW2", resName: "SOL", resSeq }),
      // (GROMACS's MW: its element columns blank, its name no element's)
      het(4 * resSeq, "", dx + 0.1, 0.1, 0, { name: "MW", resName: "SOL", resSeq }),
    ];
    const m = readStructures("pdb", "tip4p.pdb", [...sol(1, 0), "END"].join("\n") + "\n").molecules3d![0];
    expect(m.atoms.map((a) => a.el)).toEqual(["O", "H", "H"]);
    expect(m.atomsLeftOut).toBeUndefined();
    // (a site so named in a ligand's residue: an atom left out, and said)
    const ligand = [het(1, "C", 0, 0, 0), het(2, "", 0.5, 0.5, 0, { name: "MW" })].join("\n");
    expect(readStructures("pdb", "x.pdb", ligand).molecules3d![0].atomsLeftOut).toBe(1);
  });

  it("reads D and T, deuterium and tritium, as hydrogen, keeping their mass numbers", () => {
    const heavy = [het(1, "O", 0, 0, 0), het(2, "D", 0.957, 0, 0), het(3, "T", -0.24, 0.927, 0), "END"].join("\n") + "\n";
    const read = readStructures("pdb", "d2o.pdb", heavy);
    const m = read.molecules3d![0];
    expect(m.atoms.map((a) => [a.el, a.isotope])).toEqual([["O", undefined], ["H", 2], ["H", 3]]);
    // (bonded to the oxygen as any hydrogen is)
    expect(m.bonds.map((b) => [b.a1, b.a2])).toEqual([[0, 1], [0, 2]]);
    expect(checkedStructures(read, "d2o.pdb")).toBe(read);
  });
});
