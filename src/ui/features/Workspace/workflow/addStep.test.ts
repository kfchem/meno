import { describe, expect, it } from "vitest";
import { geometryKey, type Property } from "../../../../lib/entry";
import { standardStateTerm } from "../../../../lib/nodes/standardState";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { setMolecules } from "./entries";
import { findSet, resultOf } from "./flow";
import { howOf, kindInfo, needsOf } from "./kinds";
import { addHow } from "./addStep";
import { countSaid } from "./entries";
import { addSet, addStep, connect } from "./model";
import { runStep, type RunWith } from "./run";
import { readWorkflow } from "./saved";
import { noting } from "../utils/readNotes";
import { SET_ASIDE } from "./structureSteps";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
const XYZ = [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0];

/** A thermal correction to G at the lower level, at a geometry's key (this water's, unless another is given). */
const gcorr = (value: number, geometry = geometryKey(XYZ)): Property => ({ value, unit: "Eh", at: { geometry, kelvin: 298.15, atm: 1 }, by: { program: "Gaussian", method: "wB97X-D", basis: "6-31G(d)", treatment: "quasi-RRHO" }, status: "computed" });

/** A water with an energy and the properties given. */
function water(energy: number, properties: Record<string, Property>, at = { x: 0, y: 0 }): Omit<Molecule3D, "id"> {
  return {
    at,
    atoms: [
      { el: "O", x: XYZ[0], y: XYZ[1], z: XYZ[2] },
      { el: "H", x: XYZ[3], y: XYZ[4], z: XYZ[5] },
      { el: "H", x: XYZ[6], y: XYZ[7], z: XYZ[8] },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    energies: [energy],
    properties: [properties],
  };
}

/** A page: `molecules` in a set (1), into an Add (2) with `options` - and a Number (its own id) into Add's Number, where `number` is given. */
function adding(molecules: Omit<Molecule3D, "id">[], options: Record<string, string | number>, number?: Record<string, string | number>): { doc: WorkspaceDocument; add: number } {
  let doc = emptyWorkspaceDocument();
  for (const m of molecules) doc = addMolecule3d(doc, m);
  doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
  doc = addStep(doc, "add", 10, 0, options);
  const add = doc.steps![0].id;
  doc = connect(doc, { set: 1 }, add, "in");
  if (number) {
    doc = addStep(doc, "number", 0, 10, number);
    const n = doc.steps![doc.steps!.length - 1].id;
    doc = connect(doc, { set: resultOf(doc, n)!.id }, add, "number");
  }
  return { doc, add };
}

const ran = (doc: WorkspaceDocument, id: number) => doc.steps!.find((s) => s.id === id)!.ran;
const out = (doc: WorkspaceDocument, id: number, exit = "out") => setMolecules(doc, resultOf(doc, id, exit)!);

describe("a Number step", () => {
  it("gives the standard-state term at its temperature, by its formula, in a set of its own", () => {
    let doc = addStep(emptyWorkspaceDocument(), "number", 0, 0, { temperature: 298.15 });
    const id = doc.steps![0].id;
    doc = runStep(doc, id, W);
    expect(ran(doc, id)).toMatchObject({ ok: true, said: "1.89 kcal/mol" });
    const n = findSet(doc, resultOf(doc, id)!.id)!.number!;
    expect(n.value).toBeCloseTo(standardStateTerm(298.15)!, 12);
    expect(n.unit).toBe("kcal/mol");
    expect(n.by?.treatment).toMatch(/^standard state 1 atm to 1 mol\/L at 298\.15 K: R T ln\(R T c°\/p°\)/);
  });

  it("is kept in the workspace's file, and reads back as its step's, with its number and what worked it out", () => {
    let doc = addStep(emptyWorkspaceDocument(), "number", 0, 0, { temperature: 298.15 });
    const id = doc.steps![0].id;
    doc = runStep(doc, id, W);
    const read = noting(() => readWorkflow(JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires })))!);
    expect(read.left).toEqual({});
    const set = read.value.sets.find((b) => b.made?.step === id)!;
    expect([set.made?.holds, set.number]).toEqual(["number", findSet(doc, resultOf(doc, id)!.id)!.number]);
  });

  it("gives a number typed with its unit, and says what it needs where it cannot", () => {
    let doc = addStep(emptyWorkspaceDocument(), "number", 0, 0, { what: "typed", value: 2.5, unit: "kJ/mol" });
    const id = doc.steps![0].id;
    doc = runStep(doc, id, W);
    expect(findSet(doc, resultOf(doc, id)!.id)!.number).toMatchObject({ value: 2.5, unit: "kJ/mol" });
    expect(needsOf({ kind: "number", options: { what: "typed", unit: "furlongs" } })).toBe("furlongs is no unit Meno knows");
    // (its card says what was chosen - the default temperature unsaid - and its set, the number as the chips write one)
    const info = kindInfo("number");
    expect([howOf(info.options!, {}, info.how), howOf(info.options!, { temperature: 310 }, info.how), howOf(info.options!, { what: "typed", value: 1.894, unit: "kcal/mol" }, info.how)]).toEqual(["standard state", "standard state at 310 K", "1.89 kcal/mol"]);
    expect(countSaid({ number: { value: 1.8943, unit: "kcal/mol" } }, { holds: "number", entries: 1, compounds: 1 })).toBe("1.89 kcal/mol");
    expect(countSaid({ number: { value: 2.5, unit: "kJ/mol" } }, { holds: "number", entries: 1, compounds: 1 })).toBe("2.5 kJ/mol");
    expect(needsOf({ kind: "number", options: { temperature: 0 } })).toBe("The temperature must be above 0 K");
  });
});

