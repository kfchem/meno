import { describe, expect, it } from "vitest";
import { BOHR, formulaOf, readCoordinates, textOfPages, type PlacedPage, type PlacedWord } from "./coordinates";

// Coordinates made up for these tests - water, methane, ethanol, set out as a
// supporting information's pages set them - none taken from any paper.
const WATER = ["O 0.000000 0.000000 0.117300", "H 0.000000 0.757200 -0.469200", "H 0.000000 -0.757200 -0.469200"];
const METHANE = ["C 0.000000 0.000000 0.000000", "H 0.629118 0.629118 0.629118", "H -0.629118 -0.629118 0.629118", "H -0.629118 0.629118 -0.629118", "H 0.629118 -0.629118 -0.629118"];
const ETHANOL = [
  "C -1.170000 -0.400000 0.000000",
  "C 0.190000 0.290000 0.000000",
  "O 1.200000 -0.710000 0.000000",
  "H -1.980000 0.330000 0.000000",
  "H -1.280000 -1.040000 0.880000",
  "H -1.280000 -1.040000 -0.880000",
  "H 0.300000 0.930000 0.880000",
  "H 0.300000 0.930000 -0.880000",
  "H 2.040000 -0.240000 0.000000",
];
const lines = (...ls: (string | string[])[]) => ls.flat().join("\n");
const read = (text: string) => readCoordinates(text);

