import { describe, expect, it } from "vitest";
import { MANIFESTS } from "../lib/plugins/known";
import type { XyzEnergyDecl } from "../lib/plugins/manifest";
import { energiesOf, waysOf } from "./xyzEnergies";

/** What the bundled plugins declare, by plugin. */
const declared = (...ids: string[]): XyzEnergyDecl[] => MANIFESTS.filter((m) => ids.includes(m.id)).flatMap((m) => m.xyzEnergies ?? []);
const energies = (comments: string[], ...ids: string[]) => energiesOf(comments, waysOf(declared(...ids)));

describe("an XYZ file's energies, read by the patterns of the plugins added", () => {
  it("are none where no plugin is added: the geometry alone", () => {
    expect(energies([" energy: -1.17 gnorm: 0.01", " energy: -1.16 gnorm: 0.001"])).toBeUndefined();
    expect(energiesOf(["  -40.12", "  -40.13"], [])).toBeUndefined();
  });

  it("are found as xtb writes them, by its plugin's pattern", () => {
    expect(energies([" energy: -1.17 gnorm: 0.01 xtb: 6.7.1", " energy: -1.16 gnorm: 0.001"], "xtb")).toEqual([-1.17, -1.16]);
    // (nothing of CREST's or ORCA's forms by xtb's pattern alone)
    expect(energies(["  -40.1234567", "  -40.1200000"], "xtb")).toBeUndefined();
  });

  it("are found as CREST writes them, the number alone first on the line", () => {
    expect(energies(["  -40.1234567", "  -40.1200000"], "crest")).toEqual([-40.1234567, -40.12]);
    expect(energies(["  -40.1234567", "a title"], "crest")).toBeUndefined();
  });

  it("are found as ORCA writes them after the job's name", () => {
    expect(energies(["Coordinates from ORCA-job input E -1.17", "Coordinates from ORCA-job input E -1.18"], "orca")).toEqual([-1.17, -1.18]);
  });

  it("are the same lines read by the plugins added together, none where two patterns find different numbers", () => {
    const all = ["xtb", "crest", "orca"];
    expect(energies([" energy: -1.17 gnorm: 0.01", " energy: -1.16"], ...all)).toEqual([-1.17, -1.16]);
    const two = waysOf([
      { id: "a", pattern: "(?:^|\\s)energy:\\s*(-?\\d+\\.\\d+)", unit: "hartree" },
      { id: "b", pattern: "gnorm:\\s*(-?\\d+\\.\\d+)", unit: "hartree" },
    ]);
    expect(energiesOf([" energy: -1.17 gnorm: 0.01", " energy: -1.16 gnorm: 0.02"], two)).toBeUndefined();
    // (the same number by both: not ambiguous)
    const same = waysOf([
      { id: "a", pattern: "energy:\\s*(-?\\d+\\.\\d+)", unit: "hartree" },
      { id: "b", pattern: "E\\s*=\\s*(-?\\d+\\.\\d+)", unit: "hartree" },
    ]);
    expect(energiesOf(["energy: -1.0 E = -1.0", "energy: -2.0"], same)).toEqual([-1, -2]);
  });

  it("are converted from the pattern's unit to hartrees", () => {
    const ways = waysOf([{ id: "ev", pattern: "^(-?\\d+\\.\\d+) eV", unit: "eV" }]);
    const got = energiesOf(["-27.211386 eV", "-54.422772 eV"], ways)!;
    expect(got[0]).toBeCloseTo(-1, 6);
    expect(got[1]).toBeCloseTo(-2, 6);
  });

  it("are none for one frame alone, or where a frame has none", () => {
    expect(energies(["  -1.17"], "crest")).toBeUndefined();
    expect(energies(["-1.17", "a title"], "crest")).toBeUndefined();
  });
});
