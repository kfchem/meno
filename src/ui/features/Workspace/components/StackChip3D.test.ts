import { describe, expect, it } from "vitest";
import type { Result } from "../../../../lib/calc/results";
import { stackedResults } from "./StackChip3D";

const dipole: Result = { id: "dipole", group: "Dipole", label: "Dipole moment", on: "molecule", value: 1.84, unit: "D" };
const charges: Result = { id: "q", group: "Charges", label: "Mulliken", on: "atoms", values: [0.1, -0.1] };
const energy: Result = { id: "e", group: "Energy", label: "Step energy", on: "frames", values: [-5.1, -5.2, -5.3] };

describe("what a stacked molecule's chip says of its calculation", () => {
  it("says nothing where the molecule was read from none", () => {
    expect(stackedResults({ calc: undefined }, 0)).toBeUndefined();
    expect(stackedResults({ calc: { results: [] } as never }, 0)).toBeUndefined();
  });

  it("keeps the molecule's own values and tells its frames' at the frame shown, as the molecule's", () => {
    const shown = { calc: { results: [dipole, charges, energy] } as never };
    const said = stackedResults(shown, 2)!;
    expect(said.map((r) => r.on)).toEqual(["molecule", "molecule"]);
    expect(said[0]).toBe(dipole);
    expect(said[1]).toMatchObject({ label: "Step energy", value: -5.3 });
  });

  it("leaves what is of atoms for the atoms", () => {
    expect(stackedResults({ calc: { results: [charges] } as never }, 0)).toEqual([]);
  });
});
