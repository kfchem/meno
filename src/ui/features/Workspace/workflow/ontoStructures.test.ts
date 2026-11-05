import { describe, expect, it } from "vitest";
import { geometryKey, type Property } from "../../../../lib/entry";
import { boltzmann } from "../../../../lib/boltzmann";
import { factor } from "../../../../lib/units";
import type { Model } from "../store/types";
import { setMembers, structureLineage, type DrawnEntry, type SetEntry } from "./entries";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { resultOf } from "./flow";
import { addSet, addStep, connect } from "./model";
import { runStep, type RunWith } from "./run";
import { IN_3D, NO_3D, ontoStructures } from "./ontoStructures";

// 3D results onto structures (docs/WORKFLOWS.md, *3D results onto structures*): each structure drawn given what the 3D set
// holds made of it, by its lasting id alone.

const KCAL = factor("Eh", "kcal/mol");
const EMPTY: Model = { atoms: [], bonds: [] };

/** A structure drawn, at `place`, its lasting id `id` (none where not given). */
const row = (place: number, id?: string): DrawnEntry => ({ place, drawn: EMPTY, ...(id ? { record: { id, of: `of-${id}` } } : {}) });

/** A conformer `number` of compound `compound`, made of the structure `of`, its elements `els`, `kcal` above -100 Eh. */
function conformer(of: string, compound: number, number: number, els: string[], kcal: number, extra: Partial<SetEntry> = {}): SetEntry {
  // (a free energy given: at this conformer's own geometry)
  const xyz = els.flatMap((_, i) => [i, number, 0]);
  const free = extra.properties?.["thermo.free-energy"];
  const properties = free ? { properties: { "thermo.free-energy": { ...free, at: { ...free.at!, geometry: geometryKey(xyz) } } } } : {};
  return {
    compound,
    number,
    atoms: els.map((el, i) => ({ el, x: i, y: number, z: 0 })) as SetEntry["atoms"],
    bonds: [],
    xyz: els.flatMap((_, i) => [i, number, 0]),
    energy: -100 + kcal / KCAL,
    madeOf: [structureLineage(of)],
    calc: { readers: [], program: "xtb", method: "GFN2-xTB" } as SetEntry["calc"],
    ...extra,
    ...properties,
  };
}
/** A free energy, as a Frequencies step gives one. */
const g = (kcal: number, kelvin = 298.15): { properties: Record<string, Property> } => ({
  properties: { "thermo.free-energy": { value: -100 + kcal / KCAL, unit: "Eh", status: "computed", at: { geometry: "", kelvin }, by: { program: "xtb", method: "GFN2-xTB" } } },
});

const C3H8O = ["C", "C", "C", "O", "H", "H", "H", "H", "H", "H", "H", "H"];
const C2H6O = ["C", "C", "O", "H", "H", "H", "H", "H", "H"];

const valueOf = (out: ReturnType<typeof ontoStructures>, k: number, name: string) => (out.ok ? out.kept[k].record?.properties?.[name] : undefined);

