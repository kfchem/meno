import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import {
  addedStacks,
  carriedDrawing,
  freshStackId,
  gridPlaces,
  hiddenInStacks,
  middleOf,
  placeInStack,
  placeOfRecord,
  recordDrawings,
  recordsGathered,
  recordsGrid,
  recordsShownOf,
  seenDrawing,
  seenOnly,
  settledRecords,
  shownModel,
  shownOf,
  stackedRecords,
  stackMembers,
} from "./stacks";
import type { AtomStack } from "../store/types";

// (two stacks - one of three, one laid out as a grid - and a molecule of its own)
const molecules = [
  { id: 1, stack: { id: 1 } },
  { id: 2, stack: { id: 1 } },
  { id: 3, stack: { id: 1 } },
  { id: 4 },
  { id: 5, stack: { id: 2, spread: true as const } },
  { id: 6, stack: { id: 2, spread: true as const } },
];

describe("a stack of molecules in 3D", () => {
  it("is its molecules in the order its file gave them, showing its first until another is shown", () => {
    expect(stackMembers(molecules, 1).map((m) => m.id)).toEqual([1, 2, 3]);
    expect(shownOf(molecules, 1, {})).toBe(1);
    expect(shownOf(molecules, 1, { 1: 3 })).toBe(3);
    // (one it no longer has: its first again)
    expect(shownOf(molecules, 1, { 1: 9 })).toBe(1);
    expect(shownOf(molecules, 7, {})).toBeNull();
  });

  it("keeps out of sight all but the one it shows - none of a stack laid out as a grid, nor a molecule of its own", () => {
    expect([...hiddenInStacks(molecules, {})]).toEqual([2, 3]);
    expect([...hiddenInStacks(molecules, { 1: 2 })]).toEqual([1, 3]);
  });

  it("says where one stands in it and how many it holds - none of a grid's, a lone molecule's or a stack of one", () => {
    expect(placeInStack(molecules, molecules[1])).toEqual({ index: 1, count: 3, members: [1, 2, 3] });
    expect(placeInStack(molecules, molecules[3])).toBeNull();
    expect(placeInStack(molecules, molecules[4])).toBeNull();
    expect(placeInStack([{ id: 1, stack: { id: 1 } }], { id: 1, stack: { id: 1 } })).toBeNull();
  });

  it("is numbered after the document's own stacks", () => {
    expect(freshStackId(molecules)).toBe(3);
    expect(freshStackId([{ id: 1 }])).toBe(1);
  });
});

describe("a stack laid out as a grid", () => {
  it("stands in rows about as many as its columns, left to right and downwards, about where it stood", () => {
    // (five molecules each reaching 2: cells 2 * 2 + a bond's room wide, three columns, two rows)
    const places = gridPlaces({ x: 0, y: 0 }, [2, 2, 2, 2, 2]);
    const cell = 4 + NOMINAL_BOND_LENGTH;
    expect(places[0]).toEqual({ x: -cell, y: cell / 2 });
    expect(places[2]).toEqual({ x: cell, y: cell / 2 });
    expect(places[3]).toEqual({ x: -cell, y: -cell / 2 });
    expect(gridPlaces({ x: 0, y: 0 }, [])).toEqual([]);
  });

  it("stacks again in its middle - where it stood as it was laid out, its last row short or not", () => {
    expect(middleOf([{ x: 0, y: 0 }, { x: 4, y: 2 }])).toEqual({ x: 2, y: 1 });
    const at = { x: 3, y: -2 };
    const middle = middleOf(gridPlaces(at, [2, 2, 2, 2, 2]));
    expect(middle.x).toBeCloseTo(at.x, 9);
    expect(middle.y).toBeCloseTo(at.y, 9);
  });
});

