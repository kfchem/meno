import { describe, expect, it } from "vitest";
import type { Restraint } from "../../../../lib/entry";
import { OWN_NUMBERING, NUMBERING, restraintsTable, type RestraintRow } from "../../../../lib/steps/restraints";
import type { Wire, WorkflowSet, WorkflowStep } from "../store/types";
import type { SetEntry } from "./entries";
import type { Flow } from "./flow";
import { heldBy, heldRows, NONE_MADE_WHY, NOTHING_TO_HOLD, RENUMBERED_WHY } from "./heldRows";
import { RESTRAINTS_INPUT, ONE_EXIT, ONE_INPUT } from "./kinds";
import { restrainedSet, torsionsSet } from "./structureSteps";
import type { Table } from "../../../../lib/table";

// The restraints a step holds (workflow/heldRows): the rows of the tables wired into its Restraints input, each molecule taking those
// made for it by the ID a step wrote on it - the known answers for the rounds, and for a molecule numbered anew.

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
function page(steps: [number, WorkflowStep["kind"]][], sets: { id: number; by?: number; rows?: RestraintRow[]; table?: Table }[], wires: [number, number, string][]): Flow {
  return {
    steps: steps.map(([id, kind]) => ({ id, kind, x: 0, y: 0 })),
    sets: sets.map(
      (s): WorkflowSet => ({
        id: s.id,
        x0: 0,
        y0: 0,
        x1: 1,
        y1: 1,
        ...(s.by != null ? { made: { step: s.by, exit: ONE_EXIT, ...(s.rows || s.table ? { holds: "table" as const } : {}) } } : {}),
        ...(s.table ? { table: s.table } : s.rows ? { table: restraintsTable(s.rows) } : {}),
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

  it("lets a molecule its table's step found nothing to hold for go on holding nothing - never one its step refused, or never saw (the known answers)", () => {
    // (the table a real step made, wired into a minimisation)
    const wiredWith = (made: ReturnType<typeof restrainedSet>, ...more: Table[]) => {
      if (!made.ok || !made.tables?.[ONE_EXIT]) throw new Error("no table made");
      const tables = [made.tables[ONE_EXIT], ...more];
      return page([[10, "restraints"], [40, "minimise"]], tables.map((table, k) => ({ id: 11 + k, by: 10, table })), tables.map((_, k) => [11 + k, 40, RESTRAINTS_INPUT.id]));
    };
    const COORDINATION = { on: "start", factor: "0.9" };
    // (a) coordination asked, two molecules tagged, no coordination bond: the step found none to hold - both go on, holding nothing
    const a = restrainedSet([molecule("p1"), molecule("p2")], "molecules", COORDINATION);
    expect(a.ok && a.said).toContain("2 entries with none to hold");
    expect(heldRows(wiredWith(a), 40, [molecule("p1"), molecule("p2")], RDKIT, "RDKit")).toEqual({ each: [{ rows: [] }, { rows: [] }], said: [NOTHING_TO_HOLD] });
    expect(NOTHING_TO_HOLD).toBe("nothing to hold");
    // (b1) the same, the molecules with no ID: the step refused both - its table empty - and they are refused here too
    const b1 = restrainedSet([molecule(), molecule()], "molecules", COORDINATION);
    expect(b1.ok && b1.said).toContain("2 failed");
    expect(heldRows(wiredWith(b1), 40, [molecule(), molecule()], RDKIT, "RDKit")).toEqual({ each: [{ why: NONE_MADE_WHY }, { why: NONE_MADE_WHY }], said: [] });
    // (b2) a torsion typed to hold, two molecules sharing an ID: the step refused both - a restraint asked, none made - refused here
    const b2 = torsionsSet([molecule("p1"), molecule("p1")], null, "molecules", { on: "start", torsions: "typed", atoms: "1-2-3-4", target: "180", hold: "strength", strength: "50" });
    expect(b2.ok && b2.said).toContain("2 failed");
    expect(heldRows(wiredWith(b2), 40, [molecule("p1"), molecule("p1")], RDKIT, "RDKit")).toEqual({ each: [{ why: NONE_MADE_WHY }, { why: NONE_MADE_WHY }], said: [] });
    // (c) one refused by the step (no ID), one found to have none to hold: the one goes on, the refused one is refused
    const c = restrainedSet([molecule(), molecule("p2")], "molecules", COORDINATION);
    expect(heldRows(wiredWith(c), 40, [molecule(), molecule("p2")], RDKIT, "RDKit")).toEqual({ each: [{ why: NONE_MADE_WHY }, { rows: [] }], said: [NOTHING_TO_HOLD] });
    // (one the step never saw, among those it found none for: refused)
    expect(heldRows(wiredWith(a), 40, [molecule("p3")], RDKIT, "RDKit")).toEqual({ each: [{ why: NONE_MADE_WHY }], said: [] });
    // (a second table with rows for another molecule that says nothing of this one - its step never saw it: refused, that table named)
    expect(heldRows(wiredWith(a, restraintsTable([row(torsion(T1, 50), "p9")])), 40, [molecule("p1")], RDKIT, "RDKit")).toEqual({
      each: [{ why: `${NONE_MADE_WHY} by Restraints (table 2 of 2 wired in)` }],
      said: ["1 restraint row for no molecule here"],
    });
    // (the same, the second table naming it as found to have nothing too: rows for another molecule - it goes on, holding nothing)
    expect(heldRows(wiredWith(a, restraintsTable([row(torsion(T1, 50), "p9")], [{ for: "p1", on: "start", numbering: OWN_NUMBERING, why: "none found to hold" }])), 40, [molecule("p1")], RDKIT, "RDKit")).toEqual({
      each: [{ rows: [] }],
      said: [NOTHING_TO_HOLD, "1 restraint row for no molecule here"],
    });
    // (numbered anew by Atom map since its step found nothing for it: refused, as a row would be)
    expect(heldRows(wiredWith(a), 40, [molecule("p1", "as reactant #1 (k2)"), molecule("p2")], RDKIT, "RDKit")).toEqual({ each: [{ why: RENUMBERED_WHY }, { rows: [] }], said: [NOTHING_TO_HOLD] });
    // (numbered anew by Atom map before its step looked, and found to have nothing to hold: the step wrote that numbering - it goes on)
    const mapped = restrainedSet([molecule("p1", "as reactant #1 (k2)")], "molecules", COORDINATION);
    expect(heldRows(wiredWith(mapped), 40, [molecule("p1", "as reactant #1 (k2)")], RDKIT, "RDKit")).toEqual({ each: [{ rows: [] }], said: [NOTHING_TO_HOLD] });
  });

  it("lets a molecule found to have nothing to hold go on where its table holds rows for another - one its step refused or never saw refused (the maintainer, 2026-11-13)", () => {
    const nothingFor = (id: string) => ({ for: id, on: "start", numbering: OWN_NUMBERING, why: "none found to hold" });
    const one = (table: Table) => page([[10, "restraints"], [40, "minimise"]], [{ id: 11, by: 10, table }], [[11, 40, RESTRAINTS_INPUT.id]]);
    // (molecule A with a row, molecule B looked at and found to have none: A holds its row, B goes on holding nothing, counted)
    const ab = one(restraintsTable([row(torsion(T1, 50), "pA")], [nothingFor("pB")]));
    expect(heldRows(ab, 40, [molecule("pA"), molecule("pB")], RDKIT, "RDKit")).toEqual({ each: [{ rows: [torsion(T1, 50)] }, { rows: [] }], said: ["1 entry with nothing to hold"] });
    // (one the table neither has a row for nor names - its step refused it, or never saw it - and one with no ID: refused, as ever)
    expect(heldRows(ab, 40, [molecule("pA"), molecule("pC"), molecule()], RDKIT, "RDKit")).toEqual({ each: [{ rows: [torsion(T1, 50)] }, { why: NONE_MADE_WHY }, { why: NONE_MADE_WHY }], said: [] });
    // (two found to have nothing, beside A: counted as two)
    const abd = one(restraintsTable([row(torsion(T1, 50), "pA")], [nothingFor("pB"), nothingFor("pD")]));
    expect(heldRows(abd, 40, [molecule("pB"), molecule("pA"), molecule("pD")], RDKIT, "RDKit")).toEqual({
      each: [{ rows: [] }, { rows: [torsion(T1, 50)] }, { rows: [] }],
      said: ["2 entries with nothing to hold"],
    });
    // (only B came in: none held any, said as such; A's row for no molecule here, counted)
    expect(heldRows(ab, 40, [molecule("pB")], RDKIT, "RDKit")).toEqual({ each: [{ rows: [] }], said: [NOTHING_TO_HOLD, "1 restraint row for no molecule here"] });
  });

  it("takes a molecule on only where every table wired in speaks of it - a row, or nothing found to hold - saying which did not (the known answers)", () => {
    const tables = (steps: [number, WorkflowStep["kind"]][], made: Table[]) =>
      page([...steps, [40, "minimise"]], made.map((table, k) => ({ id: 11 + k, by: steps[k][0], table })), made.map((_, k) => [11 + k, 40, RESTRAINTS_INPUT.id]));
    const tableOf = (o: ReturnType<typeof restrainedSet>) => {
      if (!o.ok || !o.tables?.[ONE_EXIT]) throw new Error("no table made");
      return o.tables[ONE_EXIT];
    };
    const COORDINATION = { on: "start", factor: "0.9" };
    const SHARED = { on: "start", torsions: "typed", atoms: "1-2-3-4", target: "180", hold: "strength", strength: "50" };
    // (e) coordination finds none for both; a typed torsion's step refuses both (an ID shared): both refused, the torsions' named
    const none = tableOf(restrainedSet([molecule("p1"), molecule("p2")], "molecules", COORDINATION));
    const refused = tableOf(torsionsSet([molecule("p1"), molecule("p1"), molecule("p2"), molecule("p2")], null, "molecules", SHARED));
    const e = tables([[10, "restraints"], [20, "torsion-restraints"]], [none, refused]);
    expect(heldRows(e, 40, [molecule("p1"), molecule("p2")], RDKIT, "RDKit")).toEqual({
      each: [{ why: `${NONE_MADE_WHY} by Torsion restraints` }, { why: `${NONE_MADE_WHY} by Torsion restraints` }],
      said: [],
    });
    // (e2) a molecule one of the tables' steps never saw: refused, that table named
    const onlyP1 = tableOf(restrainedSet([molecule("p1")], "molecules", COORDINATION));
    const e2 = tables([[10, "restraints"], [20, "restraints"]], [none, onlyP1]);
    expect(heldRows(e2, 40, [molecule("p1"), molecule("p2")], RDKIT, "RDKit")).toEqual({
      each: [{ rows: [] }, { why: `${NONE_MADE_WHY} by Restraints (table 2 of 2 wired in)` }],
      said: [NOTHING_TO_HOLD],
    });
    // (a row for it in one table, the other table's step refusing it: never taken on holding the one table's row alone)
    const held = restraintsTable([row(torsion(T1, 50), "p1")]);
    const mixed = tables([[10, "restraints"], [20, "torsion-restraints"]], [held, refused]);
    expect(heldRows(mixed, 40, [molecule("p1")], RDKIT, "RDKit")).toEqual({ each: [{ why: `${NONE_MADE_WHY} by Torsion restraints` }], said: [] });
    // (round 2's step seeing every molecule round 1's minimisation gave: a row in one, nothing found in the other - held, round 1's row)
    const round2 = restraintsTable([], [{ for: "p1", on: "start", numbering: OWN_NUMBERING, why: "none found to hold" }]);
    const rounds2 = tables([[10, "restraints"], [30, "restraints"]], [held, round2]);
    expect(heldRows(rounds2, 40, [molecule("p1")], RDKIT, "RDKit")).toEqual({ each: [{ rows: [torsion(T1, 50)] }], said: [] });
  });

  it("refuses a molecule whose double bond its reference has cis, held at 180° where trans: something to hold found, not nothing ((d))", () => {
    // (C-N=N-C, the torsion at `phi`)
    const azo = (phi: number, start: string): SetEntry => {
      const r = (phi * Math.PI) / 180;
      return {
        ...molecule(start),
        atoms: ["C", "N", "N", "C"].map((el) => ({ el })),
        bonds: [
          { a1: 0, a2: 1, order: 1 },
          { a1: 1, a2: 2, order: 2 },
          { a1: 2, a2: 3, order: 1 },
        ],
        xyz: [-0.7, 1.2, 0, 0, 0, 0, 1.25, 0, 0, 1.95, 1.2 * Math.cos(r), 1.2 * Math.sin(r)],
      } as unknown as SetEntry;
    };
    const FROM = { on: "start", torsions: "reference", at: "trans", strength: "50" };
    const d = torsionsSet([azo(180, "p1")], [azo(0, "r")], "molecules", FROM);
    if (!d.ok || !d.tables?.[ONE_EXIT]) throw new Error("no table made");
    expect(d.said).not.toContain("with none to hold");
    const wired = page([[20, "torsion-restraints"], [40, "minimise"]], [{ id: 11, by: 20, table: d.tables[ONE_EXIT] }], [[11, 40, RESTRAINTS_INPUT.id]]);
    expect(heldRows(wired, 40, [azo(180, "p1")], RDKIT, "RDKit")).toEqual({ each: [{ why: NONE_MADE_WHY }], said: [] });
    // (d0) the same, nothing unlike its reference: nothing to hold - it goes on
    const d0 = torsionsSet([azo(180, "p1")], [azo(180, "r")], "molecules", FROM);
    if (!d0.ok || !d0.tables?.[ONE_EXIT]) throw new Error("no table made");
    expect(d0.said).toContain("1 entry with none to hold");
    const wired0 = page([[20, "torsion-restraints"], [40, "minimise"]], [{ id: 11, by: 20, table: d0.tables[ONE_EXIT] }], [[11, 40, RESTRAINTS_INPUT.id]]);
    expect(heldRows(wired0, 40, [azo(180, "p1")], RDKIT, "RDKit")).toEqual({ each: [{ rows: [] }], said: [NOTHING_TO_HOLD] });
  });

  it("refuses every molecule where the tables wired in hold no row and name none as found to hold nothing - a table read from a file, say", () => {
    const empty = page([[10, "restraints"], [40, "minimise"]], [{ id: 11, by: 10, rows: [] }], [[11, 40, RESTRAINTS_INPUT.id]]);
    expect(heldRows(empty, 40, [molecule("p1"), molecule()], RDKIT, "RDKit")).toEqual({ each: [{ why: NONE_MADE_WHY }, { why: NONE_MADE_WHY }], said: [] });
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
