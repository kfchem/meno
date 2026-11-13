import { describe, expect, it } from "vitest";
import type { Molecule } from "../../../../lib/chem/molecule";
import { dielsAlder, sn2 } from "../../../../lib/chem/reactionMap.fixtures";
import { calcRenumbered, keptRenumbered, setEntries, unlikeMade, type SetEntry } from "./entries";
import { atomMapPlan, measuredSet } from "./structureSteps";
import { kindInfo } from "./kinds";
import { runMeno, runMenoPair } from "./meno";
import { energiesFrom } from "./setTable";
import { convergedAt, convergedIn, convergedOf } from "./converged";
import type { Molecule3D } from "../store/types";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import { addSet, addStep, connect } from "./model";
import { resultOf } from "./flow";
import { resultsOf, runStep, type RunWith } from "./run";
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

  it("never passes on a product not finished as one that is; a finished one keeps its energy, its imaginary frequencies and what they are of, its results renumbered, what cannot be said not carried", () => {
    const unfinished = { ...product, energy: -5.5, failed: { kind: "not-converged", why: "100 cycles" } } as SetEntry;
    const o = ok(runMenoPair("atom-map", { entries: [unfinished], holds: "molecules" }, { entries: [reactant], holds: "molecules" }, R));
    expect(o.kept).toEqual([]);
    expect(o.aside.map((e) => [String(e.properties?.set_aside?.value), e.energy])).toEqual([["not finished: not converged", -5.5]]);
    const calc = { program: "xtb", version: "6.7.1", method: "GFN2-xTB", readers: ["xtb 1"], charge: 0, multiplicity: 1, imaginary: [-412.3] };
    // (a value of the molecule, one of each atom - atom i's, i / 10 - and one of a pair of atoms, 0 and 15)
    const dipole = { id: "dipole", group: "Dipole", label: "Dipole", on: "molecule", value: 1.2, quantity: "dipole" } as const;
    const charges = { id: "q", group: "Partial charges", label: "Mulliken", on: "atoms", values: product.atoms.map((_, i) => i / 10), quantity: "charge" } as const;
    const bondOrder = { id: "bo", group: "Bond orders", label: "Wiberg", on: "pairs", pairs: [[0, 15, 0.9]] } as const;
    const finished = { ...product, energy: -5.5, imaginary: [-412.3], calc: { ...calc, results: [dipole, charges, bondOrder], held: [0, 15] } } as unknown as SetEntry;
    const f = ok(runMenoPair("atom-map", { entries: [finished], holds: "molecules" }, { entries: [reactant], holds: "molecules" }, R));
    // (what the calculation was, kept, and its results - each atom's value at its atom, the pair's atoms and those held as numbered now: nothing said not carried)
    const order = f.kept[0].atoms.map((a) => da.product.atoms.findIndex((p) => p.x === a.x && p.y === a.y && p.z === a.z));
    expect(order.some((j, at) => j !== at)).toBe(true);
    const now = (a: number) => order.indexOf(a);
    expect([f.kept[0].energy, f.kept[0].imaginary, f.kept[0].calc]).toEqual([
      -5.5,
      [-412.3],
      { ...calc, results: [dipole, { ...charges, values: order.map((j) => j / 10) }, { ...bondOrder, pairs: [[now(0), now(15), 0.9]] }], held: [now(0), now(15)] },
    ]);
    expect(f.said).toBe("1 of 1 mapped");
    // (the output or the wavefunction it was read from, or a list whose rows name atoms, left behind - and said)
    const mappedWith = (c: object) => ok(runMenoPair("atom-map", { entries: [{ ...finished, calc: c } as unknown as SetEntry], holds: "molecules" }, { entries: [reactant], holds: "molecules" }, R));
    const modes = { id: "modes", group: "Vibrations", label: "Modes", on: "list", columns: [{ label: "Wavenumber" }], rows: [{ cells: [100], atoms: [0, 1] }] };
    for (const behind of [{ source: { name: "p.out", sha256: "ab" } }, { wavefunction: { name: "p.molden", sha256: "cd" } }, { results: [dipole, modes] }]) {
      const f2 = mappedWith({ ...calc, ...behind });
      expect([f2.kept[0].calc, f2.said]).toEqual(["results" in behind ? { ...calc, results: [dipole] } : calc, "1 of 1 mapped, part of its calculation not carried"]);
    }
  });

  it("carries a run's ending converged at a renumbered product's geometry - the same places - the atoms it held numbered as now; one of another geometry not", () => {
    const how = "optimisation with atoms held" as const;
    const held = { ...product, converged: convergedAt(how, product.xyz, [0, 15]) } as SetEntry;
    const [made] = ok(runMenoPair("atom-map", { entries: [held], holds: "molecules" }, { entries: [reactant], holds: "molecules" }, R)).kept;
    const order = made.atoms.map((a) => da.product.atoms.findIndex((p) => p.x === a.x && p.y === a.y && p.z === a.z));
    expect(order.some((j, at) => j !== at)).toBe(true);
    expect(made.converged).toEqual(convergedAt(how, made.xyz, [order.indexOf(0), order.indexOf(15)]));
    expect(convergedOf(made)).toEqual(made.converged);
    // (as a file gives it back)
    expect(convergedIn(JSON.parse(JSON.stringify(made.converged)))).toEqual(made.converged);
    const elsewhere = { ...product, converged: convergedAt("optimisation", product.xyz.map((v) => v + 0.1)) } as SetEntry;
    expect(ok(runMenoPair("atom-map", { entries: [elsewhere], holds: "molecules" }, { entries: [reactant], holds: "molecules" }, R)).kept[0].converged).toBeUndefined();
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

  it("keeps a compound's energies where only some of its conformers are renumbered: each still of the one calculation, written as one molecule, and an Energy window after it runs", () => {
    // (conformers as a search gives them: their energies of its calculation, and how they were made; a CIP label on C1=C2, bond 0)
    const calc = { readers: ["meno"], program: "RDKit", version: "2026.03.6", method: "MMFF94" };
    const keep = { drawnFrom: [1, 2, 3, null, null, null, null, null, null], drawnAs: "propene", made: { method: "ETKDG v3, MMFF94", how: [], energies: "MMFF94" }, stereo: { atoms: {}, bonds: { 0: "E" } } };
    const conformer = (swapped: boolean, energy: number, number: number) => propene(swapped, { energy, number, calc, keep } as unknown as Partial<SetEntry>);
    const o = ok(runMenoPair("atom-map", { entries: [conformer(false, -1.5, 1), conformer(true, -1.4, 2)], holds: "conformers" }, { entries: [propene()], holds: "molecules" }, same));
    expect(o.said).toBe("2 of 2 mapped");
    expect(o.kept.map((e) => [e.energy, e.calc, e.keep])).toEqual([
      [-1.5, calc, keep],
      [-1.4, calc, keep],
    ]);
    expect(unlikeMade(o.kept)).toBeNull();
    // (as the step writes them to the page: one molecule, its two energies, what worked them out said)
    const [m] = resultsOf(o, "atom-map").molecules;
    expect([m.energies, energiesFrom(m), m.made]).toEqual([[-1.5, -1.4], energiesFrom({ calc, energies: [-1.5], made: keep.made }), keep.made]);
    const window = runMeno("energy-window", setEntries([{ ...m, id: 1 } as Molecule3D], "conformers"), "conformers", { window: 3 });
    expect(window).toMatchObject({ ok: true });
  });

  it("renumbers what a renumbered conformer keeps with it: the drawing's atom each atom is, its labels, the atoms its calculation held", () => {
    // (H4 and H5 swapped: bond 2, C1-H4, now C1-H5, bond 3, and the other way round)
    const now = [0, 1, 2, 4, 3, 5, 6, 7, 8];
    const kept = { drawnFrom: [1, 2, 3, 4, 5, null, null, null, null], drawnAs: "d", made: { how: [] }, stereo: { atoms: { 3: "a" }, bonds: { 2: "b", 0: "E" }, shown: { atoms: [3], bonds: [2] } }, centres: [{ metal: 3, atoms: [0, 4] }] };
    expect(keptRenumbered(kept, now, now, [0, 1, 3, 2, 4, 5, 6, 7])).toEqual({
      drawnFrom: [1, 2, 3, 5, 4, null, null, null, null],
      drawnAs: "d",
      made: { how: [] },
      stereo: { atoms: { 4: "a" }, bonds: { 3: "b", 0: "E" }, shown: { atoms: [4], bonds: [3] } },
      centres: [{ metal: 4, atoms: [0, 3] }],
    });
    // (the swap its own inverse: `now` is the order too)
    expect(calcRenumbered({ readers: ["meno"], method: "GFN2-xTB", held: [3, 0], results: [], source: { name: "a.out", sha256: "ab" } } as never, now)).toEqual({
      calc: { readers: ["meno"], method: "GFN2-xTB", held: [4, 0] },
      leftBehind: true,
    });
    expect(calcRenumbered({ readers: ["meno"], held: [3] }, now)).toEqual({ calc: { readers: ["meno"], held: [4] }, leftBehind: false });
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
    // (matched on a property, together is one side for each value of it)
    expect(k.needs?.({ moleculesAre: "together", referenceIs: "together", bonds: "change", reference: "property", property: "" })).toBe("Name the property to pair them on");
    expect(k.needs?.({ moleculesAre: "together", referenceIs: "together", bonds: "change", reference: "property", property: "reaction" })).toBeUndefined();
    expect(k.how?.({ moleculesAre: "together", referenceIs: "together", bonds: "change", maps: "first", reference: "property", property: "reaction" })).toBe(
      "molecules as one side per reaction, reference as one side per reaction, bonds may change, matched on reaction",
    );
    expect(k.how?.({ moleculesAre: "each", referenceIs: "each", bonds: "change", maps: "first", reference: "order" })).toBe("bonds may change, in order");
    expect(k.how?.({ moleculesAre: "each", referenceIs: "together", bonds: "change", maps: "first", reference: "one" })).toBe("reference as one side, bonds may change");
    expect(k.how?.({ moleculesAre: "each", referenceIs: "each", bonds: "same", maps: "every", reference: "property", property: "species" })).toBe(
      "bonds stay the same, every map, matched on species",
    );
  });
});

