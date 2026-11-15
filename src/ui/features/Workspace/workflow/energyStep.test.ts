import { describe, expect, it } from "vitest";
import type { ReaderOutput } from "../../../../lib/calc/output";
import { geometryKey } from "../../../../lib/entry";
import { freeEnergyOf, imaginaryOf, setEntries, type SetEntry } from "./entries";
import { isFailure, workedOf } from "./programs";
import { resultsOf, type Worked } from "./run";

/** Water, as a step's entry. */
const water = (): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz: [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0],
  }) as unknown as SetEntry;

const reading = (id: string, value: number | string, measure: Record<string, unknown> = { quantity: "energy" }) => ({ id, on: "molecule", group: "Thermochemistry", label: id, value, ...measure });

/** What xtb's reader gives of a frequency job at `xyz`: its energy `e`, its free energy `g`, and its vibrations, `imaginary` among them. */
const frequencies = (xyz: readonly number[], e: number, g: number, imaginary: number[] = []): ReaderOutput =>
  ({
    schema: 1,
    program: "xtb",
    method: "GFN2-xTB",
    solvation: "none",
    atoms: ["O", "H", "H"],
    frames: [[...xyz]],
    energies: [e],
    optimised: true,
    imaginary,
    results: [
      reading("thermo.free-energy", g),
      reading("thermo.g-correction", g - e),
      reading("thermo.temperature", 298.15, { unit: "K" }),
      reading("thermo.pressure", 1, { unit: "atm" }),
      reading("thermo.treatment", "rotor cutoff 50 cm-1"),
      { id: "vibrations", on: "list", group: "Vibrations", label: "Vibrations", columns: [{ label: "Frequency", quantity: "wavenumber" }], rows: [...imaginary, 1595, 3657, 3756].map((f) => ({ cells: [f] })) },
    ],
  }) as unknown as ReaderOutput;

/** What a DFT single point read back: its energy `e`, its geometry as the program printed it. */
const singlePoint = (xyz: readonly number[], e: number): ReaderOutput =>
  ({ schema: 1, program: "Gaussian", method: "wB97X-D", basis: "6-311+G(d,p)", solvation: "SMD(chloroform)", atoms: ["O", "H", "H"], frames: [[...xyz]], energies: [e] }) as unknown as ReaderOutput;

/** `xyz` turned a quarter about z and moved, each coordinate printed to six places: a program's standard orientation. */
const reoriented = (xyz: readonly number[]): number[] =>
  xyz.flatMap((_, i) => (i % 3 ? [] : [-xyz[i + 1] + 1.5, xyz[i] - 0.25, xyz[i + 2] + 0.75])).map((v) => Math.round(v * 1e6) / 1e6);

const worked = (w: Worked | ReturnType<typeof workedOf>): Worked => {
  if (isFailure(w)) throw new Error(w.why);
  return w as Worked;
};

