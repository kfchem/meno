import { describe, expect, it } from "vitest";
import { knownOfMolecules, writtenOf } from "./written";
import { WORLD_PER_ANGSTROM } from "./molecule3d";
import type { Carried3D } from "../store/types";

const water = (more: Partial<Carried3D> = {}): Carried3D => ({
  atoms: [
    { el: "O", x: 1, y: 2, z: 3 },
    { el: "H", x: 1.96, y: 2, z: 3, isotope: 2 },
    { el: "H", x: 1, y: 2.96, z: 3 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  at: { x: 0, y: 0 },
  name: "water.xyz",
  ...more,
});
const dist = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

describe("molecules in 3D as a writer is given them", () => {
  it("is one molecule as its file had it, in the frame it shows, with what its atoms carry, called by its file's name", () => {
    const m = writtenOf([water()]);
    expect(m).toMatchObject({ name: "water", bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }] });
    expect(m.atoms[1]).toEqual({ el: "H", x: 1.96, y: 2, z: 3, isotope: 2 });
    const shown = writtenOf([water({ frames: [[0, 0, 0, 0.97, 0, 0, 0, 0.97, 0]], frame: 1 })]);
    expect(shown.atoms.map((a) => a.x)).toEqual([0, 0.97, 0]);
    // (with the bonds that frame has, where they go frame by frame: one hydrogen gone 3 Å off)
    const parting = water({ frames: [[1, 2, 3, 1.96, 2, 3, 1, 5, 3]], frame: 1, bondsFrom: "distance" });
    expect(writtenOf([parting]).bonds).toEqual([{ a1: 0, a2: 1, order: 1 }]);
  });

  it("is several as one system, each as it stands on the page - placed and turned - its ångströms kept", () => {
    const k = WORLD_PER_ANGSTROM;
    // (one 4 Å to the right of the other; the second turned a quarter about z)
    const quarter: [number, number, number, number] = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    const m = writtenOf([water({ at: { x: 0, y: 0, z: 10 } }), water({ at: { x: 4 * k, y: 0, z: 10 }, turn: quarter, name: "other.xyz" })]);
    expect(m.name).toBe("water + other");
    expect(m.atoms).toHaveLength(6);
    expect(m.bonds[3]).toEqual({ a1: 3, a2: 5, order: 1 });
    // each keeps its shape
    expect(dist(m.atoms[0], m.atoms[1])).toBeCloseTo(0.96, 9);
    expect(dist(m.atoms[3], m.atoms[4])).toBeCloseTo(0.96, 9);
    // the second's O-H along x turned to along y
    expect(m.atoms[4].x - m.atoms[3].x).toBeCloseTo(0, 9);
    expect(m.atoms[4].y - m.atoms[3].y).toBeCloseTo(0.96, 9);
    // and their centres 4 Å apart, as they stand
    const centre = (from: number) => m.atoms.slice(from, from + 3).reduce((c, a) => ({ x: c.x + a.x / 3, y: c.y + a.y / 3, z: c.z + a.z / 3 }), { x: 0, y: 0, z: 0 });
    expect(dist(centre(0), centre(3))).toBeCloseTo(4, 9);
  });
});

describe("what Export starts a molecule's charge and multiplicity from", () => {
  it("is what its atoms say - or, one molecule read from a calculation, the state that calculation was in", () => {
    // (water as its file had it: neutral, a singlet)
    expect(knownOfMolecules([water()])).toMatchObject({ charge: 0, multiplicity: 1 });
    // (the hydronium ion read from a cation's output: its atoms carry no charge; the calculation said +1, a singlet)
    const hydronium = water({ atoms: [...water().atoms, { el: "H", x: 1, y: 2, z: 3.96 }], calc: { readers: [], charge: 1, multiplicity: 1 } });
    expect(knownOfMolecules([hydronium])).toMatchObject({ charge: 1, multiplicity: 1 });
    // (as its atoms alone say it: neutral, a doublet - what a writer was given before)
    expect(knownOfMolecules([{ ...hydronium, calc: undefined }])).toMatchObject({ charge: 0, multiplicity: 2 });
    // (two together: what their atoms say, not one of their calculations')
    expect(knownOfMolecules([hydronium, water()])).toMatchObject({ charge: 0 });
  });
});
