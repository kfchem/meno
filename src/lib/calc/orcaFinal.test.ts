import { describe, expect, it } from "vitest";
import { calcLine, calcOf, type ReaderOutput } from "./output";
import { combine } from "./read";
import { chipLine, readResults, resultsOn } from "./results";

// HCN at r2SCAN-3c, as the cclib plugin hands an ORCA output back (its
// worker's orca_energies, orca_level): written by hand, in Meno's own form -
// no program's output is in the repository
const SAID = "ORCA final single-point energy (includes dispersion and gCP where the method has them)";
const hcn: ReaderOutput = {
  schema: 1,
  program: "ORCA",
  version: "6.1.1",
  method: "r2SCAN-3c",
  basis: null,
  charge: 0,
  multiplicity: 1,
  atoms: ["C", "N", "H"],
  frames: [[0, 0, 0, 0, 0, 1.156, 0, 0, -1.066]],
  energies: [-93.399651434575],
  results: [{ id: "energy.what", on: "molecule", group: "Calculation", label: "Energy", value: SAID }],
};

describe("an ORCA output's energies, as the cclib plugin gives them", () => {
  it("says what the energy is, with it - and the method as the input names it, a composite one with no basis after it", () => {
    const c = calcOf(hcn, ["cclib 1.9rc1"]);
    expect(calcLine(c)).toBe("ORCA 6.1.1 · r2SCAN-3c · charge 0, singlet");
    const what = resultsOn(c.results, "molecule").find((r) => r.id === "energy.what");
    expect([what?.label, what?.value]).toEqual(["Energy", SAID]);
  });

  it("says first, where they were not one to each geometry, that none was read and why - its geometries kept", () => {
    const none: ReaderOutput = {
      ...hcn,
      energies: null,
      results: [{ id: "run.energies", on: "molecule", group: "Calculation", label: "Energies", value: "not read: a final single-point energy stands at no geometry of its own", rank: 0 }],
    };
    const results = readResults(none.results, 3, 1, "cclib");
    expect(chipLine(["ORCA 6.1.1"], results)).toBe("ORCA 6.1.1 · Energies not read: a final single-point energy stands at no geometry of its own");
    expect(calcOf(none, ["cclib 1.9rc1"]).results?.map((r) => r.id)).toEqual(["run.energies"]);
  });

  it("stands, read beside another reader's reading of the same file - which gives none of its energies, method or basis", () => {
    // (a reader that gives its geometries alone)
    const other: ReaderOutput = { ...hcn, method: null, basis: null, energies: null, results: [] };
    const none: ReaderOutput = { ...hcn, energies: null, results: [{ id: "run.energies", on: "molecule", group: "Calculation", label: "Energies", value: "not read: a geometry has no final single-point energy of its own", rank: 0 }] };
    for (const order of [
      ["other", "cclib"],
      ["cclib", "other"],
    ]) {
      const found = (cclib: ReaderOutput) => order.map((from) => ({ from, version: "1", output: from === "cclib" ? cclib : other }));
      const read = combine(found(hcn)).output;
      expect([read.energies, read.method, read.basis], order.join()).toEqual([[-93.399651434575], "r2SCAN-3c", undefined]);
      // (none read: none, never another reader's in their place)
      const unread = combine(found(none)).output;
      expect([unread.energies, unread.method, unread.basis], order.join()).toEqual([undefined, "r2SCAN-3c", undefined]);
    }
  });
});
