import { describe, expect, it } from "vitest";
import type { Molecule } from "../chem/molecule";
import { mapReaction } from "../chem/reactionMap";
import { dielsAlder } from "../chem/reactionMap.fixtures";
import type { Entry } from "../entry";
import { speciesOf } from "../io/writers";
import { rebonded } from "./rebond";
import { structureKey } from "./restructure";

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
  // the product in the reactants' numbering, as the Atom map step gives it
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

  it("lets a value of a geometry and a label ride, and marks a value of the structure either was - now another - not applicable, saying so", () => {
    const g = entryOf(reactant, "rc1");
    const b = entryOf(product, "p1");
    // (a value of a geometry; labels - a Tag's ID, restraints; values of each structure, as a descriptor writes them)
    g.properties.energy = { value: -234.1, unit: "Eh", at: { geometry: "aaaa0001" }, status: "computed" };
    g.properties.start = { value: "start-1", unit: "none", status: "computed" };
    b.properties.restraints = { value: { restraints: [{ kind: "distance", atoms: [0, 10], value: 1.6, strength: 1000 }] }, unit: "none", status: "computed" };
    g.properties.mw = { value: 136.24, unit: "g/mol", of: structureKey(g), status: "computed" };
    b.properties.tpsa = { value: 0, unit: "none", of: structureKey(b), status: "computed" };
    g.properties.logp = { value: 3.1, unit: "none", of: structureKey(g), status: { failed: "not worked out" } };
    const r = rebonded(g, b, "e1");
    if ("failed" in r) throw new Error(r.failed);
    // (rides, naming its own geometry)
    expect(r.entry.properties.energy).toEqual(g.properties.energy);
    // (labels ride as they are)
    expect(r.entry.properties.start).toEqual(g.properties.start);
    expect(r.entry.properties.restraints).toEqual(b.properties.restraints);
    // (the reactant's structure is not the entry's: its value kept, marked, and said)
    expect(r.entry.properties.mw).toEqual({ ...g.properties.mw, status: { notApplicable: "worked out on the structure before Re-bond" } });
    // (the bonding's structure is the entry's: as it was)
    expect(r.entry.properties.tpsa).toEqual(b.properties.tpsa);
    expect(structureKey(r.entry)).toBe(structureKey(b));
    // (one that never was worked out keeps its own reason)
    expect(r.entry.properties.logp.status).toEqual({ failed: "not worked out" });
    expect(r.said).toEqual(["mw, logp were worked out on another structure, so they are marked not applicable."]);
  });

  it("takes the bonding entry's restraints, never the geometry's - they hold the bonds the geometry no longer has - and says it dropped them", () => {
    const g = entryOf(reactant, "rc1");
    const b = entryOf(product, "p1");
    // (a reactant conformer's own restraints, from its search; the product's, for the minimisation towards it)
    g.properties.restraints = { value: { restraints: [{ kind: "distance", atoms: [0, 1], value: 3.2, strength: 1000 }] }, unit: "none", status: "computed" };
    b.properties.restraints = { value: { restraints: [{ kind: "dihedral", atoms: [0, 1, 2, 3], value: 180, strength: 50 }] }, unit: "none", status: "computed" };
    const r = rebonded(g, b, "e1");
    if ("failed" in r) throw new Error(r.failed);
    expect(r.entry.properties.restraints).toEqual(b.properties.restraints);
    expect(r.said).toEqual(["The geometry's restraints were dropped: restraints hold a bonding's bonds, and the entry takes the bonding's."]);
    // (a bonding with none: the entry has none, and that is said too)
    delete b.properties.restraints;
    const none = rebonded(g, b, "e2");
    if ("failed" in none) throw new Error(none.failed);
    expect(none.entry.properties.restraints).toBeUndefined();
    expect(none.said).toEqual(["The geometry's restraints were dropped: restraints hold a bonding's bonds, and the entry takes the bonding's, which has none."]);
  });

  it("knows a structure by its atoms and bonds, however numbered, and not by where its atoms are", () => {
    const a = entryOf(reactant, "x");
    const turned: Entry = { ...a, geometry: { kind: "3d", xyz: a.geometry.kind === "3d" ? a.geometry.xyz.map((v) => v + 1) : [] } };
    expect(structureKey(turned)).toBe(structureKey(a));
    // (the same atoms numbered the other way round)
    const n = a.structure.atoms.length;
    const back: Entry = { ...a, structure: { atoms: [...a.structure.atoms].reverse(), bonds: a.structure.bonds.map((b) => ({ ...b, a1: n - 1 - b.a1, a2: n - 1 - b.a2 })) } };
    expect(structureKey(back)).toBe(structureKey(a));
    expect(structureKey(entryOf(product, "y"))).not.toBe(structureKey(a));
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
    expect(r.said).toEqual(["The bonding has no hydrogens, so the entry's charge and spin are not known either."]);
  });
});