describe("an Add step", () => {
  it("writes on each entry the sum of its energy, its thermal correction and the Number wired in - G at the higher level [F42]", () => {
    const { doc, add } = adding([water(-76.4, { "thermo.g-correction": gcorr(0.0012) })], { parts: "energy; thermo.g-correction", as: "G" }, { temperature: 298.15 });
    const done = runStep(doc, add, W);
    expect(ran(done, add)).toMatchObject({ ok: true, said: "1 of 1 entry given G" });
    const g = out(done, add)[0].properties![0].G;
    expect(g.value as number).toBeCloseTo(-76.4 + 0.0012 + standardStateTerm(298.15)! / 627.509474, 9);
    expect(g.parts?.map((p) => p.property)).toEqual(["energy", "thermo.g-correction", "standard state"]);
    expect(g.at).toMatchObject({ geometry: geometryKey(XYZ), kelvin: 298.15, atm: 1 });
  });

  it("runs with nothing wired into Number, and sets aside one whose part is of another geometry, saying why on it", () => {
    const { doc, add } = adding([water(-76.4, { "thermo.g-correction": gcorr(0.0012) }), water(-76.3, { "thermo.g-correction": gcorr(0.0011, "elsewhere") }, { x: 3, y: 0 })], { parts: "energy; thermo.g-correction", as: "G" });
    const done = runStep(doc, add, W);
    expect(ran(done, add)?.said).toBe("1 of 2 entries given G · rest 1 (1: its thermo.g-correction was worked out at another geometry than its own)");
    expect(out(done, add, "rest")[0].properties![0][SET_ASIDE]?.value).toBe("its thermo.g-correction was worked out at another geometry than its own");
  });

  it("never sums an entry that is no result - not converged - set aside saying so, counted on the line", () => {
    const failed = { ...water(-76.5, { "thermo.g-correction": gcorr(0.0012) }), failed: [{ kind: "not-converged" as const, why: "stopped at 200 cycles" }] };
    const { doc, add } = adding([water(-76.4, { "thermo.g-correction": gcorr(0.0012) }), { ...failed, at: { x: 3, y: 0 } }], { parts: "energy; thermo.g-correction", as: "G" });
    const done = runStep(doc, add, W);
    expect(ran(done, add)?.said).toBe("1 of 2 entries given G · rest 1 (1: not added: not converged)");
    expect(out(done, add, "rest")[0].properties![0].G).toBeUndefined();
  });

  it("never writes the sum under a name Meno gives an entry's own values", () => {
    expect(needsOf({ kind: "add", options: { parts: "energy; thermo.g-correction", as: "thermo.free-energy" } })).toBe('"thermo.free-energy" is a name Meno gives an entry\'s own values: write the sum under another name');
  });

  it("says on its card what it adds, and what it still needs", () => {
    const info = kindInfo("add");
    expect(howOf(info.options!, { parts: "energy; thermo.g-correction", as: "G-DFT" }, info.how)).toBe("G-DFT = energy + thermo.g-correction");
    expect(addHow({ parts: "energy; thermo.g-correction", as: "G-DFT" }, true)).toBe("G-DFT = energy + thermo.g-correction + number");
    expect(needsOf({ kind: "add", options: {} })).toBe("Name the properties to add");
    expect(needsOf({ kind: "add", options: { parts: "energy" } })).toBe("Name what the sum is written as");
    expect(info.inputs?.map((p) => [p.name, p.optional ?? false])).toEqual([
      ["Molecules", false],
      ["Number", true],
    ]);
  });
});
