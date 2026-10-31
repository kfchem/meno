import { describe, expect, it } from "vitest";
import { ABOUT_CENTRE, calcLine, calcOf, imaginaryWords, levelOf, marksOf, multiplicityName, readCalc, type ReaderOutput } from "./output";
import type { ListResult, MoleculeResult } from "./results";
import { combine, whoReads, checked } from "./read";
import { READER_PLUGINS, READERS, type PythonPlugin, type ReaderPlugin } from "./catalog";
import { kindById, registered } from "../io/kinds";
import { MANIFESTS } from "../plugins/known";

// water, as a reader hands back an optimisation of it: written by hand,
// in Meno's own form - no program's output is in the repository
const water: ReaderOutput = {
  schema: 1,
  program: "ORCA",
  version: "6.0.1",
  method: "B3LYP",
  basis: "def2-SVP",
  charge: 0,
  multiplicity: 1,
  atoms: ["O", "H", "H"],
  frames: [
    [0, 0, 0.1, 0, 0.8, -0.5, 0, -0.8, -0.5],
    [0, 0, 0.12, 0, 0.76, -0.47, 0, -0.76, -0.47],
  ],
  energies: [-76.31, -76.32],
  optimised: true,
  results: [
    { id: "charges.mulliken", on: "atoms", group: "Partial charges", label: "Mulliken", quantity: "charge", values: [-0.4, 0.2, 0.2] },
    // (a scheme that does not give every atom one is no result)
    { id: "charges.broken", on: "atoms", group: "Partial charges", label: "Broken", quantity: "charge", values: [1, 2] },
    {
      id: "vibrations",
      on: "list",
      group: "Vibrations",
      label: "Vibrations",
      columns: [{ label: "Frequency", quantity: "wavenumber" }],
      rows: [{ cells: [1650.2], move: [0, 0, 0.07, 0, -0.43, -0.56, 0, 0.43, -0.56] }, { cells: [-120.5] }],
    },
  ],
};

