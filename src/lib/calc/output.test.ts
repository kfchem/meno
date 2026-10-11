import { describe, expect, it } from "vitest";
import { calcLine, calcOf, multiplicityName, readCalc, type ReaderOutput } from "./output";
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

  it("reads back from a file as it was kept, and not where it does not read", () => {
    const kept = calcOf(water, ["cclib 1.9rc1"]);
    expect(readCalc(JSON.parse(JSON.stringify(kept)), 3, 2)).toEqual(kept);
    expect(readCalc({ program: "ORCA" }, 3, 2)).toBeUndefined();
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

  it("is said in a line: program, method and basis, charge and multiplicity", () => {
    expect(calcLine(calcOf(water, ["cclib"]))).toBe("ORCA 6.0.1 · B3LYP/def2-SVP · charge 0, singlet");
    expect(calcLine({ readers: ["cclib"], program: "xTB", method: "GFN2-xTB", charge: -1, multiplicity: 2 })).toBe("xTB · GFN2-xTB · charge -1, doublet");
    expect(calcLine({ readers: ["cclib"], charge: 2 })).toBe("charge +2");
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
