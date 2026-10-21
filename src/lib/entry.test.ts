import { describe, expect, it } from "vitest";
import { atOneGeometry, ENTRY_SCHEMA, FREQUENCY, frameCount, geometryKey, ridingAlong, valueFault, type Entry, type Property } from "./entry";
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
      species: speciesOf({ atoms: [], bonds: [] }),
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

  it("holds restraints to the entry's atoms, as many as each kind holds, with a value where the kind has one", () => {
    const ok = { restraints: [
      { kind: "distance" as const, atoms: [0, 1], value: 0.96, strength: 1 },
      { kind: "fixed" as const, atoms: [0], strength: 1 },
    ] };
    expect(valueFault(ok, water3())).toBeNull();
    const fault = (r: { kind: "distance" | "dihedral" | "fixed"; atoms: number[]; value?: number; strength: number }) => valueFault({ restraints: [r] }, water3());
    expect(fault({ kind: "dihedral", atoms: [0, 1, 2], value: 60, strength: 1 })).toBe("Restraint 1, a dihedral, has 3 atoms");
    // (atoms by their number from 0: water's are 0, 1 and 2)
    expect(fault({ kind: "distance", atoms: [1, 3], value: 1.5, strength: 1 })).toBe("Restraint 1 names an atom the entry does not have");
    expect(fault({ kind: "distance", atoms: [0, 1], strength: 1 })).toBe("Restraint 1, a distance, has no value");
    expect(fault({ kind: "fixed", atoms: [], strength: 1 })).toBe("Restraint 1, a fixed, has 0 atoms");
    expect(fault({ kind: "distance", atoms: [0, 1], value: 0.96, strength: 0 })).toBe("Restraint 1 has a strength of 0");
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
    expect(speciesOf(anion, { multiplicity: 3 }).from).toEqual({ charge: "atoms", multiplicity: "given" });
  });
});
