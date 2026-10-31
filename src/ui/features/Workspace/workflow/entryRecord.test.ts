import { describe, expect, it } from "vitest";
import { FREQUENCY, geometryKey } from "../../../../lib/entry";
import { entryOfSet, type SetEntry } from "./entries";
import { constitutionOf, runMeno } from "./meno";
import { speciesKept } from "./run";
import type { StepKind } from "./kinds";

/** Water as a step's entry: conformer `number` of compound 0, its H opened out by `k`, its energy `e` (hartrees). */
function water(number: number, k: number, e?: number, extra: Partial<SetEntry> = {}): SetEntry {
  return {
    compound: 0,
    number,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz: [0, 0, 0, 0.96, 0, 0, -0.24, 0.93 + k, 0],
    ...(e != null ? { energy: e } : {}),
    ...extra,
  } as SetEntry;
}

describe("a step's entry read as Meno's entry record", () => {
  it("keeps its energy as a property in hartrees, at its geometry; its species by the one rule; its molecule as its lineage", () => {
    const e = water(2, 0.1, -76.4, { charge: -1, multiplicity: 2, degeneracy: 3, name: "w", from: 7, frame: 1 });
    const entry = entryOfSet(e, "x");
    expect(entry.properties.energy).toEqual({ value: -76.4, unit: "Eh", at: { geometry: geometryKey(e.xyz) }, status: "computed" });
    expect(entry.properties.degeneracy.value).toBe(3);
    expect(entry.properties.group.value).toBe("a");
    expect(entry.properties.number.value).toBe(2);
    expect(entry.species).toMatchObject({ charge: -1, multiplicity: 2, from: { charge: "given", multiplicity: "given" } });
    expect(entry.from).toEqual(["molecule:7#1"]);
    expect(entry.structure.atoms.map((a) => a.el)).toEqual(["O", "H", "H"]);
  });

  it("says how many imaginary frequencies its calculation judged it has - 0 where it judged none - and a failure as its status", () => {
    const saddle = entryOfSet(water(1, 0, -76.4, { imaginary: [-382.63] }), "x");
    expect(saddle.properties.imaginary).toEqual({ value: 1, unit: "none", at: { geometry: geometryKey(water(1, 0).xyz) }, status: "computed" });
    expect(entryOfSet(water(1, 0, -76.4), "y").properties.imaginary).toBeUndefined();
    // (judged none: a count of 0 - never taken for not worked out)
    expect(entryOfSet(water(1, 0, -76.4, { imaginary: [] }), "z").properties.imaginary).toMatchObject({ value: 0, status: "computed" });
    expect(entryOfSet(water(1, 0, undefined, { failed: { kind: "not-converged", why: "Its optimisation did not converge" } }), "w").status).toEqual({ failed: "Its optimisation did not converge" });
  });
});

describe("the fixed numbering, on the steps there are", () => {
  // (docs/WORKFLOWS-FOUNDATION.md, *The numbering is fixed*: no step renumbers an entry's atoms. Each perceived
  //  first, as a run asks it - water, no stereo - for the steps that need to know which stereoisomer it is)
  const stereo = { perceived: true as const, elements: [], key: "O", by: { plugin: "rdkit", version: "0.1.7" } };
  const set = [water(1, 0, -76.40, { stereo }), water(2, 0.3, -76.399, { stereo }), water(3, 0.6, -76.39, { stereo })];
  const kinds: StepKind[] = ["as-conformers", "energy-window", "duplicates", "populations", "choose"];
  for (const kind of kinds) {
    it(`${kind} hands on every entry's atoms and bonds in the order they came in`, () => {
      const out = runMeno(kind, set, "conformers");
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      for (const e of [...out.kept, ...out.aside]) {
        expect(e.atoms).toEqual(set[0].atoms);
        expect(e.bonds).toEqual(set[0].bonds);
      }
    });
  }
});

describe("a molecule's species through Meno's own steps", () => {
  it("tells an anion read from a calculation from its neutral, though its atoms carry no charge", () => {
    expect(constitutionOf(water(1, 0, undefined, { charge: -1, multiplicity: 2 }))).not.toBe(constitutionOf(water(1, 0)));
    const out = runMeno("duplicates", [water(1, 0, -76.4, { charge: -1, multiplicity: 2 }), water(2, 0, -76.4)], "molecules");
    expect(out.ok && out.kept.length).toBe(2);
  });

  it("never sets aside one of another charge or spin in the same shape, in a conformer set either; one of the same species it does", () => {
    for (const holds of ["molecules", "conformers"] as const) {
      const out = runMeno("duplicates", [water(1, 0, -76.4, { charge: 0, multiplicity: 3 }), water(2, 0, -76.4, { charge: 0, multiplicity: 1 })], holds);
      expect(out.ok && out.kept.length, holds).toBe(2);
    }
    const same = runMeno("duplicates", [water(1, 0, -76.4), water(2, 0, -76.4)], "molecules");
    expect(same.ok && same.kept.length).toBe(1);
  });

  it("keeps the charge and spin a calculation said, where a step of Meno's own hands the entry on", () => {
    expect(speciesKept(water(1, 0, undefined, { charge: -1, multiplicity: 2 }))).toEqual({ calc: { readers: [], charge: -1, multiplicity: 2 } });
    expect(speciesKept(water(1, 0))).toEqual({});
  });
});

