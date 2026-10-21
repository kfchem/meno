import { describe, expect, it } from "vitest";
import { atOneGeometry, ENTRY_SCHEMA, geometryKey, ridingAlong, stereoIdentity, type Entry, type EntryStereo, type Property } from "./entry";
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

describe("which stereoisomer an entry is", () => {
  const by = { plugin: "rdkit", version: "0.1.7" };
  const centre = (specified = true) => ({ kind: "centre" as const, atoms: [1], specified });
  const perceived = (key: string, elements = [centre()], at = by): EntryStereo => ({ perceived: true, elements, key, by: at });

  it("is one text two entries share exactly when they are one stereoisomer, as one plugin's version keys them", () => {
    // ((R)- and (S)-2-butanol, keyed by the plugin; the same key from two geometries is one stereoisomer)
    expect(stereoIdentity(perceived("CC[C@@H](C)O"))).toBe(stereoIdentity(perceived("CC[C@@H](C)O")));
    expect(stereoIdentity(perceived("CC[C@@H](C)O"))).not.toBe(stereoIdentity(perceived("CC[C@H](C)O")));
    // (two versions' keys are never compared: their canonical texts may differ)
    expect(stereoIdentity(perceived("CC[C@@H](C)O"))).not.toBe(stereoIdentity(perceived("CC[C@@H](C)O", [centre()], { ...by, version: "0.1.8" })));
  });

  it("is known for a molecule with no stereo - and not known where it was not perceived, or a configuration was left open", () => {
    // (methylcyclohexane: perceived, nothing stereogenic - an identity of its own)
    expect(stereoIdentity(perceived("CC1CCCCC1", []))).toBe("rdkit@0.1.7:CC1CCCCC1");
    // (not perceived is not "no stereo"; an open centre matches nothing, not even another open one)
    expect(stereoIdentity(undefined)).toBeNull();
    expect(stereoIdentity({ perceived: false, why: "Nothing added tells stereoisomers apart" })).toBeNull();
    expect(stereoIdentity(perceived("CC(C)O", [centre(false)]))).toBeNull();
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
