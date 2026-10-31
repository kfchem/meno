import { describe, expect, it } from "vitest";
import { atOneGeometry, ENTRY_SCHEMA, FREQUENCY, frameCount, geometryKey, propertyIn, ridingAlong, stereoIdentity, valueFault, type By, type Entry, type EntryStereo, type Property } from "./entry";
import { speciesOf } from "./io/writers";

const water = (dx = 0) => [0 + dx, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0];

describe("the entry record", () => {
  it("is of version 1", () => {
    expect(ENTRY_SCHEMA).toBe(1);
  });

  it("keys a geometry by its places: the same places the same key, another's another", () => {
    expect(geometryKey(water())).toBe(geometryKey([...water()]));
    expect(geometryKey(water())).toBe(geometryKey(water(1e-7)));
    expect(geometryKey(water())).not.toBe(geometryKey(water(1e-3)));
    expect(geometryKey(water())).toMatch(/^[0-9a-f]{8}$/);
  });

  it("hands its properties on, each still saying the geometry it was worked out at", () => {
    const at = { geometry: geometryKey(water()) };
    const energy: Property = { value: -76.4, unit: "Eh", at, status: "computed" };
    const tag: Property = { value: "s1", unit: "none", status: "computed" };
    const parent: Entry = {
      id: "e1",
      from: [],
      structure: { atoms: [{ el: "O" }, { el: "H" }, { el: "H" }], bonds: [] },
      geometry: { kind: "3d", xyz: water() },
      species: speciesOf({ atoms: [], bonds: [] })!,
      properties: { energy, start: tag },
      status: "done",
    };
    const handed = ridingAlong(parent);
    expect(handed).toEqual(parent.properties);
    expect(handed.energy).not.toBe(energy);
    // (an energy of the parent's geometry and one of the child's are not at one geometry; an ID is of any)
    const child: Property = { value: -76.41, unit: "Eh", at: { geometry: geometryKey(water(0.01)) }, status: "computed" };
    expect(atOneGeometry([handed.energy, child])).toBe(false);
    expect(atOneGeometry([handed.energy, handed.start])).toBe(true);
  });
});

describe("which stereoisomer an entry is", () => {
  const by = { plugin: "rdkit", version: "0.1.7" };
  const centre = (specified = true) => ({ kind: "centre" as const, atoms: [1], specified });
  const perceived = (key: string, elements = [centre()], at: By = by): EntryStereo => ({ perceived: true, elements, key, by: at });

  it("is one text two entries share exactly when they are one stereoisomer, as one plugin's version keys them", () => {
    // ((R)- and (S)-2-butanol, keyed by the plugin; the same key from two geometries is one stereoisomer)
    expect(stereoIdentity(perceived("CC[C@@H](C)O"))).toBe(stereoIdentity(perceived("CC[C@@H](C)O")));
    expect(stereoIdentity(perceived("CC[C@@H](C)O"))).not.toBe(stereoIdentity(perceived("CC[C@H](C)O")));
    // (two versions' keys are never compared: their canonical texts may differ)
    expect(stereoIdentity(perceived("CC[C@@H](C)O"))).not.toBe(stereoIdentity(perceived("CC[C@@H](C)O", [centre()], { ...by, version: "0.1.8" })));
  });

  it("is known for a molecule with no stereo - and not known where it was not perceived, or a configuration was left open", () => {
    // (methylcyclohexane: perceived, nothing stereogenic - an identity of its own)
    expect(stereoIdentity(perceived("CC1CCCCC1", []))).toBe('["rdkit","0.1.7","CC1CCCCC1"]');
    // (not perceived is not "no stereo"; an open centre matches nothing, not even another open one)
    expect(stereoIdentity(undefined)).toBeNull();
    expect(stereoIdentity({ perceived: false, why: "Nothing added tells stereoisomers apart" })).toBeNull();
    expect(stereoIdentity(perceived("CC(C)O", [centre(false)]))).toBeNull();
  });

  it("is never one text for two different ones: no plugin or version said is not known, and no two parts run together", () => {
    // (the desk's two cases: an empty `by` read as "?" and "?" equalled a plugin and version called "?";
    //  and a key or version with the separator in it made (a, b, "c:d") and (a, "b:c", d) one text)
    expect(stereoIdentity(perceived("K", [centre()], {}))).toBeNull();
    expect(stereoIdentity(perceived("K", [centre()], { plugin: "rdkit" }))).toBeNull();
    expect(stereoIdentity(perceived("K", [centre()], { plugin: "", version: "0.1.7" }))).toBeNull();
    expect(stereoIdentity(perceived("K", [centre()], { plugin: "?", version: "?" }))).not.toBeNull();
    expect(stereoIdentity(perceived("c:d", [centre()], { plugin: "a", version: "b" }))).not.toBe(stereoIdentity(perceived("d", [centre()], { plugin: "a", version: "b:c" })));
    expect(stereoIdentity(perceived("d", [centre()], { plugin: "a@b", version: "c" }))).not.toBe(stereoIdentity(perceived("d", [centre()], { plugin: "a", version: "b@c" })));
  });
});