describe("3D results onto structures", () => {
  it("gives each structure its conformers in the set, by its lasting id - how many, its lowest E, and its state - the structures as they came", () => {
    const rows = [row(0, "a"), row(1, "b")];
    const out = ontoStructures(rows, [conformer("a", 0, 1, C3H8O, 1), conformer("a", 0, 2, C3H8O, 0), conformer("b", 1, 1, C3H8O, 0.5)], 298.15);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.kept.map((r) => r.place)).toEqual([0, 1]);
    expect(out.aside).toEqual([]);
    expect([valueOf(out, 0, IN_3D.conformers)?.value, valueOf(out, 1, IN_3D.conformers)?.value]).toEqual([2, 1]);
    expect(valueOf(out, 0, IN_3D.state)?.value).toBe("finished");
    // (its lowest, as that conformer's energy is: in hartrees, by what worked it out)
    expect(valueOf(out, 0, IN_3D.eMin)).toMatchObject({ value: -100, unit: "Eh", status: "computed", by: { program: "xtb", method: "GFN2-xTB" } });
    // (what the record said before is kept)
    expect(out.kept[0].record).toMatchObject({ id: "a", of: "of-a" });
  });

  it("shares among the structures of one formula and charge alone, each conformer weighed as Populations weighs it - never across formulas", () => {
    // (two isomers, C3H8O, and ethanol, C2H6O: each formula's shares its own)
    const rows = [row(0, "a"), row(1, "b"), row(2, "c")];
    const entries = [conformer("a", 0, 1, C3H8O, 0), conformer("a", 0, 2, C3H8O, 1), conformer("b", 1, 1, C3H8O, 0.5), conformer("c", 2, 1, C2H6O, 30)];
    const out = ontoStructures(rows, entries, 298.15);
    const w = boltzmann([0, 1, 0.5].map((k) => -100 + k / KCAL), 298.15);
    expect(valueOf(out, 0, IN_3D.share)?.value).toBeCloseTo(w[0] + w[1], 12);
    expect(valueOf(out, 1, IN_3D.share)?.value).toBeCloseTo(w[2], 12);
    // (ethanol, alone in its formula, all of its own: never weighed against the others, 30 kcal/mol up or not)
    expect(valueOf(out, 2, IN_3D.share)?.value).toBe(1);
    expect(valueOf(out, 0, IN_3D.share)).toMatchObject({ ensemble: { of: 3 } });
    expect(out.ok && out.said).toMatch(/shares at 298.15 K among the isomers of each formula \(2 formulas\), from electronic energies/);
  });

  it("weighs each conformer by its degeneracy, where each has one, and by G where each has one alike", () => {
    const rows = [row(0, "a"), row(1, "b")];
    const deg = ontoStructures(rows, [conformer("a", 0, 1, C3H8O, 0, { degeneracy: 1 }), conformer("b", 1, 1, C3H8O, 0, { degeneracy: 3 })], 298.15);
    expect(valueOf(deg, 1, IN_3D.share)?.value).toBeCloseTo(0.75, 12);
    // (by G: the electronic energies one way, the free energies the other)
    const free = ontoStructures(rows, [conformer("a", 0, 1, C3H8O, 0, g(2)), conformer("b", 1, 1, C3H8O, 2, g(0))], 298.15);
    expect(valueOf(free, 1, IN_3D.share)?.value).toBeGreaterThan(0.9);
    expect(free.ok && free.said).toMatch(/from free energies/);
  });

  it("gives G min where each finished conformer has a G worked out alike - else why not, never a number", () => {
    const rows = [row(0, "a"), row(1, "b"), row(2, "c")];
    const out = ontoStructures(
      rows,
      [
        conformer("a", 0, 1, C3H8O, 0, g(3)),
        conformer("a", 0, 2, C3H8O, 1, g(2)),
        conformer("b", 1, 1, C3H8O, 0, g(1)),
        conformer("b", 1, 2, C3H8O, 1),
        conformer("c", 2, 1, C2H6O, 0, g(1)),
        conformer("c", 2, 2, C2H6O, 1, g(1, 400)),
      ],
      298.15,
    );
    expect(valueOf(out, 0, IN_3D.gMin)).toMatchObject({ value: -100 + 2 / KCAL, unit: "Eh", status: "computed" });
    expect(valueOf(out, 1, IN_3D.gMin)).toMatchObject({ status: { failed: "its conformer #2 has no free energy" } });
    expect(valueOf(out, 2, IN_3D.gMin)?.status).toMatchObject({ failed: expect.stringMatching(/^its conformers' free energies differ in /) });
  });

  it("gives E min of the finished alone, where they come from one calculation; and says how many did not finish", () => {
    const rows = [row(0, "a"), row(1, "b"), row(2, "c")];
    const out = ontoStructures(
      rows,
      [
        conformer("a", 0, 1, C3H8O, -5, { failed: { kind: "error", why: "SCF did not converge" } as SetEntry["failed"] }),
        conformer("a", 0, 2, C3H8O, 0),
        conformer("b", 1, 1, C3H8O, 0, { failed: { kind: "error", why: "x" } as SetEntry["failed"] }),
        conformer("c", 2, 1, C2H6O, 0),
        conformer("c", 2, 2, C2H6O, 1, { calc: { readers: [], program: "orca", method: "r2SCAN-3c" } as SetEntry["calc"] }),
      ],
      298.15,
    );
    expect(valueOf(out, 0, IN_3D.state)?.value).toBe("1 of 2 conformers not finished");
    expect(valueOf(out, 0, IN_3D.eMin)?.value).toBe(-100);
    // (none finished: no E, no share - said in its place)
    expect(valueOf(out, 1, IN_3D.state)?.value).toMatch(/^none of its 1 conformer finished: /);
    expect(valueOf(out, 1, IN_3D.eMin)).toBeUndefined();
    expect(valueOf(out, 1, IN_3D.share)).toMatchObject({ status: { notApplicable: "none of its conformers finished" } });
    expect(valueOf(out, 2, IN_3D.eMin)?.status).toMatchObject({ failed: expect.stringMatching(/^its conformers' energies come from different calculations/) });
  });

  it("refuses shares where a conformer of the isomers is no minimum, naming it", () => {
    const out = ontoStructures([row(0, "a"), row(1, "b")], [conformer("a", 0, 1, C3H8O, 0), conformer("b", 1, 1, C3H8O, 0, { imaginary: [-120] })], 298.15);
    expect(valueOf(out, 0, IN_3D.share)?.status).toMatchObject({ failed: expect.stringMatching(/no minimum/) });
    expect(valueOf(out, 1, IN_3D.share)?.status).toMatchObject({ failed: expect.stringMatching(/no minimum/) });
  });

  it("gives nothing to a structure with no lasting id, nor to two that share one - and counts the conformers made of none of them", () => {
    const rows = [row(0), row(1, "d"), row(2, "d"), row(3, "e")];
    const out = ontoStructures(rows, [conformer("d", 0, 1, C3H8O, 0), conformer("x", 1, 1, C3H8O, 0)], 298.15);
    expect(valueOf(out, 0, IN_3D.state)).toMatchObject({ status: { notApplicable: "it has no lasting id to be found by" } });
    expect(valueOf(out, 1, IN_3D.state)).toMatchObject({ status: { notApplicable: "its lasting id is another structure's here too (structure 3)" } });
    expect(valueOf(out, 1, IN_3D.conformers)).toBeUndefined();
    // (one with none in the set: none, said so - its share not 0, but not applicable)
    expect(valueOf(out, 3, IN_3D.state)?.value).toBe(NO_3D);
    expect(valueOf(out, 3, IN_3D.conformers)?.value).toBe(0);
    expect(valueOf(out, 3, IN_3D.share)).toMatchObject({ status: { notApplicable: NO_3D } });
    expect(out.ok && out.said).toMatch(/0 of 4 structures with 3D results · 2 conformers made of none of them · 2 structures sharing a lasting id given nothing$/);
  });

  it("refuses a temperature at or below 0 K, and nothing come in", () => {
    expect(ontoStructures([row(0, "a")], [], 0)).toEqual({ ok: false, said: "The temperature must be above 0 K" });
    expect(ontoStructures([], [], 298.15)).toEqual({ ok: false, said: "Nothing comes into Structures" });
  });

  it("runs on the structures wired into Structures and the 3D set wired into 3D results, each structure found by its set's lasting id", () => {
    // (two chains the chemist drew, in a set; and a molecule in 3D made of the first, in a set of its own)
    let doc: WorkspaceDocument = {
      ...emptyWorkspaceDocument(),
      model: {
        atoms: [0, 4].flatMap((y, k) => [
          { id: 1 + 2 * k, x: 0, y, r: 0.9, el: "C" },
          { id: 2 + 2 * k, x: 1.3, y, r: 0.9, el: k ? "N" : "O" },
        ]),
        bonds: [0, 1].map((k) => ({ id: 10 + k, a: 1 + 2 * k, b: 2 + 2 * k, order: 1 as const })),
      },
      nextId: 100,
    };
    doc = addSet(doc, { x0: -2, y0: -2, x1: 4, y1: 6 });
    const structures = doc.sets![0];
    const [first] = setMembers(doc, structures).records.map((r) => r!.id!);
    const molecule: Omit<Molecule3D, "id"> = {
      atoms: [
        { el: "C", x: 0, y: 0, z: 0 },
        { el: "O", x: 1.4, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      at: { x: 40, y: 0 },
      energies: [-115.1],
      madeOf: [structureLineage(first)],
    };
    doc = addMolecule3d(doc, molecule);
    doc = addSet(doc, { x0: 30, y0: -10, x1: 50, y1: 10 });
    const results = doc.sets![1];
    doc = addStep(doc, "onto-structures", 10, 20);
    const step = doc.steps![0].id;
    doc = connect(doc, { set: structures.id }, step, "structures");
    doc = connect(doc, { set: results.id }, step, "results");
    const w: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
    doc = runStep(doc, step, w);
    expect(doc.steps![0].ran).toMatchObject({ ok: true, said: expect.stringMatching(/^1 of 2 structures with 3D results/) });
    const out = setMembers(doc, resultOf(doc, step)!).records;
    expect(out.map((r) => r?.properties?.[IN_3D.state]?.value)).toEqual(["finished", NO_3D]);
    expect(out[0]?.properties?.[IN_3D.eMin]?.value).toBe(-115.1);
    expect(out[0]?.properties?.[IN_3D.share]?.value).toBe(1);
  });
});