describe("a stack in a picture", () => {
  it("shows the one it shows - its first where none says so - a grid's every one, and the rest as they are", () => {
    const carried = [
      { name: "a", stack: { id: 1 } },
      { name: "b", stack: { id: 1 }, shown: true as const },
      { name: "c" },
      { name: "d", stack: { id: 2 } },
      { name: "e", stack: { id: 2 } },
      { name: "f", stack: { id: 3, spread: true as const } },
      { name: "g", stack: { id: 3, spread: true as const } },
    ];
    expect(seenOnly(carried).map((m) => m.name)).toEqual(["b", "c", "d", "f", "g"]);
  });
});

// (a stack of drawings of three records, each a C-O, standing in one place - and a lone atom)
type A = { id: number; x: number; y: number; stack?: AtomStack };
const drawing = (): { atoms: A[]; bonds: { id: number; a: number; b: number }[] } => ({
  atoms: [
    ...[0, 1, 2].flatMap((k) => [
      { id: 2 * k + 1, x: 0, y: 0, stack: { id: 1, record: k } },
      { id: 2 * k + 2, x: 1.5, y: 0, stack: { id: 1, record: k } },
    ]),
    { id: 9, x: 20, y: 0 },
  ],
  bonds: [0, 1, 2].map((k) => ({ id: 100 + k, a: 2 * k + 1, b: 2 * k + 2 })),
});
const idsOf = (atoms: readonly { id: number }[]) => atoms.map((a) => a.id);

