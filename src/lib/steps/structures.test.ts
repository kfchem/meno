import { describe, expect, it } from "vitest";
import { place } from "../chem/reactionMap.fixtures";
import type { Entry, EntryAtom } from "../entry";
import { speciesOf } from "../io/writers";
import { combined } from "./combine";
import { angle, dihedral, distance, measured } from "./measure";
import { withSpecies } from "./species";

/**
 * Meno's structure steps against answers known by construction: electron
 * counts worked by hand, geometries whose distances, angles and dihedrals
 * are set as they are built.
 */

const entry = (id: string, els: string[], xyz: number[] | null, extra: Partial<Entry> = {}): Entry => {
  const atoms: EntryAtom[] = els.map((el) => ({ el }));
  return {
    id,
    from: [],
    structure: { atoms, bonds: els.slice(1).map((_, i) => ({ a1: 0, a2: i + 1, order: 1 as const })) },
    geometry: xyz ? { kind: "3d", xyz } : { kind: "none" },
    species: speciesOf({ atoms: atoms.map((a) => ({ ...a, x: 0, y: 0, z: 0 })), bonds: [] })!,
    properties: {},
    status: "done",
    ...extra,
  };
};
const water = (id = "w") => entry(id, ["O", "H", "H"], [0, 0, 0, 0.9572, 0, 0, -0.2400, 0.9266, 0]);
const hydroxyl = (id = "oh") => entry(id, ["O", "H"], [0, 0, 0, 0.97, 0, 0]);

describe("Species", () => {
  it("sets a charge and multiplicity the electrons allow, each said to be given", () => {
    const e = withSpecies(water(), { charge: 0, multiplicity: 1 });
    expect(e.species).toEqual({ charge: 0, multiplicity: 1, from: { charge: "given", multiplicity: "given" } });
    expect(e.status).toBe("done");
    // O2: 16 electrons, two unpaired - the triplet
    expect(withSpecies(entry("o2", ["O", "O"], [0, 0, 0, 1.21, 0, 0]), { multiplicity: 3 }).status).toBe("done");
    // OH: 9 electrons - a doublet
    expect(withSpecies(hydroxyl(), { multiplicity: 2 }).status).toBe("done");
    // a proton: no electrons, a singlet
    expect(withSpecies(entry("h", ["H"], [0, 0, 0]), { charge: 1, multiplicity: 1 }).status).toBe("done");
  });

  it("fails an entry whose electrons cannot have the multiplicity, with the reason, and changes nothing to fit", () => {
    // water: 10 electrons, an even count, cannot be a doublet
    const w = withSpecies(water(), { multiplicity: 2 });
    expect(w.status).toEqual({ failed: expect.stringMatching(/^10 electrons cannot have multiplicity 2/) });
    expect(w.species!.multiplicity).toBe(2);
    // OH: 9 electrons cannot be a singlet; as the anion, 10, it can
    expect(withSpecies(hydroxyl(), { multiplicity: 1 }).status).toEqual({ failed: expect.stringMatching(/^9 electrons/) });
    expect(withSpecies(hydroxyl(), { charge: -1, multiplicity: 1 }).status).toBe("done");
    // a proton has no electron to leave unpaired
    expect(withSpecies(entry("h", ["H"], [0, 0, 0]), { charge: 1, multiplicity: 2 }).status).toEqual({ failed: expect.stringMatching(/^0 electrons cannot have 1 unpaired/) });
  });

  it("follows a charge given with the multiplicity its electrons then take, where none is given: Na+ a singlet", () => {
    expect(withSpecies(entry("na", ["Na"], [0, 0, 0]), { charge: 1 }).species).toMatchObject({ charge: 1, multiplicity: 1 });
    expect(entry("na", ["Na"], [0, 0, 0]).species!.multiplicity).toBe(2);
  });

  it("fails a skeleton - its hydrogens not there, no species - and gives it none: its charge and spin are not known", () => {
    // benzene's carbons alone
    const skeleton = entry("s", ["C", "C", "C", "C", "C", "C"], null, { species: null });
    const s = withSpecies(skeleton, { charge: 0, multiplicity: 1 });
    expect(s.status).toEqual({ failed: expect.stringMatching(/^This molecule has no hydrogens, so its charge and spin are not known/) });
    expect(s.species).toBeNull();
  });

  it("keeps what it is not given as the entry had it", () => {
    const charged = withSpecies(hydroxyl(), { charge: -1 });
    const again = withSpecies(charged, { multiplicity: 1 });
    expect(again.species).toMatchObject({ charge: -1, multiplicity: 1 });
  });
});