describe("a calculation's thermochemistry as the entry's properties", () => {
  /** What a reading is, as a plugin gives it: of the molecule, an energy in hartrees, or with its own unit. */
  const reading = (id: string, value: number | string, measure: Record<string, unknown> = { quantity: "energy" }) =>
    ({ id, on: "molecule", group: "Thermochemistry", label: id, value, ...measure }) as never;
  const xtb = {
    readers: ["xtb 6.7.1"],
    program: "xtb",
    method: "GFN2-xTB",
    solvation: "ALPB(water), reference state gsolv [1 M gas/solution]",
    results: [
      reading("thermo.free-energy", -5.0623),
      reading("thermo.enthalpy", -5.0428),
      reading("thermo.zpve", 0.0213),
      reading("thermo.g-correction", 0.0047),
      reading("thermo.h-correction", 0.0242),
      reading("thermo.temperature", 298.15, { unit: "K" }),
      reading("thermo.treatment", "rotor cutoff 50 cm-1, imag. cutoff -20 cm-1, scaling factor 1"),
    ],
  };

  it("takes each as the program said it: in hartrees, at the temperature and in the solvation it used, by what, with its treatment", () => {
    const e = water(1, 0, -5.07, { calc: xtb });
    const p = entryOfSet(e, "x").properties;
    const at = { geometry: geometryKey(e.xyz), kelvin: 298.15, solvent: "ALPB(water), reference state gsolv [1 M gas/solution]" };
    const by = { plugin: "xtb", program: "xtb", method: "GFN2-xTB", treatment: "rotor cutoff 50 cm-1, imag. cutoff -20 cm-1, scaling factor 1" };
    expect(p["thermo.free-energy"]).toEqual({ value: -5.0623, unit: "Eh", at, by, status: "computed" });
    expect(p["thermo.enthalpy"]).toMatchObject({ value: -5.0428, unit: "Eh", at, by });
    expect(p["thermo.zpve"]).toMatchObject({ value: 0.0213, at, by });
    expect(p["thermo.g-correction"]).toMatchObject({ value: 0.0047, at, by });
    // (xtb says no pressure: none is said for it - never one assumed)
    expect(p["thermo.free-energy"].at).not.toHaveProperty("atm");
    // (only those agreed as properties: the rest stay readings)
    expect(p).not.toHaveProperty("thermo.h-correction");
    // (the energy: in the solvation it was worked out in, by what - no temperature, which is not its)
    expect(p.energy).toEqual({ value: -5.07, unit: "Eh", at: { geometry: geometryKey(e.xyz), solvent: xtb.solvation }, by: { plugin: "xtb", program: "xtb", method: "GFN2-xTB" }, status: "computed" });
  });

  it("says the pressure where the program said one, the gas phase where it said none, and nothing where it said nothing", () => {
    const orca = { readers: ["cclib 1.9rc1"], program: "ORCA", method: "B3LYP", basis: "def2-SVP", solvation: "none", results: [reading("thermo.free-energy", -76.4), reading("thermo.temperature", 298.15, { unit: "K" }), reading("thermo.pressure", 1, { unit: "atm" })] };
    const p = entryOfSet(water(1, 0, -76.42, { calc: orca }), "x").properties;
    expect(p["thermo.free-energy"].at).toMatchObject({ kelvin: 298.15, atm: 1, solvent: "none" });
    expect(p["thermo.free-energy"].by).toEqual({ plugin: "cclib", program: "ORCA", method: "B3LYP", basis: "def2-SVP" });
    const unsaid = entryOfSet(water(1, 0, -76.42, { calc: { ...orca, solvation: undefined } }), "x").properties;
    expect(unsaid["thermo.free-energy"].at).not.toHaveProperty("solvent");
  });

  it("gives each thermochemical property the symmetry it was worked out with, as the program printed it - and none where it printed none", () => {
    const orca = {
      readers: ["cclib 1.9rc1"],
      program: "ORCA",
      method: "B3LYP",
      results: [
        reading("thermo.free-energy", -56.53),
        reading("thermo.g-correction", 0.0123),
        reading("thermo.enthalpy", -56.51),
        reading("thermo.zpve", 0.0345),
        reading("thermo.treatment", "quasi-RRHO (Grimme), 100 cm-1"),
        reading("thermo.point-group", "C3v"),
        reading("thermo.symmetry-number", 3, { unit: "none" }),
      ],
    };
    const p = entryOfSet(water(1, 0, -56.55, { calc: orca }), "x").properties;
    const by = { plugin: "cclib", program: "ORCA", method: "B3LYP", treatment: "quasi-RRHO (Grimme), 100 cm-1", pointGroup: "C3v", symmetryNumber: 3 };
    for (const id of ["thermo.free-energy", "thermo.g-correction", "thermo.enthalpy", "thermo.zpve"]) expect(p[id].by).toEqual(by);
    // (the electronic energy has none: it counts no rotation)
    expect(p.energy.by).toEqual({ plugin: "cclib", program: "ORCA", method: "B3LYP" });
    // (none printed: none said, never one assumed; one that is no whole number of 1 or more, none)
    const unprinted = entryOfSet(water(1, 0, -56.55, { calc: { ...orca, results: orca.results.slice(0, 5) } }), "x").properties;
    expect(unprinted["thermo.free-energy"].by).not.toHaveProperty("symmetryNumber");
    expect(unprinted["thermo.free-energy"].by).not.toHaveProperty("pointGroup");
    const odd = entryOfSet(water(1, 0, -56.55, { calc: { ...orca, results: [...orca.results.slice(0, 6), reading("thermo.symmetry-number", 0, { unit: "none" })] } }), "x").properties;
    expect(odd["thermo.free-energy"].by).not.toHaveProperty("symmetryNumber");
  });

  it("takes nothing that is not an energy in hartrees, and nothing where no calculation was", () => {
    const odd = { readers: ["x 1"], results: [reading("thermo.free-energy", "n/a"), reading("thermo.enthalpy", 3, { unit: "kcal/mol" })] };
    const p = entryOfSet(water(1, 0, undefined, { calc: odd }), "x").properties;
    expect(p).not.toHaveProperty("thermo.free-energy");
    expect(p).not.toHaveProperty("thermo.enthalpy");
    const bare = entryOfSet(water(1, 0, -76.4), "x").properties;
    expect(bare.energy).toEqual({ value: -76.4, unit: "Eh", at: { geometry: geometryKey(water(1, 0).xyz) }, status: "computed" });
  });
});

