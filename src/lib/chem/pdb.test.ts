import { describe, expect, it } from "vitest";
import { elementOf, MOST_ATOMS, readPdb, recordName, writePdb, type PdbWriteMolecule } from "./pdb";
import sample from "../../samples/cholesterol.pdb?raw";

/** Columns `from` to `to`, as the format numbers them. */
const cols = (line: string, from: number, to: number) => line.substring(from - 1, to);

/**
 * An ATOM or HETATM line with each field put in its columns, as the
 * format's Coordinate Section lays them out - the fixtures here are made
 * from the layout, not copied from any file.
 */
function atomLine(f: {
  record?: "ATOM" | "HETATM";
  serial: number;
  name: string;
  altLoc?: string;
  resName?: string;
  chainID?: string;
  resSeq?: number;
  iCode?: string;
  x: number;
  y: number;
  z: number;
  occupancy?: string;
  tempFactor?: string;
  element?: string;
  charge?: string;
}): string {
  const line = Array(80).fill(" ");
  const put = (from: number, s: string) => [...s].forEach((c, i) => (line[from - 1 + i] = c));
  put(1, (f.record ?? "ATOM").padEnd(6));
  put(7, String(f.serial).padStart(5));
  put(13, f.name.padEnd(4));
  put(17, f.altLoc ?? " ");
  put(18, (f.resName ?? "GLY").padStart(3));
  put(22, f.chainID ?? "A");
  put(23, String(f.resSeq ?? 1).padStart(4));
  put(27, f.iCode ?? " ");
  put(31, f.x.toFixed(3).padStart(8));
  put(39, f.y.toFixed(3).padStart(8));
  put(47, f.z.toFixed(3).padStart(8));
  put(55, (f.occupancy ?? "1.00").padStart(6));
  put(61, (f.tempFactor ?? "0.00").padStart(6));
  put(77, (f.element ?? "").padStart(2));
  put(79, (f.charge ?? "").padEnd(2));
  return line.join("").trimEnd();
}

const conect = (from: number, ...to: number[]) => "CONECT" + [from, ...to].map((n) => String(n).padStart(5)).join("");

