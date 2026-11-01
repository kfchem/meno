import { describe, expect, it } from "vitest";
import { homoOf, orbitalName, orbitalResults, orbitalsOf, type Orbital } from "./orbitals";
import { calcOf } from "./output";
import { ELECTRONVOLT_J, HARTREE_J } from "../units";

const EV = HARTREE_J / ELECTRONVOLT_J;
/** A restricted calculation's orbitals: `occupied` doubly occupied, then `virtual` empty, their energies rising. */
const closed = (occupied: number, virtual: number, extra: Partial<Orbital> = {}): Orbital[] =>
  Array.from({ length: occupied + virtual }, (_, i) => ({ spin: "both" as const, energy: -1 + 0.1 * i, occupation: i < occupied ? 2 : 0, ...extra }));

describe("orbitals as a reader gives them", () => {
  it("are taken where each is as the form says: a spin, an energy or none, an occupation from 0 to 2 or none", () => {
    expect(orbitalsOf([{ spin: "both", energy: -0.5, occupation: 2, symmetry: " A1 " }, { spin: "both", energy: null, occupation: null, surface: { ask: "orbital:1" } }])).toEqual([
      { spin: "both", energy: -0.5, occupation: 2, symmetry: "A1" },
      { spin: "both", energy: null, occupation: null, surface: { ask: "orbital:1" } },
    ]);
    for (const bad of [[], [{ spin: "up", energy: 0, occupation: 1 }], [{ spin: "alpha", energy: "x", occupation: 1 }], [{ spin: "alpha", energy: 0, occupation: 3 }], "orbitals"])
      expect(orbitalsOf(bad)).toBeUndefined();
    // (of both spins, or of each apart: never the two ways at once)
    expect(orbitalsOf([{ spin: "both", energy: 0, occupation: 2 }, { spin: "alpha", energy: 0, occupation: 1 }])).toBeUndefined();
  });

  it("have a HOMO only where every occupation is whole and every energy given: the last at least half full", () => {
    expect(homoOf(closed(3, 2))).toBe(2);
    // (a restricted open shell: its singly occupied orbitals are occupied)
    expect(homoOf([...closed(2, 0), { spin: "both", energy: 0, occupation: 1 }, { spin: "both", energy: 0.2, occupation: 0 }])).toBe(2);
    // (one spin's: one electron is full)
    expect(homoOf([{ spin: "alpha", energy: -1, occupation: 1 }, { spin: "alpha", energy: 1, occupation: 0 }])).toBe(0);
    // (natural orbitals: fractional, no frontier by name)
    expect(homoOf([{ spin: "both", energy: 0, occupation: 1.98 }, { spin: "both", energy: 0, occupation: 0.02 }])).toBeUndefined();
    expect(homoOf([{ spin: "both", energy: null, occupation: 2 }])).toBeUndefined();
  });

  it("are named from the HOMO", () => {
    expect([0, 1, 2, 3, 4].map((i) => orbitalName(i, 2))).toEqual(["HOMO−2", "HOMO−1", "HOMO", "LUMO", "LUMO+1"]);
  });
});

