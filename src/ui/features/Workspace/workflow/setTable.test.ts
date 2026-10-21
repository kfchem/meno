import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { chooseRows, chosenMolecules, rowMolecule, sortRows, tableRows } from "./setTable";

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

  it("puts an entry on the page as a molecule of its own: its frame's geometry and energy - of a conformer set, a part of one, with no shares", () => {
    const m = water(1, 0, 2, [-76.001, -76.003, -76.002], { conformerSet: true, made: { how: [], energies: "Field X" } });
    const one = rowMolecule(tableRows([m], "conformers")[2]);
    expect(one.atoms[0].x).toBeCloseTo(0.2, 12);
    expect(one.atoms[1].x).toBeCloseTo(0.76, 12);
    expect(one.energies).toEqual([-76.002]);
    expect(one.frames).toBeUndefined();
    expect([one.conformerSet, one.partOf, one.shares]).toEqual([true, true, undefined]);
    expect(one.made?.energies).toBe("Field X");
    // (of a molecule that is no conformer set, none)
    const plain = rowMolecule(tableRows([water(2, 0, 0, [-76])], "molecules")[0]);
    expect([plain.conformerSet, plain.partOf]).toEqual([undefined, undefined]);
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

  it("chooses rows as a list does: one; one added or taken with ⌘ or Ctrl; those between with Shift, as sorted", () => {
    const sorted = [3, 0, 2, 1, 4].map((at) => ({ at }));
    let c = chooseRows(sorted, new Set(), null, 0);
    expect([[...c.chosen], c.anchor]).toEqual([[0], 0]);
    c = chooseRows(sorted, c.chosen, c.anchor, 1, { range: true });
    expect([...c.chosen].sort()).toEqual([0, 1, 2]);
    expect(c.anchor).toBe(0);
    c = chooseRows(sorted, c.chosen, c.anchor, 2, { add: true });
    expect([...c.chosen].sort()).toEqual([0, 1]);
    // (from the one clicked last, 2, to 4 as sorted - 2, 1, 4 - added to those chosen)
    c = chooseRows(sorted, c.chosen, c.anchor, 4, { add: true, range: true });
    expect([...c.chosen].sort()).toEqual([0, 1, 2, 4]);
    // (Shift with none clicked before: it alone)
    expect([...chooseRows(sorted, new Set(), null, 4, { range: true }).chosen]).toEqual([4]);
  });

  it("puts those chosen on the page in the set's order, however it is sorted - a compound's conformers together, one compound still", () => {
    const a = water(1, 0, 3, [-76.001, -76.003, -76.002, -76.004], { conformerSet: true, numbers: [2, 5, 7, 9], degeneracies: [1, 2, 1, 3], shares: [0.1, 0.4, 0.2, 0.3] });
    const b = water(2, 5, 1, [-80.1, -80.2], { conformerSet: true });
    const rows = tableRows([a, b], "conformers");
    const ms = chosenMolecules(sortRows(rows, "energy"), new Set([0, 2, 3, 5]));
    // (two compounds, as they were: a's frames 1 and 3 and 4 - its 2, 7 and 9 - and b's second)
    expect(ms).toHaveLength(2);
    expect(ms[0].energies).toEqual([-76.001, -76.002, -76.004]);
    expect(ms[0].numbers).toEqual([2, 7, 9]);
    expect(ms[0].degeneracies).toEqual([1, 1, 3]);
    expect(ms[0].atoms[0].x).toBeCloseTo(0, 12);
    expect(ms[0].frames!.map((f) => f[0])).toEqual([0.2, 0.3]);
    // (a conformer set still, but a part of one: its shares, of all four, not kept, nor worked out of these three)
    expect([ms[0].conformerSet, ms[0].partOf, ms[0].shares]).toEqual([true, true, undefined]);
    expect([ms[1].energies, ms[1].numbers, ms[1].frames, ms[1].partOf]).toEqual([[-80.2], [2], undefined, true]);
    // (all of a compound's conformers chosen: the whole set, its shares with it)
    const whole = chosenMolecules(rows, new Set([0, 1, 2, 3]))[0];
    expect([whole.conformerSet, whole.partOf, whole.shares]).toEqual([true, undefined, [0.1, 0.4, 0.2, 0.3]]);
    // (and a part of a part, a part still - its table saying no energy above a lowest it may not hold)
    const part = { ...water(3, 0, 1, [-76.2, -76.1]), ...ms[0], id: 3, at: { x: 0, y: 0 } };
    expect(chosenMolecules(tableRows([part], "conformers"), new Set([0, 1, 2]))[0].partOf).toBe(true);
    expect(tableRows([part], "conformers").map((r) => r.above)).toEqual([undefined, undefined, undefined]);
  });
});