describe("a PDB file, read", () => {
  it("reads an atom's fields from their columns", () => {
    const entry = readPdb(
      atomLine({ serial: 12, name: " CA", altLoc: "B", resName: "LYS", chainID: "C", resSeq: -3, iCode: "A", x: 1.5, y: -22.25, z: 333.125, occupancy: "0.50", tempFactor: "12.34", element: "C" }) + "\n",
    );
    expect(entry.models).toHaveLength(1);
    expect(entry.models[0].atoms[0]).toEqual({
      record: "ATOM",
      serial: 12,
      name: "CA",
      altLoc: "B",
      resName: "LYS",
      chainID: "C",
      resSeq: -3,
      iCode: "A",
      x: 1.5,
      y: -22.25,
      z: 333.125,
      occupancy: 0.5,
      tempFactor: 12.34,
      element: "C",
    });
  });

  it("takes an atom's element from its element columns - or, where they are blank, from how its name is aligned", () => {
    const line = (name: string, element = "") => atomLine({ record: "HETATM", serial: 1, name, x: 0, y: 0, z: 0, element });
    expect(elementOf(line(" CA", "C"))).toBe("C");
    expect(elementOf(line("FE", "FE"))).toBe("Fe");
    // (a one-letter element's name starts at column 14, a two-letter one's at 13)
    expect(elementOf(line(" CA"))).toBe("C");
    expect(elementOf(line("CA"))).toBe("Ca");
    expect(elementOf(line("FE1"))).toBe("Fe");
    expect(elementOf(line("1HG"))).toBe("H");
    expect(elementOf(line(" XX", "QQ"))).toBeUndefined();
  });

  it("reads a charge as the format writes it, a digit and its sign", () => {
    const atoms = readPdb(
      [
        atomLine({ record: "HETATM", serial: 1, name: "FE", x: 0, y: 0, z: 0, element: "FE", charge: "2+" }),
        atomLine({ record: "HETATM", serial: 2, name: " CL", x: 3, y: 0, z: 0, element: "CL", charge: "1-" }),
        atomLine({ record: "HETATM", serial: 3, name: " O", x: 6, y: 0, z: 0, element: "O" }),
      ].join("\n"),
    ).models[0].atoms;
    expect(atoms.map((a) => [a.element, a.charge])).toEqual([["Fe", 2], ["Cl", -1], ["O", undefined]]);
  });

  it("reads models between MODEL and ENDMDL, and where chains end by TER", () => {
    const model = (n: number, dx: number) => [
      `MODEL     ${String(n).padStart(4)}`,
      atomLine({ serial: 1, name: " N", x: dx, y: 0, z: 0, element: "N" }),
      atomLine({ serial: 2, name: " CA", x: dx + 1.5, y: 0, z: 0, element: "C" }),
      "TER       3      GLY A   1",
      atomLine({ record: "HETATM", serial: 4, name: " O", resName: "HOH", resSeq: 9, x: dx, y: 5, z: 0, element: "O" }),
      "ENDMDL",
    ];
    const entry = readPdb([...model(1, 0), ...model(2, 0.25)].join("\n"));
    expect(entry.models.map((m) => m.serial)).toEqual([1, 2]);
    expect(entry.models.map((m) => m.atoms.length)).toEqual([3, 3]);
    expect(entry.models[1].atoms[0].x).toBe(0.25);
    expect(entry.models[0].chainEnds).toEqual([2]);
  });

  it("reads each bond CONECT records give once, from both its atoms' records and over continued records", () => {
    const entry = readPdb(
      [
        atomLine({ record: "HETATM", serial: 1, name: " C1", x: 0, y: 0, z: 0, element: "C" }),
        conect(1, 2, 3, 4, 5),
        conect(1, 6),
        conect(2, 1),
        conect(6, 1, 6),
      ].join("\n"),
    );
    expect(entry.conect).toEqual([[1, 2], [1, 3], [1, 4], [1, 5], [1, 6]]);
  });

  it("reads what HEADER and TITLE say, the title's continued lines put together", () => {
    const entry = readPdb(
      [
        "HEADER    TEST STRUCTURE                          06-OCT-26   9ZZZ",
        "TITLE     A SMALL MOLECULE,   WRITTEN",
        "TITLE    2 BY HAND",
        atomLine({ serial: 1, name: " C", x: 0, y: 0, z: 0, element: "C" }),
      ].join("\n"),
    );
    expect(entry).toMatchObject({ idCode: "9ZZZ", classification: "TEST STRUCTURE", title: "A SMALL MOLECULE, WRITTEN BY HAND" });
  });

  it("counts the records it does not read yet, and the lines that are none, and stops at END", () => {
    const entry = readPdb(
      [
        "REMARK   2 RESOLUTION. 1.50 ANGSTROMS.",
        "REMARK   3",
        "CRYST1    1.000    1.000    1.000  90.00  90.00  90.00 P 1           1",
        "not a record at all",
        // (an atom whose coordinates do not read)
        "ATOM      1  C   GLY A   1       x.xxx   0.000   0.000  1.00  0.00           C",
        atomLine({ serial: 2, name: " C", x: 0, y: 0, z: 0, element: "C" }),
        "END",
        atomLine({ serial: 3, name: " C", x: 9, y: 9, z: 9, element: "C" }),
      ].join("\r\n"),
    );
    expect(entry.unread).toEqual({ REMARK: 2, CRYST1: 1 });
    expect(entry.unreadable).toBe(2);
    expect(entry.models[0].atoms.map((a) => a.serial)).toEqual([2]);
  });

  it("knows a line's record name by its first six columns", () => {
    expect(recordName("HETATM    1")).toBe("HETATM");
    expect(recordName("END")).toBe("END");
    expect(recordName("TER       3")).toBe("TER");
  });
});

/** A line with each field put in its columns, as a record's layout says: [first column, text] pairs. */
function fieldsLine(name: string, fields: [number, string][]): string {
  const line = Array(80).fill(" ");
  [[1, name.padEnd(6)] as [number, string], ...fields].forEach(([from, s]) => [...s].forEach((c, i) => (line[from - 1 + i] = c)));
  return line.join("").trimEnd();
}