describe("orbitals as Meno lists them", () => {
  it("are one list, from the highest down, in electronvolts, opening on the LUMO, with the HOMO-LUMO gap", () => {
    const [list, gap] = orbitalResults(closed(3, 2)) as [Record<string, unknown>, Record<string, unknown>];
    expect(list).toMatchObject({ id: "orbitals", on: "list", group: "Orbitals", label: "Molecular orbitals", focus: 1 });
    expect(list.columns).toEqual([{ label: "Orbital" }, { label: "Energy", unit: "eV", digits: 3 }]);
    const rows = list.rows as { cells: unknown[] }[];
    expect(rows.map((r) => r.cells[0])).toEqual(["LUMO+1", "LUMO", "HOMO", "HOMO−1", "HOMO−2"]);
    expect(rows[2].cells[1]).toBeCloseTo(-0.8 * EV, 9);
    expect(gap).toMatchObject({ id: "homo-lumo-gap", on: "molecule", unit: "eV", digits: 2 });
    expect(gap.value as number).toBeCloseTo(0.1 * EV, 9);
  });

  it("are a list for each spin, without a gap, where the spins are given apart; their symmetries where any is given", () => {
    const orbitals: Orbital[] = [
      { spin: "alpha", energy: -1, occupation: 1, symmetry: "A1" },
      { spin: "alpha", energy: 1, occupation: 0, symmetry: "B2" },
      { spin: "beta", energy: 0.5, occupation: 0 },
    ];
    const out = orbitalResults(orbitals) as Record<string, unknown>[];
    expect(out.map((r) => [r.id, r.label])).toEqual([
      ["orbitals.a", "α orbitals"],
      ["orbitals.b", "β orbitals"],
    ]);
    expect(out[0].columns).toEqual([{ label: "Orbital" }, { label: "Symmetry", quantity: "symmetry" }, { label: "Energy", unit: "eV", digits: 3 }]);
    // (a spin with none occupied: named by number, with its occupation)
    expect((out[1].rows as { cells: unknown[] }[])[0].cells).toEqual([1, 0.5 * EV, 0]);
  });

  it("are listed by number with their occupations where no HOMO can be named, a surface kept with its row", () => {
    const natural: Orbital[] = [
      { spin: "both", energy: 0, occupation: 1.98, surface: { ask: "orbital:0" } },
      { spin: "both", energy: 0, occupation: 0.02 },
    ];
    const [list] = orbitalResults(natural) as Record<string, unknown>[];
    expect(list.focus).toBeUndefined();
    expect(list.columns).toEqual([
      { label: "Orbital", quantity: "number", digits: 0 },
      { label: "Energy", unit: "eV", digits: 3 },
      { label: "Occupation", quantity: "number", digits: 4 },
    ]);
    expect(list.rows).toEqual([{ cells: [2, 0, 0.02] }, { cells: [1, 0, 1.98], surface: { ask: "orbital:0" } }]);
  });

  it("open on the HOMO where no LUMO is given (a file of the occupied orbitals alone)", () => {
    const [list] = orbitalResults(closed(3, 0)) as Record<string, unknown>[];
    expect(list.focus).toBe(0);
    expect(orbitalResults(closed(3, 0))).toHaveLength(1);
  });

  it("keep those about the frontier where there are more than a list holds", () => {
    const [list] = orbitalResults(closed(4000, 3000)) as { rows: { cells: unknown[] }[]; focus: number }[];
    expect(list.rows).toHaveLength(5000);
    expect(list.rows[list.focus].cells[0]).toBe("LUMO");
  });

  it("are a molecule's results, read and trimmed about the frontier as any list is", () => {
    const calc = calcOf({ atoms: ["H", "H"], frames: [[0, 0, 0, 0, 0, 0.74]], orbitals: closed(30, 30) }, ["reader 1"]);
    const list = calc.results?.find((r) => r.id === "orbitals");
    expect(list?.on).toBe("list");
    if (list?.on !== "list") return;
    expect(list.rows).toHaveLength(20);
    expect(list.rows[list.focus!].cells[0]).toBe("LUMO");
    expect(list.trimmed).toEqual({ from: 21, to: 40, of: 60 });
    expect(calc.results?.some((r) => r.id === "homo-lumo-gap")).toBe(true);
    // (a list the reader gave of its own, under the same name, first)
    const own = { id: "orbitals", on: "list", group: "Orbitals", label: "Its own", columns: [{ label: "x" }], rows: [{ cells: [1] }] };
    const both = calcOf({ atoms: ["H", "H"], frames: [[0, 0, 0, 0, 0, 0.74]], orbitals: closed(1, 1), results: [own] }, ["reader 1"]);
    expect(both.results?.filter((r) => r.id === "orbitals").map((r) => r.label)).toEqual(["Its own"]);
  });
});
