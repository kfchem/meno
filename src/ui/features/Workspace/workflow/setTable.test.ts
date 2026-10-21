import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { rowMolecule, sortRows, tableRows } from "./setTable";

/** A water, its oxygen at `x`, with `frames` more geometries - each its oxygen further along - and energies where given. */
function water(id: number, x: number, more = 0, energies?: number[], extra: Partial<Molecule3D> = {}): Molecule3D {
  const atoms = [
    { el: "O", x, y: 0, z: 0 },
    { el: "H", x: x + 0.76, y: 0.59, z: 0 },
    { el: "H", x: x - 0.76, y: 0.59, z: 0 },
  ];
  return {
    id,
    at: { x: 0, y: 0 },
    atoms,
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...(more ? { frames: Array.from({ length: more }, (_, k) => atoms.flatMap((a, i) => [a.x + (i === 0 ? (k + 1) / 10 : 0), a.y, a.z])) } : {}),
    ...(energies ? { energies } : {}),
    ...extra,
  };
}

describe("a set as a table", () => {
  it("is a row for each entry - each conformer of each compound - in the step's order, with its energy above its compound's lowest", () => {
    // (1 Eh = 627.5094740631 kcal/mol, CODATA 2018: 0.0015936014 Eh above is 1.000000 kcal/mol)
    const rows = tableRows([water(1, 0, 1, [-76, -76.0015936014], { made: { how: [], energies: "Field X" } }), water(2, 5, 0, [-80])], "conformers");
    expect(rows.map((r) => [r.compound, r.number, r.energy])).toEqual([
      ["a", 1, -76],
      ["a", 2, -76.0015936014],
      ["b", 1, -80],
    ]);
    expect(rows[0].above).toBeCloseTo(1.0, 6);
    expect(rows[1].above).toBe(0);
    expect(rows[2].above).toBe(0);
    // (each energy says what worked it out)
    expect(rows[0].from).toBe("Field X");
    expect(rows[2].from).toBe("");
  });

  it("in a set of molecules: no compound, no energy above another's - they are of different compounds", () => {
    const rows = tableRows([water(1, 0, 0, [-76]), water(2, 5, 0, [-75])], "molecules");
    expect(rows.map((r) => [r.compound, r.above])).toEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });

  it("sorts by any column, up or down, those with none last and ties in the set's order", () => {
    const rows = tableRows([water(1, 0, 2, [-76.001, -76.003, -76.002]), water(2, 5, 0)], "conformers");
    expect(sortRows(rows, "energy").map((r) => r.at)).toEqual([1, 2, 0, 3]);
    expect(sortRows(rows, "energy", true).map((r) => r.at)).toEqual([0, 2, 1, 3]);
    expect(sortRows(rows, "compound", true).map((r) => r.at)).toEqual([3, 0, 1, 2]);
  });

  it("puts an entry on the page as a molecule of its own: its frame's geometry and energy, no conformer set", () => {
    const m = water(1, 0, 2, [-76.001, -76.003, -76.002], { conformerSet: true, made: { how: [], energies: "Field X" } });
    const one = rowMolecule(tableRows([m], "conformers")[2]);
    expect(one.atoms[0].x).toBeCloseTo(0.2, 12);
    expect(one.atoms[1].x).toBeCloseTo(0.76, 12);
    expect(one.energies).toEqual([-76.002]);
    expect(one.frames).toBeUndefined();
    expect(one.conformerSet).toBeUndefined();
    expect(one.made?.energies).toBe("Field X");
  });

  it("takes of the calculation only what is of that frame: its own frame's values; what is of the end only with the last", () => {
    const calc = {
      readers: [],
      program: "P",
      results: [
        { id: "e", group: "Energies", label: "E", on: "frames" as const, values: [1, 2, 3] },
        { id: "d", group: "Properties", label: "Dipole", on: "molecule" as const, value: 1.8 },
      ],
    };
    const rows = tableRows([water(1, 0, 2, undefined, { calc })], "molecules");
    // (a file's frames: each an entry of its own)
    expect(rows).toHaveLength(3);
    const first = rowMolecule(rows[0]).calc!;
    expect(first.results).toEqual([{ ...calc.results[0], values: [1] }]);
    const last = rowMolecule(rows[2]).calc!;
    expect(last.results).toEqual([{ ...calc.results[0], values: [3] }, calc.results[1]]);
  });
});