describe("an Energy step's single point", () => {
  // (Optimise -> Frequencies at GFN2-xTB -> Energy at DFT: an energy at one level, its correction to G at another)
  const freq = () => worked(workedOf("frequencies", water(), frequencies(water().xyz, -5.07, -5.05, [-120.5]), ["xtb"]));

  it("keeps the frequencies' thermochemistry and vibrations, each with its own level, at the entry's geometry", () => {
    const f = freq();
    const sp = worked(workedOf("energy", f, singlePoint(f.xyz, -76.4), ["cclib 1.9rc1"]));
    expect(sp.energy).toBe(-76.4);
    expect(sp.calc?.method).toBe("wB97X-D");
    const g = sp.properties?.["thermo.g-correction"];
    expect(g?.value).toBeCloseTo(0.02, 10);
    expect([g?.by?.program, g?.by?.method, g?.by?.treatment, g?.at?.kelvin, g?.at?.atm, g?.at?.geometry]).toEqual(["xtb", "GFN2-xTB", "rotor cutoff 50 cm-1", 298.15, 1, geometryKey(f.xyz)]);
    // (its free energy G is the frequencies' own, at their level - never the single point's energy plus a correction)
    expect([freeEnergyOf(sp)?.value, freeEnergyOf(sp)?.by?.method]).toEqual([-5.05, "GFN2-xTB"]);
    // (its imaginary frequency still there to filter on)
    expect(imaginaryOf(sp)).toEqual([-120.5]);
    // (and so as the step's molecule, and the next step's entry)
    const [m] = resultsOf({ ok: true, holds: "molecules", kept: [sp], aside: [], said: "" }, "energy").molecules;
    const [next] = setEntries([{ ...m, id: 1, at: { x: 0, y: 0 } }], "molecules");
    expect([next.energy, next.properties?.["thermo.g-correction"]?.by?.method, geometryKey(next.xyz)]).toEqual([-76.4, "GFN2-xTB", geometryKey(f.xyz)]);
  });

  it("keeps the entry's geometry key though the program turned it to its own orientation", () => {
    const f = freq();
    const sp = worked(workedOf("energy", f, singlePoint(reoriented(f.xyz), -76.4), ["cclib 1.9rc1"]));
    expect(geometryKey(reoriented(f.xyz))).not.toBe(geometryKey(f.xyz));
    expect(sp.xyz).toEqual(f.xyz);
    expect(sp.properties?.["thermo.g-correction"]?.at?.geometry).toBe(geometryKey(sp.xyz));
  });

  it("fails where an atom moved: its energy is of another geometry", () => {
    const f = freq();
    const moved = [...f.xyz];
    moved[3] += 0.05;
    const w = workedOf("energy", f, singlePoint(moved, -76.4), ["cclib 1.9rc1"]);
    expect(isFailure(w) && [w.kind, w.why]).toEqual(["failed", "Its atoms moved in what was to be a single point: its energy is of another geometry"]);
  });

  it("fails where it read back no energy - never leaving the energy the entry came with beside its calculation", () => {
    const f = freq();
    const w = workedOf("energy", f, { ...singlePoint(f.xyz, -76.4), energies: undefined } as unknown as ReaderOutput, ["cclib 1.9rc1"]);
    expect(isFailure(w) && [w.kind, w.why]).toEqual(["failed", "It read back no energy"]);
    // (an optimisation or frequencies that read back none: no energy, not the one it came with)
    for (const kind of ["optimise", "frequencies"] as const) {
      const o = worked(workedOf(kind, f, { ...singlePoint(f.xyz, -76.4), energies: undefined, optimised: true } as unknown as ReaderOutput, ["cclib 1.9rc1"]));
      expect(o.energy).toBeUndefined();
    }
  });

  it("fails where the program gave back its mirror image: of the other hand, though every distance is the same", () => {
    const nh3 = { ...water(), atoms: [{ el: "N" }, { el: "H" }, { el: "H" }, { el: "H" }], bonds: [1, 2, 3].map((a2) => ({ a1: 0, a2, order: 1 })), xyz: [0, 0, 0.1, 0.94, 0, -0.28, -0.47, 0.814, -0.28, -0.47, -0.814, -0.28], energy: -4.4 } as unknown as SetEntry;
    const out = (xyz: number[]) => ({ ...singlePoint(xyz, -56.5), atoms: ["N", "H", "H", "H"] }) as ReaderOutput;
    // (the same, turned: one shape)
    expect(isFailure(workedOf("energy", nh3, out(reoriented(nh3.xyz)), ["cclib 1.9rc1"]))).toBe(false);
    // (its mirror image - each z turned over, then turned as a whole: every distance the same, the other hand)
    const mirror = reoriented(nh3.xyz.map((v, i) => (i % 3 === 2 ? -v : v)));
    const w = workedOf("energy", nh3, out(mirror), ["cclib 1.9rc1"]);
    expect(isFailure(w) && w.kind).toBe("failed");
  });

  it("an optimisation still takes the geometry it reached, and nothing of the calculation it came from", () => {
    const f = freq();
    const moved = [...f.xyz];
    moved[3] += 0.05;
    const o = worked(workedOf("optimise", f, { ...singlePoint(moved, -76.41), optimised: true } as ReaderOutput, ["cclib 1.9rc1"]));
    expect(o.xyz).toEqual(moved);
    expect(o.properties?.["thermo.g-correction"]).toBeUndefined();
  });
});
