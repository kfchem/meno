// Held beside structures.test.ts: what Combine does not carry of a part's restraints - an atom the part has not, one that is no whole number, a start that is not its atoms' places - and that the restraints of each name stay a list of their own.
import { describe, expect, it } from "vitest";
import type { Entry, EntryAtom, Property } from "../entry";
import { speciesOf } from "../io/writers";
import { combined } from "./combine";

const entry = (id: string, els: string[], xyz: number[], properties: Record<string, Property> = {}): Entry => {
  const atoms: EntryAtom[] = els.map((el) => ({ el }));
  return {
    id,
    from: [],
    structure: { atoms, bonds: els.slice(1).map((_, i) => ({ a1: 0, a2: i + 1, order: 1 as const })) },
    geometry: { kind: "3d", xyz },
    species: speciesOf({ atoms: atoms.map((a) => ({ ...a, x: 0, y: 0, z: 0 })), bonds: [] })!,
    properties,
    status: "done",
  };
};
const WATER = [0, 0, 0, 0.9572, 0, 0, -0.24, 0.9266, 0];
const OH = [3, 0, 0, 3.97, 0, 0];
const held = (atoms: number[][], start?: number[]): Property => ({ value: { restraints: atoms.map((a) => ({ kind: "fixed" as const, atoms: a })), ...(start ? { start } : {}) }, unit: "none", status: "computed" });
const rowsOf = (e: Entry, name = "restraints") => (e.properties[name].value as { restraints: { atoms: number[] }[] }).restraints.map((r) => r.atoms);
const ok = (r: ReturnType<typeof combined>) => {
  if ("failed" in r) throw new Error(r.failed);
  return r;
};

describe("a part's restraints carried into a complex", () => {
  it("are carried only where every atom they name is one of the part's: the atom just past the part's last, and one that is no whole number, are not", () => {
    // (water has atoms 0 to 2: 3 is the hydroxyl's first in the complex)
    const past = ok(combined([entry("a", ["O", "H", "H"], WATER, { restraints: held([[3]]) }), entry("b", ["O", "H"], OH, { restraints: held([[0]]) })], "c"));
    expect(rowsOf(past.entry)).toEqual([[3]]);
    const fraction = ok(combined([entry("a", ["O", "H", "H"], WATER, { restraints: held([[0.5]]) }), entry("b", ["O", "H"], OH, { restraints: held([[1]]) })], "c"));
    expect(rowsOf(fraction.entry)).toEqual([[4]]);
    expect(past.said.join(" ")).toContain("part 1: restraints on atoms it has not");
  });

  it("start only as long as the part's atoms' places: a start of another length is not joined", () => {
    const a = (start: number[]) => entry("a", ["O", "H", "H"], WATER, { restraints: held([[0, 1].slice(0, 1)], start) });
    const b = entry("b", ["O", "H"], OH, { restraints: held([[0]], OH) });
    expect((ok(combined([a(WATER), b], "c")).entry.properties.restraints.value as { start?: number[] }).start).toEqual([...WATER, ...OH]);
    expect(ok(combined([a(WATER.slice(0, 6)), b], "c")).entry.properties.restraints.value).not.toHaveProperty("start");
  });

  it("of each name stay a list of their own", () => {
    const a = entry("a", ["O", "H", "H"], WATER, { restraints: held([[0]]), pins: held([[1]]) });
    const b = entry("b", ["O", "H"], OH, { restraints: held([[0]]), pins: held([[1]]) });
    const r = ok(combined([a, b], "c"));
    expect(rowsOf(r.entry, "restraints")).toEqual([[0], [3]]);
    expect(rowsOf(r.entry, "pins")).toEqual([[1], [4]]);
  });
});