describe("a property's value, checked against its entry", () => {
  /** Water, three atoms, as one geometry or as a path of two frames. */
  const water3 = (frames?: number): Pick<Entry, "structure" | "geometry"> => ({
    structure: { atoms: [{ el: "O" }, { el: "H" }, { el: "H" }], bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }] },
    geometry: frames ? { kind: "frames", frames: Array.from({ length: frames }, () => water()) } : { kind: "3d", xyz: water() },
  });

  it("counts a geometry's frames: a path's, one, or none for a graph", () => {
    expect(frameCount(water3(2).geometry)).toBe(2);
    expect(frameCount(water3().geometry)).toBe(1);
    expect(frameCount({ kind: "none" })).toBe(0);
  });

  it("holds a list to what it is per: three charges for three atoms, two energies for a path of two frames", () => {
    expect(valueFault({ list: [-0.8, 0.4, 0.4], per: "atom" }, water3())).toBeNull();
    expect(valueFault({ list: [-76.40, -76.41], per: "frame" }, water3(2))).toBeNull();
    // (the ambiguity per removes: three values are three atoms' - or three frames', which this path has not)
    expect(valueFault({ list: [-76.40, -76.41, -76.42], per: "frame" }, water3(2))).toBe("A list per frame has 3 values for 2 frames");
    expect(valueFault({ list: [0, 1], per: "atom" }, water3())).toBe("A list per atom has 2 values for 3 atoms");
    // (a curve's points are as many as it has)
    expect(valueFault({ list: [1, 2, 3, 4, 5], per: "point" }, water3())).toBeNull();
  });

  it("holds a table's rows to its columns, and each mode to three numbers an atom", () => {
    // (each column with its own unit: a frequency's, and a symmetry's, which has none)
    const columns = [FREQUENCY, { name: "symmetry", unit: "none" as const }];
    expect(valueFault({ table: { columns, rows: [[1595, "A1"], [3657, "A1"], [3756, "B2"]] } }, water3())).toBeNull();
    expect(valueFault({ table: { columns, rows: [[1595, "A1"], [3657]] } }, water3())).toBe("Row 2 of a table has 1 cells for 2 columns");
    expect(valueFault({ modes: [Array(9).fill(0.1), Array(9).fill(0.2)] }, water3())).toBeNull();
    expect(valueFault({ modes: [Array(9).fill(0.1), Array(6).fill(0.2)] }, water3())).toBe("Mode 2 has 6 numbers for 3 atoms");
  });

  it("holds restraints to the entry's atoms, as many as each kind holds, with a value and a strength where the kind has them", () => {
    const ok = { restraints: [
      { kind: "distance" as const, atoms: [0, 1], value: 0.96, strength: 1000 },
      { kind: "dihedral" as const, atoms: [1, 0, 2, 1], value: 180, strength: 50 },
      { kind: "fixed" as const, atoms: [0] },
    ] };
    expect(valueFault(ok, water3())).toBeNull();
    const fault = (r: { kind: "distance" | "dihedral" | "fixed"; atoms: number[]; value?: number; strength?: number }) => valueFault({ restraints: [r] }, water3());
    expect(fault({ kind: "dihedral", atoms: [0, 1, 2], value: 60, strength: 1 })).toBe("Restraint 1, a dihedral, has 3 atoms");
    // (atoms by their number from 0: water's are 0, 1 and 2)
    expect(fault({ kind: "distance", atoms: [1, 3], value: 1.5, strength: 1 })).toBe("Restraint 1 names an atom the entry does not have");
    expect(fault({ kind: "distance", atoms: [0, 1], strength: 1 })).toBe("Restraint 1, a distance, has no value");
    expect(fault({ kind: "fixed", atoms: [] })).toBe("Restraint 1, a fixed, has 0 atoms");
    expect(fault({ kind: "distance", atoms: [0, 1], value: 0.96, strength: 0 })).toBe("Restraint 1 has a strength of 0");
    expect(fault({ kind: "dihedral", atoms: [0, 1, 2, 0], value: 180 })).toBe("Restraint 1 has a strength of undefined");
    // (atoms fixed are fixed: nothing to hold them to, nothing to hold them by)
    expect(fault({ kind: "fixed", atoms: [0], strength: 1 })).toBe("Restraint 1 fixes atoms, so it has neither value nor strength");
  });
});

