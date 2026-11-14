import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import type { ReaderOutput } from "../../../../lib/calc/output";
import type { SetEntry } from "./entries";
import { pluginEntry, workedOf } from "./programs";
import type { Worked } from "./run";

/** Minimise with restraints: what a plugin is given of the restraints wired in for an entry, and what its result says of where they were first held. */

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
/** Where a minimisation first held an entry's restraints, as its result says it: no rows, the places. */
const firstHeldAt = (start: number[]): Property => ({ value: { restraints: [], start }, unit: "none", status: "computed" });
const out = (optimised: boolean): ReaderOutput =>
  ({ schema: 1, program: "RDKit", method: "MMFF94, restrained", atoms: ["O", "H", "H"], frames: [[0, 0, 0, 0.97, 0, 0, -0.3, 0.95, 0]], energies: [-0.01], optimised, results: [] }) as unknown as ReaderOutput;
const held = (w: Worked) => w.properties?.restraints?.value as { restraints: unknown[]; start?: number[] } | undefined;

describe("Minimise with restraints", () => {
  it("gives its plugin the rows wired in for the entry, and where they were first held where it says", () => {
    const rows = [{ kind: "distance" as const, atoms: [1, 2], value: 1.6, strength: 200 }];
    expect(pluginEntry(water(), rows).restraints).toEqual(rows);
    expect(pluginEntry(water(), rows).start).toBeUndefined();
    expect(pluginEntry(water({ restraints: firstHeldAt([1, 2, 3, 4, 5, 6, 7, 8, 9]) }), rows).start).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // (none wired in: none given - none an entry carries, nothing carries rows)
    expect(pluginEntry(water({ restraints: restraints() })).restraints).toBeUndefined();
  });

  it("says on its result where the restraints were first held: where the entry stood, the first time; as it said, after - the rows not carried on", () => {
    const first = workedOf("minimise", water(), out(true), [], undefined, [], true) as Worked;
    expect(held(first)).toEqual({ restraints: [], start: XYZ });
    expect(first.xyz).toEqual([0, 0, 0, 0.97, 0, 0, -0.3, 0.95, 0]);
    const again = workedOf("minimise", water({ restraints: firstHeldAt([1, 2, 3, 4, 5, 6, 7, 8, 9]) }), out(true), [], undefined, [], true) as Worked;
    expect(held(again)?.start).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // (none held: nothing said of where)
    expect(held(workedOf("minimise", water(), out(true), []) as Worked)).toBeUndefined();
    // (another kind of step says none)
    expect(held(workedOf("optimise", water(), out(true), [], undefined, [], true) as Worked)).toBeUndefined();
  });

  it("is not done where it did not converge in the steps it was given: out of Failed, saying so", () => {
    expect((workedOf("minimise", water({ restraints: restraints() }), out(false), []) as Worked).failed).toEqual({ kind: "not-converged", why: "The minimisation did not converge in the steps it was given" });
  });
});
