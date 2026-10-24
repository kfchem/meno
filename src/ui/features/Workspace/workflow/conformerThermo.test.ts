import { describe, expect, it } from "vitest";
import { boltzmann } from "../../../../lib/boltzmann";
import type { DiagramValue } from "../../../../lib/energyDiagram";
import { geometryKey } from "../../../../lib/entry";
import { factor } from "../../../../lib/units";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { entryOfSet, imaginaryOf, setEntries, withoutCarried, type SetEntry } from "./entries";
import { resultOf } from "./flow";
import { runMeno } from "./meno";
import { addSet, addStep, connect } from "./model";
import { isFailure, workedOf } from "./programs";
import { resultsOf, runStep, type RunWith, type Worked } from "./run";

const KCAL = factor("Eh", "kcal/mol");
const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** Water as conformer `number` of compound 0, its H opened out by `k`. */
const water = (number: number, k: number): SetEntry => ({
  compound: 0,
  number,
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0, y: 0, z: 0 },
    { el: "H", x: 0, y: 0, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  xyz: [0, 0, 0, 0.96, 0, 0, -0.24, 0.93 + k, 0],
});

/** What xtb's reader gives of a frequency job at `xyz`: its energy `e`, its free energy `g` (hartrees) at `kelvin`, and its vibrations - `imaginary` among them, as it judged them. */
function xtbFrequencies(xyz: readonly number[], e: number, g: number, kelvin = 298.15, imaginary: number[] = []) {
  const reading = (id: string, value: number | string, measure: Record<string, unknown> = { quantity: "energy" }) => ({ id, on: "molecule", group: "Thermochemistry", label: id, value, ...measure });
  return {
    schema: 1,
    program: "xtb",
    method: "GFN2-xTB",
    solvation: "none",
    atoms: ["O", "H", "H"],
    frames: [[...xyz]],
    energies: [e],
    imaginary,
    results: [
      reading("thermo.free-energy", g),
      reading("thermo.enthalpy", g + 0.02),
      reading("thermo.zpve", 0.021),
      reading("thermo.g-correction", g - e),
      reading("thermo.temperature", kelvin, { unit: "K" }),
      reading("thermo.treatment", "rotor cutoff 50 cm-1"),
      {
        id: "vibrations",
        on: "list",
        group: "Vibrations",
        label: "Vibrations",
        columns: [{ label: "Frequency", quantity: "wavenumber" }],
        rows: [...imaginary, 1595, 3657, 3756].map((f) => ({ cells: [f], move: Array(9).fill(0.1) })),
      },
    ],
  };
}

/**
 * Three conformers of water, each one's frequencies worked out by xtb (a
 * job each), as a Frequencies step on a conformer set keeps them - its
 * molecule - and its entries as the next step takes them. Their energies
 * E go up from the first; their free energies G the other way.
 */
function frequencied(es = [-5.07, -5.069, -5.068], gs = [-5.05, -5.0505, -5.0508], kelvin = 298.15, imaginary: number[][] = []) {
  const conformers = es.map((_, k) => water(k + 1, 0.01 * k));
  const done = conformers.map((c, k) => workedOf("frequencies", c, xtbFrequencies(c.xyz, es[k], gs[k], kelvin, imaginary[k]), ["xtb 6.7.1"]));
  if (done.some(isFailure)) throw new Error("not done");
  const [m] = resultsOf({ ok: true, holds: "conformers", kept: done as Worked[], aside: [], said: "" }, "frequencies").molecules;
  const molecule = { ...m, id: 2, at: { x: 0, y: 0 } } as Molecule3D;
  return { molecule, entries: setEntries([molecule], "conformers"), conformers };
}

