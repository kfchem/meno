import { describe, expect, it } from "vitest";
import { atOneGeometry, ENTRY_SCHEMA, geometryKey, ridingAlong, type Entry, type Property } from "./entry";
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
