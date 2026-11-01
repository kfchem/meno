import { describe, expect, it } from "vitest";
import { geometryKey, type Property } from "../../../../lib/entry";
import { convergedAt, type ConvergedHow } from "./converged";
import type { SetEntry } from "./entries";
import { kindInfo, needsOf } from "./kinds";
import { runMenoPair } from "./meno";

// (the numbers: ORCA 6.1.1 at its own GFN2-xTB, 298.15 K, 1 atm, quasi-RRHO - ammonia's inversion, and a Diels-Alder's
//  saddle point above the complex of its two reactants; each a value its output printed, in hartrees)
const AMMONIA = { saddle: { e: -4.41650682, g: -4.40194074, group: "D3h", sigma: 6 }, minimum: { e: -4.42624404, g: -4.41175675, group: "Cs", sigma: 1 } };
const DIELS_ALDER = { saddle: { e: -17.81225922, g: -17.7053786 }, complex: { e: -17.82305901, g: -17.72551573 } };

const reading = (id: string, value: number | string, measure: Record<string, unknown> = { quantity: "energy" }) => ({ id, on: "molecule", group: "Thermochemistry", label: id, value, ...measure });

type Made = { e: number; g?: number; group?: string; sigma?: number; imaginary?: number[]; how?: ConvergedHow | null; method?: string; kelvin?: number; atoms?: string[]; shift?: number; charge?: number };
/** An entry as Frequencies left it: its energy, its free energy and how it was worked out, its imaginary frequencies, and where a run converged at it. */
function made(m: Made, extra: Partial<SetEntry> = {}): SetEntry {
  const atoms = m.atoms ?? ["N", "H", "H", "H"];
  const xyz = atoms.flatMap((_, k) => [k * 1.01 + (m.shift ?? 0), k % 2 ? 0.4 : 0, 0]);
  const results = [
    ...(m.g != null ? [reading("thermo.free-energy", m.g)] : []),
    reading("thermo.temperature", m.kelvin ?? 298.15, { unit: "K" }),
    reading("thermo.pressure", 1, { unit: "atm" }),
    reading("thermo.treatment", "quasi-RRHO (Grimme), 100 cm⁻¹"),
    ...(m.group ? [reading("thermo.point-group", m.group, {})] : []),
    ...(m.sigma != null ? [reading("thermo.symmetry-number", m.sigma, { unit: "none" })] : []),
  ];
  return {
    compound: 0,
    number: 1,
    atoms: atoms.map((el) => ({ el })),
    bonds: [],
    xyz,
    energy: m.e,
    // (its imaginary frequencies, as its calculation judged them - as a step's entry carries them: entries `setEntries`)
    imaginary: m.imaginary ?? [],
    ...(m.charge != null ? { charge: m.charge, multiplicity: 2 } : {}),
    calc: { readers: ["cclib 1.9rc1"], program: "ORCA", method: m.method ?? "GFN2-xTB", solvation: "none", results, imaginary: m.imaginary ?? [] },
    ...(m.how === null ? {} : { converged: convergedAt(m.how ?? "optimisation", xyz) }),
    ...extra,
  } as unknown as SetEntry;
}
const saddle = (m: Partial<Made> = {}) => made({ ...AMMONIA.saddle, imaginary: [-972], how: "highest point refined", shift: 0.2, ...m });
const minimum = (m: Partial<Made> = {}) => made({ ...AMMONIA.minimum, ...m });

const run = (saddles: SetEntry[], starts: SetEntry[], options: Record<string, string> = {}) => runMenoPair("barrier", { entries: saddles, holds: "molecules" }, { entries: starts, holds: "molecules" }, options);
const kept = (o: ReturnType<typeof run>) => {
  if (!o.ok) throw new Error(o.said);
  return o;
};
const barrier = (o: ReturnType<typeof run>, k = 0): Property => kept(o).kept[k].properties!.barrier;
const why = (o: ReturnType<typeof run>, k = 0) => kept(o).aside[k]?.failed?.why;