describe("coordinates in a text", () => {
  it("reads a structure under its name, with its energy as a note and its charge and multiplicity", () => {
    const [s, ...more] = read(lines("Optimized structures", "", "TS1", "E = -154.987654 Hartree", "0 1", ETHANOL));
    expect(more).toHaveLength(0);
    expect(s.name).toBe("TS1");
    expect(s.notes).toEqual(["E = -154.987654 Hartree"]);
    expect([s.charge, s.multiplicity]).toEqual([0, 1]);
    expect(formulaOf(s.atoms)).toBe("C2H6O");
    expect(s.atoms[2]).toEqual({ el: "O", x: 1.2, y: -0.71, z: 0 });
    expect(s.warnings).toEqual([]);
  });

  it("reads Gaussian's molecule specification: labels, a freeze code, commas", () => {
    const text = lines("0,1", "C1,0,-1.170000,-0.400000,0.000000", "C2 -1 0.190000 0.290000 0.000000", ETHANOL.slice(2).map((l) => l.replace(" ", " 0 ")));
    const [s] = read(text);
    expect(s.atoms.map((a) => a.el).join("")).toBe("CCOHHHHHH");
    expect(s.atoms[1]).toEqual({ el: "C", x: 0.19, y: 0.29, z: 0 });
    expect([s.charge, s.multiplicity]).toEqual([0, 1]);
  });

  it("reads Gaussian's table of an orientation: centre, atomic number, type, x y z", () => {
    const rule = "---------------------------------------------------------------------";
    const text = lines(
      "Standard orientation:",
      rule,
      "Center Atomic Atomic Coordinates (Angstroms)",
      "Number Number Type X Y Z",
      rule,
      "1 8 0 0.000000 0.000000 0.117300",
      "2 1 0 0.000000 0.757200 -0.469200",
      "3 1 0 0.000000 -0.757200 -0.469200",
      rule,
    );
    const [s] = read(text);
    expect(formulaOf(s.atoms)).toBe("H2O");
    expect(s.atoms[1].y).toBeCloseTo(0.7572);
  });

  it("reads numbered atoms, and atomic numbers for symbols, and a count begun again as a new structure", () => {
    const numbered = (ls: string[]) => ls.map((l, i) => `${i + 1} ${l}`);
    const ss = read(lines(numbered(WATER), numbered(METHANE)));
    expect(ss.map((s) => formulaOf(s.atoms))).toEqual(["H2O", "CH4"]);
    const [z] = read(lines(WATER.map((l) => l.replace(/^O/, "8").replace(/^H/, "1"))));
    expect(formulaOf(z.atoms)).toBe("H2O");
  });

  it("reads on across a page's end: its number, its running head and foot, and lines broken anywhere", () => {
    const foot = "J. Made-Up Chem. 2026, 1, 1-40";
    const head = "Supporting Information for a Made-Up Paper";
    const text = lines(
      head,
      "Compound 3a",
      "0 1",
      ETHANOL.slice(0, 4),
      // (a line broken by the viewer, and the page's end)
      "H -1.280000",
      "-1.040000 0.880000",
      foot,
      "S12",
      head,
      ETHANOL.slice(5),
      "Page 13 of 40",
      foot,
    );
    const ss = read(text);
    expect(ss).toHaveLength(1);
    expect(ss[0].name).toBe("Compound 3a");
    expect(ss[0].atoms).toHaveLength(9);
    expect(ss[0].warnings).toEqual([]);
  });

  it("reads on across a page's foot set once, where the parts bond as one, and parts two structures that do not", () => {
    const once = read(lines("Ethanol", ETHANOL.slice(0, 5), "Printed for review only, one copy", ETHANOL.slice(5)));
    expect(once.map((s) => s.atoms.length)).toEqual([9]);
    const two = read(lines("Water", WATER, "Methane", METHANE));
    expect(two.map((s) => [s.name, formulaOf(s.atoms)])).toEqual([
      ["Water", "H2O"],
      ["Methane", "CH4"],
    ]);
  });

  it("parts structures written as XYZ files are, each its count and its name", () => {
    const ss = read(lines("3", "water", WATER, "5", "", METHANE));
    expect(ss.map((s) => [s.name, s.stated, s.atoms.length])).toEqual([
      ["water", 3, 3],
      ["Structure 2", 5, 5],
    ]);
  });

  it("turns lengths given in bohr into ångströms", () => {
    const inBohr = WATER.map((l) => l.replace(/-?\d+\.\d+/g, (n) => (Number(n) / BOHR).toFixed(6)));
    const [s] = read(lines("Water (coordinates in bohr)", inBohr));
    expect([s.name, s.bohr]).toEqual(["Water", true]);
    expect(s.atoms[1].y).toBeCloseTo(0.7572, 5);
  });

  it("reads a minus however the page printed it", () => {
    const [s] = read(lines(WATER.map((l) => l.replace(/-/g, "−"))));
    expect(s.atoms[1].z).toBeCloseTo(-0.4692);
  });

  it("says where the count the text gives is not the atoms found, an atom stands apart, or two stand closer than a bond", () => {
    const [short] = read(lines("Water, 4 atoms", WATER));
    expect(short.warnings).toContain("The text gives 4 atoms; 3 are here.");
    const [apart] = read(lines("Methane", METHANE, "Cl 9.000000 0.000000 0.000000"));
    expect(apart.warnings).toContain("An atom stands far from all the others.");
    const [near] = read(lines("Water", WATER, "H 0.000000 0.757200 -0.200000"));
    expect(near.warnings).toContain("Two atoms stand closer than any bond.");
  });

  it("tells two columns read across apart: two atoms on a line, or the lines of each in turn", () => {
    const across = read(lines("Water   Ethanol", WATER.map((l, i) => `${l}   ${ETHANOL[i]}`), ETHANOL.slice(3)));
    expect(across.map((s) => [s.name, formulaOf(s.atoms)])).toEqual([
      ["Water", "H2O"],
      ["Ethanol", "C2H6O"],
    ]);
    // (two columns ended unevenly, each about the origin: the methane's last atoms, alone on their lines, the methane's - as
    // the water's an H would be bonded twice)
    const uneven = read(lines("Left", WATER.map((l, i) => `${l}   ${METHANE[i]}`), METHANE.slice(3)));
    expect(uneven.map((s) => formulaOf(s.atoms))).toEqual(["H2O", "CH4"]);
    const inTurn = read(lines("Two", ETHANOL.flatMap((l, i) => [l, ETHANOL.map((m) => m.replace(/(-?\d+\.\d+)/, (x) => String(Number(x) + 10)))[i]])));
    expect(inTurn.map((s) => formulaOf(s.atoms))).toEqual(["C2H6O", "C2H6O"]);
  });

  it("marks atoms that came mixed and cannot be told apart, rather than guessing", () => {
    // (ethanol and methane, taken in turn but unevenly: no every-other reading makes each whole)
    const order = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1];
    const a = [...ETHANOL];
    const b = METHANE.map((m) => m.replace(/(-?\d+\.\d+)/, (x) => String(Number(x) + 10)));
    const mixed = order.map((w) => (w ? b.shift() : a.shift())!);
    const [s] = read(lines("Mixed", mixed));
    expect(s.mixed).toBe(true);
    expect(s.warnings[0]).toMatch(/columns came mixed/);
  });

  it("reads a text whose lines' ends were made spaces, as some copies make them: each structure, its charge and multiplicity", () => {
    const ss = read(lines("Water", "E = -76.4 Hartree", "0 1", WATER, "Methane", "1 2", METHANE).replace(/\n/g, " "));
    expect(ss.map((s) => [s.name, formulaOf(s.atoms), s.charge, s.multiplicity, s.notes])).toEqual([
      ["Water", "H2O", 0, 1, ["E = -76.4 Hartree"]],
      ["Methane", "CH4", 1, 2, []],
    ]);
  });

  it("reads lengths in ångströms where only the energies are given in atomic units", () => {
    const [s] = read(lines("TS1", "SCF energy (a.u.) = -154.987654", "ZPE (a.u.) = 0.081234", ETHANOL));
    expect(s.bohr).toBe(false);
    expect(s.atoms[0]).toEqual({ el: "C", x: -1.17, y: -0.4, z: 0 });
    expect(s.warnings).toEqual([]);
    // (said of the coordinates, atomic units are bohr still)
    expect(read(lines("TS1", "Cartesian coordinates (a.u.)", ETHANOL))[0].bohr).toBe(true);
  });

  it("takes a compound's number set alone over its atoms for its name, not their count - unless it counts them", () => {
    const [s] = read(lines("Coordinates", "1", "SCF energy (a.u.) = -154.987654", ETHANOL));
    expect(s.name).toBe("1");
    expect(s.stated).toBeUndefined();
    expect(s.warnings).toEqual([]);
    const [xyz] = read(lines("9", "Ethanol", ETHANOL));
    expect([xyz.name, xyz.stated]).toEqual(["Ethanol", 9]);
  });

  it("reads no lone atom met among a text's words or another table's numbers - but one said to be a structure", () => {
    // (an elemental analysis, a peak list with the page's number set in it)
    expect(read(lines("Elemental analysis calculated (%):", "C 61.250 H 5.140 N 8.930", "found C 61.180 H 5.200 N 8.870."))).toEqual([]);
    expect(read(lines("1H NMR peaks", "7.2512 7.2488 7.2401 S9 4.1123 4.1019 4.0915 1.2534 1.2411"))).toEqual([]);
    const [ion] = read(lines("Chloride", "E = -460.123456 Hartree", "-1 1", "Cl 0.000000 0.000000 0.000000"));
    expect([ion.name, ion.atoms.length, ion.charge]).toEqual(["Chloride", 1, -1]);
  });

  it("reads no crystal structure's table: fractions of its cell, with their uncertainties", () => {
    const table = [
      "Fractional atomic coordinates and isotropic displacement parameters",
      "x y z Uiso*/Ueq",
      "C1 0.51234 (12) 0.43210 (9) 0.21098 (8) 0.0201 (3)",
      "C2 0.60123 (12) 0.38765 (9) 0.27654 (8) 0.0195 (3)",
      "H2A 0.6512 0.4401 0.3012 0.023*",
      "H2B 0.6623 0.3502 0.2401 0.023*",
      "O3 0.55432 (10) 0.29876 (7) 0.33210 (6) 0.0221 (2)",
    ];
    expect(read(lines(table))).toEqual([]);
  });

  it("reads no table of positions numbered 1, 2, 3 with their values beside them", () => {
    expect(read(lines("13C NMR shifts", "position δ(a) δ(b) Δδ", "1 171.4 171.3 0.1", "2 128.9 129.1 -0.2", "3 55.2 55.2 0.0", "4 21.7 21.6 0.1"))).toEqual([]);
  });

  it("reads nothing from a text with no atoms in it", () => {
    expect(read("Table S1. Energies (kcal/mol)\nTS1 12.3 14.5 16.7\nTS2 10.1 11.2 12.3")).toEqual([]);
  });
});

