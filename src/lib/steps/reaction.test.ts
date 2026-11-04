import { describe, expect, it } from "vitest";
import { geometryKey, type Entry } from "../entry";
import { bondChangesTable, renumberedEntry } from "./reaction";
import { atomsOfRows, tableIn } from "../table";

/** Water, numbered H, O, H: its geometry, a value at it, a list and a vibration by atom, a restraint, and its stereo elements. */
function water(): Entry {
  const xyz = [0.96, 0, 0, 0, 0, 0, -0.24, 0.93, 0];
  const at = { geometry: geometryKey(xyz) };
  return {
    id: "w",
    from: [],
    structure: {
      atoms: [{ el: "H" }, { el: "O" }, { el: "H" }],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 1 },
      ],
    },
    geometry: { kind: "3d", xyz },
    species: { charge: 0, multiplicity: 1, from: { charge: "atoms", multiplicity: "atoms" } },
    properties: {
      energy: { value: -76.4, unit: "Eh", at, status: "computed" },
      charges: { value: { list: [0.4, -0.8, 0.4], per: "atom" }, unit: "none", at, status: "computed" },
      modes: { value: { modes: [[1, 0, 0, 2, 0, 0, 3, 0, 0]] }, unit: "none", at, status: "computed" },
      held: { value: { restraints: [{ kind: "distance", atoms: [0, 1], value: 1, strength: 1 }] }, unit: "none", status: "computed" },
      name: { value: "water", unit: "none", status: "computed" },
    },
    stereo: { perceived: true, elements: [{ kind: "centre", atoms: [1], specified: true }], key: "k", by: { plugin: "p", version: "1" } },
    status: "done",
  } as Entry;
}

describe("an entry renumbered as the reactants are", () => {
  // (atom 0 now is its oxygen, then its first hydrogen, then its second)
  const order = [1, 0, 2];
  const e = renumberedEntry(water(), order, "r") as Entry;

  it("holds the same atoms and bonds, in the new order, each where it stood", () => {
    expect(e.structure.atoms.map((a) => a.el)).toEqual(["O", "H", "H"]);
    expect(e.structure.bonds).toEqual([
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ]);
    expect(e.geometry).toEqual({ kind: "3d", xyz: [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0] });
    expect([e.id, e.from]).toEqual(["r", ["w"]]);
  });

  it("renumbers what names atoms - a list by atom, a vibration, a restraint, the stereo - and leaves the rest as it was", () => {
    expect(e.properties.charges.value).toEqual({ list: [-0.8, 0.4, 0.4], per: "atom" });
    expect(e.properties.modes.value).toEqual({ modes: [[2, 0, 0, 1, 0, 0, 3, 0, 0]] });
    expect(e.properties.held.value).toEqual({ restraints: [{ kind: "distance", atoms: [1, 0], value: 1, strength: 1 }] });
    expect(e.stereo).toMatchObject({ elements: [{ atoms: [0] }] });
    expect(e.properties.energy.value).toBe(-76.4);
    expect(e.properties.name).toEqual(water().properties.name);
  });

  it("says a value at its geometry is at it still, the geometry now in the new order", () => {
    expect(e.properties.energy.at).toEqual({ geometry: geometryKey((e.geometry as { xyz: number[] }).xyz) });
    expect(e.properties.energy.at?.geometry).not.toBe(water().properties.energy.at?.geometry);
  });

  it("refuses an order that is not each atom once, saying so", () => {
    expect(renumberedEntry(water(), [0, 0, 2], "r")).toEqual({ failed: "The map does not give each of its 3 atoms one place in the reference's numbering." });
    expect(renumberedEntry(water(), [0, 1], "r")).toHaveProperty("failed");
  });
});

describe("a reaction's bond changes as a table", () => {
  const changes = [
    { a1: 0, a2: 4, element1: "C", element2: "C", before: 0, after: 1, change: "formed" as const },
    { a1: 0, a2: 1, element1: "C", element2: "C", before: 2, after: 1, change: "order" as const },
  ];

  it("has a row a bond, its atoms from 1, with what changed and its order before and after", () => {
    const t = bondChangesTable([{ product: 0, map: 0, changes }], () => "b");
    expect(t.columns.map((c) => c.name)).toEqual(["map.entry", "Change", "Atom 1", "Atom 2", "Element 1", "Element 2", "Order before", "Order after"]);
    expect(t.rows).toEqual([
      ["b", "formed", 1, 5, "C", "C", 0, 1],
      ["b", "order changed", 1, 2, "C", "C", 2, 1],
    ]);
  });

  it("says its atom columns count from 1, which a reader takes them by - kept when the workspace is saved and read back", () => {
    const t = bondChangesTable([{ product: 0, map: 0, changes }], () => "b");
    expect(atomsOfRows(t)).toEqual({ columns: ["Atom 1", "Atom 2"], rows: [[0, 4], [0, 1]] });
    expect(atomsOfRows(tableIn(JSON.parse(JSON.stringify(t)))!)).toEqual(atomsOfRows(t));
  });

  it("names the map, from 1, where a product has several", () => {
    const t = bondChangesTable(
      [
        { product: 0, map: 0, changes: changes.slice(0, 1) },
        { product: 0, map: 1, changes: changes.slice(1) },
      ],
      () => "b",
    );
    expect(t.columns[1].name).toBe("Map");
    expect(t.rows.map((r) => r.slice(0, 3))).toEqual([
      ["b", 1, "formed"],
      ["b", 2, "order changed"],
    ]);
  });
});
