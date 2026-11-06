import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { CORE_MOST_STEPS } from "../../../../lib/layout/morph";
import {
  ALIGN_MOST_STEPS,
  alignSteps,
  alignedRecords,
  addedStacks,
  carriedDrawing,
  freshStackId,
  gridPlaces,
  hiddenInStacks,
  middleOf,
  openedAsStack,
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
import { measured } from "../../../../testing/timeouts";

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

describe("a file's molecules in 3D, opened", () => {
  // (the maintainer, 2026-10-13: a file of several jobs opens as one molecule for each, side by side)
  it("stand as a stack - an SD file's records - but side by side where they are an output's jobs", () => {
    expect(openedAsStack([{}, {}])).toBe(true);
    expect(openedAsStack([{}])).toBe(false);
    const job = (number: number) => ({ calc: { readers: ["cclib"], job: { number, of: 2 } } });
    expect(openedAsStack([job(1), job(2)])).toBe(false);
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

  it("is taken apart record by record, each atom and bond looked at a few times, not once for every record", () => {
    // (two stacks of 50 records of 28 atoms in a chain, the second stack's
    // atoms first, and a loose chain of 28 after them)
    const atoms: (A & { stack?: AtomStack })[] = [];
    const bonds: { id: number; a: number; b: number }[] = [];
    const chain = (stack?: AtomStack) => {
      const first = atoms.length + 1;
      for (let i = 0; i < 28; i++) {
        atoms.push({ id: first + i, x: i, y: 0, ...(stack ? { stack } : {}) });
        if (i) bonds.push({ id: first + i, a: first + i - 1, b: first + i });
      }
    };
    for (let r = 0; r < 50; r++) chain({ id: 2, record: r, ...(r === 0 ? { title: "second" } : {}) });
    for (let r = 0; r < 50; r++) chain({ id: 1, record: r });
    chain();
    const seenAtoms = counted(atoms);
    const seenBonds = counted(bonds);
    const parts = recordDrawings({ atoms: seenAtoms.list, bonds: seenBonds.list });
    expect(idsOf(parts.loose.atoms)).toEqual(idsOf(atoms.slice(-28)));
    expect(parts.loose.bonds).toHaveLength(27);
    // (stack 1 first, its records in order; each a chain of its own)
    expect(parts.stacked).toHaveLength(100);
    expect(parts.stacked[0].model.atoms[0].id).toBe(50 * 28 + 1);
    expect(parts.stacked[50].model.atoms[0].id).toBe(1);
    expect(parts.stacked[50].title).toBe("second");
    expect(parts.stacked.every((r) => r.model.atoms.length === 28 && r.model.bonds.length === 27)).toBe(true);
    // (where every atom and bond was looked through for every record, half
    // a million reads here - 1.5 s for a thousand records)
    expect(seenAtoms.reads() + seenBonds.reads()).toBeLessThan(20 * (atoms.length + bonds.length));
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

describe("a stack of more records than a call takes as its arguments", () => {
  // (65,536 in WebKit, about twice that here: a stack of that many records threw as it was shown or laid out as a grid)
  const n = 150_000;
  const atoms = Array.from({ length: n }, (_, k) => ({ id: k + 1, x: 0, y: 0, el: "C", stack: { id: 1, record: n - k } }));

  it("shows its first record, lays its records out as a grid, and places molecules in 3D in one", () => {
    expect(shownModel({ atoms, bonds: [] }, {}).atoms.map((a) => a.id)).toEqual([n]);
    expect(recordsGrid({ atoms }, 1).size).toBe(n);
    expect(gridPlaces({ x: 0, y: 0 }, Array.from({ length: n }, () => 1))).toHaveLength(n);
  }, measured(300));
});

/** `xs` read through a count of the times one of them is read by its place - how much of a list a function looks at. */
function counted<T>(xs: T[]): { list: T[]; reads: () => number } {
  let n = 0;
  const list = new Proxy(xs, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) n++;
      return Reflect.get(target, key, receiver);
    },
  });
  return { list, reads: () => n };
}

describe("a stack of drawings, lined up as it is opened", () => {
  /** Ethanol, C-C-O, as record `record` drawn turned by `turn` degrees about (0, 0), mirrored first where `mirror`; its atoms' ids from `first`. */
  const ethanol = (first: number, record: number, turn: number, mirror = false, wedge = false) => {
    const t = (turn * Math.PI) / 180;
    const at = (x: number, y: number) => {
      const u = mirror ? -x : x;
      return { x: Math.cos(t) * u - Math.sin(t) * y, y: Math.sin(t) * u + Math.cos(t) * y };
    };
    const places = [at(-0.87, -0.25), at(0, 0.25), at(0.87, -0.25)];
    return {
      atoms: ["C", "C", "O"].map((el, i) => ({ id: first + i, el, ...places[i], stack: { id: 1, record } })),
      bonds: [
        { a: first, b: first + 1, order: 1 as const, ...(wedge ? { stereo: "up" as const } : {}) },
        { a: first + 1, b: first + 2, order: 1 as const },
      ],
    };
  };
  const stacked = (...rs: ReturnType<typeof ethanol>[]) => ({ atoms: rs.flatMap((r) => r.atoms), bonds: rs.flatMap((r) => r.bonds) });
  const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;

  it("turns each record that is the structure before it to lie on that one - mirrored too, where it has no wedge", () => {
    const m = stacked(ethanol(1, 0, 0), ethanol(10, 1, 90), ethanol(20, 2, 30, true));
    const out = alignedRecords(m, [{ atoms: [1, 2, 3] }, { atoms: [10, 11, 12] }, { atoms: [20, 21, 22] }]);
    const at = (id: number) => out.atoms.find((a) => a.id === id)!;
    [10, 20].forEach((first) => [0, 1, 2].forEach((i) => expect(near(at(first + i), at(1 + i))).toBe(true)));
  });

  it("shares its steps out among its records: a long stack's records each given fewer, never more than one search takes, the whole within its most", () => {
    expect(alignSteps(2)).toBe(CORE_MOST_STEPS);
    let before = Infinity;
    for (const n of [2, 3, 5, 11, 101, 1001, 10001]) {
      const each = alignSteps(n);
      expect(each, `${n}`).toBeLessThanOrEqual(before);
      expect(each * (n - 1), `${n}`).toBeLessThanOrEqual(ALIGN_MOST_STEPS);
      before = each;
    }
    expect(alignSteps(1001)).toBe(Math.floor(ALIGN_MOST_STEPS / 1000));
  });

  it("only turns one with a wedge - a mirror would change what it says - and leaves one sharing nothing, and those after it, as the file has them", () => {
    const wedged = stacked(ethanol(1, 0, 0), ethanol(10, 1, 30, true, true));
    const out = alignedRecords(wedged, [{ atoms: [1, 2, 3] }, { atoms: [10, 11, 12] }]);
    const at = (id: number) => out.atoms.find((a) => a.id === id)!;
    expect([0, 1, 2].every((i) => near(at(10 + i), at(1 + i)))).toBe(false);
    // (turned only: each bond as long, the mirrored record not mirrored back)
    expect(Math.hypot(at(10).x - at(11).x, at(10).y - at(11).y)).toBeCloseTo(1, 1);
    // (sharing nothing - no core at all - kept as it is)
    const other = { ...ethanol(10, 1, 90), atoms: ethanol(10, 1, 90).atoms.map((a) => ({ ...a, el: "N" })) };
    const m = stacked(ethanol(1, 0, 0), other);
    expect(alignedRecords(m, [{ atoms: [1, 2, 3] }, { atoms: [10, 11, 12] }])).toBe(m);
  });

  it("turns an analogue - ethylamine after ethanol - onto it by the core they share, the rest of it moved with it", () => {
    const amine = { ...ethanol(10, 1, 90), atoms: ethanol(10, 1, 90).atoms.map((a) => (a.id === 12 ? { ...a, el: "N" } : a)) };
    const out = alignedRecords(stacked(ethanol(1, 0, 0), amine), [{ atoms: [1, 2, 3] }, { atoms: [10, 11, 12] }]);
    const at = (id: number) => out.atoms.find((a) => a.id === id)!;
    expect(near(at(10), at(1)) && near(at(11), at(2)) && near(at(12), at(3))).toBe(true);
  });

  it("only turns one with any mark a mirror would change - a bold or dashed line, a double bond to one side, a mark put by hand", () => {
    // (each record mirrored in the file: lined up by a mirror it would lie exactly on the first; turned only, it cannot)
    const marks: [string, (r: ReturnType<typeof ethanol>) => ReturnType<typeof ethanol>][] = [
      ["bold", (r) => ({ ...r, bonds: r.bonds.map((b, i) => (i === 0 ? { ...b, display: "bold" as const } : b)) })],
      ["dashed", (r) => ({ ...r, bonds: r.bonds.map((b, i) => (i === 0 ? { ...b, display: "dashed" as const } : b)) })],
      ["double to one side", (r) => ({ ...r, bonds: r.bonds.map((b, i) => (i === 0 ? { ...b, doubleMode: "left" as const } : b)) })],
      ["mark on a bond", (r) => ({ ...r, bonds: r.bonds.map((b, i) => (i === 0 ? { ...b, stereoAt: { x: 0, y: 0 } } : b)) })],
      ["mark on an atom", (r) => ({ ...r, atoms: r.atoms.map((a, i) => (i === 1 ? { ...a, stereoAt: { x: 0, y: 0 } } : a)) })],
    ];
    for (const [what, mark] of marks) {
      const first = mark(ethanol(1, 0, 0));
      const out = alignedRecords(stacked(first, mark(ethanol(10, 1, 30, true))), [{ atoms: [1, 2, 3] }, { atoms: [10, 11, 12] }]);
      const at = (id: number) => out.atoms.find((a) => a.id === id)!;
      expect([0, 1, 2].every((i) => near(at(10 + i), at(1 + i))), what).toBe(false);
      // (turned, not reshaped: each bond as long as it was)
      expect(Math.hypot(at(10).x - at(11).x, at(10).y - at(11).y), what).toBeCloseTo(1, 1);
    }
  });
});
