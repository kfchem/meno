import { describe, expect, it } from "vitest";
import { ABOUT_FOCUS, aboveText, bySource, chipLine, grouped, isMarked, numberText, pairValue, readResults, resultKey, resultsOn, symmetryText, valueText, type ListResult, type MoleculeResult, type PairsResult } from "./results";
import { cardGroupsOf, readerNameOf, titled } from "./sources";

describe("a calculation's results, as a plugin gives them", () => {
  it("are kept where they read as results for the molecule's atoms and frames", () => {
    const given = [
      { id: "dipole", on: "molecule", group: "Properties", label: "Dipole moment", quantity: "dipole", value: 1.85, rank: 2 },
      { id: "grad", on: "frames", group: "Optimisation", label: "RMS gradient", unit: "Eh/bohr", digits: 6, values: [0.01, 0.001] },
      { id: "q", on: "atoms", group: "Partial charges", label: "Mulliken", quantity: "charge", values: [-0.4, 0.2, 0.2] },
      { id: "wbi", on: "pairs", group: "NBO", label: "Wiberg bond index", pairs: [[0, 1, 0.82], [0, 2, 0.82], [0, 9, 1], [1, 1, 1]] },
      {
        id: "e2",
        on: "list",
        group: "NBO",
        label: "Donor-acceptor interactions",
        columns: [{ label: "Donor" }, { label: "Acceptor" }, { label: "E(2)", unit: "kcal/mol", digits: 2 }],
        rows: [{ cells: ["LP(1) O 1", "BD*(1) O 1-H 2", 1.23], atoms: [0, 1, 7], frame: 1 }],
        focus: 0,
      },
    ];
    const r = readResults(given, 3, 2, "NBO 7");
    expect(r.map((x) => x.id)).toEqual(["dipole", "grad", "q", "wbi", "e2"]);
    expect(r.every((x) => x.from === "NBO 7")).toBe(true);
    // (pairs of atoms it has not, or of one atom with itself, left out)
    expect((r[3] as PairsResult).pairs).toEqual([
      [0, 1, 0.82],
      [0, 2, 0.82],
    ]);
    // (a row's atoms, one of which the molecule has not, left out; its frame, which it has, kept)
    const row = r[4].on === "list" ? r[4].rows[0] : null;
    expect(row).toEqual({ cells: ["LP(1) O 1", "BD*(1) O 1-H 2", 1.23], frame: 1 });
  });

  it("are not kept where they do not read: the wrong count, an unknown kind, no name, values that are no values", () => {
    const bad = [
      { id: "q", on: "atoms", group: "Partial charges", label: "Mulliken", values: [1, 2] },
      { id: "x", on: "somewhere", group: "G", label: "L", value: 1 },
      { id: "y", on: "molecule", group: "G", value: 1 },
      { id: "z", on: "molecule", group: "G", label: "L", value: { a: 1 } },
      { id: "w", on: "frames", group: "G", label: "L", values: [1, Infinity] },
      { id: "v", on: "list", group: "G", label: "L", columns: [{ label: "A" }], rows: [{ cells: [1, 2] }] },
      "text",
      null,
    ];
    expect(readResults(bad, 3, 2)).toEqual([]);
    expect(readResults("not a list", 3, 2)).toEqual([]);
  });

  it("keep a quantity Meno knows, or else the unit given, and no other", () => {
    const [a, b] = readResults(
      [
        { id: "a", on: "molecule", group: "G", label: "A", quantity: "energy", unit: "kJ/mol", value: -1 },
        { id: "b", on: "molecule", group: "G", label: "B", quantity: "loudness", unit: "dB", value: 3 },
      ],
      1,
      1,
    );
    expect([a.on === "molecule" && a.quantity, a.on === "molecule" && a.unit]).toEqual(["energy", undefined]);
    expect([b.on === "molecule" && b.quantity, b.on === "molecule" && b.unit]).toEqual([undefined, "dB"]);
  });

  it("keep two readers' results of one name, each its own reader's - but not one reader's twice", () => {
    const one = { id: "q", on: "atoms", group: "Partial charges", label: "Mulliken", values: [0] };
    const r = readResults([{ ...one, from: "cclib" }, { ...one, from: "other" }, { ...one, from: "cclib" }], 1, 1);
    expect(r.map((x) => [x.id, x.from])).toEqual([
      ["q", "cclib"],
      ["q", "other"],
    ]);
    expect(resultKey(r[0])).not.toBe(resultKey(r[1]));
  });
});

