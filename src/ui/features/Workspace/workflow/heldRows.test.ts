import { describe, expect, it } from "vitest";
import type { Restraint } from "../../../../lib/entry";
import { OWN_NUMBERING, NUMBERING, restraintsTable, type RestraintRow } from "../../../../lib/steps/restraints";
import type { Wire, WorkflowSet, WorkflowStep } from "../store/types";
import type { SetEntry } from "./entries";
import type { Flow } from "./flow";
import { heldBy, heldRows, NONE_MADE_WHY, RENUMBERED_WHY } from "./heldRows";
import { RESTRAINTS_INPUT, ONE_EXIT, ONE_INPUT } from "./kinds";

// The restraints a step holds (workflow/heldRows): the rows of the tables wired into its Restraints input, each molecule taking those
// made for it by the ID a step wrote on it - CHEM's known answers for the rounds, and for a molecule numbered anew.

/** A molecule of six carbons in a row, as a step's entry, its ID `start` as given, and its numbering where Atom map gave one. */
const molecule = (start?: string, numbering?: string, properties: SetEntry["properties"] = {}): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: Array.from({ length: 6 }, () => ({ el: "C" })),
    bonds: [],
    xyz: Array.from({ length: 18 }, (_, i) => i),
    properties: {
      ...(start ? { start: { value: start, unit: "none", status: "computed", label: true } } : {}),
      ...(numbering ? { [NUMBERING]: { value: numbering, unit: "none", status: "computed", label: true } } : {}),
      ...properties,
    },
  }) as unknown as SetEntry;

const torsion = (atoms: number[], strength: number): Restraint => ({ kind: "dihedral", atoms, value: 180, strength });
const row = (restraint: Restraint, forWhat = "p1", numbering = OWN_NUMBERING): RestraintRow => ({ restraint, why: "typed", for: forWhat, on: "start", numbering });
const T1: number[] = [0, 1, 2, 3];
const T2: number[] = [1, 2, 3, 4];

/** A page: steps by id and kind, sets each made by a step's first exit (a table, where given), and wires `[set, step, port]`. */
function page(steps: [number, WorkflowStep["kind"]][], sets: { id: number; by?: number; rows?: RestraintRow[] }[], wires: [number, number, string][]): Flow {
  return {
    steps: steps.map(([id, kind]) => ({ id, kind, x: 0, y: 0 })),
    sets: sets.map(
      (s): WorkflowSet => ({
        id: s.id,
        x0: 0,
        y0: 0,
        x1: 1,
        y1: 1,
        ...(s.by != null ? { made: { step: s.by, exit: ONE_EXIT, ...(s.rows ? { holds: "table" as const } : {}) } } : {}),
        ...(s.rows ? { table: restraintsTable(s.rows) } : {}),
      }),
    ),
    wires: wires.map(([set, step, port], k): Wire => ({ id: 100 + k, from: { set }, to: { step, port } })),
  } as unknown as Flow;
}

/**
 * Two rounds as case F draws them: round 1's restraints (step 10, its table set 11) held by a minimisation (step 20, giving set
 * 21); round 2's restraints (step 30, its table set 31) made of what that minimisation gave - so after it - and both tables wired
 * into round 2's minimisation (step 40).
 */
const rounds = (one: RestraintRow[], two: RestraintRow[]) =>
  page(
    [
      [10, "restraints"],
      [20, "minimise"],
      [30, "restraints"],
      [40, "minimise"],
    ],
    [{ id: 11, by: 10, rows: one }, { id: 21, by: 20 }, { id: 31, by: 30, rows: two }, { id: 5 }],
    [
      [5, 20, ONE_INPUT],
      [11, 20, RESTRAINTS_INPUT.id],
      [21, 30, ONE_INPUT],
      [21, 40, ONE_INPUT],
      [11, 40, RESTRAINTS_INPUT.id],
      [31, 40, RESTRAINTS_INPUT.id],
    ],
  );

const RDKIT = heldBy("minimise", undefined);