describe("a PDB file's secondary structure, read", () => {
  it("reads a helix's residues, class, comment and length from their columns (HELIX)", () => {
    const helix = fieldsLine("HELIX", [
      [8, "  3"], [12, " H3"], [16, "LEU"], [20, "B"], [22, "  12"], [26, "A"],
      [28, "SER"], [32, "B"], [34, "  25"], [38, " "], [39, " 5"], [41, "a 3-10 one"], [72, "   14"],
    ]);
    // (no class given: right-handed alpha, the default)
    const plain = fieldsLine("HELIX", [[8, "  4"], [12, " H4"], [16, "ALA"], [20, "B"], [22, "  40"], [28, "LYS"], [32, "B"], [34, "  47"]]);
    const entry = readPdb([helix, plain].join("\n"));
    expect(entry.helices).toEqual([
      {
        serNum: 3,
        helixID: "H3",
        init: { resName: "LEU", chainID: "B", seqNum: 12, iCode: "A" },
        end: { resName: "SER", chainID: "B", seqNum: 25, iCode: "" },
        helixClass: 5,
        comment: "a 3-10 one",
        length: 14,
      },
      { serNum: 4, helixID: "H4", init: { resName: "ALA", chainID: "B", seqNum: 40, iCode: "" }, end: { resName: "LYS", chainID: "B", seqNum: 47, iCode: "" }, helixClass: 1 },
    ]);
    expect(entry.unread).toEqual({});
  });

  it("reads a strand's residues, sense and registration from their columns (SHEET)", () => {
    const first = fieldsLine("SHEET", [[8, "  1"], [12, "  S"], [15, " 2"], [18, "VAL"], [22, "A"], [23, "   3"], [29, "ILE"], [33, "A"], [34, "   7"], [39, " 0"]]);
    const second = fieldsLine("SHEET", [
      [8, "  2"], [12, "  S"], [15, " 2"], [18, "THR"], [22, "A"], [23, "  20"], [29, "GLU"], [33, "A"], [34, "  24"], [39, "-1"],
      [42, " N  "], [46, "THR"], [50, "A"], [51, "  22"], [57, " O  "], [61, "VAL"], [65, "A"], [66, "   5"],
    ]);
    const entry = readPdb([first, second].join("\n"));
    expect(entry.strands[0]).toEqual({
      strand: 1,
      sheetID: "S",
      numStrands: 2,
      init: { resName: "VAL", chainID: "A", seqNum: 3, iCode: "" },
      end: { resName: "ILE", chainID: "A", seqNum: 7, iCode: "" },
      sense: 0,
    });
    expect(entry.strands[1].sense).toBe(-1);
    expect(entry.strands[1].registration).toEqual({
      cur: { resName: "THR", chainID: "A", seqNum: 22, iCode: "", atom: "N" },
      prev: { resName: "VAL", chainID: "A", seqNum: 5, iCode: "", atom: "O" },
    });
  });

  it("counts a record whose residues do not read as unreadable, and goes on", () => {
    const entry = readPdb(fieldsLine("HELIX", [[8, "  1"], [16, "ALA"], [22, "  xx"]]));
    expect(entry.helices).toEqual([]);
    expect(entry.unreadable).toBe(1);
  });
});