describe("a surface coloured by another grid", () => {
  const grid = { origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], counts: [2, 2, 2], values: "A".repeat(4 * Math.ceil(32 / 3)) };
  const list = (colour: unknown) => [{ id: "nci", on: "list", group: "NCI", label: "NCI", columns: [{ label: "Surface" }], rows: [{ cells: ["x"], surface: grid, colour }] }];
  it("is read with the grid or promise that colours it, the values its scale runs between, and what they are", () => {
    const [r] = readResults(list({ by: grid, from: -0.035, to: 0.02, label: "sign(λ2)ρ (a.u.)" }), 1, 1);
    expect(r.on === "list" && r.rows[0].colour).toMatchObject({ from: -0.035, to: 0.02, label: "sign(λ2)ρ (a.u.)" });
    const [p] = readResults(list({ by: { ask: "grid:1" }, from: -1, to: 1 }), 1, 1);
    expect(p.on === "list" && p.rows[0].colour).toEqual({ by: { ask: "grid:1" }, from: -1, to: 1 });
  });
  it("is left uncoloured where what colours it reads as nothing: no grid, a scale running nowhere", () => {
    for (const bad of [{ from: 0, to: 1 }, { by: grid, from: 1, to: 1 }, { by: grid, from: 0 }, "red"]) {
      const [r] = readResults(list(bad), 1, 1);
      expect(r.on === "list" && r.rows[0].colour).toBeUndefined();
    }
  });
});

describe("a result's values, as Meno writes them", () => {
  it("in the quantity's unit, to its decimals, with a true minus", () => {
    expect(valueText(-382.0550901, { quantity: "energy" })).toBe("−382.055090 Eh");
    expect(valueText(0.2134, { quantity: "charge" })).toBe("+0.213");
    expect(valueText(-0.4128, { quantity: "charge" })).toBe("−0.413");
    expect(valueText(0.0001, { quantity: "charge" })).toBe("0.000");
    expect(valueText(1650.24, { quantity: "wavenumber" })).toBe("1650.2 cm⁻¹");
    expect(valueText(-120.46, { quantity: "wavenumber" })).toBe("120.5i cm⁻¹");
    expect(valueText(1.85, { quantity: "dipole" })).toBe("1.85 D");
    expect(valueText(109.47, { quantity: "angle" })).toBe("109.5°");
    expect(valueText(0.96, { quantity: "length" })).toBe("0.960 Å");
    expect(valueText(-0.0000001, { quantity: "number" })).toBe("0.0000");
  });

  it("with the unit given, at most four decimals, none trailing; or as many as given", () => {
    expect(valueText(298.15, { unit: "K" })).toBe("298.15 K");
    expect(valueText(90.3141, { unit: "cal/(mol·K)", digits: 2 })).toBe("90.31 cal/(mol·K)");
    expect(valueText(3, {})).toBe("3");
    expect(valueText(7, { quantity: "number", digits: 0 })).toBe("7");
  });

  it("a text as it is; none, a dash", () => {
    expect(valueText("HOMO", {})).toBe("HOMO");
    expect(valueText(null, { quantity: "energy" })).toBe("–");
  });

  it("marked where an imaginary frequency", () => {
    expect(isMarked(-120, { quantity: "wavenumber" })).toBe(true);
    expect(isMarked(120, { quantity: "wavenumber" })).toBe(false);
    expect(isMarked(-1, { quantity: "energy" })).toBe(false);
  });
});