describe("the restraints a step holds, wired in", () => {
  it("are none where nothing is wired into its Restraints input", () => {
    expect(heldRows(page([[40, "minimise"]], [], []), 40, [molecule("p1")], RDKIT, "RDKit")).toBeNull();
  });

  it("hold every round's rows: round 1's {t1 50, t2 50} and round 2's {t2 100} give {t1 50, t2 100} - the later step's taken, and said", () => {
    const d = rounds([row(torsion(T1, 50)), row(torsion(T2, 50))], [row(torsion(T2, 100))]);
    const held = heldRows(d, 40, [molecule("p1")], RDKIT, "RDKit");
    expect(held).toEqual({ each: [{ rows: [torsion(T1, 50), torsion(T2, 100)] }], said: ["1 row taken over by a later step's"] });
    // (the same the other way round on the page: where a table lies decides nothing)
    const turned = { ...d, wires: [...d.wires!].reverse() };
    expect(heldRows(turned, 40, [molecule("p1")], RDKIT, "RDKit")).toEqual(held);
  });

  it("refuses a molecule two steps' rows hold unlike, neither step after the other - never decided by where they lie", () => {
    const d = page(
      [
        [10, "restraints"],
        [30, "restraints"],
        [40, "minimise"],
      ],
      [{ id: 11, by: 10, rows: [row(torsion(T2, 50))] }, { id: 31, by: 30, rows: [row(torsion(T2, 100))] }],
      [
        [11, 40, RESTRAINTS_INPUT.id],
        [31, 40, RESTRAINTS_INPUT.id],
      ],
    );
    expect(heldRows(d, 40, [molecule("p1")], RDKIT, "RDKit")).toEqual({
      each: [{ why: "Rows hold torsion 2-3-4-5 for it unlike each other, from steps neither of which comes after the other" }],
      said: [],
    });
    // (rows alike are one, wherever they come from)
    const alike = page(
      [
        [10, "restraints"],
        [30, "restraints"],
        [40, "minimise"],
      ],
      [{ id: 11, by: 10, rows: [row(torsion(T2, 50))] }, { id: 31, by: 30, rows: [row(torsion([4, 3, 2, 1], 50))] }],
      [
        [11, 40, RESTRAINTS_INPUT.id],
        [31, 40, RESTRAINTS_INPUT.id],
      ],
    );
    expect(heldRows(alike, 40, [molecule("p1")], RDKIT, "RDKit")).toEqual({ each: [{ rows: [torsion(T2, 50)] }], said: [] });
  });

  it("never takes a row held exactly and one held by a strength for the same: the later step's held and said, or refused in one table", () => {
    const exact: Restraint = { kind: "dihedral", atoms: T2, value: 180, exact: true };
    const held = heldRows(rounds([row(torsion(T2, 50))], [row(exact)]), 40, [molecule("p1")], heldBy("minimise", ["dihedral", "dihedral-exact"]), "RDKit");
    expect(held).toEqual({ each: [{ rows: [exact] }], said: ["1 row taken over by a later step's"] });
    const one = page([[10, "restraints"], [40, "minimise"]], [{ id: 11, by: 10, rows: [row(torsion(T2, 50)), row(exact)] }], [[11, 40, RESTRAINTS_INPUT.id]]);
    expect(heldRows(one, 40, [molecule("p1")], RDKIT, "RDKit")).toEqual({ each: [{ why: "Rows of one table hold torsion 2-3-4-5 for it unlike each other" }], said: [] });
  });

  it("refuses a molecule one table's rows hold unlike", () => {
    const d = page([[10, "restraints"], [40, "minimise"]], [{ id: 11, by: 10, rows: [row(torsion(T1, 50)), row(torsion(T1, 60))] }], [[11, 40, RESTRAINTS_INPUT.id]]);
    expect(heldRows(d, 40, [molecule("p1")], RDKIT, "RDKit")).toEqual({ each: [{ why: "Rows of one table hold torsion 1-2-3-4 for it unlike each other" }], said: [] });
  });

  it("refuses a molecule numbered anew by Atom map since its rows were made - never held on what are now other atoms", () => {
    // (a row for atoms 1-2 made on a product conformer in its own numbering; Atom map then numbered it onto the reactant)
    const d = page([[10, "restraints"], [40, "minimise"]], [{ id: 11, by: 10, rows: [row({ kind: "distance", atoms: [0, 1], value: 1.5, strength: 500 })] }], [[11, 40, RESTRAINTS_INPUT.id]]);
    expect(heldRows(d, 40, [molecule("p1", "as reactant #1 (k2)")], RDKIT, "RDKit")).toEqual({ each: [{ why: RENUMBERED_WHY }], said: [] });
    expect(RENUMBERED_WHY).toBe("its restraints were made before Atom map numbered it anew");
    // (made after it, in that numbering: held)
    const after = page([[10, "restraints"], [40, "minimise"]], [{ id: 11, by: 10, rows: [row({ kind: "distance", atoms: [0, 1], value: 1.5, strength: 500 }, "p1", "as reactant #1 (k2)")] }], [[11, 40, RESTRAINTS_INPUT.id]]);
    expect(heldRows(after, 40, [molecule("p1", "as reactant #1 (k2)")], RDKIT, "RDKit")).toMatchObject({ each: [{ rows: [{ kind: "distance" }] }] });
  });

  it("refuses a molecule no row is for, or one a row names an atom it has not; and counts rows for no molecule", () => {
    const d = page(
      [[10, "restraints"], [40, "minimise"]],
      [{ id: 11, by: 10, rows: [row(torsion(T1, 50), "p1"), row({ kind: "fixed", atoms: [6] }, "p2"), row(torsion(T1, 50), "p9"), row(torsion(T2, 50), "p9")] }],
      [[11, 40, RESTRAINTS_INPUT.id]],
    );
    expect(heldRows(d, 40, [molecule("p1"), molecule("p2"), molecule("p3"), molecule()], RDKIT, "RDKit")).toEqual({
      each: [{ rows: [torsion(T1, 50)] }, { why: "A row holds atoms fixed 7, and it has atoms 1 to 6" }, { why: NONE_MADE_WHY }, { why: NONE_MADE_WHY }],
      said: ["2 restraint rows for no molecule here"],
    });
    expect(NONE_MADE_WHY).toBe("no restraints made for it");
  });

  it("refuses a molecule that carries restraints of its own besides those wired in", () => {
    const d = page([[10, "restraints"], [40, "minimise"]], [{ id: 11, by: 10, rows: [row(torsion(T1, 50))] }], [[11, 40, RESTRAINTS_INPUT.id]]);
    const carries = molecule("p1", undefined, { restraints: { value: { restraints: [torsion(T2, 50)] }, unit: "none", status: "computed" } });
    expect(heldRows(d, 40, [carries], RDKIT, "RDKit")).toMatchObject({ each: [{ why: "It carries restraints of its own (Torsion restraints) as well as those wired in: hold one or the other" }] });
  });

  it("is refused where what comes in is no restraints table", () => {
    const d = page([[40, "minimise"]], [{ id: 11 }], [[11, 40, RESTRAINTS_INPUT.id]]);
    expect(heldRows(d, 40, [molecule("p1")], RDKIT, "RDKit")).toEqual({ why: "What comes into Restraints is no table of restraints yet" });
  });
});

