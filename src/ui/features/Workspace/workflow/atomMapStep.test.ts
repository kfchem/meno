import { describe, expect, it } from "vitest";
import type { Molecule } from "../../../../lib/chem/molecule";
import { dielsAlder, sn2 } from "../../../../lib/chem/reactionMap.fixtures";
import { setEntries, type SetEntry } from "./entries";
import { measuredSet } from "./structureSteps";
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

/** What every Atom map here is asked: each entry a side of its own, on both inputs, its bonds free to change - a reaction. */
const R = { moleculesAre: "each", referenceIs: "each", bonds: "change" };

const ok = (o: ReturnType<typeof runMenoPair>) => {
  if (!o.ok) throw new Error(o.said);
  return o;
};

describe("Atom map, as a step: a reaction's products onto its reactants", () => {
  const da = dielsAlder();
  const reactant = entryOf(da.reactants[0]);
  const product = entryOf(da.product, 0, { name: "cyclohexene" } as Partial<SetEntry>);

  it("writes the product in the reactants' numbering, every atom where it stands in the product, and its bond changes as a table", () => {
    const o = ok(runMenoPair("atom-map", { entries: [product], holds: "molecules" }, { entries: [reactant], holds: "molecules" }, R));
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
    expect(o.said).toBe("1 of 1 mapped");
    expect(o.aside).toEqual([]);
  });

  it("takes one reactant entry, its hydrogens there; sets aside a product that cannot map, saying why", () => {
    expect(runMenoPair("atom-map", { entries: [product], holds: "molecules" }, { entries: [reactant, reactant], holds: "molecules" }, R)).toEqual({
      ok: false,
      said: "Against the one reference, but 2 came into Reference: match them on a property, or take the reference as one side",
    });
    expect(runMenoPair("atom-map", { entries: [product], holds: "molecules" }, { entries: [{ ...reactant, skeleton: true }], holds: "molecules" }, R)).toMatchObject({ ok: false });
    // (a product of another formula; a skeleton)
    const fewer = entryOf({ atoms: da.product.atoms.slice(0, 15), bonds: da.product.bonds.filter((b) => b.a1 < 15 && b.a2 < 15) }, 1);
    const o = ok(runMenoPair("atom-map", { entries: [fewer, { ...product, compound: 2, skeleton: true }], holds: "molecules" }, { entries: [reactant], holds: "molecules" }, R));
    expect(o.kept).toEqual([]);
    expect(o.aside.map((e) => String(e.properties?.set_aside?.value))).toEqual([
      "It has 15 atoms and the reference 16: every atom must map one to one, hydrogens included.",
      "it has no hydrogens: every atom must map, hydrogens included",
    ]);
  });

  it("never passes on a product not finished as one that is; a finished one keeps its energy and imaginary frequencies, its calculation said not carried", () => {
    const unfinished = { ...product, energy: -5.5, failed: { kind: "not-converged", why: "100 cycles" } } as SetEntry;
    const o = ok(runMenoPair("atom-map", { entries: [unfinished], holds: "molecules" }, { entries: [reactant], holds: "molecules" }, R));
    expect(o.kept).toEqual([]);
    expect(o.aside.map((e) => [String(e.properties?.set_aside?.value), e.energy])).toEqual([["not finished: not converged", -5.5]]);
    const finished = { ...product, energy: -5.5, imaginary: [-412.3], calc: { program: "xtb", readers: ["xtb 1"] } } as unknown as SetEntry;
    const f = ok(runMenoPair("atom-map", { entries: [finished], holds: "molecules" }, { entries: [reactant], holds: "molecules" }, R));
    expect([f.kept[0].energy, f.kept[0].imaginary, f.kept[0].calc]).toEqual([-5.5, [-412.3], undefined]);
    expect(f.said).toBe("1 of 1 mapped, its calculation not carried");
  });

  it("names each mapped product apart - two of one name by their places - under a name of Meno's own, replacing and saying one the product carried; its vibrations kept", () => {
    const vib = { value: { table: { columns: [{ name: "frequency", unit: "cm-1" }], rows: [[120]] } }, unit: "none", status: "computed" };
    const twin = (compound: number) => ({ ...product, compound, properties: { "map.entry": { value: "old", unit: "none", status: "computed" }, vibrations: vib } }) as unknown as SetEntry;
    const o = ok(runMenoPair("atom-map", { entries: [twin(0), twin(1)], holds: "molecules" }, { entries: [reactant], holds: "molecules" }, R));
    expect(o.kept.map((e) => e.properties?.["map.entry"]?.value)).toEqual(["cyclohexene (a #1)", "cyclohexene (b #1)"]);
    expect(new Set(o.tables!.changes.rows.map((r) => r[0]))).toEqual(new Set(["cyclohexene (a #1)", "cyclohexene (b #1)"]));
    expect(o.kept[0].properties?.vibrations).toEqual(vib);
    expect(o.said).toBe("2 of 2 mapped, the map.entry 2 entries carried replaced");
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
    doc = addStep(doc, "atom-map", 40, 0, R);
    const [m, ref] = kindInfo("atom-map").inputs!.map((port) => port.id);
    doc = connect(connect(doc, { set: a }, step, ref), { set: b }, step, m);
    const ran = runStep(doc, step, W);
    expect(ran.steps!.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "1 of 2 mapped, 1 not mapped" });
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

describe("Atom map's sets, named", () => {
  it("each exit's by its own name: what it maps, what it did not, and the bond changes", () => {
    const steps = [{ id: 3, kind: "atom-map", by: "meno", x: 0, y: 0 }] as unknown as Parameters<typeof setName>[1];
    expect(["out", "rest", "changes"].map((exit) => setName({ made: { step: 3, exit, holds: "molecules" } }, steps))).toEqual(["Mapped", "Not mapped", "Bond changes"]);
  });
});

describe("Atom map's bond changes into Measure, on the page", () => {
  it("measures the bond the Diels-Alder forms, C1-C5, on the product mapped - its atoms read from the table as its columns count them", () => {
    const da = dielsAlder();
    const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
    const mol = (m: Molecule, x: number) => ({ at: { x, y: 0 }, atoms: m.atoms, bonds: m.bonds });
    let doc = addMolecule3d(emptyWorkspaceDocument(), mol(da.reactants[0], 0));
    doc = addMolecule3d(doc, mol(da.product, 20));
    const a = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -4, y0: -4, x1: 4, y1: 4 });
    const b = doc.nextWorkflowId!;
    doc = addSet(doc, { x0: 16, y0: -4, x1: 24, y1: 4 });
    const reaction = doc.nextWorkflowId!;
    doc = addStep(doc, "atom-map", 40, 0, R);
    doc = connect(connect(doc, { set: a }, reaction, "reference"), { set: b }, reaction, "molecules");
    const products = resultOf(doc, reaction, "out")!.id;
    const changes = resultOf(doc, reaction, "changes")!.id;
    const measure = doc.nextWorkflowId!;
    doc = addStep(doc, "measure", 80, 0, { from: "table", rows: "map.entry" });
    doc = connect(connect(doc, { set: products }, measure), { set: changes }, measure, "atoms");
    // (Measure run: the Atom map before it run first, as any step before one)
    const ran = runStep(doc, measure, W);
    expect(ran.steps!.find((s) => s.id === measure)!.ran).toMatchObject({ ok: true, said: "6 measurements on 1 entry" });
    const measured = resultOf(ran, measure, "out")!;
    const member = measured.members![0];
    const m = ran.molecules3d!.find((x) => "molecule" in member && x.id === member.molecule)!;
    // (C1 and C5 in the reactants' numbering are atoms 1 and 11; their distance in the product as it was drawn, by name)
    const p = (name: string) => da.product.atoms[da.productOrder.indexOf(name)];
    const truth = Math.hypot(p("C1").x - p("C5").x, p("C1").y - p("C5").y, p("C1").z - p("C5").z);
    const entry = setEntries([m], "molecules")[0];
    expect(entry.properties?.["distance 1-11"]?.value).toBeCloseTo(truth, 6);
    // (a column that does not say how it counts atoms, refused - never guessed)
    const unsaid = { ...resultOf(ran, reaction, "changes")!.table! };
    unsaid.columns = unsaid.columns.map((c) => (c.kind === "number" ? { name: c.name, kind: "number", unit: c.unit } : c));
    expect(measuredSet([entry], "molecules", "", { table: unsaid, rows: "" })).toEqual({ ok: false, said: "No column of the table says it holds atoms, and how it counts them" });
    // (atoms typed with a table wired in: measured as typed, the table said not read)
    const typed = runStep({ ...ran, steps: ran.steps!.map((s) => (s.id === measure ? { ...s, options: { from: "typed", measurements: "1-11" } } : s)) }, measure, W);
    expect(typed.steps!.find((s) => s.id === measure)!.ran).toMatchObject({ ok: true, said: "1 measurement on 1 entry \u00b7 the table wired into Atoms not read: atoms typed" });
  });
});


describe("Atom map, as a step: conformers onto their species", () => {
  /**
   * Propene in its plane: C1=C2 along x, C3 on C2; H4 on C1 cis to C3, H5
   * on C1 trans to it, H6 on C2, H7-H9 the methyl's. `swapped`: H4 and H5
   * each in the other's place - the same shape, numbered the other way
   * round, as a conformer search may give it.
   */
  const propene = (swapped = false, extra: Partial<SetEntry> = {}): SetEntry => {
    const h4 = [-0.55, 0.92, 0];
    const h5 = [-0.55, -0.92, 0];
    const xyz = [0, 0, 0, 1.34, 0, 0, 2.1, 1.25, 0, ...(swapped ? h5 : h4), ...(swapped ? h4 : h5), 1.9, -0.93, 0, 3.1, 1.0, 0.3, 1.8, 1.9, 0.85, 2.0, 1.85, -0.9];
    const els = ["C", "C", "C", "H", "H", "H", "H", "H", "H"];
    const bonds = [
      [0, 1, 2],
      [1, 2, 1],
      [0, 3, 1],
      [0, 4, 1],
      [1, 5, 1],
      [2, 6, 1],
      [2, 7, 1],
      [2, 8, 1],
    ].map(([a1, a2, order]) => ({ a1, a2, order }));
    return { compound: 0, number: 1, atoms: els.map((el, i) => ({ el, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] })), bonds, xyz, ...extra } as SetEntry;
  };
  const same = { moleculesAre: "each", referenceIs: "each", bonds: "same" };

  it("gives a conformer whose CH2 hydrogens stand each in the other's place in its species' numbering - the reference's places, atom for atom - and no bond changes", () => {
    const o = ok(runMenoPair("atom-map", { entries: [propene(true, { energy: -117.1 }), propene()], holds: "conformers" }, { entries: [propene()], holds: "molecules" }, same));
    expect(o.holds).toBe("conformers");
    expect(o.kept.map((e) => e.xyz)).toEqual([propene().xyz, propene().xyz]);
    // (its energy that of its geometry still)
    expect(o.kept[0].energy).toBe(-117.1);
    expect(o.tables!.changes.rows).toEqual([]);
    expect(o.said).toBe("2 of 2 mapped");
  });

  it("matches each conformer with its species on a property, saying what it cannot pair", () => {
    const tagged = (e: SetEntry, v: string): SetEntry => ({ ...e, properties: { ...e.properties, species: { value: v, unit: "none", status: "computed" } } });
    const o = ok(
      runMenoPair(
        "atom-map",
        { entries: [tagged(propene(true), "b"), tagged(propene(true), "d")], holds: "conformers" },
        { entries: [tagged(propene(), "b"), tagged(propene(true), "c")], holds: "molecules" },
        { ...same, reference: "property", property: "species" },
      ),
    );
    expect(o.kept[0].xyz).toEqual(propene().xyz);
    expect(o.aside.map((e) => e.properties?.set_aside?.value)).toEqual(["not paired: no entry of Reference has its species, d"]);
    expect(o.said).toBe("1 of 2 mapped, 1 not mapped");
  });

  it("with bonds to stay the same, sets a reaction's product aside, its bonds named - never passed on as mapped", () => {
    const da = dielsAlder();
    const o = ok(runMenoPair("atom-map", { entries: [entryOf(da.product)], holds: "molecules" }, { entries: [entryOf(da.reactants[0])], holds: "molecules" }, same));
    expect(o.kept).toEqual([]);
    expect(String(o.aside[0].properties?.set_aside?.value)).toMatch(/^The map has bonds .* formed, .* of another order, and its bonds are to stay the same\.$/);
  });
});