describe("a calculation's vibrations as the entry's properties", () => {
  const list = (rows: { cells: (number | string)[]; move?: unknown }[], columns = [{ label: "Mode", quantity: "number" }, { label: "Frequency", quantity: "wavenumber" }]) =>
    ({ id: "vibrations", on: "list", group: "Vibrations", label: "Vibrations", columns, rows }) as never;

  it("takes each frequency in cm-1, an imaginary one negative, in the program's order - and the modes where every one gives them", () => {
    const move = (k: number) => Array.from({ length: 9 }, (_, i) => (i === k ? 0.7 : 0));
    const calc = { readers: ["cclib 1.9rc1"], program: "ORCA", method: "B3LYP", results: [list([{ cells: [1, -35.2], move: move(0) }, { cells: [2, 1595.4], move: move(1) }, { cells: [3, 3657.1], move: move(2) }])] };
    const e = water(1, 0, -76.4, { calc });
    const p = entryOfSet(e, "x").properties;
    expect(p.vibrations).toEqual({
      value: { table: { columns: [FREQUENCY], rows: [[-35.2], [1595.4], [3657.1]] } },
      unit: "none",
      at: { geometry: geometryKey(e.xyz) },
      by: { plugin: "cclib", program: "ORCA", method: "B3LYP" },
      status: "computed",
    });
    expect(p.modes.value).toEqual({ modes: [move(0), move(1), move(2)] });
  });

  it("gives no modes where any vibration gives none, or only a promise of them; and nothing where no column is a frequency", () => {
    const calc = (results: unknown[]) => ({ readers: ["xtb 6.7.1"], program: "xtb", method: "GFN2-xTB", results }) as never;
    const xtb = entryOfSet(water(1, 0, -5, { calc: calc([list([{ cells: [1, 1590] }, { cells: [2, 3650] }])]) }), "x").properties;
    expect(xtb.vibrations.value).toEqual({ table: { columns: [FREQUENCY], rows: [[1590], [3650]] } });
    expect(xtb).not.toHaveProperty("modes");
    const asked = entryOfSet(water(1, 0, -5, { calc: calc([list([{ cells: [1, 1590], move: { ask: "m1" } }])]) }), "x").properties;
    expect(asked).not.toHaveProperty("modes");
    const odd = entryOfSet(water(1, 0, -5, { calc: calc([list([{ cells: [1, 1590] }], [{ label: "Mode", quantity: "number" }, { label: "Shift", unit: "ppm" }] as never)]) }), "x").properties;
    expect(odd).not.toHaveProperty("vibrations");
  });
});