describe("restraints read back from a file", () => {
  it("reads each row as it was written, and nothing where any row does not read", () => {
    const value = { restraints: [
      { kind: "distance", atoms: [0, 1], value: 3.21, strength: 500 },
      { kind: "dihedral", atoms: [3, 0, 1, 2], value: 180, strength: 50 },
      { kind: "fixed", atoms: [2] },
    ] };
    const p = propertyIn({ value, unit: "none", status: "computed" });
    expect(p).toEqual({ value, unit: "none", status: "computed" });
    // (and where a minimisation first held them)
    const started = { ...value, start: [0, 0, 0, 1.5, 0, 0, 3, 0, 0, 4.5, 0, 0] };
    expect(propertyIn({ value: started, unit: "none", status: "computed" })?.value).toEqual(started);
    expect(propertyIn({ value: { ...value, start: [0, "x"] }, unit: "none", status: "computed" })).toBeUndefined();
    // (a row of no kind, a distance with no strength, atoms fixed with a value, an atom not a whole number: none read - nothing held in part)
    for (const bad of [
      { kind: "angle", atoms: [0, 1, 2], value: 90, strength: 1 },
      { kind: "distance", atoms: [0, 1], value: 2 },
      { kind: "fixed", atoms: [0], value: 1 },
      { kind: "fixed", atoms: [0.5] },
      // (the wrong number of atoms for its kind)
      { kind: "distance", atoms: [0, 1, 2], value: 2, strength: 1 },
      { kind: "dihedral", atoms: [0, 1, 2], value: 180, strength: 1 },
      { kind: "fixed", atoms: [] },
    ])
      expect(propertyIn({ value: { restraints: [value.restraints[0], bad] }, unit: "none", status: "computed" })).toBeUndefined();
  });
});

describe("a molecule's species, by Meno's one rule", () => {
  const anion = { atoms: [{ el: "O", x: 0, y: 0, z: 0, charge: -1 }, { el: "H", x: 1, y: 0, z: 0 }], bonds: [] };

  it("is what it was given, where it was given a whole charge and a multiplicity of one or more", () => {
    expect(speciesOf(anion, { charge: 0, multiplicity: 2 })).toEqual({ charge: 0, multiplicity: 2, from: { charge: "given", multiplicity: "given" } });
  });

  it("is what its atoms say where it was given none, or none that makes sense", () => {
    expect(speciesOf(anion)).toEqual({ charge: -1, multiplicity: 1, from: { charge: "atoms", multiplicity: "atoms" } });
    expect(speciesOf(anion, { charge: 0.5, multiplicity: 0 })).toEqual({ charge: -1, multiplicity: 1, from: { charge: "atoms", multiplicity: "atoms" } });
    expect(speciesOf(anion, { multiplicity: 3 })!.from).toEqual({ charge: "atoms", multiplicity: "given" });
  });
});

describe("a sum's parts, as a file holds them", () => {
  it("reads back each part as it was - its value, unit, where and by what - and refuses a sum whose parts do not all read", () => {
    const p = {
      value: -499.977,
      unit: "Eh",
      at: { geometry: "g1", kelvin: 298.15, atm: 1, solvent: "SMD(chloroform)" },
      by: { treatment: "sum: energy (...) + thermo.g-correction (...) + standard state (...)" },
      status: "computed",
      parts: [
        { property: "energy", value: -500.1, unit: "Eh", at: { geometry: "g1", solvent: "SMD(chloroform)" }, by: { program: "Gaussian", method: "wB97X-D", basis: "6-311+G(d,p)" } },
        { property: "thermo.g-correction", value: 0.12, unit: "Eh", at: { geometry: "g1", kelvin: 298.15, atm: 1 }, by: { method: "wB97X-D", basis: "6-31G(d)", treatment: "quasi-RRHO" } },
        { property: "standard state", value: 1.894, unit: "kcal/mol", by: { treatment: "standard state 1 atm to 1 mol/L at 298.15 K" } },
      ],
    };
    expect(propertyIn(JSON.parse(JSON.stringify(p)))).toEqual(p);
    // (one part that does not read - no name, no number, a unit Meno does not know, a field of the wrong kind - and none of it is read)
    for (const bad of [{ value: 1, unit: "Eh" }, { property: "x", value: "1", unit: "Eh" }, { property: "x", value: 1, unit: "furlongs" }, { property: "x", value: 1, unit: "Eh", at: { kelvin: 298 } }])
      expect(propertyIn({ ...p, parts: [...p.parts, bad] })).toBeUndefined();
    expect(propertyIn({ ...p, parts: [] })).toBeUndefined();
  });
});