describe("Frequencies on a conformer set", () => {
  it("keeps each conformer's free energy, enthalpy, zero-point energy and correction with it - at its geometry, by what, at what temperature - and its vibrations", () => {
    const { molecule, entries, conformers } = frequencied();
    expect(molecule.conformerSet).toBe(true);
    expect(entries).toHaveLength(3);
    entries.forEach((e, k) => {
      const p = entryOfSet(e, `x${k}`).properties;
      expect(p["thermo.free-energy"]).toMatchObject({ value: [-5.05, -5.0505, -5.0508][k], unit: "Eh", status: "computed" });
      expect(p["thermo.free-energy"].at).toEqual({ geometry: geometryKey(conformers[k].xyz), kelvin: 298.15, solvent: "none" });
      expect(p["thermo.free-energy"].by).toMatchObject({ plugin: "xtb", program: "xtb", method: "GFN2-xTB", treatment: "rotor cutoff 50 cm-1" });
      expect(p["thermo.enthalpy"].value).toBeCloseTo([-5.03, -5.0305, -5.0308][k], 9);
      expect(p["thermo.zpve"].value).toBe(0.021);
      expect(p["thermo.g-correction"].value).toBeCloseTo([0.02, 0.0185, 0.0172][k], 9);
      expect(p.vibrations.value).toEqual({ table: { columns: [expect.objectContaining({ name: "frequency" })], rows: [[1595], [3657], [3756]] } });
      // (each one's vibrations were worked out and it has no imaginary one: "none", not "not computed")
      expect(imaginaryOf(e)).toEqual([]);
    });
    // (not the modes' displacements, which are large: those stay with a molecule's own calculation)
    expect(molecule.properties!.every((p) => !("modes" in p))).toBe(true);
  });

  it("keeps each one's imaginary frequencies apart from none worked out - computed, none; computed, some; not computed", () => {
    const { entries } = frequencied(undefined, undefined, undefined, [[], [-85.3], []]);
    expect(entries.map(imaginaryOf)).toEqual([[], [-85.3], []]);
    expect(entryOfSet(entries[1], "b").properties.imaginary.value).toBe(1);
    // (a conformer no frequency job ran on: not computed)
    expect(imaginaryOf(water(1, 0))).toBe("not computed");
  });

  it("drops what a conformer carries of a calculation where a program works it out anew, or it is no longer at that geometry", () => {
    const { entries } = frequencied();
    const again = workedOf("energy", entries[0], { schema: 1, program: "xtb", atoms: ["O", "H", "H"], frames: [[...entries[0].xyz]], energies: [-5.07] }, ["xtb 6.7.1"]);
    if (isFailure(again)) throw new Error(again.why);
    expect(entryOfSet(again, "x").properties["thermo.free-energy"]).toBeUndefined();
    expect(imaginaryOf(again)).toBe("not computed");
    expect(withoutCarried(entries[0]).properties).toBeUndefined();
  });
});

