import { describe, expect, it } from "vitest";
import { FREQUENCY, geometryKey, type Entry } from "../entry";
import { speciesOf } from "../io/writers";
import { displaced, displacedEntry, imaginaryVibration } from "./vibrations";

/** Displace against answers worked by hand. */

describe("imaginaryVibration", () => {
  it("takes the one of negative frequency; of several the most negative, and says so; of none, fails", () => {
    expect(imaginaryVibration([-512.3, 30, 1700])).toEqual({ index: 0 });
    expect(imaginaryVibration([45, -60.2, -1203.4, 900])).toEqual({ index: 2, said: "It has 2 imaginary vibrations; the most negative, -1203.4 cm⁻¹, is taken." });
    expect(imaginaryVibration([12, 400])).toEqual({ failed: "It has no imaginary vibration." });
  });
});

describe("Displace", () => {
  const xyz = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  // atom 2 moves (0, 0, 2) - the most - atom 1 (1, 0, 0), atom 3 not at all
  const mode = [1, 0, 0, 0, 0, 2, 0, 0, 0];

  it("moves the atom moving most by exactly the amplitude, the others in proportion", () => {
    expect(displaced(xyz, mode, 0.3)).toEqual({ xyz: [0.15, 0, 0, 1, 0, 0.3, 0, 1, 0] });
    expect(displaced(xyz, mode, -0.3)).toEqual({ xyz: [-0.15, 0, 0, 1, 0, -0.3, 0, 1, 0] });
  });

  it("does not depend on how the program scaled the mode", () => {
    expect(displaced(xyz, mode.map((v) => v * 37.5), 0.3)).toEqual(displaced(xyz, mode, 0.3));
  });

  it("refuses a mode of another size or one that moves nothing", () => {
    expect(displaced(xyz, [1, 0, 0], 0.3)).toEqual({ failed: "The vibration has 1 atoms and the geometry 3." });
    expect(displaced(xyz, [0, 0, 0, 0, 0, 0, 0, 0, 0], 0.3)).toEqual({ failed: "The vibration moves no atom." });
  });
});

describe("Displace on an entry", () => {
  // a hydrogen halfway between two oxygens, O-H-O along x; its imaginary vibration moves the hydrogen along x (0.9) against the oxygens (-0.3 each), a soft bend the other way
  const xyz = [-1.2, 0, 0, 0, 0, 0, 1.2, 0, 0];
  const ts = (frequencies: number[], modes: number[][]): Entry => ({
    id: "ts1",
    from: [],
    structure: { atoms: [{ el: "O" }, { el: "H" }, { el: "O" }], bonds: [] },
    geometry: { kind: "3d", xyz },
    species: speciesOf({ atoms: [], bonds: [] }),
    properties: {
      energy: { value: -151.2, unit: "Eh", at: { geometry: geometryKey(xyz) }, status: "computed" },
      vibrations: {
        value: { table: { columns: [FREQUENCY], rows: frequencies.map((f) => [f]) } },
        unit: "none",
        at: { geometry: geometryKey(xyz) },
        status: "computed",
      },
      modes: { value: { modes }, unit: "none", at: { geometry: geometryKey(xyz) }, status: "computed" },
    },
    status: "done",
  });
  const transfer = [-0.3, 0, 0, 0.9, 0, 0, -0.3, 0, 0];
  const bend = [0, 0.1, 0, 0, -0.2, 0, 0, 0.1, 0];

  it("displaces along the imaginary vibration, the hydrogen by the amplitude, the energy still saying its own geometry", () => {
    const r = displacedEntry(ts([-1450, 300], [transfer, bend]), { vibration: "imaginary", amplitude: 0.1 }, "d1");
    if ("failed" in r) throw new Error(r.failed);
    const g = r.entry.geometry as { xyz: number[] };
    expect(g.xyz[3]).toBeCloseTo(0.1, 12);
    expect(g.xyz[0]).toBeCloseTo(-1.2 - 0.1 / 3, 12);
    expect(r.entry.properties.energy.at?.geometry).toBe(geometryKey(xyz));
    expect(r.entry.from).toEqual(["ts1"]);
  });

  it("displaces along a vibration chosen by number, from 0", () => {
    const r = displacedEntry(ts([-1450, 300], [transfer, bend]), { vibration: 1, amplitude: 0.2 }, "d2");
    if ("failed" in r) throw new Error(r.failed);
    expect((r.entry.geometry as { xyz: number[] }).xyz[4]).toBeCloseTo(-0.2, 12);
    expect(displacedEntry(ts([-1450, 300], [transfer, bend]), { vibration: 2, amplitude: 0.2 }, "d")).toEqual({ failed: "There is no vibration 3: it has 1 to 2." });
  });

  it("refuses an entry with no imaginary vibration, or vibrations it cannot read, with the reason", () => {
    expect(displacedEntry(ts([300, 400], [transfer, bend]), { vibration: "imaginary", amplitude: 0.1 }, "d")).toEqual({ failed: "It has no imaginary vibration." });
    expect(displacedEntry(ts([-1450], [transfer, bend]), { vibration: "imaginary", amplitude: 0.1 }, "d")).toEqual({ failed: "It has 1 vibrations and 2 modes." });
    expect(displacedEntry(ts([-1450, 300], [[0, 0], bend]), { vibration: "imaginary", amplitude: 0.1 }, "d")).toEqual({ failed: "Its vibrations: Mode 1 has 2 numbers for 3 atoms." });
    const bare = { ...ts([-1450], [transfer]), properties: {} };
    expect(displacedEntry(bare, { vibration: "imaginary", amplitude: 0.1 }, "d")).toEqual({ failed: "The entry has no vibrations." });
  });
});
