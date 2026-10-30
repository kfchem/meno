import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import type { ReaderOutput } from "../../../../lib/calc/output";
import type { SetEntry } from "./entries";
import { pluginEntry, workedOf } from "./programs";
import type { Worked } from "./run";

/** Minimise with restraints: what a plugin is given of an entry's restraints, and what its result says of where they were first held. */

const XYZ = [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0];
const water = (properties: SetEntry["properties"] = {}): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz: [...XYZ],
    properties,
  }) as unknown as SetEntry;
const restraints = (start?: number[]): Property => ({
  value: { restraints: [{ kind: "distance", atoms: [1, 2], value: 1.6, strength: 200 }], ...(start ? { start } : {}) },
  unit: "none",
  status: "computed",
});
const out = (optimised: boolean): ReaderOutput =>
  ({ schema: 1, program: "RDKit", method: "MMFF94, restrained", atoms: ["O", "H", "H"], frames: [[0, 0, 0, 0.97, 0, 0, -0.3, 0.95, 0]], energies: [-0.01], optimised, results: [] }) as unknown as ReaderOutput;
const held = (w: Worked) => w.properties?.restraints?.value as { start?: number[] };

describe("Minimise with restraints", () => {
  it("gives its plugin the entry's restraints, and where they were first held where they say", () => {
    expect(pluginEntry(water({ restraints: restraints() })).restraints).toEqual([{ kind: "distance", atoms: [1, 2], value: 1.6, strength: 200 }]);
    expect(pluginEntry(water({ restraints: restraints() })).start).toBeUndefined();
    expect(pluginEntry(water({ restraints: restraints([1, 2, 3, 4, 5, 6, 7, 8, 9]) })).start).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // (none held: none given)
    expect(pluginEntry(water()).restraints).toBeUndefined();
  });

  it("says on its result where the restraints were first held: where the entry stood, the first time; as they said, after", () => {
    const first = workedOf("minimise", water({ restraints: restraints() }), out(true), []) as Worked;
    expect(held(first).start).toEqual(XYZ);
    expect(first.xyz).toEqual([0, 0, 0, 0.97, 0, 0, -0.3, 0.95, 0]);
    const again = workedOf("minimise", water({ restraints: restraints([1, 2, 3, 4, 5, 6, 7, 8, 9]) }), out(true), []) as Worked;
    expect(held(again).start).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // (another kind of step leaves restraints as they are)
    expect(held(workedOf("optimise", water({ restraints: restraints() }), out(true), []) as Worked).start).toBeUndefined();
  });

  it("is not done where it did not converge in the steps it was given: out of Failed, saying so", () => {
    expect((workedOf("minimise", water({ restraints: restraints() }), out(false), []) as Worked).failed).toEqual({ kind: "not-converged", why: "The minimisation did not converge in the steps it was given" });
  });
});
