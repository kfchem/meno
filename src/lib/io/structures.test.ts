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

  it("leaves out an XYZ file's frame cut short, or with a place that does not read, and its energy with it", () => {
    const frame = (e: string, x: string) => `3\nenergy: ${e}\nO 0 0 0\nH ${x} 0.59 0\nH -0.76 0.59 0\n`;
    // (the second frame damaged, the last cut short - as a file still being written is)
    const text = frame("-76.1", "0.76") + frame("-76.2", "0.7x") + frame("-76.3", "0.77") + frame("-76.4", "0.78").split("\n").slice(0, 4).join("\n");
    const read = readStructures("xyz", "t.xyz", text);
    expect(checkedStructures(read, "t.xyz")).toBe(read);
    const m = read.molecules3d![0];
    expect(m.atoms[1].x).toBe(0.76);
    // (its bonds as its first frame has them)
    expect(m.bonds).toEqual([
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ]);
    expect(m.frames).toEqual([[0, 0, 0, 0.77, 0.59, 0, -0.76, 0.59, 0]]);
    expect(m.energies).toEqual([-76.1, -76.3]);
    // (and says so: never without a word)
    expect(m.framesLeftOut).toBe(2);
    // (none whole: none read)
    expect(() => readStructures("xyz", "t.xyz", "2\n\nO 0 0 0\nH 0.7x 0.59 0\n")).toThrow(/No molecules found in t.xyz/);
  });

  it("leaves out a first frame with a place that does not read, says so, and is the first whole one", () => {
    const read = readStructures("xyz", "h.xyz", "2\nfirst\nH 0 0\nH 0.74 0 0\n2\nsecond\nH 0 0 0\nH 0.8 0 0\n");
    const m = read.molecules3d![0];
    expect(m.atoms.map((a) => a.x)).toEqual([0, 0.8]);
    expect(m.frames).toBeUndefined();
    expect(m.framesLeftOut).toBe(1);
    expect(checkedStructures(read, "h.xyz")).toBe(read);
  });

  it("says where atoms of it stand in one place - a damaged file - and finds them no bond", () => {
    const m = readStructures("xyz", "c.xyz", "3\n\nC 0 0 0\nC 0 0 0\nC 1.5 0 0\n").molecules3d![0];
    expect(m.together).toBe(1);
    expect(m.bonds.map((b) => [b.a1, b.a2])).toEqual([[0, 2], [1, 2]]);
    expect(readStructures("xyz", "w.xyz", WATER).molecules3d![0].together).toBeUndefined();
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
    // (a bond from an atom to itself, or a second between two atoms, as a file may give: drawn, neither showed, and its
    // structure could then not be cleaned up or made in 3D - "This structure could not be read")
    const [b0] = mol.model.bonds;
    broken({ ...mol, model: { ...mol.model, bonds: [...mol.model.bonds, { ...b0, id: 9999, b: b0.a }] } }, /bond of its drawing joins an atom to itself/);
    broken({ ...mol, model: { ...mol.model, bonds: [...mol.model.bonds, { ...b0, id: 9999, a: b0.b, b: b0.a, order: 2 }] } }, /two bonds of its drawing join the same atoms/);
    const m = read.molecules3d![0];
    broken({ ...read, molecules3d: [{ ...m, bonds: [{ a1: 0, a2: 7, order: 1 }] }] }, /bond of a molecule in 3D joins no atoms/);
    broken({ ...read, molecules3d: [{ ...m, frames: [[0, 0, 0]] }] }, /frame of a molecule in 3D is not whole/);
    broken({ ...read, pluses: [{ x: 1 }] }, /"\+" sign is not placed/);
    broken({ ...mol, records: [{ atoms: [mol.model.atoms[0].id] }, { atoms: [-9] }] }, /record of its drawing holds atoms it does not have/);
  });
});

describe("a file cut short, as Meno's own reader gives it", () => {
  // (a C-O drawn flat; the file ending after its first atom)
  const lines = ["c", "  Meno", "", "  2  1  0  0  0  0  0  0  0  0999 V2000",
    "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
    "    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0",
    "  1  2  1  0", "M  END"];
  const whole = lines.join("\n");
  const cut = lines.slice(0, 5).join("\n");

  it("is not read, the chemist told why: not a part of a structure drawn as the whole", () => {
    // (it was read on from what was not there: a carbon at 0, 0 for every atom to come)
    expect(readStructures("mol", "c.mol", whole).model.atoms).toHaveLength(2);
    expect(() => readStructures("mol", "c.mol", cut)).toThrow("c.mol could not be read: it ends before all its atoms and bonds are given.");
    expect(() => readStructures("sdf", "c.sdf", `${whole}\n$$$$\n${cut}\n`)).toThrow("c.sdf could not be read: its record 2 ends before all its atoms and bonds are given.");
    const rxn = (last: string) => ["$RXN", "", "  Meno", "", "  1  1", "$MOL", whole, "$MOL", last].join("\n");
    expect(readStructures("rxn", "c.rxn", rxn(whole)).arrow).toBeDefined();
    expect(() => readStructures("rxn", "c.rxn", rxn(cut))).toThrow("c.rxn could not be read: one of its molecules ends before all its atoms and bonds are given.");
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
function het(serial: number, el: string, x: number, y: number, z: number, more: { altLoc?: string; resSeq?: number } = {}): string {
  const line = Array(80).fill(" ");
  const put = (from: number, s: string) => [...s].forEach((c, i) => (line[from - 1 + i] = c));
  put(1, "HETATM");
  put(7, String(serial).padStart(5));
  put(14, el);
  put(17, more.altLoc ?? " ");
  put(18, "LIG");
  put(22, "A");
  put(23, String(more.resSeq ?? 1).padStart(4));
  put(31, x.toFixed(3).padStart(8));
  put(39, y.toFixed(3).padStart(8));
  put(47, z.toFixed(3).padStart(8));
  put(77, el.padStart(2));
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
});