describe("what a reader hands back", () => {
  it("is kept on the molecule as what the calculation was, and its results, each with the reader it came from", () => {
    const c = calcOf(water, ["cclib 1.9rc1"]);
    expect(c).toMatchObject({ readers: ["cclib 1.9rc1"], program: "ORCA", version: "6.0.1", method: "B3LYP", basis: "def2-SVP", charge: 0, multiplicity: 1, optimised: true });
    // (each result keeps its reader by id)
    expect(c.results!.map((r) => [r.id, r.from])).toEqual([
      ["charges.mulliken", "cclib"],
      ["vibrations", "cclib"],
    ]);
  });

  it("leaves out what the output does not say", () => {
    const c = calcOf({ atoms: ["H", "H"], frames: [[0, 0, 0, 0, 0, 0.74]], program: "xTB", method: "  ", charge: null }, ["cclib 1.9rc1"]);
    expect(c).toEqual({ readers: ["cclib 1.9rc1"], program: "xTB" });
  });

  it("keeps the imaginary frequencies the program judged it has, in plain words - and what it warned of - read back from a file as they were", () => {
    const saddle = calcOf({ ...water, imaginary: [-382.63], warnings: [{ kind: "hessian-not-stationary", text: "Hessian on incompletely optimized geometry!" }] }, ["xtb 6.7.1"]);
    expect(saddle.imaginary).toEqual([-382.63]);
    expect(imaginaryWords(saddle.imaginary!)).toBe("1 imaginary frequency, 382.6i cm⁻¹");
    expect(imaginaryWords([-382.63, -41.05])).toBe("2 imaginary frequencies, 382.6i, 41.0i cm⁻¹");
    expect(readCalc(JSON.parse(JSON.stringify(saddle)), 3, 2)).toEqual(saddle);
    // (judged none: kept as none, apart from not judged - and read back so)
    const none = calcOf({ ...water, imaginary: [] }, ["xtb 6.7.1"]);
    expect(none.imaginary).toEqual([]);
    expect(readCalc(JSON.parse(JSON.stringify(none)), 3, 2)).toEqual(none);
    // (not numbers below 0, or not judged: no mark)
    for (const imaginary of [[382.63], [Number.NaN], null, undefined]) expect(calcOf({ ...water, imaginary }, ["xtb 6.7.1"]).imaginary).toBeUndefined();
  });

  it("says an adopted output is one first, and reads back as it was - when with it", () => {
    const adopted = { ...calcOf(water, ["cclib 1.9rc1"]), adopted: 1_760_000_000_000 };
    expect(calcLine(adopted)).toBe(`adopted output \u00b7 ${calcLine(calcOf(water, ["cclib 1.9rc1"]))}`);
    expect(readCalc(JSON.parse(JSON.stringify(adopted)), 3, 2)).toEqual(adopted);
  });

  it("reads back one read by no reader as it was kept - the charge and spin a step was given, what made a molecule - and refuses one that says nothing", () => {
    // (as workflow/run speciesKept writes one: the charge and spin a Meno step's result came in with)
    const given = { readers: [], charge: 1, multiplicity: 2 };
    expect(readCalc(JSON.parse(JSON.stringify(given)), 3, 1)).toEqual(given);
    // (as a conformer search on a drawing writes one: the plugin, and its force field)
    const made = { readers: [], program: "RDKit", method: "MMFF94" };
    expect(readCalc(JSON.parse(JSON.stringify(made)), 3, 1)).toEqual(made);
    expect(readCalc({ readers: [] }, 3, 1)).toBeUndefined();
    expect(readCalc({ readers: [], charge: "1" }, 3, 1)).toBeUndefined();
  });

  it("refuses the whole record where any field there is not as Meno writes it - never read back without it, as if it had not been said", () => {
    const made = { readers: [], program: "RDKit", method: "MMFF94" };
    const kept = calcOf(water, ["cclib 1.9rc1"]);
    // (each field malformed in turn, in a record by no reader and in one by a reader)
    const malformed: Record<string, unknown[]> = {
      charge: ["1", 1.5, null, Number.NaN],
      multiplicity: ["2", 0, -1, 2.5, null],
      program: [7, "", "  ", null],
      version: [6, ""],
      method: [false, ""],
      basis: [{}, ""],
      solvation: [[], ""],
      optimised: ["yes", 1, null],
      adopted: ["today", null],
    };
    for (const [k, values] of Object.entries(malformed))
      for (const v of values) {
        expect(readCalc({ ...made, [k]: v }, 3, 1), `${k} ${String(v)}`).toBeUndefined();
        expect(readCalc({ ...kept, [k]: v }, 3, 2), `${k} ${String(v)}`).toBeUndefined();
      }
    // (the desk's case: the program kept, the charge gone, said nowhere - refused instead)
    expect(readCalc({ readers: [], program: "RDKit", charge: "1" }, 3, 1)).toBeUndefined();
    // (a reader that is no name; readers that are not a list)
    expect(readCalc({ ...kept, readers: ["cclib 1.9rc1", 3] }, 3, 2)).toBeUndefined();
    expect(readCalc({ ...kept, readers: [" "] }, 3, 2)).toBeUndefined();
    expect(readCalc({ ...kept, readers: "cclib 1.9rc1" }, 3, 2)).toBeUndefined();
    // (each well formed, as written: read back as it was)
    expect(readCalc({ ...made, charge: -1, multiplicity: 1, optimised: true }, 3, 1)).toEqual({ ...made, charge: -1, multiplicity: 1, optimised: true });
  });

  it("reads back from a file as it was kept, and not where it does not read", () => {
    const kept = calcOf(water, ["cclib 1.9rc1"]);
    expect(readCalc(JSON.parse(JSON.stringify(kept)), 3, 2)).toEqual(kept);
    expect(readCalc({ program: "ORCA" }, 3, 2)).toBeUndefined();
    // (the wavefunction kept with it, as Meno holds it: never a place to find it again)
    const wavefunction = { name: "water.molden", sha256: "a".repeat(64), kind: "molden" };
    expect(readCalc({ ...kept, wavefunction: { ...wavefunction, path: "/tmp/water.molden" } }, 3, 2)?.wavefunction).toEqual(wavefunction);
    expect(readCalc({ ...kept, wavefunction: { name: "x", sha256: "nope" } }, 3, 2)).not.toHaveProperty("wavefunction");
    expect(readCalc("ORCA", 3, 2)).toBeUndefined();
    // (what belongs to another molecule's atoms is not this one's: its
    // charges, and its vibrations' motions - their frequencies stay)
    const other = readCalc(kept, 4, 2)?.results;
    expect(other?.map((r) => r.id)).toEqual(["vibrations"]);
    expect(other?.[0].on === "list" && other[0].rows.some((r) => r.move)).toBe(false);
  });

  it("keeps the output it was read from - its name, kind, SHA-256, and where it was - and not a place that does not read", () => {
    const source = { name: "water.out", sha256: "a".repeat(64), kind: "orca", path: "/data/run 3/water.out" };
    const kept = calcOf(water, ["cclib 1.9rc1"], source);
    expect(readCalc(JSON.parse(JSON.stringify(kept)), 3, 2)?.source).toEqual(source);
    expect(readCalc({ ...kept, source: { ...source, path: 7 } }, 3, 2)?.source).toEqual({ name: "water.out", sha256: "a".repeat(64), kind: "orca" });
    expect(readCalc({ ...kept, source: { ...source, path: "x".repeat(5000) } }, 3, 2)?.source?.path).toBeUndefined();
  });

  it("keeps the readers that could not read it, and why", () => {
    const c = calcOf(water, ["cclib 1.9rc1"], undefined, [{ from: "pyscf", why: "no basis" }]);
    expect(c.unread).toEqual([{ from: "pyscf", why: "no basis" }]);
    expect(readCalc(JSON.parse(JSON.stringify(c)), 3, 2)?.unread).toEqual([{ from: "pyscf", why: "no basis" }]);
  });

  it("of a file of several jobs, keeps which job it is and what it did, says so in its line, and reads it back", () => {
    const job = { ...water, job: { number: 1, of: 2, kind: "Optimisation" } };
    const calc = calcOf(job, ["cclib"]);
    expect(calc.job).toEqual({ number: 1, of: 2, kind: "Optimisation" });
    expect(calcLine(calc)).toBe("ORCA 6.0.1 · job 1 of 2, optimisation · B3LYP/def2-SVP · charge 0, singlet");
    expect(readCalc(JSON.parse(JSON.stringify(calc)), 3, 1)!.job).toEqual(calc.job);
    // (not a job of several: none kept)
    for (const bad of [{ number: 1, of: 1 }, { number: 3, of: 2 }, { number: 0, of: 2 }, { number: "1", of: 2 }]) expect(calcOf({ ...water, job: bad as never }, ["cclib"]).job).toBeUndefined();
  });

  it("is said in a line: program, method and basis, charge and multiplicity", () => {
    expect(calcLine(calcOf(water, ["cclib"]))).toBe("ORCA 6.0.1 · B3LYP/def2-SVP · charge 0, singlet");
    expect(calcLine({ readers: ["cclib"], program: "xTB", method: "GFN2-xTB", charge: -1, multiplicity: 2 })).toBe("xTB · GFN2-xTB · charge \u22121, doublet");
    expect(calcLine({ readers: ["cclib"], charge: 2 })).toBe("charge +2");
  });

  it("says the solvation the output says, after the method, and gas phase where it says none", () => {
    const solvated = calcOf({ ...water, program: "xtb", version: "6.7.1", method: "GFN2-xTB", basis: null, solvation: "ALPB(water), reference state gsolv [1 M gas/solution]" }, ["xtb 0.1.0"]);
    expect(solvated.solvation).toBe("ALPB(water), reference state gsolv [1 M gas/solution]");
    expect(calcLine(solvated)).toBe("xtb 6.7.1 · GFN2-xTB · ALPB(water), reference state gsolv [1 M gas/solution] · charge 0, singlet");
    expect(levelOf({ method: "GFN2-xTB", solvation: "none" })).toBe("GFN2-xTB · gas phase");
    // (unsaid: nothing said of it)
    expect(levelOf({ method: "B3LYP", basis: "def2-SVP" })).toBe("B3LYP/def2-SVP");
    // (kept in the file, and read back)
    expect(readCalc(JSON.parse(JSON.stringify(solvated)), 3, 2)?.solvation).toBe(solvated.solvation);
    expect(calcOf({ ...water, solvation: "  " }, ["cclib"]).solvation).toBeUndefined();
    expect(multiplicityName(7)).toBe("multiplicity 7");
  });
});