describe("where results are said", () => {
  const results = readResults(
    [
      { id: "g", on: "molecule", group: "Thermochemistry", label: "Gibbs free energy", quantity: "energy", value: -381.911145, rank: 1 },
      { id: "h", on: "molecule", group: "Thermochemistry", label: "Enthalpy", quantity: "energy", value: -381.868235 },
      { id: "d", on: "molecule", group: "Properties", label: "Dipole moment", quantity: "dipole", value: 0, rank: 2 },
      { id: "q", on: "atoms", group: "Partial charges", label: "Mulliken", quantity: "charge", values: [0] },
      { id: "s", on: "molecule", group: "Thermochemistry", label: "Temperature", unit: "K", value: 298.15 },
      { id: "wbi", on: "pairs", group: "NBO", label: "Wiberg bond index", pairs: [[0, 1, 0.82]] },
    ],
    2,
    1,
  );

  it("in the chip's line: what it says first, then the ranked, as many as the line holds", () => {
    expect(chipLine(["ORCA 6.0.1 · DFT/STO-3G", "−382.055090 Eh"], results, 110)).toBe(
      "ORCA 6.0.1 · DFT/STO-3G · −382.055090 Eh · Gibbs free energy −381.911145 Eh · Dipole moment 0.00 D",
    );
    expect(chipLine(["ORCA 6.0.1 · DFT/STO-3G", "−382.055090 Eh"], results, 80)).toBe(
      "ORCA 6.0.1 · DFT/STO-3G · −382.055090 Eh · Gibbs free energy −381.911145 Eh",
    );
    expect(chipLine(["", "−1.000000 Eh"], undefined)).toBe("−1.000000 Eh");
  });

  it("in the chip's line, how the run went - ranked 0 - however long the line", () => {
    const run = readResults(
      [
        { id: "run", on: "molecule", group: "Calculation", label: "Run", value: "did not come to its end", rank: 0 },
        { id: "d", on: "molecule", group: "Properties", label: "Dipole moment", value: 2.37, quantity: "dipole", rank: 2 },
      ],
      3,
      13,
      "cclib 1.9rc1",
    );
    const first = ["Gaussian 2016+B.01 · HF/STO-3G · charge 0, singlet", "−229.293084 Eh"];
    expect(chipLine(first, run)).toBe("Gaussian 2016+B.01 · HF/STO-3G · charge 0, singlet · −229.293084 Eh · Run did not come to its end");
    expect(chipLine(first, run, 200)).toBe("Gaussian 2016+B.01 · HF/STO-3G · charge 0, singlet · −229.293084 Eh · Run did not come to its end · Dipole moment 2.37 D");
  });

  it("by their groups, in the order the groups first come", () => {
    expect(grouped(resultsOn(results, "molecule")).map((g) => [g.group, g.results.map((r) => r.id)])).toEqual([
      ["Thermochemistry", ["g", "h", "s"]],
      ["Properties", ["d"]],
    ]);
  });

  it("a pair's, whichever way round it is asked for", () => {
    const wbi = resultsOn(results, "pairs")[0];
    expect(pairValue(wbi, 1, 0)).toBe(0.82);
    expect(pairValue(wbi, 0, 2)).toBeUndefined();
  });
});

describe("results from two readers", () => {
  const one = (from: string, id: string, label: string, value: number, rank?: number) => ({ id, on: "molecule", group: "Properties", label, value, from, ...(rank ? { rank } : {}) });
  const results = readResults(
    [one("cclib", "dipole", "Dipole moment", 1.8, 1), one("pyscf", "dipole", "Dipole moment", 1.9, 1), one("pyscf", "s2", "<S²>", 0.75, 2)],
    1,
    1,
  );

  it("stand side by side, each under its reader's name - none where one reader gave them all", () => {
    expect(bySource(results, readerNameOf).map((p) => [p.source, p.results.length])).toEqual([
      ["cclib", 1],
      ["PySCF", 2],
    ]);
    expect(bySource(results.slice(0, 1), readerNameOf)).toEqual([{ results: results.slice(0, 1) }]);
    const groups = cardGroupsOf(resultsOn(results, "molecule"), (r) => ({ text: valueText(r.value, r) }));
    expect(groups.map((g) => [g.source, g.group, g.rows.map((r) => r.text)])).toEqual([
      ["cclib", "Properties", ["1.8"]],
      ["PySCF", "Properties", ["1.9", "0.75"]],
    ]);
  });

  it("are named by their reader where another's of the kind stand beside them, a menu's lists", () => {
    expect(titled({ label: "Molecular orbitals", from: "pyscf" }, [{ from: "cclib" }, { from: "pyscf" }])).toBe("Molecular orbitals · PySCF");
    expect(titled({ label: "Molecular orbitals", from: "cclib" }, [{ from: "cclib" }])).toBe("Molecular orbitals");
    expect(readerNameOf("cclib")).toBe("cclib");
    expect(readerNameOf("meno")).toBe("Meno");
  });

  it("fill the chip's line from one reader: the first that ranked any", () => {
    expect(chipLine(["ORCA"], results, 200)).toBe("ORCA · Dipole moment 1.8");
    expect(chipLine(["ORCA"], results.slice(1), 200)).toBe("ORCA · Dipole moment 1.9 · <S²> 0.75");
  });
});

// (the numbers audit, 2026-10-14: the same quantity written the same way wherever it shows)
describe("a number, wherever Meno writes one", () => {
  it("has a true minus, and is never minus nought", () => {
    expect(numberText(-1.5, 2)).toBe("\u22121.50");
    expect(numberText(-0.0001, 3)).toBe("0.000");
    expect(valueText(-0.0000001, { quantity: "energy" })).toBe("0.000000 Eh");
  });

  it("signs a spin population as it signs a charge", () => {
    expect(valueText(0.52, { quantity: "spin" })).toBe("+0.520");
    expect(valueText(-0.13, { quantity: "spin" })).toBe("\u22120.130");
    expect(valueText(0.0001, { quantity: "spin" })).toBe("0.000");
    expect(valueText(0.52, { quantity: "charge" })).toBe("+0.520");
  });

  it("writes an energy above the lowest with its decimals chosen once it is rounded", () => {
    expect(aboveText(1.234)).toBe("1.23 kcal/mol");
    expect(aboveText(9.994)).toBe("9.99 kcal/mol");
    expect(aboveText(9.996)).toBe("10.0 kcal/mol");
    expect(aboveText(12.34)).toBe("12.3 kcal/mol");
    expect(aboveText(0)).toBe("0.00 kcal/mol");
  });
});