describe("a Barrier step", () => {
  it("says where neither side's free energy states its solvation: a match of not stated is never silent", () => {
    const unsaid = (e: SetEntry): SetEntry => ({ ...e, calc: { ...e.calc!, solvation: undefined } }) as SetEntry;
    expect(barrier(run([unsaid(saddle())], [unsaid(minimum())])).by?.treatment).toMatch(/; solvation not stated$/);
    // (stated, as the output says it - "none", the gas phase - it says nothing more)
    expect(barrier(run([saddle()], [minimum()])).by?.treatment).not.toMatch(/solvation/);
  });

  it("gives each saddle point its free energy's height above its start, in kcal/mol, the two sigmas as each was worked out - ammonia's inversion", () => {
    const o = run([saddle()], [minimum()]);
    const b = barrier(o);
    // (CODATA 2018's hartree: 627.509474 kcal/mol)
    expect(b.value as number).toBeCloseTo(6.16, 2);
    expect(b.value as number).toBeCloseTo((AMMONIA.saddle.g - AMMONIA.minimum.g) * 627.5094740630558, 9);
    expect(b).toMatchObject({ unit: "kcal/mol", at: { geometry: geometryKey(saddle().xyz), kelvin: 298.15, atm: 1 }, by: { program: "ORCA", method: "GFN2-xTB" } });
    // (the sigmas differ - D3h's 6, the minimum read as Cs, 1 - and are kept, both said)
    expect(b.by?.treatment).toBe(
      "free energy G (thermo.free-energy; quasi-RRHO (Grimme), 100 cm⁻¹): the saddle point's less its start a #1's; point group and rotational symmetry number: D3h, σ 6 (saddle point), Cs, σ 1 (start)",
    );
    expect(kept(o).said).toBe("ΔG‡ 6.16 kcal/mol (G at GFN2-xTB, 298.15 K)");
  });

  it("leaves the rotational symmetry out where asked - sigma 1 on both sides, each side's RT ln sigma taken off - so that the program's tolerance no longer moves it", () => {
    // (the reference's sigma 1 on both sides: 5.098 kcal/mol)
    const o = run([saddle()], [minimum()], { symmetry: "left-out" });
    expect(barrier(o).value as number).toBeCloseTo(5.098, 3);
    expect(barrier(o).by?.treatment).toMatch(/; rotational symmetry left out - σ 1 on both sides, each side's RT ln σ taken off by Meno \(R = 8\.314462618 J\/\(mol K\)\)$/);
    expect(kept(o).said).toBe("ΔG‡ 5.10 kcal/mol (G at GFN2-xTB, 298.15 K, σ left out)");
    // (another run, the same two read otherwise - the point refined Cs, sigma 1; the minimum C3v, sigma 3: 4.45 as read, 5.10 left out, as the other)
    const other = { saddle: saddle({ g: -4.40362848, group: "Cs", sigma: 1 }), minimum: minimum({ g: -4.41071972, group: "C3v", sigma: 3 }) };
    expect(barrier(run([other.saddle], [other.minimum])).value as number).toBeCloseTo(4.45, 2);
    expect(barrier(run([other.saddle], [other.minimum], { symmetry: "left-out" })).value as number).toBeCloseTo(5.101, 3);
    // (E counts no rotation: the option is G's alone)
    expect(barrier(run([saddle()], [minimum()], { energy: "E", symmetry: "left-out" })).value as number).toBeCloseTo(6.11, 2);
  });

  it("gives the electronic energy's height where E is asked", () => {
    const o = run([saddle()], [minimum()], { energy: "E" });
    expect(barrier(o).value as number).toBeCloseTo(6.11, 2);
    expect(barrier(o).by?.treatment).toBe("electronic energy E: the saddle point's less its start a #1's");
    expect(kept(o).said).toBe("ΔE‡ 6.11 kcal/mol (E at GFN2-xTB)");
  });

  it("gives a Diels-Alder's from the complex of its reactants, as the reference numbers have it", () => {
    const atoms = ["C", "C", "C", "C", "C", "C", ...Array(10).fill("H")];
    const ts = made({ ...DIELS_ALDER.saddle, group: "C1", sigma: 1, atoms, imaginary: [-394], how: "saddle point optimisation", shift: 0.3 });
    const complex = made({ ...DIELS_ALDER.complex, group: "C1", sigma: 1, atoms });
    expect(barrier(run([ts], [complex])).value as number).toBeCloseTo(12.636, 3);
    expect(barrier(run([ts], [complex], { energy: "E" })).value as number).toBeCloseTo(6.777, 3);
  });

  it("refuses a saddle point that is none: not converged to one, or not with one imaginary frequency", () => {
    expect(why(run([saddle({ how: null })], [minimum()]))).toBe("a #1 is no converged saddle point: optimise it to a saddle point, or take Path search's point refined, then Frequencies on it");
    expect(why(run([saddle({ how: "optimisation" })], [minimum()]))).toMatch(/^a #1 is no converged saddle point/);
    expect(why(run([saddle({ imaginary: [-972, -40] })], [minimum()]))).toBe("a #1 has 2 imaginary frequencies: a saddle point has one");
    expect(why(run([saddle({ imaginary: [] })], [minimum()]))).toBe("a #1 has 0 imaginary frequencies: a saddle point has one");
    // (a run that failed, its record there still: no result)
    expect(why(run([{ ...saddle(), failed: { kind: "failed", why: "x" } }], [minimum()]))).toMatch(/^a #1 is no converged saddle point/);
  });

  it("refuses a start that is no converged minimum - for G, one with an imaginary frequency; for E, says it", () => {
    expect(why(run([saddle()], [minimum({ how: null })]))).toBe("its start a #1 is no converged optimisation: optimise it, then Frequencies on it");
    expect(why(run([saddle()], [minimum({ how: "saddle point optimisation" })]))).toMatch(/^its start a #1 is no converged optimisation/);
    expect(why(run([saddle()], [minimum({ imaginary: [-41.6, -8.6] })]))).toBe("its start a #1 has 2 imaginary frequencies, which its free energy leaves out: choose E, or optimise it to a minimum");
    const e = run([saddle()], [minimum({ imaginary: [-41.6] })], { energy: "E" });
    expect(barrier(e).by?.treatment).toBe("electronic energy E: the saddle point's less its start a #1's; its start has 1 imaginary frequency");
  });

  it("refuses two not worked out alike: another level, another temperature, a sigma not read", () => {
    expect(why(run([saddle({ method: "B3LYP" })], [minimum()]))).toBe("a #1: their thermo.free-energy were not worked out alike - method: B3LYP and GFN2-xTB");
    expect(why(run([saddle()], [minimum({ kelvin: 310 })]))).toBe("a #1: their thermo.free-energy were not worked out alike - temperature: 298.15 K and 310 K");
    expect(why(run([saddle({ sigma: undefined, group: undefined })], [minimum()]))).toBe(
      "a #1: the rotational symmetry number thermo.free-energy was worked out with was not read of the saddle point: its rotational entropy cannot be told",
    );
    // (E counts no rotation: no sigma asked)
    expect(barrier(run([saddle({ sigma: undefined })], [minimum()], { energy: "E" })).value as number).toBeCloseTo(6.11, 2);
    expect(why(run([saddle()], [minimum({ g: undefined })]))).toBe("its start a #1 has no thermo.free-energy");
  });

  it("takes a method named in another case as the same - B3LYP and b3lyp - each shown as read; another method still refused", () => {
    const b = barrier(run([saddle({ method: "B3LYP" })], [minimum({ method: "b3lyp" })]));
    expect(b.value as number).toBeCloseTo((AMMONIA.saddle.g - AMMONIA.minimum.g) * 627.5094740630558, 9);
    expect(b.by?.method).toBe("B3LYP");
    expect(why(run([saddle({ method: "B3LYP" })], [minimum({ method: "pbe0" })]))).toBe("a #1: their thermo.free-energy were not worked out alike - method: B3LYP and pbe0");
  });

  it("refuses two that are not one molecule in one numbering, of one charge and spin", () => {
    expect(why(run([saddle()], [minimum({ atoms: ["P", "H", "H", "H"] })]))).toBe("a #1 and its start a #1 are not the same atoms in one numbering");
    expect(why(run([saddle()], [minimum({ charge: 1 })]))).toBe("a #1 and its start a #1 are not of one charge and spin");
  });

  it("takes a G summed of parts (Add's), set against one summed of the same parts each worked out alike - a standard state on one side alone refused", () => {
    const sum = (e: SetEntry, energy: number, correction: number, standard: boolean): SetEntry => {
      const at = { geometry: geometryKey(e.xyz) };
      const parts = [
        { property: "energy", value: energy, unit: "Eh" as const, at, by: { program: "ORCA", method: "B3LYP", basis: "def2-TZVP" } },
        { property: "thermo.g-correction", value: correction, unit: "Eh" as const, at: { ...at, kelvin: 298.15, atm: 1 }, by: { program: "ORCA", method: "GFN2-xTB", treatment: "quasi-RRHO (Grimme), 100 cm⁻¹", pointGroup: "C1", symmetryNumber: 1 } },
        ...(standard ? [{ property: "standard state", value: 1.894, unit: "kcal/mol" as const, by: { treatment: "standard state 1 atm to 1 mol/L at 298.15 K" } }] : []),
      ];
      const value = energy + correction + (standard ? 1.894 / 627.5094740630558 : 0);
      return { ...e, properties: { G: { value, unit: "Eh", at: { ...at, kelvin: 298.15, atm: 1 }, parts, status: "computed" } } };
    };
    const ts = sum(saddle(), -56.5, 0.02, true);
    const start = sum(minimum(), -56.52, 0.025, true);
    const o = run([ts], [start], { free: "G" });
    expect(barrier(o).value as number).toBeCloseTo((-56.5 + 0.02 - (-56.52 + 0.025)) * 627.5094740630558, 9);
    expect(kept(o).said).toBe("ΔG‡ 9.41 kcal/mol (G = energy + thermo.g-correction + standard state, 298.15 K)");
    expect(why(run([ts], [sum(minimum(), -56.52, 0.025, false)], { free: "G" }))).toBe(
      "a #1: G of the saddle point is energy + thermo.g-correction + standard state, of its start a #1 energy + thermo.g-correction: not summed of the same parts",
    );
    const otherLevel = { ...start, properties: { G: { ...start.properties!.G, parts: start.properties!.G.parts!.map((p, i) => (i === 0 ? { ...p, by: { ...p.by, basis: "def2-SVP" } } : p)) } } };
    expect(why(run([ts], [otherLevel], { free: "G" }))).toBe("a #1: their energy in G were not worked out alike - basis: def2-TZVP and def2-SVP");
    // (a part's method and basis in another case are the same: the sums are set one against the other)
    const otherCase = { ...start, properties: { G: { ...start.properties!.G, parts: start.properties!.G.parts!.map((p, i) => (i === 0 ? { ...p, by: { ...p.by, method: "b3lyp", basis: "DEF2-TZVP" } } : p)) } } };
    expect(barrier(run([ts], [otherCase], { free: "G" })).value as number).toBeCloseTo((-56.5 + 0.02 - (-56.52 + 0.025)) * 627.5094740630558, 9);
    const noSigma = { ...start, properties: { G: { ...start.properties!.G, parts: start.properties!.G.parts!.map((p, i) => (i === 1 ? { ...p, by: { ...p.by, symmetryNumber: undefined } } : p)) } } };
    expect(why(run([ts], [noSigma], { free: "G" }))).toBe(
      "a #1: the rotational symmetry number thermo.g-correction in G was worked out with was not read of its start a #1: its rotational entropy cannot be told",
    );
    // (a G summed of parts none of which is thermochemistry - an energy and a standard state - has no sigma to read: refused, as
    //  read and left out alike, never a barrier of no number)
    const noThermal = (e: SetEntry) => {
      const g = e.properties!.G;
      const parts = g.parts!.filter((p) => p.property !== "thermo.g-correction");
      return { ...e, properties: { G: { ...g, parts } } };
    };
    for (const symmetry of ["as-read", "left-out"] as const) {
      const o = run([noThermal(ts)], [noThermal(start)], { free: "G", symmetry });
      expect(why(o)).toBe("a #1: G is energy + standard state, none of them a calculation's thermochemistry: the rotational symmetry number it was worked out with cannot be read, nor its rotational entropy told");
      expect(JSON.stringify(o)).not.toContain("NaN");
    }
  });

  it("pairs as Path search does: in order, each with each, or matched on a property - one with no start out of Failed", () => {
    const tag = (e: SetEntry, v: string): SetEntry => ({ ...e, properties: { ...e.properties, path: { value: v, unit: "none", status: "computed" } } });
    expect(run([saddle(), saddle()], [minimum()])).toEqual({ ok: false, said: "Saddle points holds 2 and Starts 1: in order, each saddle point is paired with the start in its place" });
    expect(kept(run([saddle()], [minimum(), minimum({ g: AMMONIA.minimum.g + 0.001 })], { pairs: "each" })).kept).toHaveLength(2);
    const on = run([tag(saddle(), "p1"), tag(saddle(), "p2")], [tag(minimum(), "p2")], { pairs: "property", property: "path" });
    expect([kept(on).kept.length, why(on)]).toEqual([1, "a #1 is paired with no start: no entry of Starts has its path, p1"]);
    expect(kept(on).said).toBe("ΔG‡ 6.16 kcal/mol (G at GFN2-xTB, 298.15 K) · failed 1");
  });

  it("is a step of Meno's on two inputs, its saddle points and their starts, its options read", () => {
    const info = kindInfo("barrier");
    expect(info.inputs?.map((p) => p.name)).toEqual(["Saddle points", "Starts"]);
    // (each a set of molecules, or of conformers - each conformer one saddle point, or one start)
    expect(info.inputs?.map((p) => p.takes)).toEqual([["molecules", "conformers"], ["molecules", "conformers"]]);
    expect(info.others?.map((x) => x.name)).toEqual(["Failed"]);
    expect(needsOf({ kind: "barrier", options: {} })).toBeUndefined();
    expect(needsOf({ kind: "barrier", options: { free: " " } })).toBe("Name the property that is its free energy G");
    expect(needsOf({ kind: "barrier", options: { energy: "E", free: "" } })).toBeUndefined();
    expect(needsOf({ kind: "barrier", options: { pairs: "property" } })).toBe("Name the property to pair them on");
  });
});