describe("Combine", () => {
  it("holds the parts in order, the first's atoms first, each where it stands, bonds renumbered", () => {
    const nh3 = entry("n", ["N", "H", "H", "H"], [5, 0, 0, 6, 0, 0, 5, 1, 0, 5, 0, 1]);
    const r = combined([water("a"), nh3], "c");
    if ("failed" in r) throw new Error(r.failed);
    expect(r.entry.structure.atoms.map((a) => a.el)).toEqual(["O", "H", "H", "N", "H", "H", "H"]);
    expect(r.entry.structure.bonds.slice(2)).toEqual([
      { a1: 3, a2: 4, order: 1 },
      { a1: 3, a2: 5, order: 1 },
      { a1: 3, a2: 6, order: 1 },
    ]);
    expect(r.entry.geometry).toEqual({ kind: "3d", xyz: [...(water().geometry as { xyz: number[] }).xyz, 5, 0, 0, 6, 0, 0, 5, 1, 0, 5, 0, 1] });
    expect(r.entry.from).toEqual(["a", "n"]);
    expect(r.entry.species).toMatchObject({ charge: 0, multiplicity: 1 });
    expect(r.said).toEqual([]);
  });

  it("adds the charges, and takes two open-shell parts as high spin, saying so", () => {
    const na = withSpecies(entry("na", ["Na"], [0, 0, 0]), { charge: 1 });
    const cl = withSpecies(entry("cl", ["Cl"], [3, 0, 0]), { charge: -1 });
    const salt = combined([na, cl], "nacl");
    if ("failed" in salt) throw new Error(salt.failed);
    expect([na.species!.multiplicity, na.status, cl.species!.multiplicity, cl.status]).toEqual([1, "done", 1, "done"]);
    expect(salt.entry.species).toMatchObject({ charge: 0, multiplicity: 1 });
    const two = combined([hydroxyl("p"), entry("q", ["O", "H"], [3, 0, 0, 3.97, 0, 0])], "pq");
    if ("failed" in two) throw new Error(two.failed);
    expect(two.entry.species!.multiplicity).toBe(3);
    expect(two.said).toEqual([expect.stringMatching(/2 parts are open-shell: taken as high spin, multiplicity 3/)]);
  });

  it("with a part that is a skeleton gives a complex of no species either, and says so", () => {
    const skeleton = entry("s", ["C", "C", "C", "C", "C", "C"], [0, 0, 0, 1.4, 0, 0, 2.1, 1.2, 0, 1.4, 2.4, 0, 0, 2.4, 0, -0.7, 1.2, 0], { species: null });
    const r = combined([water("a"), skeleton], "c");
    if ("failed" in r) throw new Error(r.failed);
    expect(r.entry.species).toBeNull();
    expect(r.said).toEqual(["A part has no hydrogens, so the complex's charge and spin are not known either."]);
  });

  it("carries no part's properties, and says so; refuses frames and mixed places, with the reason", () => {
    const e = { ...water(), properties: { energy: { value: -76.4, unit: "Eh" as const, status: "computed" as const } } };
    const r = combined([e, hydroxyl()], "c");
    expect("failed" in r ? r : r.entry.properties).toEqual({});
    expect("failed" in r ? [] : r.said).toEqual([expect.stringMatching(/not carried over/)]);
    const path = { ...water(), geometry: { kind: "frames" as const, frames: [[0, 0, 0, 1, 0, 0, 0, 1, 0]] } };
    expect(combined([path, water()], "x")).toEqual({ failed: expect.stringMatching(/frames/) });
    expect(combined([entry("g", ["C"], null), water()], "x")).toEqual({ failed: expect.stringMatching(/different kinds/) });
    expect(combined([], "x")).toEqual({ failed: expect.any(String) });
  });
});

