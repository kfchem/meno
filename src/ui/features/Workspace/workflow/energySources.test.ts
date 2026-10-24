/**
 * An entry's energy, as a table of molecules has it: what worked it out - its
 * calculation, else what made it (`made.energies`: an energy a text's note
 * named, "E(MP2)"; a force field) - so that energies from two sources are
 * never one column, set against one another in a diagram's ΔE or anywhere
 * else that reads it.
 */
import { describe, expect, it } from "vitest";
import { calcOf } from "../../../../lib/calc/output";
import { diagramOf } from "../../../../lib/energyDiagram";
import { readCoordinates } from "../../../../lib/io/coordinates";
import { moleculesAsTable } from "../../../../lib/table";
import type { Molecule3D } from "../store/types";
import { coordinateMolecules } from "../utils/coordinates";
import { entryOfSet, setEntries } from "./entries";

const WATER = ["O 0.000000 0.000000 0.117300", "H 0.000000 0.757200 -0.469200", "H 0.000000 -0.757200 -0.469200"];
/** A water read from a text, titled `title`, its notes `notes`. */
const read = (title: string, notes: string[]): Omit<Molecule3D, "id"> => ({
  ...coordinateMolecules(readCoordinates([title, ...notes, ...WATER].join("\n")).map((structure) => ({ structure, name: structure.name })), "made-up-si.pdf")[0],
  at: { x: 0, y: 0 },
});
/** Molecules as the table a diagram is drawn from: their energy columns, and the diagram of them, or why not. */
function seen(ms: Omit<Molecule3D, "id">[], holds: "molecules" | "conformers" = "molecules") {
  const entries = setEntries(ms.map((m, i) => ({ ...m, id: i + 1 })), holds).map((e, i) => entryOfSet(e, `e${i}`));
  const table = moleculesAsTable(entries);
  return { columns: table.columns.filter((c) => c.name.startsWith("energy")).map((c) => c.name), diagram: diagramOf(table) };
}
/** A calculation's water, titled `title`, its energy `e`. */
const calculated = (title: string, e: number, method = "a method"): Omit<Molecule3D, "id"> => {
  const atoms = [
    { el: "O", x: 0, y: 0, z: 0.1173 },
    { el: "H", x: 0, y: 0.7572, z: -0.4692 },
    { el: "H", x: 0, y: -0.7572, z: -0.4692 },
  ];
  return {
    at: { x: 0, y: 0 },
    title,
    atoms,
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    energies: [e],
    calc: calcOf({ atoms: atoms.map((a) => a.el), frames: [atoms.flatMap((a) => [a.x, a.y, a.z])], energies: [e], program: "a program", method }, ["a reader"]),
  };
};

describe("an entry's energy, by what worked it out", () => {
  it("of two read from a text, one an E(HF) and one an E(MP2): two columns, never one - and a diagram of them refused, naming both", () => {
    const { columns, diagram } = seen([read("R", ["E(HF) = -76.01 Hartree"]), read("P", ["E(MP2) = -76.30 Hartree"])]);
    expect(columns).toEqual(["energy · E(HF)", "energy · E(MP2)"]);
    expect("why" in diagram && diagram.why).toMatch(/"energy · E\(HF\)".*"energy · E\(MP2\)"/);
  });

  it("of two read from a text alike, both E(MP2): one column, set against one another", () => {
    expect(seen([read("R", ["E(MP2) = -76.30 Hartree"]), read("P", ["E(MP2) = -76.28 Hartree"])]).columns).toEqual(["energy"]);
  });

  it("of a force field's conformers, one force field: one column - they are set against one another", () => {
    const ff = (e: number): Omit<Molecule3D, "id"> => ({ ...calculated("C", e), calc: undefined, made: { how: [], energies: "MMFF94" } });
    expect(seen([ff(-1), ff(-0.99)]).columns).toEqual(["energy"]);
  });

  it("of a calculation's, as it was: worked out by the calculation", () => {
    const entries = setEntries([{ ...calculated("R", -76.4), id: 1 }], "molecules").map((e) => entryOfSet(e, "e"));
    expect(entries[0].properties.energy.by).toEqual({ plugin: "a", program: "a program", method: "a method" });
    expect(seen([calculated("R", -76.4), calculated("P", -76.3)]).columns).toEqual(["energy"]);
  });

  it("of a calculation's beside a force field's: two columns - never compared, the diagram refused", () => {
    const ff: Omit<Molecule3D, "id"> = { ...calculated("P", -0.05), calc: undefined, made: { how: [], energies: "MMFF94" } };
    const { columns, diagram } = seen([calculated("R", -76.4), ff]);
    expect(columns).toHaveLength(2);
    expect("why" in diagram).toBe(true);
  });
});
