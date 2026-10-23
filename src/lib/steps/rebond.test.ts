import { describe, expect, it } from "vitest";
import type { Molecule } from "../chem/molecule";
import { mapReaction } from "../chem/reactionMap";
import { dielsAlder } from "../chem/reactionMap.fixtures";
import type { Entry } from "../entry";
import { speciesOf } from "../io/writers";
import { rebonded } from "./rebond";

/** An entry of a molecule, in its own numbering. */
const entryOf = (m: Molecule, id: string, group?: string): Entry => ({
  id,
  from: [],
  structure: { atoms: m.atoms.map((a) => ({ el: a.el })), bonds: m.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order as 1 | 2 | 3 })) },
  geometry: { kind: "3d", xyz: m.atoms.flatMap((a) => [a.x, a.y, a.z]) },
  species: speciesOf({ atoms: m.atoms, bonds: [] }),
  properties: group ? { group: { value: group, unit: "none", status: "computed" } } : {},
  status: "done",
});

describe("Re-bond", () => {
  const da = dielsAlder();
  const reactant = da.reactants[0];
  const mapped = mapReaction({ reactants: [reactant], products: [da.product] });
  if ("error" in mapped) throw new Error(mapped.message);
  // the product in the reactants' numbering, as the Reaction step gives it
  const product = mapped.productsInReactantNumbering[0];

  it("gives the reactant's geometry the product's bonds - the known Diels-Alder ring - in the reactants' numbering", () => {
    const r = rebonded(entryOf(reactant, "rc1", "a"), entryOf(product, "p1", "b"), "e1");
    if ("failed" in r) throw new Error(r.failed);
    expect(r.entry.geometry).toEqual({ kind: "3d", xyz: reactant.atoms.flatMap((a) => [a.x, a.y, a.z]) });
    const key = (b: { a1: number; a2: number; order: number }) => `${Math.min(b.a1, b.a2)}-${Math.max(b.a1, b.a2)}:${b.order}`;
    expect(r.entry.structure.bonds.map(key).sort()).toEqual(product.bonds.map(key).sort());
    // the two bonds the reaction forms (C1-C5, C4-C6: atoms 0-10 and 3-11) are there, and stand long in the reactant's geometry
    expect(r.entry.structure.bonds.map(key)).toEqual(expect.arrayContaining(["0-10:1", "3-11:1"]));
    const d = (i: number, j: number) => Math.hypot(reactant.atoms[i].x - reactant.atoms[j].x, reactant.atoms[i].y - reactant.atoms[j].y, reactant.atoms[i].z - reactant.atoms[j].z);
    expect(d(0, 10)).toBeGreaterThan(2);
    expect(r.entry.properties.group.value).toBe("a → b");
    expect(r.entry.from).toEqual(["rc1", "p1"]);
  });

  it("keeps both entries' properties, the geometry's where both have one, each saying its own geometry", () => {
    const g = entryOf(reactant, "rc1");
    g.properties.energy = { value: -234.1, unit: "Eh", at: { geometry: "aaaa0001" }, status: "computed" };
    const b = entryOf(product, "p1");
    b.properties.energy = { value: -234.2, unit: "Eh", at: { geometry: "bbbb0002" }, status: "computed" };
    b.properties.product = { value: "p-1", unit: "none", status: "computed" };
    const r = rebonded(g, b, "e1");
    if ("failed" in r) throw new Error(r.failed);
    expect(r.entry.properties.energy.at?.geometry).toBe("aaaa0001");
    expect(r.entry.properties.product.value).toBe("p-1");
    expect(r.entry.properties.group.value).toBe("rc1 → p1");
  });

  it("makes nothing of two entries not in one numbering, and says the first atom that differs", () => {
    // the product as drawn, in its own numbering: not the reactants'
    const r = rebonded(entryOf(reactant, "rc1"), entryOf(da.product, "p0"), "e1");
    expect(r).toEqual({ failed: expect.stringMatching(/^Atom 1 is C in the geometry and H in the bonding/) });
    const fewer: Molecule = { atoms: product.atoms.slice(0, 5), bonds: [] };
    expect(rebonded(entryOf(reactant, "rc1"), entryOf(fewer, "x"), "e1")).toEqual({ failed: expect.stringMatching(/16 atoms and the bonding 5/) });
    const path: Entry = { ...entryOf(reactant, "rc1"), geometry: { kind: "frames", frames: [[]] } };
    expect(rebonded(path, entryOf(product, "p1"), "e1")).toEqual({ failed: expect.stringMatching(/Take frames/) });
  });
  it("gives no species where the bonding is a skeleton, its hydrogens not there - as the bonding has none", () => {
    const r = rebonded(entryOf(reactant, "rc1"), { ...entryOf(product, "p1"), species: null }, "e1");
    if ("failed" in r) throw new Error(r.failed);
    expect(r.entry.species).toBeNull();
  });
});