describe("Atom map, as a step: one side per reaction, and sides in order", () => {
  const da = dielsAlder();
  const { reactant: sn2Reactant, product: sn2Product } = sn2();
  /** The atoms of a molecule at `idx`, as a molecule of its own (the bonds between them kept). */
  const part = (m: Molecule, idx: number[], charged?: string): Molecule => ({
    atoms: idx.map((i) => ({ ...m.atoms[i], ...(m.atoms[i].el === charged ? { charge: -1 } : {}) })),
    bonds: m.bonds.filter((b) => idx.includes(b.a1) && idx.includes(b.a2)).map((b) => ({ ...b, a1: idx.indexOf(b.a1), a2: idx.indexOf(b.a2) })),
  });
  const upTo = (n: number) => Array.from({ length: n }, (_, i) => i);
  const rest = (m: Molecule, n: number) => Array.from({ length: m.atoms.length - n }, (_, i) => n + i);
  const tagged = (e: SetEntry, reaction: string, name: string): SetEntry =>
    ({ ...e, name, properties: { ...e.properties, reaction: { value: reaction, unit: "none", status: "computed" } } }) as SetEntry;
  // (butadiene's atoms are the first ten of the stack, ethylene's the last six; CH3Br the atoms but Cl, chloride alone)
  const cl = sn2Reactant.atoms.findIndex((a) => a.el === "Cl");
  const br = sn2Product.atoms.findIndex((a) => a.el === "Br");
  const without = (m: Molecule, i: number) => m.atoms.map((_, k) => k).filter((k) => k !== i);
  const reactants = (charge?: string) => [
    tagged(entryOf(part(da.reactants[0], upTo(10))), "1", "butadiene"),
    tagged(entryOf(part(da.reactants[0], rest(da.reactants[0], 10))), "1", "ethylene"),
    tagged(entryOf(part(sn2Reactant, without(sn2Reactant, cl))), "2", "bromomethane"),
    tagged(entryOf(part(sn2Reactant, [cl], charge)), "2", "chloride"),
  ];
  const products = (charge?: string) => [
    tagged(entryOf(da.product), "1", "cyclohexene"),
    tagged(entryOf(part(sn2Product, without(sn2Product, br))), "2", "chloromethane"),
    tagged(entryOf(part(sn2Product, [br], charge)), "2", "bromide"),
  ];
  const together = { moleculesAre: "together", referenceIs: "together", bonds: "change", reference: "property", property: "reaction" };

  it("maps each reaction's products as one side onto its reactants as one side, matched on a property: two reactions in one set", () => {
    const [bd, eth, mebr, cl_] = reactants("Cl");
    const [cyc, mecl, br_] = products("Br");
    expect(atomMapPlan([cyc, mecl, br_], [bd, eth, mebr, cl_], together)).toEqual({
      groups: [
        { reference: [0, 1], sides: [[0]] },
        { reference: [2, 3], sides: [[1, 2]] },
      ],
      aside: [],
      sides: 2,
    });
    const o = ok(runMenoPair("atom-map", { entries: [cyc, mecl, br_], holds: "molecules" }, { entries: [bd, eth, mebr, cl_], holds: "molecules" }, together));
    // (the tags of the parts are not carried onto the side they make: said)
    expect(o.said).toBe("2 of 2 mapped, the parts' own values not carried");
    expect(o.kept.map((e) => e.atoms.length)).toEqual([16, 6]);
    expect(o.tables!.changes.rows.map((r) => r[0])).toContain("chloromethane + bromide");
    expect(o.tables!.changes.rows.map((r) => r[0])).toContain("cyclohexene");
  });

  it("sets aside a side whose value no reference has, or that has none, saying why", () => {
    const [bd, eth, mebr, cl_] = reactants("Cl");
    const [cyc, mecl, br_] = products("Br");
    const three = tagged(entryOf(da.product), "3", "orphan");
    const none = entryOf(da.product, 0, { name: "untagged" } as Partial<SetEntry>);
    const o = ok(runMenoPair("atom-map", { entries: [cyc, three, none, mecl, br_], holds: "molecules" }, { entries: [bd, eth, mebr, cl_], holds: "molecules" }, together));
    expect(o.said).toBe("2 of 4 mapped, 2 not mapped, the parts' own values not carried");
    expect(o.aside.map((e) => [e.name, e.properties?.set_aside?.value])).toEqual([
      ["orphan", "not paired: no reference with reaction = 3"],
      ["untagged", "not paired: it has no reaction"],
    ]);
  });

  it("maps a side only onto a reference of its own charge: chloride and bromomethane against chloromethane and bromide maps, bromide drawn neutral does not", () => {
    const refs = reactants("Cl");
    const ok1 = ok(runMenoPair("atom-map", { entries: products("Br").slice(1), holds: "molecules" }, { entries: refs.slice(2), holds: "molecules" }, together));
    expect(ok1.said).toBe("1 of 1 mapped, the parts' own values not carried");
    const o = ok(runMenoPair("atom-map", { entries: products().slice(1), holds: "molecules" }, { entries: refs.slice(2), holds: "molecules" }, together));
    expect(o.kept).toEqual([]);
    expect(o.aside.map((e) => e.properties?.set_aside?.value)).toEqual(["charge 0 here, -1 in the reference", "charge 0 here, -1 in the reference"]);
  });

  it("does not filter the reagents: one left in Reference makes its side unbalanced, refused with the mapper's words", () => {
    const [bd, eth] = reactants();
    const reagent = tagged(entryOf(part(sn2Reactant, without(sn2Reactant, cl))), "1", "reagent");
    const o = ok(runMenoPair("atom-map", { entries: [products()[0]], holds: "molecules" }, { entries: [bd, eth, reagent], holds: "molecules" }, together));
    expect(o.kept).toEqual([]);
    expect(String(o.aside[0].properties?.set_aside?.value)).toMatch(/^It has 16 atoms and the reference 21: every atom must map/);
  });

  it("takes the k-th side of Molecules onto the k-th of Reference, and refuses unequal counts saying both", () => {
    const order = { moleculesAre: "each", referenceIs: "each", bonds: "change", reference: "order" };
    const stack = entryOf(da.reactants[0]);
    const sn = entryOf(sn2Reactant);
    const dp = entryOf(da.product);
    const sp = entryOf(sn2Product);
    const o = ok(runMenoPair("atom-map", { entries: [dp, sp], holds: "molecules" }, { entries: [stack, sn], holds: "molecules" }, order));
    expect(o.said).toBe("2 of 2 mapped");
    expect(o.kept.map((e) => e.atoms.length)).toEqual([16, 6]);
    // (by place, never by which one fits: the other way round, neither maps)
    const swapped = ok(runMenoPair("atom-map", { entries: [sp, dp], holds: "molecules" }, { entries: [stack, sn], holds: "molecules" }, order));
    expect(swapped.kept).toEqual([]);
    expect(swapped.said).toBe("0 of 2 mapped, 2 not mapped");
    expect(runMenoPair("atom-map", { entries: [dp, sp], holds: "molecules" }, { entries: [stack, sn, stack], holds: "molecules" }, order)).toEqual({
      ok: false,
      said: "Molecules holds 2 and Reference 3: in order, each side is paired with the reference side in its place",
    });
  });

  it("offers the three ways to match: the one reference, in order, or on a property", () => {
    const against = kindInfo("atom-map").options!.find((o) => o.id === "reference")!;
    expect("choices" in against && against.choices.map((c) => c.value)).toEqual(["one", "order", "property"]);
  });

  it("refuses an empty Reference - a Filter may keep nothing - never crashing, with each way of matching and each side taking", () => {
    const [cyc] = products();
    const plan = (reference: string, referenceIs: string) => atomMapPlan([cyc], [], { moleculesAre: "together", referenceIs, bonds: "change", reference, property: "reaction" });
    expect(plan("one", "together")).toEqual({ refused: "Nothing comes into Reference" });
    expect(plan("one", "each")).toEqual({ refused: "Against the one reference, but 0 came into Reference: match them on a property, or take the reference as one side" });
    for (const referenceIs of ["each", "together"]) {
      expect(plan("order", referenceIs)).toEqual({ refused: "Nothing comes into Reference" });
      // (matched on a property: no reference has its value, so its side is not mapped, saying why)
      expect(plan("property", referenceIs)).toEqual({ groups: [], aside: [{ entry: 0, why: "not paired: no reference with reaction = 1" }], sides: 1 });
    }
  });

  it("refuses a value held by several entries of Reference, each its own: no product is paired with whichever came first", () => {
    const [bd, eth] = reactants();
    const [cyc] = products();
    const each = { moleculesAre: "each", referenceIs: "each", bonds: "change", reference: "property", property: "reaction" };
    const o = ok(runMenoPair("atom-map", { entries: [cyc], holds: "molecules" }, { entries: [bd, eth], holds: "molecules" }, each));
    expect(o.kept).toEqual([]);
    expect(o.aside.map((e) => e.properties?.set_aside?.value)).toEqual(["not paired: 2 entries of Reference have its reaction, 1"]);
  });

  it("takes together or each its own on either input alone, matched on a property: two entries of one value one side, or two sides", () => {
    const [bd, eth] = reactants();
    const [cyc, mecl, br_] = products();
    const [, , mebr, cl_] = reactants();
    const whole = tagged(entryOf(sn2Reactant), "2", "SN2 reactants");
    const wholeProduct = tagged(entryOf(sn2Product), "2", "SN2 products");
    const on = { bonds: "change", reference: "property", property: "reaction" };
    // (the products together onto the one reactant entry of their value; the reactants together onto the one product entry)
    const a = ok(runMenoPair("atom-map", { entries: [mecl, br_], holds: "molecules" }, { entries: [whole], holds: "molecules" }, { ...on, moleculesAre: "together", referenceIs: "each" }));
    expect(a.said).toBe("1 of 1 mapped, the parts' own values not carried");
    const b = ok(runMenoPair("atom-map", { entries: [wholeProduct], holds: "molecules" }, { entries: [mebr, cl_], holds: "molecules" }, { ...on, moleculesAre: "each", referenceIs: "together" }));
    expect(b.said).toBe("1 of 1 mapped");
    // (each its own on Molecules: two products of one reaction are two sides, each onto the reactants together)
    const c = ok(runMenoPair("atom-map", { entries: [cyc, tagged(entryOf(da.product), "1", "cyclohexene again")], holds: "molecules" }, { entries: [bd, eth], holds: "molecules" }, { ...on, moleculesAre: "each", referenceIs: "together" }));
    expect(c.said).toBe("2 of 2 mapped");
  });

  it("counts what is not mapped by sides: two entries that are one unmapped side say 1, not 2", () => {
    const o = ok(runMenoPair("atom-map", { entries: products().slice(1), holds: "molecules" }, { entries: [entryOf(da.reactants[0])], holds: "molecules" }, { moleculesAre: "together", referenceIs: "each", bonds: "change" }));
    expect(o.aside).toHaveLength(2);
    expect(o.said).toBe("0 of 1 mapped, 1 not mapped");
  });
});