describe("Populations and Energy window on a conformer set with free energies", () => {
  it("weights G where every conformer has one, and says so - shares unlike those of E", () => {
    const { entries } = frequencied();
    const onG = runMeno("populations", entries, "conformers", { temperature: 298.15 });
    if (!onG.ok) throw new Error(onG.said);
    expect(onG.said).toBe("1 compound at 298.15 K, from free energies (G)");
    expect(onG.shares).toEqual(boltzmann([-5.05, -5.0505, -5.0508], 298.15));
    // (the same conformers with no free energies: E's shares, the other way round, and said)
    const onE = runMeno("populations", entries.map(withoutCarried), "conformers", { temperature: 298.15 });
    if (!onE.ok) throw new Error(onE.said);
    expect(onE.said).toBe("1 compound at 298.15 K, from electronic energies");
    expect(onE.shares).toEqual(boltzmann([-5.07, -5.069, -5.068], 298.15));
    expect(onG.shares![2]).toBeGreaterThan(onG.shares![0]);
    expect(onE.shares![0]).toBeGreaterThan(onE.shares![2]);
  });

  it("takes G only at the temperature asked: at another, E - and why not G", () => {
    const { entries } = frequencied();
    const out = runMeno("populations", entries, "conformers", { temperature: 350 });
    expect(out.ok && out.said).toBe("1 compound at 350 K, from electronic energies (not free energies: a #1's G is at 298.15 K, not 350 K)");
  });

  it("keeps the window on G where every conformer has one, and says so", () => {
    const { entries } = frequencied();
    // (G: #3 lowest, #1 0.0008 Eh = 0.5 kcal/mol above it; E: #1 lowest, #3 0.002 Eh = 1.3 kcal/mol above it)
    const onG = runMeno("energy-window", entries, "conformers", { window: 0.3 });
    if (!onG.ok) throw new Error(onG.said);
    expect(onG.said).toBe("2 of 3 kept, on free energies (G, 298.15 K)");
    expect(onG.kept.map((e) => e.number)).toEqual([2, 3]);
    const onE = runMeno("energy-window", entries.map(withoutCarried), "conformers", { window: 0.3 });
    expect(onE.ok && onE.kept.map((e) => e.number)).toEqual([1]);
    // (0.0008 Eh in kcal/mol: within a window of 0.6)
    expect(0.0008 * KCAL).toBeLessThan(0.6);
    expect(runMeno("energy-window", entries, "conformers", { window: 0.6 }).ok).toBe(true);
  });

  it("falls back to E where one conformer has no G - saying which - and refuses a saddle point on G", () => {
    const { entries } = frequencied();
    const one = [entries[0], withoutCarried(entries[1]), entries[2]];
    const win = runMeno("energy-window", one, "conformers", { window: 0.3 });
    expect(win.ok && win.said).toBe("1 of 3 kept, on electronic energies (not free energies: a #2 has none)");
    const pop = runMeno("populations", one, "conformers", { temperature: 298.15 });
    expect(pop.ok && pop.said).toBe("1 compound at 298.15 K, from electronic energies (not free energies: a #2 has none)");
    expect(pop.ok && pop.shares).toEqual(boltzmann([-5.07, -5.069, -5.068], 298.15));
    // (a saddle point's G is no minimum's: the window on G refuses it, naming it)
    const { entries: saddle } = frequencied(undefined, undefined, undefined, [[], [-85.3], []]);
    expect(runMeno("energy-window", saddle, "conformers", { window: 3 })).toMatchObject({ ok: false, said: expect.stringContaining("a #2 has") });
  });

  it("falls back to E where the conformers' G were worked out unlike, saying how", () => {
    const { entries } = frequencied();
    const other = { ...entries[2], properties: { ...entries[2].properties, "thermo.free-energy": { ...entries[2].properties!["thermo.free-energy"], by: { program: "xtb", method: "GFN1-xTB" } } } };
    const out = runMeno("populations", [entries[0], entries[1], other], "conformers", { temperature: 298.15 });
    expect(out.ok && out.said).toBe("1 compound at 298.15 K, from electronic energies (not free energies: compound a's differ in method: GFN2-xTB (a #1) and GFN1-xTB (a #3))");
  });
});

describe("an Energy diagram on conformer sets with free energies", () => {
  it("stands each level at its lowest G, as ΔG", () => {
    const at = (m: Molecule3D, x: number, title: string): Omit<Molecule3D, "id"> => {
      const { id: _id, ...rest } = m;
      return { ...rest, at: { x, y: 0 }, title };
    };
    // (R: G lowest at #3, -5.0508; TS: the same conformers 0.03 Eh higher in G, E unchanged)
    const r = frequencied().molecule;
    const ts = frequencied(undefined, [-5.02, -5.0205, -5.0208]).molecule;
    let doc = addMolecule3d(emptyWorkspaceDocument(), at(r, 0, "R"));
    doc = addMolecule3d(doc, at(ts, 4, "TS"));
    const set = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -2, y0: -2, x1: 6, y1: 2 });
    const step = doc.nextWorkflowId!;
    doc = addStep(doc, "energy-diagram", 14, 0, { quantity: "thermo.free-energy" });
    doc = runStep(connect(doc, { set }, step), step, W);
    const s = doc.steps!.find((x) => x.id === step)!;
    expect(s.ran?.ok).toBe(true);
    const d = resultOf(doc, step)!.chart as DiagramValue;
    expect(d.axis.name).toBe("ΔG");
    expect(d.levels.map((l) => [l.name, Number(l.value.toFixed(3)), l.lowest.number])).toEqual([
      ["R", 0, 3],
      ["TS", Number((0.03 * KCAL).toFixed(3)), 3],
    ]);
    // (each level's lowest: its vibrations worked out, none imaginary)
    expect(d.levels.map((l) => l.lowest.imaginary)).toEqual([[], []]);
  });
});