describe("reading an output", () => {
  // (a kind the plugins Meno carries bring, all added)
  const carried = registered(MANIFESTS).kinds;
  const orca = kindById("orca", carried)!;
  // a second reader of ORCA's output
  const other: ReaderPlugin = { ...(READER_PLUGINS[0] as PythonPlugin), id: "orca-own", name: "Meno's ORCA reader", reads: ["orca"], profile: "plugin-orca-own" };
  const readers = [...READERS, other];
  const ids = (w: ReturnType<typeof whoReads>) => (w instanceof Error ? w.message : [w.reader.id, w.also.map((p) => p.id)]);

  it("is its reader's - the one chosen - alone, unless others are chosen to read it as well", () => {
    expect(ids(whoReads(orca, "job.out", new Set(["cclib"]), { read: {}, also: {} }, readers))).toEqual(["cclib", []]);
    expect(ids(whoReads(orca, "job.out", new Set(["cclib", "orca-own"]), { read: { orca: "orca-own" }, also: {} }, readers))).toEqual(["orca-own", []]);
    expect(ids(whoReads(orca, "job.out", new Set(["cclib", "orca-own"]), { read: { orca: "orca-own" }, also: { orca: ["cclib"] } }, readers))).toEqual([
      "orca-own",
      ["cclib"],
    ]);
  });

  it("says no plugin added reads it, where none that reads it is - naming none of its own accord (catalogues do: lib/calc/probe)", () => {
    const why = whoReads(orca, "job.out", new Set(), { read: {}, also: {} });
    expect(why).toBeInstanceOf(Error);
    expect((why as Error).message).toBe("No plugin added reads job.out.");
  });

  it("says so where the output holds no geometry, as an xTB single point's does not", () => {
    const xtb = kindById("xtb", carried)!;
    expect(() => checked({ atoms: ["O", "H", "H"], frames: [] }, xtb, "sp.out")).toThrow(/holds no geometry/);
    expect(checked(water, orca, "job.out")).toBe(water);
  });
});