describe("a PDB file, written", () => {
  const water: PdbWriteMolecule = {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.757, y: 0.586, z: 0 },
      { el: "H", x: -0.757, y: 0.586, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1 },
      { a1: 0, a2: 2 },
    ],
  };

  it("puts each field of an atom's record in its columns, every line 80 columns", () => {
    const lines = writePdb([[water, { atoms: [{ el: "Fe", x: -123.4567, y: 1, z: 2, charge: 3 }], bonds: [] }]]).split("\n");
    expect(lines.slice(0, -1).every((l) => l.length === 80)).toBe(true);
    const [o, h1, , fe] = lines;
    expect(cols(o, 1, 6)).toBe("HETATM");
    expect(cols(o, 7, 11)).toBe("    1");
    expect(cols(o, 13, 16)).toBe(" O1 ");
    expect(cols(h1, 13, 16)).toBe(" H1 ");
    expect(cols(o, 18, 20)).toBe("UNL");
    expect(cols(o, 22, 22)).toBe("A");
    expect(cols(o, 23, 26)).toBe("   1");
    expect(cols(h1, 31, 38)).toBe("   0.757");
    expect(cols(h1, 39, 46)).toBe("   0.586");
    expect(cols(o, 55, 60)).toBe("  1.00");
    expect(cols(o, 61, 66)).toBe("  0.00");
    expect(cols(o, 77, 78)).toBe(" O");
    expect(cols(o, 79, 80)).toBe("  ");
    // (a two-letter element's name from column 13; a molecule a residue of its own; a charge as a digit and its sign)
    expect(cols(fe, 13, 16)).toBe("FE1 ");
    expect(cols(fe, 23, 26)).toBe("   2");
    expect(cols(fe, 31, 38)).toBe("-123.457");
    expect(cols(fe, 77, 80)).toBe("FE3+");
  });

  it("names an atom by its element alone where its number among them does not fit", () => {
    const carbons = Array.from({ length: 100 }, (_, i) => ({ el: "C", x: i, y: 0, z: 0 }));
    const lines = writePdb([[{ atoms: carbons, bonds: [] }]]).split("\n");
    expect(cols(lines[98], 13, 16)).toBe(" C99");
    expect(cols(lines[99], 13, 16)).toBe(" C  ");
  });

  it("gives every bond in CONECT records from both its atoms, in increasing order, four to a record, after the coordinates", () => {
    const hub = {
      atoms: Array.from({ length: 6 }, (_, i) => ({ el: "C", x: i, y: 0, z: 0 })),
      bonds: [5, 1, 3, 2, 4].map((n) => ({ a1: 0, a2: n })),
    };
    const lines = writePdb([[hub]]).split("\n").map((l) => l.trimEnd());
    expect(lines.filter((l) => l.startsWith("CONECT"))).toEqual([
      conect(1, 2, 3, 4, 5),
      conect(1, 6),
      conect(2, 1),
      conect(3, 1),
      conect(4, 1),
      conect(5, 1),
      conect(6, 1),
    ]);
    expect(lines[lines.length - 2]).toBe("END");
  });

  it("writes MODEL and ENDMDL records only where there is more than one model", () => {
    expect(writePdb([[water]])).not.toMatch(/^MODEL/m);
    const two = writePdb([[water], [water]]).split("\n").map((l) => l.trimEnd());
    expect(two.filter((l) => /^(MODEL|ENDMDL)/.test(l))).toEqual(["MODEL        1", "ENDMDL", "MODEL        2", "ENDMDL"]);
    // (each model's atoms numbered from 1, so that one set of CONECT records serves them all)
    expect(two.filter((l) => l.startsWith("CONECT"))).toHaveLength(3);
  });

  it("refuses what the format cannot hold", () => {
    expect(() => writePdb([[{ atoms: [{ el: "Ph", x: 0, y: 0, z: 0 }], bonds: [] }]])).toThrow(/no element/);
    expect(() => writePdb([[{ atoms: [{ el: "C", x: 12345.678, y: 0, z: 0 }], bonds: [] }]])).toThrow(/does not fit/);
    const many = Array.from({ length: MOST_ATOMS + 1 }, () => ({ el: "H", x: 0, y: 0, z: 0 }));
    expect(() => writePdb([[{ atoms: many, bonds: [] }]])).toThrow(/at most 99,999 atoms/);
  });

  it("reads back as it was written", () => {
    const entry = readPdb(writePdb([[water, { atoms: [{ el: "Fe", x: 4, y: 5, z: 6, charge: 2 }], bonds: [] }]]));
    expect(entry.models[0].atoms.map((a) => [a.element, a.x, a.y, a.z, a.charge, a.resSeq])).toEqual([
      ["O", 0, 0, 0, undefined, 1],
      ["H", 0.757, 0.586, 0, undefined, 1],
      ["H", -0.757, 0.586, 0, undefined, 1],
      ["Fe", 4, 5, 6, 2, 2],
    ]);
    expect(entry.conect).toEqual([[1, 2], [1, 3]]);
    expect(entry.unreadable).toBe(0);
  });

  it("is how Meno's sample is written: cholesterol's atoms and bonds", () => {
    const entry = readPdb(sample);
    expect(entry.models[0].atoms).toHaveLength(74);
    expect(entry.conect).toHaveLength(77);
  });
});