describe("Measure", () => {
  it("measures distances and angles set by construction: a 3-4-5 right triangle", () => {
    const t = entry("t", ["C", "C", "C"], [0, 0, 0, 3, 0, 0, 0, 4, 0]);
    const m = measured(t, [[0, 1], [1, 2], [1, 0, 2]]);
    expect(m.properties["distance 1-2"]).toMatchObject({ value: 3, unit: "Å", status: "computed" });
    expect(m.properties["distance 2-3"].value).toBeCloseTo(5, 12);
    expect(m.properties["angle 2-1-3"]).toMatchObject({ unit: "°", status: "computed" });
    expect(m.properties["angle 2-1-3"].value).toBeCloseTo(90, 12);
    expect(angle([0, 0, 0], [1, 0, 0], [2, 0, 0])).toBeCloseTo(180, 12);
  });

  it("signs a dihedral as IUPAC's torsion angle: looking from the second atom to the third, the first turned clockwise to the fourth is positive", () => {
    // looking along +z from b to c, a on +x; d turned anticlockwise as seen from +z, which is clockwise as seen from b
    const turned = (deg: number): [number, number, number] => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 1];
    const a: [number, number, number] = [1, 0, 0];
    const b: [number, number, number] = [0, 0, 0];
    const c: [number, number, number] = [0, 0, 1];
    expect(dihedral(a, b, c, turned(60))).toBeCloseTo(60, 10);
    expect(dihedral(a, b, c, turned(-60))).toBeCloseTo(-60, 10);
    expect(Math.abs(dihedral(a, b, c, turned(180)))).toBeCloseTo(180, 10);
    expect(dihedral(a, b, c, turned(0))).toBeCloseTo(0, 10);
    // the test fixtures' builder places by the same torsion
    for (const t of [-150, -60, 10, 75, 120]) {
      const d = place(a, b, c, 1.1, 109.5, t);
      expect(dihedral(a, b, c, d)).toBeCloseTo(t, 9);
      expect(distance(c, d)).toBeCloseTo(1.1, 12);
      expect(angle(b, c, d)).toBeCloseTo(109.5, 9);
    }
  });

  it("gives one value per frame for an entry with frames, each measurement saying its geometry", () => {
    const one = measured(water(), [[1, 0, 2]]);
    expect(one.properties["angle 2-1-3"].at?.geometry).toMatch(/^[0-9a-f]{8}$/);
    const frames = { ...water(), geometry: { kind: "frames" as const, frames: [[0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 0, 0, 2, 0, 0, 0, 2, 0]] } };
    expect(measured(frames, [[0, 1]]).properties["distance 1-2"].value).toEqual({ list: [1, 2], per: "frame" });
  });

  it("leaves nothing out: no 3D places, not applicable; an atom it has not, failed - each with the reason", () => {
    const flat = { ...water(), geometry: { kind: "2d" as const, xy: [0, 0, 1, 0, 0, 1] } };
    expect(measured(flat, [[0, 1]]).properties["distance 1-2"].status).toEqual({ notApplicable: "The entry is drawn, not in 3D." });
    const m = measured(water(), [[0, 8], [0, 0], [0]]);
    expect(m.properties["distance 1-9"].status).toEqual({ failed: "The entry has no atom 9: its atoms are 1 to 3." });
    expect(m.properties["distance 1-1"].status).toEqual({ failed: expect.stringMatching(/named twice/) });
    expect(m.properties["measurement 1"].status).toEqual({ failed: expect.stringMatching(/two, three or four/) });
  });
});