describe("what several readers found in one output", () => {
  // a reader of NBO's analysis: no geometry, the same atoms, results of its own
  const nbo: ReaderOutput = {
    atoms: ["O", "H", "H"],
    frames: [],
    method: "B3LYP-D3",
    results: [
      { id: "natural", on: "atoms", group: "Partial charges", label: "Natural (NPA)", quantity: "charge", values: [-0.9, 0.45, 0.45] },
      // (of the same name as one of the first reader's: NBO's own, kept beside it)
      { id: "mulliken", on: "atoms", group: "Partial charges", label: "Mulliken", quantity: "charge", values: [-0.5, 0.25, 0.25] },
      { id: "wiberg", on: "pairs", group: "NBO", label: "Wiberg bond index", pairs: [[0, 1, 0.82]] },
    ],
  };

  it("keeps which geometries the run converged on, as the reader that read them marked them (2026-10-22: found in the app, left out here)", () => {
    const marks = water.frames.map((_, i) => i === water.frames.length - 1);
    expect(combine([{ from: "cclib", version: "1.9rc1", output: { ...water, converged: marks } }, { from: "nbo", version: "7", output: nbo }]).output.converged).toEqual(marks);
    // (marks of other geometries than these say nothing of which converged: none did, not stated - never every one)
    const odd = combine([{ from: "cclib", version: "1.9rc1", output: { ...water, converged: [true] } }]).output;
    expect([odd.converged, odd.unmarked]).toEqual([water.frames.map(() => false), "unstated"]);
    // (a reader saying why none is, kept with its marks)
    const cut = combine([{ from: "cclib", version: "1.9rc1", output: { ...water, converged: water.frames.map(() => false), unmarked: "cut" } }]).output;
    expect(cut.unmarked).toBe("cut");
  });

  it("keeps the imaginary frequencies the program judged the last geometry has, and what it warned of (2026-10-28: found in the app, left out here)", () => {
    const warnings = [{ kind: "hessian-not-stationary", text: "the gradient is not small" }];
    const saddle = combine([{ from: "cclib", version: "1.9rc1", output: { ...water, imaginary: [-927.98], warnings } }, { from: "nbo", version: "7", output: nbo }]).output;
    expect([saddle.imaginary, saddle.warnings]).toEqual([[-927.98], warnings]);
    // (none judged, as some: kept - and none said where no reader judged)
    expect(combine([{ from: "cclib", version: "1.9rc1", output: { ...water, imaginary: [] } }]).output.imaginary).toEqual([]);
    expect(combine([{ from: "cclib", version: "1.9rc1", output: water }]).output).not.toHaveProperty("imaginary");
    // (of a reader that read other geometries: not of the last of these)
    expect(combine([{ from: "cclib", version: "1.9rc1", output: water }, { from: "nbo", version: "7", output: { ...nbo, imaginary: [-50] } }]).output).not.toHaveProperty("imaginary");
  });

  it("keeps each geometry's mark with it where one before it does not read - never all marks dropped with one geometry", () => {
    // (three geometries, the middle one cut short: the last, marked converged, still is)
    const three = [water.frames[0], water.frames[0].slice(0, 5), water.frames[0]];
    const out = combine([{ from: "cclib", version: "1.9rc1", output: { ...water, frames: three, converged: [false, false, true] } }]).output;
    expect(out.frames).toHaveLength(2);
    expect(out.converged).toEqual([false, true]);
    expect(marksOf({ atoms: water.atoms, frames: three, converged: [false, false, true] })).toEqual({ converged: [false, true] });
    expect(marksOf({ atoms: water.atoms, frames: three })).toBeNull();
  });

  it("keeps, of a file of several jobs, its jobs as its reader read them", () => {
    const sp: ReaderOutput = { ...water, job: { number: 2, of: 2, kind: "Single point" } };
    const opt: ReaderOutput = { ...water, job: { number: 1, of: 2, kind: "Optimisation" } };
    const { output } = combine([{ from: "cclib", version: "1.9rc1", output: { ...sp, jobs: [opt, sp] } }, { from: "nbo", version: "7", output: nbo }]);
    expect(output.jobs).toEqual([opt, sp]);
    expect(output.job).toEqual(sp.job);
    expect(combine([{ from: "cclib", version: "1.9rc1", output: water }]).output.jobs).toBeUndefined();
  });

  it("is put together: the geometries, and what the calculation was, the first's that gives them; every reader's results, each its own", () => {
    const { output, readers } = combine([
      { from: "cclib", version: "1.9rc1", output: water },
      { from: "nbo", version: "7", output: nbo },
    ]);
    expect(readers).toEqual(["cclib 1.9rc1", "nbo 7"]);
    expect(output.frames).toEqual(water.frames);
    expect(output.energies).toEqual(water.energies);
    expect(output.method).toBe("B3LYP");
    const results = calcOf(output, readers).results!;
    // (a name is its reader's own: NBO's Mulliken is NBO's, beside cclib's)
    expect(results.map((r) => `${r.label} (${r.from})`)).toEqual([
      "Mulliken (cclib)",
      "Vibrations (cclib)",
      "Natural (NPA) (nbo)",
      "Mulliken (nbo)",
      "Wiberg bond index (nbo)",
    ]);
  });

  it("takes the geometries of whichever gives them, the order deciding what both give, and whose results come first", () => {
    const { output } = combine([
      { from: "nbo", version: "7", output: nbo },
      { from: "cclib", version: "1.9rc1", output: water },
    ]);
    expect(output.frames).toEqual(water.frames);
    expect(output.method).toBe("B3LYP-D3");
    expect(output.program).toBe("ORCA");
    expect((output.results as { label: string; from: string }[]).filter((r) => r.label === "Mulliken").map((r) => r.from)).toEqual(["nbo", "cclib"]);
  });

  it("leaves out a reader whose atoms are not the geometries', and what belongs to frames it did not read as many of", () => {
    const other: ReaderOutput = {
      atoms: ["O", "H", "H"],
      frames: [water.frames[1]],
      energies: [-76.4],
      results: [{ id: "grad", on: "frames", group: "Optimisation", label: "RMS gradient", unit: "Eh/bohr", values: [0.001] }],
    };
    const { output, readers } = combine([
      { from: "cclib", version: "1.9rc1", output: water },
      { from: "x", version: "", output: { ...nbo, atoms: ["O", "H"] } },
      { from: "y", version: "", output: other },
    ]);
    expect(readers).toEqual(["cclib 1.9rc1", "y"]);
    expect(output.energies).toEqual(water.energies);
    expect((output.results as { id: string }[]).map((r) => r.id)).toEqual(["charges.mulliken", "vibrations"]);
  });
});