describe("Atom map, as a step: sides of several structures", () => {
  it("maps the SN2's products, CH3Cl and Br-, as one side together onto the reactants: one entry, in the places the map set them in", () => {
    const { reactant, product } = sn2();
    const br = product.atoms.findIndex((a) => a.el === "Br");
    const keep = (idx: number[]): Molecule => ({
      atoms: idx.map((i) => product.atoms[i]),
      bonds: product.bonds.filter((b) => idx.includes(b.a1) && idx.includes(b.a2)).map((b) => ({ ...b, a1: idx.indexOf(b.a1), a2: idx.indexOf(b.a2) })),
    });
    const parts = [entryOf(keep(product.atoms.map((_, i) => i).filter((i) => i !== br)), 0, { name: "chloromethane" } as Partial<SetEntry>), entryOf(keep([br]), 1, { name: "bromide" } as Partial<SetEntry>)];
    const o = ok(runMenoPair("atom-map", { entries: parts, holds: "molecules" }, { entries: [entryOf(reactant)], holds: "molecules" }, { ...R, moleculesAre: "together" }));
    expect(o.kept).toHaveLength(1);
    expect(o.kept[0].atoms.map((a) => a.el)).toEqual(reactant.atoms.map((a) => a.el));
    expect(o.tables!.changes.rows.map((r) => [r[0], r[1]])).toEqual([
      ["chloromethane + bromide", "formed"],
      ["chloromethane + bromide", "broken"],
    ]);
    expect(o.said).toBe("1 of 1 mapped");
  });

  it("asks how each input's entries are taken and whether bonds may change - none has a default - and says what was chosen: an input taken as one side, and the bonds", () => {
    const k = kindInfo("atom-map");
    expect(k.inputs?.map((p) => p.name)).toEqual(["Molecules", "Reference"]);
    expect([k.made, ...(k.others ?? []).map((x) => x.name)]).toEqual(["Mapped", "Not mapped", "Bond changes"]);
    expect(k.needs?.({})).toBe("Choose how the molecules are taken");
    expect(k.needs?.({ moleculesAre: "each" })).toBe("Choose how the reference is taken");
    expect(k.needs?.({ moleculesAre: "each", referenceIs: "each" })).toBe("Choose whether bonds may change");
    expect(k.needs?.({ moleculesAre: "together", referenceIs: "each", bonds: "change", reference: "property", property: "species" })).toBe(
      "Matched on a property takes each entry on its own: set both inputs to each its own",
    );
    expect(k.how?.({ moleculesAre: "each", referenceIs: "together", bonds: "change", maps: "first", reference: "one" })).toBe("reference as one side, bonds may change");
    expect(k.how?.({ moleculesAre: "each", referenceIs: "each", bonds: "same", maps: "every", reference: "property", property: "species" })).toBe(
      "bonds stay the same, every map, matched on species",
    );
  });
});
