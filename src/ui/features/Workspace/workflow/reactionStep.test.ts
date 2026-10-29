import { describe, expect, it } from "vitest";
import type { Molecule } from "../../../../lib/chem/molecule";
import { dielsAlder, sn2 } from "../../../../lib/chem/reactionMap.fixtures";
import type { SetEntry } from "./entries";
import { kindInfo } from "./kinds";
import { runMenoPair } from "./meno";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import { addSet, addStep, connect } from "./model";
import { resultOf } from "./flow";
import { runStep, type RunWith } from "./run";
import { setName } from "./doers";
import { BETWEEN } from "./look";

/** A molecule in 3D as a step's entry: its atoms, bonds and places. */
const entryOf = (m: Molecule, compound = 0, extra: Partial<SetEntry> = {}): SetEntry =>
  ({ compound, number: 1, atoms: m.atoms, bonds: m.bonds, xyz: m.atoms.flatMap((a) => [a.x, a.y, a.z]), ...extra }) as SetEntry;

const ok = (o: ReturnType<typeof runMenoPair>) => {
  if (!o.ok) throw new Error(o.said);
  return o;
};

describe("Reaction, as a step", () => {
  const da = dielsAlder();
  const reactant = entryOf(da.reactants[0]);
  const product = entryOf(da.product, 0, { name: "cyclohexene" } as Partial<SetEntry>);

  it("writes the product in the reactants' numbering, every atom where it stands in the product, and its bond changes as a table", () => {
    const o = ok(runMenoPair("reaction", { entries: [reactant], holds: "molecules" }, { entries: [product], holds: "molecules" }));
    expect(o.kept).toHaveLength(1);
    const made = o.kept[0];
    // (each atom the reactants' element, the product's place)
    expect(made.atoms.map((a) => a.el)).toEqual(reactant.atoms.map((a) => a.el));
    const places = new Set(da.product.atoms.map((a) => `${a.x},${a.y},${a.z}`));
    made.atoms.forEach((_, i) => expect(places.has(`${made.xyz[3 * i]},${made.xyz[3 * i + 1]},${made.xyz[3 * i + 2]}`)).toBe(true));
    expect(made.bonds).toHaveLength(da.product.bonds.length);
    const t = o.tables!.changes;
    expect(t.rows.map((r) => [r[0], r[1]])).toEqual([
      ["cyclohexene", "formed"],
      ["cyclohexene", "formed"],
      ["cyclohexene", "order changed"],
      ["cyclohexene", "order changed"],
      ["cyclohexene", "order changed"],
      ["cyclohexene", "order changed"],
    ]);
    expect(o.said).toBe("1 product in the reactants' numbering \u00b7 6 bond changes");
    expect(o.aside).toEqual([]);
  });

  it("takes one reactant entry, its hydrogens there; sets aside a product that cannot map, saying why", () => {
    expect(runMenoPair("reaction", { entries: [reactant, reactant], holds: "molecules" }, { entries: [product], holds: "molecules" })).toEqual({
      ok: false,
      said: "Reactants takes one entry, the reactants as one structure (make a complex of several with Combine): 2 came in",
    });
    expect(runMenoPair("reaction", { entries: [{ ...reactant, skeleton: true }], holds: "molecules" }, { entries: [product], holds: "molecules" })).toMatchObject({ ok: false });
    // (a product of another formula; a skeleton)
    const fewer = entryOf({ atoms: da.product.atoms.slice(0, 15), bonds: da.product.bonds.filter((b) => b.a1 < 15 && b.a2 < 15) }, 1);
    const o = ok(runMenoPair("reaction", { entries: [reactant], holds: "molecules" }, { entries: [fewer, { ...product, compound: 2, skeleton: true }], holds: "molecules" }));
    expect(o.kept).toEqual([]);
    expect(o.aside.map((e) => String(e.properties?.set_aside?.value))).toEqual([
      "it has no hydrogens: every atom must map, hydrogens included",
      "The product has 15 atoms and the reactants 16: every atom must map one to one, hydrogens included.",
    ]);
  });

  it("is laid out on the page: the mapped products, those not mapped, and the bond changes, a table, in their exits' sets", () => {
    const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
    const mol = (m: Molecule, x: number) => ({ at: { x, y: 0 }, atoms: m.atoms, bonds: m.bonds });
    let doc = addMolecule3d(emptyWorkspaceDocument(), mol(da.reactants[0], 0));
    doc = addMolecule3d(doc, mol(da.product, 20));
    doc = addMolecule3d(doc, mol(sn2().product, 22));
    const a = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -4, y0: -4, x1: 4, y1: 4 });
    const b = doc.nextWorkflowId!;
    doc = addSet(doc, { x0: 16, y0: -4, x1: 24, y1: 4 });
    const step = doc.nextWorkflowId!;
    doc = addStep(doc, "reaction", 40, 0);
    const [r, p] = kindInfo("reaction").inputs!.map((port) => port.id);
    doc = connect(connect(doc, { set: a }, step, r), { set: b }, step, p);
    const ran = runStep(doc, step, W);
    expect(ran.steps!.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "1 product in the reactants' numbering \u00b7 6 bond changes \u00b7 1 not mapped" });
    const changes = resultOf(ran, step, "changes")!;
    expect(changes.made).toMatchObject({ holds: "table" });
    expect(changes.table!.rows).toHaveLength(6);
    expect(resultOf(ran, step, "out")!.members?.length).toBe(1);
    // (each exit's set under the one before, as it has grown: clear of it, and no further down than the room between two sets -
    //  a set further down, not yet moved, no hindrance)
    const out = resultOf(ran, step, "out")!;
    const rest = resultOf(ran, step, "rest")!;
    expect(rest.members?.length).toBe(1);
    expect(rest.y1).toBeLessThan(out.y0);
    expect(rest.y1).toBeGreaterThan(out.y0 - 2 * BETWEEN);
    expect(changes.y1).toBeLessThan(rest.y0);
    expect(changes.y1).toBeGreaterThan(rest.y0 - 2 * BETWEEN);
  });
});

describe("Reaction's sets, named", () => {
  it("each exit's by its own name: what it maps, what it did not, and the bond changes", () => {
    const steps = [{ id: 3, kind: "reaction", by: "meno", x: 0, y: 0 }] as unknown as Parameters<typeof setName>[1];
    expect(["out", "rest", "changes"].map((exit) => setName({ made: { step: 3, exit, holds: "molecules" } }, steps))).toEqual(["Mapped products", "Not mapped", "Bond changes"]);
  });
});
