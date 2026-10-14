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

  it("opens a trajectory the file ends in the middle of with its whole frames, each with its energy", () => {
    const frame = (e: number, z: number) => `3\n energy: ${e} gnorm: 0.01 xtb: 6.7.1\nO 0 0 ${z}\nH 0.76 0.59 0\nH -0.76 0.59 0\n`;
    const read = readStructures("xyz", "md.xyz", frame(-5.07, 0) + frame(-5.08, 0.01) + "3\n energy: -5.09 gnorm: 0.01\nO 0 0 0.02\n");
    expect(checkedStructures(read, "md.xyz")).toBe(read);
    expect(read.molecules3d![0]).toMatchObject({ frames: [[0, 0, 0.01, 0.76, 0.59, 0, -0.76, 0.59, 0]], energies: [-5.07, -5.08], framesLeftOut: 1 });
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
    // (none whole: the file refused, saying why of its first frame)
    expect(() => readStructures("xyz", "t.xyz", "2\n\nO 0 0 0\nH 0.7x 0.59 0\n")).toThrow('t.xyz could not be read: line 4 gives H a place that is not a number: "0.7x".');
    expect(() => readStructures("xyz", "t.xyz", "3\nwater\nO 0 0 0\nH 0.76 0.59 0")).toThrow("t.xyz could not be read: its first frame ends before its atoms do (it says 3, and gives 2).");
  });

  it("says what follows its frames that is no frame - a separator line, text at the end - as a frame left out, never reading it silently", () => {
    const frame = (e: number, z: number) => `3\nE ${e}\nO 0 0 ${z}\nH 0.76 0.59 0\nH -0.76 0.59 0\n`;
    // (text after the frames: not read, and said)
    const m = readStructures("xyz", "scan.xyz", frame(-76.1, 0) + frame(-76.2, 0.01) + "END of the scan\n" + frame(-76.3, 0.02)).molecules3d![0];
    expect(m.frames).toHaveLength(1);
    expect(m.energies).toEqual([-76.1, -76.2]);
    expect(m.framesLeftOut).toBe(1);
    // (nothing but a frame: nothing said)
    expect(readStructures("xyz", "w.xyz", WATER + "\n\n").molecules3d![0].framesLeftOut).toBeUndefined();
    // (no count at all: refused, saying which line)
    expect(() => readStructures("xyz", "x.xyz", "water\n3\n")).toThrow('Line 1 of the XYZ file is not a count of atoms: "water".');
  });

  it("reads every frame of a file with a \">\" line between its frames, each with its energy", () => {
    const frame = (e: number, z: number) => `3\nCoordinates E ${e}\nO 0 0 ${z}\nH 0.76 0.59 0\nH -0.76 0.59 0\n`;
    const text = [-76.1, -76.2, -76.3, -76.4, -76.5].map((e, k) => frame(e, k / 100)).join(">\n");
    const m = readStructures("xyz", "scan.xyz", text).molecules3d![0];
    expect(m.frames).toHaveLength(4);
    expect(m.energies).toEqual([-76.1, -76.2, -76.3, -76.4, -76.5]);
    expect(m.framesLeftOut).toBeUndefined();
  });

  it("passes over blank lines between frames, each frame its energy still", () => {
    const frame = (e: number, z: number) => `3\n energy: ${e}\nO 0 0 ${z}\nH 0.76 0.59 0\nH -0.76 0.59 0\n`;
    const m = readStructures("xyz", "md.xyz", frame(-5.07, 0) + "\n" + frame(-5.08, 0.01) + "\n\n" + frame(-5.09, 0.02)).molecules3d![0];
    expect(m.frames).toHaveLength(2);
    expect(m.energies).toEqual([-5.07, -5.08, -5.09]);
    expect(m.framesLeftOut).toBeUndefined();
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
    const m = read.molecules3d![0];
    broken({ ...read, molecules3d: [{ ...m, bonds: [{ a1: 0, a2: 7, order: 1 }] }] }, /bond of a molecule in 3D joins no atoms/);
    broken({ ...read, molecules3d: [{ ...m, frames: [[0, 0, 0]] }] }, /frame of a molecule in 3D is not whole/);
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

describe("a structure's file cut short or damaged, as Meno's own reader gives it", () => {
  const cut = (text: string, share: number) => text.slice(0, Math.floor(text.length * share));
  const lines = (text: string, share: number) => text.split("\n").slice(0, Math.floor(text.split("\n").length * share)).join("\n");

  it("is refused, saying so, where it ends before the atoms and bonds its counts line gives - not read as atoms at the origin", () => {
    // (read anyway, a MOL file cut after its first atom was 62 atoms, 61 of them carbons at the origin, and no bonds)
    for (const share of [0.02, 0.3, 0.7]) expect(() => readStructures("sdf", "c.sdf", cut(sampleSdf, share)), `cut at ${share}`).toThrow(/c.sdf could not be read: it ends before the atoms and bonds it says it has/);
    for (const share of [0.02, 0.3, 0.7]) expect(() => readStructures("rxn", "e.rxn", cut(sampleRxn, share)), `cut at ${share}`).toThrow(/e.rxn could not be read: it ends before/);
    // (a reaction cut at its second molecule was read as its first, saying nothing)
    expect(() => readStructures("rxn", "e.rxn", lines(sampleRxn, 0.5))).toThrow(/e.rxn could not be read/);
    // a counts line giving more than the file holds, or an atom's line with no place
    expect(() => readStructures("sdf", "c.sdf", sampleSdf.replace(/^(.*\n.*\n.*\n)\s*\d+\s+\d+/, "$1999 30"))).toThrow(/could not be read/);
    expect(() => readStructures("sdf", "c.sdf", sampleSdf.replace(/-?\d+\.\d{4}/, "abc"))).toThrow(/could not be read/);
    // (a whole file still reads, its SD data items cut or not)
    expect(readStructures("sdf", "c.sdf", sampleSdf.replace(/\$\$\$\$\s*$/, "")).model.atoms.length).toBeGreaterThan(20);
    expect(readStructures("sdf", "c.sdf", sampleSdf.replace(/\r?\n/g, "\r\n")).model.atoms.length).toBeGreaterThan(20);
  });

  it("opens the records of an SD file before one cut short, naming it as left out (the maintainer, 2026-10-14)", () => {
    const record = (title: string) =>
      [title, "  Meno            2D", "", "  2  1  0  0  0  0  0  0  0  0999 V2000",
        "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
        "    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0",
        "  1  2  1  0", "M  END", "$$$$"].join("\n");
    const two = `${record("one")}\n${record("two")}`;
    const read = readStructures("sdf", "two.sdf", two.slice(0, two.lastIndexOf("  1  2  1  0")));
    expect(read.model.atoms.map((a) => a.el)).toEqual(["C", "O"]);
    expect(read.recordsLeftOut).toEqual([{ record: 2, why: "ends before the atoms and bonds it says it has" }]);
    expect(checkedStructures(read, "two.sdf")).toBe(read);
    // (its only record cut short: refused, as ever)
    expect(() => readStructures("mol", "one.mol", record("one").slice(0, record("one").lastIndexOf("  1  2  1  0")))).toThrow(/one.mol could not be read: it ends before/);
  });

  /** A V2000 molfile of the atom and bond lines given, its counts line saying how many - or `counts`. */
  const v2000 = (atoms: string[], bonds: string[], counts = [atoms.length, bonds.length]) =>
    ["", "  Meno            2D", "", `${String(counts[0]).padStart(3)}${String(counts[1]).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`, ...atoms, ...bonds, "M  END"].join("\n") + "\n";
  /** A V2000 atom line, its fields in the format's columns. */
  const atom = (x: number, y: number, el: string) => `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}    0.0000 ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`;
  /** A V3000 molfile of the atom and bond entries given. */
  const v3000 = (atoms: string[], bonds: string[]) =>
    ["", "  Meno            2D", "", "  0  0  0     0  0            999 V3000", "M  V30 BEGIN CTAB", `M  V30 COUNTS ${atoms.length} ${bonds.length} 0 0 0`, "M  V30 BEGIN ATOM", ...atoms.map((a) => `M  V30 ${a}`), "M  V30 END ATOM", "M  V30 BEGIN BOND", ...bonds.map((b) => `M  V30 ${b}`), "M  V30 END BOND", "M  V30 END CTAB", "M  END"].join("\n") + "\n";

  it("leaves out a record with a bond to an atom it has not, naming it - not read as a bond to another record's atom - and refuses a file of no record that reads", () => {
    // (read anyway, record 1's carbon, given a bond to its atom 4, was bonded to record 2's nitrogen; an atom 0, to the record before's)
    const sd = (first: string, second: string) => `${v2000([atom(0, 0, "C"), atom(1.5, 0, "O")], [first])}$$$$\n${v2000([atom(5, 0, "N"), atom(6.5, 0, "S")], [second])}$$$$\n`;
    const first = readStructures("sdf", "two.sdf", sd("  1  4  1  0", "  1  2  1  0"));
    expect(first.model.atoms.map((a) => a.el)).toEqual(["N", "S"]);
    expect(first.recordsLeftOut).toEqual([{ record: 1, why: "has a bond to an atom it does not have" }]);
    expect(readStructures("sdf", "two.sdf", sd("  1  2  1  0", "  0  1  1  0")).recordsLeftOut).toEqual([{ record: 2, why: "has a bond to an atom it does not have" }]);
    // (none reads: refused, its first record named)
    expect(() => readStructures("sdf", "two.sdf", sd("  1  4  1  0", "  0  1  1  0"))).toThrow("two.sdf could not be read: its record 1 has a bond to an atom it does not have. It may be damaged.");
    expect(() => readStructures("mol", "v3.mol", v3000(["1 C 0 0 0 0", "2 O 1.5 0 0 0"], ["1 1 1 4"]))).toThrow("v3.mol could not be read: it has a bond to an atom it does not have.");
    // (and the same records whole read as before)
    expect(readStructures("sdf", "two.sdf", sd("  1  2  1  0", "  1  2  1  0")).model.bonds).toHaveLength(2);
  });

  it("refuses a benzene whose counts line gives an atom too few - its last atom's line taken for a bond - rather than fail on it", () => {
    // (read anyway, an aromatic bond to the sixth atom it had not failed as its rings were made Kekulé)
    const ring = [[0, 1.4], [1.212, 0.7], [1.212, -0.7], [0, -1.4], [-1.212, -0.7], [-1.212, 0.7]].map(([x, y]) => atom(x, y, "C"));
    const bonds = [1, 2, 3, 4, 5, 6].map((k) => `${String(k).padStart(3)}${String((k % 6) + 1).padStart(3)}  4  0  0  0  0`);
    expect(() => readStructures("mol", "b.mol", v2000(ring, bonds, [5, 6]))).toThrow(/^b.mol could not be read: /);
    expect(readStructures("mol", "b.mol", v2000(ring, bonds)).model.bonds).toHaveLength(6);
  });

  it("refuses an atom with no symbol, rather than read it as carbon", () => {
    expect(() => readStructures("mol", "n.mol", v2000([atom(0, 0, "O"), "    1.2990    0.7500    0.0000"], ["  1  2  1  0"]))).toThrow("n.mol could not be read: it has an atom with no symbol. It may be damaged.");
    expect(() => readStructures("mol", "n.mol", v3000(["1 O 0 0 0 0", '2 "" 1.299 0.75 0 0'], ["1 1 1 2"]))).toThrow("n.mol could not be read: it has an atom with no symbol.");
  });

  it("refuses a place or another number that is not one - Fortran's D exponent, 0N - rather than read its first digits", () => {
    // (read anyway, "1.19D+01" - 11.9 - was 1.19, and "0N" 0)
    const o = (line: string) => v2000([atom(0, 0, "C"), line], ["  1  2  1  0"]);
    expect(() => readStructures("mol", "d.mol", o("  1.19D+01    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0"))).toThrow("d.mol could not be read: it has an atom whose place is not a number. It may be damaged.");
    expect(() => readStructures("mol", "d.mol", o("1.19D+01 0.0 0.0 O 0 0"))).toThrow(/it has an atom whose place is not a number/);
    expect(() => readStructures("mol", "d.mol", o("    1.1900    0.0000        0N O   0  0  0  0  0  0  0  0  0  0  0  0"))).toThrow(/it has an atom whose place is not a number/);
    expect(() => readStructures("mol", "d.mol", o("    1.1900    0.0000    0.0000 O   0 0N  0  0  0  0  0  0  0  0  0  0"))).toThrow(/it has an atom with a field that is not a number/);
    expect(() => readStructures("mol", "d.mol", v2000([atom(0, 0, "C"), atom(1.19, 0, "O")], ["  1  2 1x  0  0  0  0"]))).toThrow(/it has a bond with a field that is not a number/);
    expect(() => readStructures("mol", "d.mol", v3000(["1 C 0 0 0 0", "2 O 1.19D+01 0 0 0"], ["1 1 1 2"]))).toThrow(/it has an atom whose place is not a number/);
    expect(() => readStructures("mol", "d.mol", v3000(["1 C 0 0 0 0", "2 O 1.19 0 0 0"], ["1 1x 1 2"]))).toThrow(/it has a bond with a field that is not a number/);
    // (an E exponent is a number's: read as one)
    expect(readStructures("mol", "e.mol", o("1.1900E+00    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0")).model.atoms).toHaveLength(2);
  });

  it("reads an abbreviation naming an atom the file has not as the atoms it has, and a property line shorter than its count as far as it goes - rather than fail on either", () => {
    // (read before, both failed with a TypeError)
    const co = (...props: string[]) => ["", "  Meno            2D", "", "  2  1  0  0  0  0  0  0  0  0999 V2000", atom(0, 0, "C"), atom(1.5, 0, "O"), "  1  2  1  0", ...props, "M  END"].join("\n") + "\n";
    expect(readStructures("mol", "s.mol", co("M  STY  1   1 SUP", "M  SAL   1  2   2   5", "M  SMT   1 OMe")).model.atoms.map((a) => a.el)).toEqual(["C", "OMe"]);
    const v3 = (sgroup: string) => v3000(["1 C 0 0 0 0", "2 O 1.5 0 0 0"], ["1 1 1 2"]).replace("M  V30 END CTAB", `M  V30 BEGIN SGROUP\nM  V30 ${sgroup}\nM  V30 END SGROUP\nM  V30 END CTAB`);
    expect(readStructures("mol", "s.mol", v3("1 SUP 0 ATOMS=(2 2 5) XBONDS=(2 1 9) LABEL=OMe")).model.atoms.map((a) => a.el)).toEqual(["C", "OMe"]);
    expect(readStructures("mol", "s.mol", co("M  STY  2   1 SUP   2")).model.atoms).toHaveLength(2);
    expect(readStructures("mol", "s.mol", co("M  STY  1   1 SRU", "M  SCN  1   1")).model.atoms).toHaveLength(2);
  });

  it("refuses a mass difference on an element whose table mass Meno does not hold - W, U - rather than drop it; its mass given itself is read", () => {
    // (read anyway, the tungsten and the uranium were of no isotope, saying nothing)
    const heavy = (el: string, iso: string[] = []) =>
      ["", "  Meno            2D", "", "  2  1  0  0  0  0  0  0  0  0999 V2000", atom(0, 0, "C"), `    1.9000    0.0000    0.0000 ${el.padEnd(3)} 1  0  0  0  0  0  0  0  0  0  0  0`, "  1  2  1  0", ...iso, "M  END"].join("\n") + "\n";
    expect(() => readStructures("mol", "w.mol", heavy("W"))).toThrow("w.mol could not be read: it gives W a mass difference, and Meno does not know the mass it is a difference from.");
    expect(() => readStructures("mol", "u.mol", heavy("U"))).toThrow(/it gives U a mass difference/);
    expect(readStructures("mol", "u.mol", heavy("U", ["M  ISO  1   2 235"])).model.atoms[1]).toMatchObject({ el: "U", isotope: 235 });
    // (one whose table mass Meno holds: the isotope it means)
    expect(readStructures("mol", "c.mol", heavy("C")).model.atoms[1]).toMatchObject({ el: "C", isotope: 13 });
  });

  it("refuses an XYZ file whose first frame is cut short, and leaves out a trajectory's last frame, cut short as it is still written - saying how many it left out", () => {
    expect(() => readStructures("xyz", "w.xyz", WATER.split("\n").slice(0, 4).join("\n"))).toThrow(/w.xyz could not be read: its first frame ends before/);
    const frames = `${WATER}${WATER}${WATER.split("\n").slice(0, 3).join("\n")}`;
    const read = readStructures("xyz", "w.xyz", frames);
    const m = read.molecules3d![0];
    expect(m.atoms).toHaveLength(3);
    expect(m.frames).toHaveLength(1);
    // (never silently: how many frames were left out is said)
    expect(m.framesLeftOut).toBe(1);
    expect(checkedStructures(read, "w.xyz")).toBe(read);
    expect(readStructures("xyz", "w.xyz", `${WATER}${WATER}`).molecules3d![0].framesLeftOut).toBeUndefined();
  });

  it("reads a PDB file with a byte-order mark, or lines ended by CR alone, as it reads the file", () => {
    const n = readStructures("pdb", "c.pdb", samplePdb).molecules3d![0].atoms.length;
    expect(readStructures("pdb", "c.pdb", "\uFEFF" + samplePdb).molecules3d![0].atoms).toHaveLength(n);
    expect(readStructures("pdb", "c.pdb", samplePdb.replace(/\r?\n/g, "\r")).molecules3d![0].atoms).toHaveLength(n);
  });
});