describe("a stack of drawings", () => {
  it("is a file's records each standing where the drawing's middle was, told their stack, record and title", () => {
    const flat: { atoms: A[]; bonds: [] } = { atoms: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 2, y: 0 }, { id: 3, x: 10, y: 4 }], bonds: [] };
    const stacked = stackedRecords(flat, [{ atoms: [1, 2], title: "a" }, { atoms: [3] }]);
    expect(stacked.atoms.map((a) => [a.x, a.y, a.stack])).toEqual([
      [4, 2, { id: 1, record: 0, title: "a" }],
      [6, 2, { id: 1, record: 0, title: "a" }],
      [5, 2, { id: 1, record: 1 }],
    ]);
    // (one record: no stack)
    expect(stackedRecords(flat, [{ atoms: [1, 2, 3] }])).toBe(flat);
  });

  it("is shown by its record shown - its first where none is said, or one it no longer has - and the rest as they are", () => {
    const d = drawing();
    expect(idsOf(shownModel(d, {}).atoms)).toEqual([1, 2, 9]);
    expect(shownModel(d, {}).bonds.map((b) => b.id)).toEqual([100]);
    expect(idsOf(shownModel(d, { 1: 2 }).atoms)).toEqual([5, 6, 9]);
    expect(idsOf(shownModel(d, { 1: 7 }).atoms)).toEqual([1, 2, 9]);
    // (the same asked again, the same; a drawing with nothing out of sight, itself)
    const shown = { 1: 1 };
    expect(shownModel(d, shown)).toBe(shownModel(d, shown));
    const lone = { atoms: [{ id: 1, x: 0, y: 0 }], bonds: [] };
    expect(shownModel(lone, {})).toBe(lone);
    // (laid out as a grid: every record)
    const spread = { ...d, atoms: d.atoms.map((a) => (a.stack ? { ...a, stack: { ...a.stack, spread: true as const } } : a)) };
    expect(shownModel(spread, {}).atoms).toHaveLength(7);
  });

  it("says where a record stands in it and how many it holds - none of a grid's or of a lone atom", () => {
    const d = drawing();
    d.atoms[2] = { ...d.atoms[2], stack: { id: 1, record: 1, title: "b" } };
    expect(placeOfRecord(d, d.atoms[2])).toEqual({ index: 1, count: 3, records: [0, 1, 2], title: "b" });
    expect(placeOfRecord(d, d.atoms[6])).toBeNull();
  });

  it("is carried whole, the record it shows marked - a picture showing that one, a file reading which it showed", () => {
    const d = drawing();
    const carried = carriedDrawing(d, { 1: 1 });
    expect(carried.atoms.filter((a) => a.stack?.shown).map((a) => a.id)).toEqual([3, 4]);
    expect(recordsShownOf(carried.atoms)).toEqual({ 1: 1 });
    expect(idsOf(seenDrawing(carried).atoms)).toEqual([3, 4, 9]);
    // (marked none: its first)
    expect(idsOf(seenDrawing(d).atoms)).toEqual([1, 2, 9]);
    const { loose, stacked } = recordDrawings(carried);
    expect(idsOf(loose.atoms)).toEqual([9]);
    expect(stacked.map((r) => idsOf(r.model.atoms))).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(stacked[0].model.bonds.map((b) => b.id)).toEqual([100]);
  });

  it("brought into a drawing, is numbered after its own, none marked; one record of it alone is no stack", () => {
    const d = carriedDrawing(drawing(), { 1: 1 });
    const added = addedStacks(d.atoms, 4);
    expect(added.every((a) => !a.stack || (a.stack.id === 4 && !a.stack.shown))).toBe(true);
    expect(addedStacks(d.atoms.slice(0, 2), 4).every((a) => !a.stack)).toBe(true);
  });

  it("keeps what is drawn onto a record with it, and records bonded together one record", () => {
    const d = drawing();
    const drawn = { atoms: [...d.atoms, { id: 10, x: 0, y: 2 }, { id: 11, x: 0, y: 4 }], bonds: [...d.bonds, { id: 110, a: 3, b: 10 }, { id: 111, a: 10, b: 11 }] };
    const settled = settledRecords(drawn, d);
    expect(settled.atoms.find((a) => a.id === 11)?.stack).toEqual({ id: 1, record: 1 });
    expect(settled.atoms.find((a) => a.id === 9)?.stack).toBeUndefined();
    const joined = settledRecords({ ...d, bonds: [...d.bonds, { id: 112, a: 2, b: 5 }] }, d);
    expect(joined.atoms.filter((a) => a.stack?.record === 0).map((a) => a.id)).toEqual([1, 2, 5, 6]);
    // (nothing of the kind: the drawing itself)
    expect(settledRecords(d, d)).toBe(d);
  });

  it("left with one record, is that record alone", () => {
    const d = drawing();
    const left = { atoms: d.atoms.filter((a) => (a.stack?.record ?? 0) === 2 || !a.stack), bonds: d.bonds.slice(2) };
    expect(settledRecords(left, d).atoms.every((a) => !a.stack)).toBe(true);
  });

  it("goes with the record it shows moved whole - not with one atom moved, nor with all of them moved alike", () => {
    const d = drawing();
    const moved = (ids: number[], dx: number) => ({ ...d, atoms: d.atoms.map((a) => (ids.includes(a.id) ? { ...a, x: a.x + dx } : a)) });
    expect(settledRecords(moved([1, 2], 3), d).atoms.slice(0, 6).map((a) => a.x)).toEqual([3, 4.5, 3, 4.5, 3, 4.5]);
    expect(settledRecords(moved([1], 3), d).atoms.slice(2, 6).map((a) => a.x)).toEqual([0, 1.5, 0, 1.5]);
    const all = moved([1, 2, 3, 4, 5, 6], 3);
    expect(settledRecords(all, d)).toBe(all);
  });

  it("is laid out as a grid round its records' middle, and stacked again there", () => {
    const d = drawing();
    const grid = recordsGrid(d, 1);
    const cell = 1.5 + 2 * NOMINAL_BOND_LENGTH;
    // (three records: two columns, two rows)
    expect(grid.get(0)!.dx).toBeCloseTo(-cell / 2, 9);
    expect(grid.get(1)!.dx).toBeCloseTo(cell / 2, 9);
    expect(grid.get(2)!.dx).toBeCloseTo(-cell / 2, 9);
    const spread = { ...d, atoms: d.atoms.map((a) => (a.stack ? { ...a, x: a.x + grid.get(a.stack.record)!.dx, y: a.y + grid.get(a.stack.record)!.dy } : a)) };
    const back = recordsGathered(spread, 1);
    for (const [record, m] of back) {
      expect(m.dx).toBeCloseTo(-grid.get(record)!.dx, 9);
      expect(m.dy).toBeCloseTo(-grid.get(record)!.dy, 9);
    }
  });
});
