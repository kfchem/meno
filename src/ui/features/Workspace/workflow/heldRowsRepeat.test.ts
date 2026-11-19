/**
 * Rows held over a Repeat's passes (workflow/heldRows; docs/WORKFLOWS.md, *Repeat*): an entry inside a Repeat holds the rows of every pass up
 * its own lineage - those it was held with before, carried on with it (workflow/programs `firstHeld`) - and this pass's, the later pass
 * winning a torsion held in both; rows carried in another numbering are refused, never held on other atoms.
 */
import { describe, expect, it } from "vitest";
import type { Property, Restraint } from "../../../../lib/entry";
import { NUMBERING, OWN_NUMBERING, restraintsTable, type RestraintRow } from "../../../../lib/steps/restraints";
import type { Wire, WorkflowSet, WorkflowStep } from "../store/types";
import type { SetEntry } from "./entries";
import type { Flow } from "./flow";
import { heldBy, heldRows, RENUMBERED_WHY } from "./heldRows";
import { ONE_EXIT, RESTRAINTS_INPUT } from "./kinds";

const T1 = [0, 1, 2, 3];
const T2 = [1, 2, 3, 4];
const torsion = (atoms: number[], strength: number): Restraint => ({ kind: "dihedral", atoms, value: 180, strength });
const row = (restraint: Restraint, numbering = OWN_NUMBERING): RestraintRow => ({ restraint, why: "typed", for: "p1", on: "start", numbering });
const RDKIT = heldBy("minimise", undefined);

/** An entry with its ID p1, and the rows it was held with in earlier passes where given, in `numbering` (its own as it now is, unless said). */
function entry(carried?: Restraint[], carriedIn?: string, nowIn?: string): SetEntry {
  const props: Record<string, Property> = { start: { value: "p1", unit: "none", status: "computed", label: true } };
  if (nowIn) props[NUMBERING] = { value: nowIn, unit: "none", status: "computed", label: true };
  if (carried) props.restraints = { value: { restraints: carried, start: [], ...(carriedIn ? { numbering: carriedIn } : {}) }, unit: "none", status: "computed" };
  return { compound: 0, number: 1, atoms: Array.from({ length: 6 }, () => ({ el: "C" })), bonds: [], xyz: Array.from({ length: 18 }, (_, i) => i), properties: props } as unknown as SetEntry;
}

/** This pass's Torsion restraints (step 30, its table set 31) wired into a minimisation (step 20) - both inside a Repeat (1) where `inside`. */
function page(rows: RestraintRow[], inside = true): Flow {
  const steps: Partial<WorkflowStep>[] = [
    { id: 1, kind: "repeat", x: 0, y: 0, frame: { w: 1000, h: 1000 }, ...(inside ? { holds: [20, 30] } : {}) },
    { id: 20, kind: "minimise", x: 0, y: 0 },
    { id: 30, kind: "torsion-restraints", x: 0, y: 0 },
  ];
  const sets: Partial<WorkflowSet>[] = [{ id: 31, x0: 0, y0: 0, x1: 1, y1: 1, made: { step: 30, exit: ONE_EXIT, holds: "table" }, table: restraintsTable(rows) }];
  const wires: Wire[] = [{ id: 100, from: { set: 31 }, to: { step: 20, port: RESTRAINTS_INPUT.id } }];
  return { steps, sets, wires } as unknown as Flow;
}

const rowsOf = (r: ReturnType<typeof heldRows>) => {
  if (!r || "why" in r) throw new Error("not held");
  return r.each.map((x) => ("rows" in x ? x.rows.map((y) => [y.atoms.join("-"), y.strength]) : x.why));
};

describe("rows held over a Repeat's passes", () => {
  it("holds an entry's pass-1 rows at From and its pass-2 rows at From + Step; a torsion held in both at its pass-2 value", () => {
    // (pass 1 held T1 at 50; pass 2's table holds T2 at 100, and T1 again at 100)
    const carried = [torsion(T1, 50)];
    expect(rowsOf(heldRows(page([row(torsion(T2, 100))]), 20, [entry(carried)], RDKIT, "RDKit"))).toEqual([
      [
        ["0-1-2-3", 50],
        ["1-2-3-4", 100],
      ],
    ]);
    expect(rowsOf(heldRows(page([row(torsion(T1, 100)), row(torsion(T2, 100))]), 20, [entry(carried)], RDKIT, "RDKit"))).toEqual([
      [
        ["0-1-2-3", 100],
        ["1-2-3-4", 100],
      ],
    ]);
  });

  it("holds a torsion held in pass 1 and found like the reference in pass 2 again at its pass-1 value - it is never released", () => {
    expect(rowsOf(heldRows(page([row(torsion(T2, 100))]), 20, [entry([torsion(T1, 50)])], RDKIT, "RDKit"))[0]).toContainEqual(["0-1-2-3", 50]);
  });

  it("holds an entry's carried rows where this pass's table has none for it", () => {
    const table = page([]);
    // (the table speaks of no molecule: one with carried rows holds those)
    const r = heldRows({ ...table, sets: table.sets!.map((s) => ({ ...s, table: restraintsTable([], [{ for: "p1", on: "start", numbering: OWN_NUMBERING, why: "nothing" } as never]) })) }, 20, [entry([torsion(T1, 50)])], RDKIT, "RDKit");
    expect(rowsOf(r)).toEqual([[["0-1-2-3", 50]]]);
  });

  it("holds for each entry its own carried rows, never another's of the same ID: lineage, not the ID alone", () => {
    // (two entries both p1 - one gone round twice, held at T1 50 then 100; one once, at T1 50 - this pass's table holds T2 at 150 for p1)
    const twice = entry([torsion(T1, 100)]);
    const once = entry([torsion(T1, 50)]);
    expect(rowsOf(heldRows(page([row(torsion(T2, 150))]), 20, [twice, once], RDKIT, "RDKit"))).toEqual([
      [
        ["0-1-2-3", 100],
        ["1-2-3-4", 150],
      ],
      [
        ["0-1-2-3", 50],
        ["1-2-3-4", 150],
      ],
    ]);
  });

  it("refuses rows carried in another numbering: an Atom map inside the frame numbered it anew - never held on other atoms", () => {
    expect(rowsOf(heldRows(page([row(torsion(T2, 100), "map-2")]), 20, [entry([torsion(T1, 50)], OWN_NUMBERING, "map-2")], RDKIT, "RDKit"))).toEqual([RENUMBERED_WHY]);
  });

  it("outside a Repeat holds what is wired in alone, as ever: rows an entry carries are not held again", () => {
    expect(rowsOf(heldRows(page([row(torsion(T2, 100))], false), 20, [entry([torsion(T1, 50)])], RDKIT, "RDKit"))).toEqual([[["1-2-3-4", 100]]]);
  });
});