describe("what each program holds, restrained or exact - never swapped", () => {
  const one = (r: Restraint) => page([[10, "restraints"], [40, "optimise"]], [{ id: 11, by: 10, rows: [row(r)] }], [[11, 40, RESTRAINTS_INPUT.id]]);
  const exactTorsion: Restraint = { kind: "dihedral", atoms: T1, value: 180, exact: true };
  const exactDistance: Restraint = { kind: "distance", atoms: [0, 1], value: 1.5, exact: true };
  const restrained: Restraint = { kind: "distance", atoms: [0, 1], value: 1.5, strength: 500 };
  const why = (d: Flow, holds: Parameters<typeof heldRows>[3], name: string) => {
    const h = heldRows(d, 40, [molecule("p1")], holds, name);
    if (!h || "why" in h) throw new Error("not read");
    const e = h.each[0];
    return "why" in e ? e.why : null;
  };

  it("a force field's minimisation (its plugin naming none) holds distances and torsions by their strengths and atoms fixed, and refuses an exact torsion", () => {
    expect(why(one(torsion(T1, 50)), RDKIT, "RDKit")).toBeNull();
    expect(why(one({ kind: "fixed", atoms: [0] }), RDKIT, "RDKit")).toBeNull();
    expect(why(one(exactTorsion), RDKIT, "RDKit")).toBe("The RDKit plugin holds a torsion only by a strength, not exactly: torsion 1-2-3-4 is to be held exactly");
  });

  it("a program holding atoms fixed alone refuses an exact distance, and one with a strength", () => {
    expect(why(one(exactDistance), ["fixed"], "xtb")).toBe("The xtb plugin holds no distances: distance 1-2");
    expect(why(one(restrained), ["fixed"], "xtb")).toBe("The xtb plugin holds no distances: distance 1-2");
    expect(why(one({ kind: "fixed", atoms: [0, 2] }), ["fixed"], "xtb")).toBeNull();
  });

  it("a program that constrains holds a row exactly, and refuses one with a strength", () => {
    const constrains = ["fixed", "distance-exact", "dihedral-exact"] as const;
    expect(why(one(exactDistance), constrains, "ORCA")).toBeNull();
    expect(why(one(exactTorsion), constrains, "ORCA")).toBeNull();
    expect(why(one(restrained), constrains, "ORCA")).toBe("The ORCA plugin holds a distance only exactly, not by a strength: distance 1-2 has a strength");
  });

  it("a kind that is no minimisation holds nothing its plugin does not name", () => {
    expect(heldBy("optimise", undefined)).toEqual([]);
    expect(why(one({ kind: "fixed", atoms: [0] }), heldBy("saddle-point", undefined), "Gaussian")).toBe("The Gaussian plugin holds no atoms fixed: atoms fixed 1");
  });
});