describe("a formula", () => {
  it("is written as Hill writes it", () => {
    expect(formulaOf([{ el: "O" }, { el: "C" }, { el: "H" }, { el: "H" }, { el: "N" }, { el: "C" }])).toBe("C2H2NO");
    expect(formulaOf([{ el: "Cl" }, { el: "Na" }])).toBe("ClNa");
  });
});

describe("coordinates selected in a PDF, each word where it lies", () => {
  // (a US letter page; words in 9-point type, 5 points a letter, lines 11 points apart)
  const W = 612;
  const H = 792;
  /** Lines of words set from (x, y) down, each word where its letters fall; `at` sets a line's words at given x's instead. */
  const set = (ls: readonly string[], x: number, y: number, at?: readonly number[]): PlacedWord[] =>
    ls.flatMap((l, k) => {
      let left = x;
      return l.split(/\s+/).map((text, j) => {
        const x0 = at ? at[j] : left;
        left = x0 + 5 * text.length + 4;
        return { text, box: [x0, y + 11 * k, x0 + 5 * text.length, y + 11 * k + 9] as const };
      });
    });
  const page = (...words: PlacedWord[][]): PlacedPage => ({ words: words.flat(), width: W, height: H });
  const head = (n: number) => [...set(["Supporting Information"], 230, 30), ...set([`S${n}`], 300, 760), ...set(["J. Made-Up Chem. 2026"], 60, 760)];

  it("reads a page's two columns one after the other, and on over the page, its heads, feet and numbers left out", () => {
    const pages = [
      // (the ethanol begun at the foot of the left column and run on at the top of the right; the water after it, run on to the next page)
      // (an energy beside each name: a number on a line no atom's)
      page(head(12), set(["Compound 1", "E = -154.987654 Hartree", "0 1", ...ETHANOL.slice(0, 5)], 60, 600), set([...ETHANOL.slice(5), "Water", "E = -76.401234 Hartree", "0 1", WATER[0]], 330, 80)),
      page(head(13), set(WATER.slice(1), 60, 80)),
    ];
    const ss = readCoordinates(textOfPages(pages));
    expect(ss.map((s) => [s.name, formulaOf(s.atoms), s.warnings])).toEqual([
      ["Compound 1", "C2H6O", []],
      ["Water", "H2O", []],
    ]);
  });

  it("reads a page of atoms in one column beside notes in the other, a heading across both, minus signs printed true", () => {
    // (each structure's energies in the left column, its atoms in the right, line by line; its name over both)
    const notes = ["SCF energy (a.u.) = -154.987654", "ZPE (a.u.) = 0.081234", "Gibbs energy (a.u.) = -155.012345"];
    const atoms = ETHANOL.map((l) => l.replace(/-/g, "\u2212"));
    const words = [
      ...set(["Coordinates of each structure, with its energies beside it"], 60, 60),
      ...set(["Compound 1"], 60, 80),
      ...set(notes, 60, 91),
      ...set(atoms, 330, 91),
    ];
    // (its heads and feet those of every page, the next one's the water's, set out alike)
    const next = [...set(["Water"], 60, 80), ...set(notes, 60, 91), ...set(WATER, 330, 91)];
    const [s, w, ...more] = readCoordinates(textOfPages([page(head(14), words), page(head(15), next)]));
    expect(more).toHaveLength(0);
    expect([s.name, formulaOf(s.atoms), s.warnings, !!s.mixed]).toEqual(["Compound 1", "C2H6O", [], false]);
    expect([w.name, formulaOf(w.atoms), w.notes]).toEqual(["Water", "H2O", notes]);
    expect(s.atoms[0]).toEqual({ el: "C", x: -1.17, y: -0.4, z: 0 });
  });

  it("reads a table of one column, its x, y and z set far apart, as one", () => {
    const rows = ETHANOL.map((l) => l.split(" "));
    const words = rows.flatMap((r, k) => set([r.join(" ")], 72, 100 + 11 * k, [72, 180, 330, 480]).map((w) => ({ ...w, box: [w.box[0], 100 + 11 * k, w.box[2], 109 + 11 * k] as const })));
    const [s, ...more] = readCoordinates(textOfPages([page(words)]));
    expect(more).toHaveLength(0);
    expect(formulaOf(s.atoms)).toBe("C2H6O");
    expect(s.atoms[0]).toEqual({ el: "C", x: -1.17, y: -0.4, z: 0 });
  });
});