describe("an ensemble's value, as a file holds it", () => {
  it("reads back how many it is over, and its members' values with their own parts one level down - no deeper", () => {
    const sum = { property: "G", value: -1.2, unit: "Eh", at: { geometry: "g1", kelvin: 298.15 }, parts: [{ property: "energy", value: -1.3, unit: "Eh" }, { property: "thermo.g-correction", value: 0.1, unit: "Eh" }] };
    const p = { value: -1.21, unit: "Eh", at: { geometry: "g1", kelvin: 298.15 }, by: { treatment: "ensemble over 2" }, status: "computed", parts: [sum, { ...sum, value: -1.19 }], ensemble: { of: 2 } };
    expect(propertyIn(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(propertyIn({ ...p, ensemble: { of: 0 } })).toBeUndefined();
    expect(propertyIn({ ...p, ensemble: { of: 1.5 } })).toBeUndefined();
    // (two levels down: not read)
    expect(propertyIn({ ...p, parts: [{ ...sum, parts: [{ ...sum.parts[0], parts: [sum.parts[1]] }] }] })).toBeUndefined();
  });
});

describe("a property's structure, as a file holds it", () => {
  it("reads back the structure a value was worked out from, and refuses one that is no key", () => {
    const p = { value: 136.24, unit: "g/mol", of: "k1", status: "computed" };
    expect(propertyIn(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(propertyIn({ ...p, of: 7 })).toBeUndefined();
    const { of: _, ...plain } = p;
    expect(propertyIn(plain)).toEqual(plain);
  });

  it("reads back the symmetry a free energy was worked out with - its point group, and its symmetry number a whole number of 1 or more", () => {
    const p = { value: -56.53, unit: "Eh", at: { geometry: "g1", kelvin: 298.15, atm: 1 }, by: { program: "ORCA", method: "B3LYP", treatment: "quasi-RRHO (Grimme), 100 cm-1", pointGroup: "C3v", symmetryNumber: 3 }, status: "computed" };
    expect(propertyIn(JSON.parse(JSON.stringify(p)))).toEqual(p);
    for (const bad of [0, 1.5, "3", -3]) expect(propertyIn({ ...p, by: { ...p.by, symmetryNumber: bad } })).toBeUndefined();
    expect(propertyIn({ ...p, by: { ...p.by, pointGroup: 3 } })).toBeUndefined();
  });

  it("reads back a table of numbers, as a conformer carries its vibrations - and refuses a table of any other shape", () => {
    const p = { value: { table: { columns: [FREQUENCY], rows: [[-12.5], [1595], [3657]] } }, unit: "none", at: { geometry: "g1", kelvin: 298.15 }, status: "computed" };
    expect(propertyIn(JSON.parse(JSON.stringify(p)))).toEqual(p);
    const table = (t: unknown) => propertyIn({ ...p, value: { table: t } });
    expect(table({ columns: [FREQUENCY], rows: [] })).toEqual({ ...p, value: { table: { columns: [FREQUENCY], rows: [] } } });
    // (a row not as wide as the columns; a cell not a finite number; a column of no unit Meno knows, or unnamed; no columns)
    expect(table({ columns: [FREQUENCY], rows: [[1, 2]] })).toBeUndefined();
    expect(table({ columns: [FREQUENCY], rows: [["1595"]] })).toBeUndefined();
    expect(table({ columns: [FREQUENCY], rows: [[null]] })).toBeUndefined();
    expect(table({ columns: [{ name: "frequency", unit: "furlongs" }], rows: [[1]] })).toBeUndefined();
    expect(table({ columns: [{ name: "", unit: "cm-1" }], rows: [[1]] })).toBeUndefined();
    expect(table({ columns: [], rows: [] })).toBeUndefined();
    expect(table({ columns: [FREQUENCY] })).toBeUndefined();
    // (other values not one: a list, modes)
    expect(propertyIn({ ...p, value: { list: [1, 2], per: "atom" } })).toBeUndefined();
    expect(propertyIn({ ...p, value: { modes: [[0, 0, 0]] } })).toBeUndefined();
  });
});

