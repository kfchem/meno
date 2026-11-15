import { describe, expect, it } from "vitest";
import type { CalcInfo } from "../../../../lib/calc/output";
import { dielsAlder } from "../../../../lib/chem/reactionMap.fixtures";
import { ATOMS_FROM_1, type Table } from "../../../../lib/table";
import { CHANGE, MAPPED_ENTRY } from "../../../../lib/steps/reaction";
import { setEntries, type SetEntry } from "./entries";
import { modeOnAtomsSet } from "./structureSteps";

/** A saddle point: the Diels-Alder's reactants, its one imaginary vibration moving atom i by i + 1 along z, so that the last ranks first. */
function saddle(product: string | null): SetEntry {
  const r = dielsAlder().reactants[0];
  const n = r.atoms.length;
  const calc = {
    readers: ["test 1"],
    results: [{ id: "vibrations", on: "list", group: "Vibrations", label: "Vibrations", columns: [{ label: "Frequency", quantity: "wavenumber" }], rows: [{ cells: [-400], move: Array.from({ length: n }, (_, i) => [0, 0, i + 1]).flat() }] }],
  } as CalcInfo;
  const [e] = setEntries([{ id: 1, at: { x: 0, y: 0 }, atoms: r.atoms, bonds: r.bonds, calc }] as never, "molecules");
  return product == null ? e : { ...e, properties: { ...e.properties, [MAPPED_ENTRY]: { value: product, unit: "none", status: "computed" } } };
}

/** An Atom map's bond changes, as its table has them: each row its product, what changed and the two atoms, from 1. */
function changes(rows: [string, string, number, number][]): Table {
  return {
    columns: [
      { name: MAPPED_ENTRY, kind: "text" },
      { name: CHANGE, kind: "text" },
      { name: "Atom 1", kind: "number", unit: "none", atoms: ATOMS_FROM_1 },
      { name: "Atom 2", kind: "number", unit: "none", atoms: ATOMS_FROM_1 },
    ],
    rows,
    unread: [],
    left: [],
  } as Table;
}

const ranks = (out: ReturnType<typeof modeOnAtomsSet>) => (out.ok ? out.kept.map((e) => e.properties?.["mode.ranks"]) : []);

describe("Mode on atoms on a set", () => {
  const table = changes([
    ["P", "formed", 1, 11],
    ["P", "formed", 4, 12],
    ["P", "order changed", 1, 2],
    ["Q", "formed", 2, 3],
  ]);

  it("takes, row by row, only the rows whose product is the entry's, where rows are matched on a property - an entry of none taking none, said", () => {
    const out = modeOnAtomsSet([saddle("P"), saddle("Q"), saddle(null)], "molecules" as never, { reach: 1, table, rows: MAPPED_ENTRY });
    const r = ranks(out);
    expect(r[0]?.value).toBe("C1 16, C4 13, C11 6, C12 5");
    expect(r[1]?.value).toBe("C2 15, C3 14");
    expect(r[2]?.status).toEqual({ failed: "No atoms are listed." });
    expect(out.ok && out.said).toBe("3 entries, 2 with reacting atoms outside the window · 1 not worked out");
  });

  it("takes every row on every entry where rows are matched on none", () => {
    const out = modeOnAtomsSet([saddle("P"), saddle("Q")], "molecules" as never, { reach: 1, table });
    expect(ranks(out).map((p) => p?.value)).toEqual(["C1 16, C2 15, C3 14, C4 13, C11 6, C12 5", "C1 16, C2 15, C3 14, C4 13, C11 6, C12 5"]);
  });

  it("takes a bond whose order changed only where every row is asked for: else the bonds formed or broken alone", () => {
    const made = modeOnAtomsSet([saddle("P")], "molecules" as never, { reach: 1, table, rows: MAPPED_ENTRY });
    const every = modeOnAtomsSet([saddle("P")], "molecules" as never, { reach: 1, table, rows: MAPPED_ENTRY, which: "every" });
    expect(ranks(made)[0]?.value).toBe("C1 16, C4 13, C11 6, C12 5");
    expect(ranks(every)[0]?.value).toBe("C1 16, C2 15, C4 13, C11 6, C12 5");
  });

  it("says where it replaced the mode's values an entry carried", () => {
    const first = modeOnAtomsSet([saddle("P")], "molecules" as never, { reach: 1, table, rows: MAPPED_ENTRY });
    if (!first.ok) throw new Error(first.said);
    const again = modeOnAtomsSet(first.kept, "molecules" as never, { reach: 1, table, rows: MAPPED_ENTRY });
    expect(again.ok && again.said).toBe("1 entry, 1 with reacting atoms outside the window · the mode's values an entry carried replaced");
  });
});