describe("results in Meno's own forms", () => {
  it("keep a vector value's components and the point it was taken about, as given - three numbers each, or none", () => {
    const given = [
      { id: "dipole", on: "molecule", group: "Properties", label: "Dipole moment", quantity: "dipole", value: 2.1, vector: [0, 0, -2.1], origin: [0, 0, 0.06] },
      { id: "dipole2", on: "molecule", group: "Properties", label: "Dipole moment", quantity: "dipole", value: 2.1, vector: [0, 1], origin: "here" },
    ];
    const [a, b] = readResults(given, 3, 1) as MoleculeResult[];
    expect([a.vector, a.origin]).toEqual([[0, 0, -2.1], [0, 0, 0.06]]);
    expect([b.vector, b.origin]).toEqual([undefined, undefined]);
  });

  it("keep, of a list that opens on a row, the rows about it: as many up to it, it among them, and after - an orbitals' list given in full", () => {
    // (fifty orbitals, highest first, opening on the LUMO: row 30)
    const rows = Array.from({ length: 50 }, (_, i) => ({ cells: [`orbital ${i}`, -i] }));
    const [list] = readResults([{ id: "orbitals", on: "list", group: "Orbitals", label: "Molecular orbitals", columns: [{ label: "Orbital" }, { label: "Energy", unit: "eV" }], rows, focus: 30, shown: 31 }], 3, 1) as ListResult[];
    expect(list.rows.map((r) => r.cells[0])).toEqual(Array.from({ length: 2 * ABOUT_FOCUS }, (_, i) => `orbital ${30 - ABOUT_FOCUS + 1 + i}`));
    expect([list.rows[list.focus!].cells[0], list.rows[list.shown!].cells[0]]).toEqual(["orbital 30", "orbital 31"]);
    // (and says which rows it keeps, counted from 1, of how many)
    expect(list.trimmed).toEqual({ from: 22, to: 41, of: 50 });
    // (read again - a workspace kept - as it was: neither trimmed again nor its count changed)
    const again = readResults([list], 3, 1)[0] as ListResult;
    expect([again.rows, again.focus, again.shown, again.trimmed]).toEqual([list.rows, list.focus, list.shown, list.trimmed]);
    // (a count that does not fit its rows is not taken)
    expect((readResults([{ ...list, trimmed: { from: 1, to: 5, of: 50 } }], 3, 1)[0] as ListResult).trimmed).toBeUndefined();
    // (one that says it keeps all it has is no list kept so: core's rule trims it all the same)
    const all = readResults([{ id: "orbitals", on: "list", group: "Orbitals", label: "Molecular orbitals", columns: [{ label: "Orbital" }, { label: "Energy", unit: "eV" }], rows, focus: 30, trimmed: { from: 1, to: 50, of: 50 } }], 3, 1)[0] as ListResult;
    expect([all.rows.length, all.trimmed]).toEqual([20, { from: 22, to: 41, of: 50 }]);
    // (one given as Meno keeps it - twenty about its focus - as it was, nothing said; one that opens on no row, whole)
    const kept = readResults([{ ...list, trimmed: undefined, focus: 9 }], 3, 1)[0] as ListResult;
    expect([kept.rows.length, kept.trimmed]).toEqual([20, undefined]);
    const whole = readResults([{ id: "v", on: "list", group: "V", label: "V", columns: [{ label: "x" }], rows: rows.map((r) => ({ cells: [r.cells[0]] })) }], 3, 1)[0] as ListResult;
    expect(whole.rows).toHaveLength(50);
  });

  it("write a point group or a Mulliken symbol with its first letter upper and the rest lower, however it was printed", () => {
    expect(["c2v", "C2V", "C2v", " d3h ", "TD", "bu", "AU", "B1G", "A'", "E''", "C∞v", "Σg"].map(symmetryText)).toEqual(["C2v", "C2v", "C2v", "D3h", "Td", "Bu", "Au", "B1g", "A'", "E''", "C∞v", "Σg"]);
    // (a number before it - an orbital's, numbered within its symmetry - as it is)
    expect(["1A1", "2b2", "1a'", "10E''", "3B1", "(A1)", "(a1)", "B1G"].map(symmetryText)).toEqual(["1A1", "2B2", "1A'", "10E''", "3B1", "(A1)", "(A1)", "B1g"]);
  });
});