describe("how a conformer search took conformers as one, as its program said it", () => {
  it("keeps CREGEN's thresholds, as the CREST plugin reads them from its run, as the molecule's results", () => {
    const out: ReaderOutput = {
      schema: 1,
      program: "CREST",
      version: "2.12",
      method: "iMTD-GC, GFN2-xTB",
      atoms: ["O", "H", "H"],
      frames: [[0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0]],
      energies: [-5.07],
      results: [
        { id: "cregen.rmsd", group: "Same conformer (CREGEN)", label: "RMSD threshold", on: "molecule", value: 0.125, unit: "Å" },
        { id: "cregen.bconst", group: "Same conformer (CREGEN)", label: "Rotational-constant threshold (relative)", on: "molecule", value: 0.01 },
        { id: "cregen.ewin", group: "Same conformer (CREGEN)", label: "Energy window", on: "molecule", value: 6, unit: "kcal/mol" },
      ],
    } as ReaderOutput;
    const calc = calcOf(out, ["crest 0.1.0"]);
    expect(calc.results?.map((r) => [r.group, r.label, r.on === "molecule" ? r.value : null, "unit" in r ? r.unit : undefined])).toEqual([
      ["Same conformer (CREGEN)", "RMSD threshold", 0.125, "Å"],
      ["Same conformer (CREGEN)", "Rotational-constant threshold (relative)", 0.01, undefined],
      ["Same conformer (CREGEN)", "Energy window", 6, "kcal/mol"],
    ]);
  });
});

describe("a calculation's results in Meno's own form", () => {
  // (hydroxide, made up: O at the origin, H 0.97 Å up z; its dipole as a program printed it, about a point 0.1 Å up z)
  const hydroxide = (extra: Partial<ReaderOutput> = {}, dipole: Record<string, unknown> = {}): ReaderOutput => ({
    schema: 1,
    charge: -1,
    multiplicity: 1,
    atoms: ["O", "H"],
    frames: [[0, 0, 0, 0, 0, 0.97]],
    masses: [15.999, 1.008],
    results: [{ id: "dipole", on: "molecule", group: "Properties", label: "Dipole moment", quantity: "dipole", rank: 2, value: 1.0, vector: [0, 0, 1.0], origin: [0, 0, 0.1], ...dipole }],
    ...extra,
  });
  const dipoleOf = (o: ReaderOutput) => calcOf(o, ["reader 1"]).results!.find((r) => r.id === "dipole") as MoleculeResult;

  it("takes a charged molecule's dipole about the centre of mass of its last geometry, with the masses the program used - once", () => {
    const d = dipoleOf(hydroxide());
    // (the centre: 0.97 × 1.008 / 17.007 Å up z; μ' = μ - q (C - O), q = -1, in debye per e Å)
    const centre = (0.97 * 1.008) / (15.999 + 1.008);
    expect(d.label).toBe(ABOUT_CENTRE);
    expect(d.origin![2]).toBeCloseTo(centre, 12);
    expect(d.vector![2]).toBeCloseTo(1.0 + (centre - 0.1) * 4.803204712570263, 12);
    expect(d.value as number).toBeCloseTo(Math.abs(d.vector![2]), 12);
    // (read again - a workspace kept - it is not moved again: its origin is the centre now)
    const again = calcOf({ ...hydroxide(), results: [d] }, ["reader 1"]).results!.find((r) => r.id === "dipole") as MoleculeResult;
    expect([again.value, again.origin, again.label]).toEqual([d.value, d.origin, d.label]);
  });

  it("takes it about the centre of mass the program printed with it, where it did - before one worked out from masses", () => {
    const d = dipoleOf(hydroxide({ masses: null }, { centre: [0, 0, 0.05] }));
    expect([d.label, d.origin]).toEqual([ABOUT_CENTRE, [0, 0, 0.05]]);
    expect(d.vector![2]).toBeCloseTo(1.0 + (0.05 - 0.1) * 4.803204712570263, 12);
  });

  it("takes it, where the program gave no masses, with the elements' standard atomic weights", () => {
    const d = dipoleOf(hydroxide({ masses: null }));
    // (NIST's standard atomic weights: O's interval [15.99903,15.99977], its midpoint; H's [1.00784,1.00811], its midpoint)
    const centre = (0.97 * 1.007975) / (15.9994 + 1.007975);
    expect([d.label, d.origin![2]]).toEqual([ABOUT_CENTRE, expect.closeTo(centre, 12)]);
    // (masses not one to each atom: the standard weights too)
    expect(dipoleOf(hydroxide({ masses: [1] })).origin![2]).toBeCloseTo(centre, 12);
  });

  it("leaves a dipole as given where it does not depend on the point - neutral - or cannot be moved: no origin, or no weight for an element", () => {
    expect(dipoleOf(hydroxide({ charge: 0 })).value).toBe(1.0);
    expect(dipoleOf(hydroxide({}, { origin: undefined })).value).toBe(1.0);
    expect(dipoleOf(hydroxide({ masses: null, atoms: ["O", "Og"] })).label).toBe("Dipole moment");
  });

  it("writes a point group and Mulliken symbols as Meno writes them, for display and comparison", () => {
    const out = hydroxide({
      results: [
        { id: "thermo.point-group", on: "molecule", group: "Thermochemistry", label: "Point group", value: "c2v" },
        { id: "vibrations", on: "list", group: "Vibrations", label: "Vibrations", columns: [{ label: "Symmetry", quantity: "symmetry" }, { label: "Frequency", quantity: "wavenumber" }], rows: [{ cells: ["BU", 3600] }, { cells: ["a'", 1600] }] },
      ],
    });
    const calc = calcOf(out, ["reader 1"]);
    expect(calc.results!.find((r) => r.id === "thermo.point-group")).toMatchObject({ value: "C2v" });
    expect((calc.results!.find((r) => r.id === "vibrations") as ListResult).rows.map((r) => r.cells)).toEqual([["Bu", 3600], ["A'", 1600]]);
  });
});

