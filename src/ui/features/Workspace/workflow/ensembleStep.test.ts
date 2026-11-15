import { describe, expect, it } from "vitest";
import { geometryKey, type Property } from "../../../../lib/entry";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { setMolecules } from "./entries";
import { resultOf } from "./flow";
import { howOf, kindInfo, needsOf } from "./kinds";
import { addSet, addStep, connect } from "./model";
import { runStep, type RunWith } from "./run";
import { SET_ASIDE } from "./structureSteps";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
const frameOf = (k: number) => [0, 0, 0, 0.96 + k / 100, 0, 0, -0.24, 0.93, 0];
/** A free energy of a frame's geometry, in kcal/mol, at 298.15 K. */
const g = (value: number, k: number): Property => ({ value, unit: "kcal/mol", at: { geometry: geometryKey(frameOf(k)), kelvin: 298.15, atm: 1 }, by: { program: "P", method: "M" }, status: "computed" });

/** A conformer set of water, its frames' free energies as given. */
function waters(gs: number[], extra: Partial<Molecule3D> = {}): Omit<Molecule3D, "id"> {
  const xyz = frameOf(0);
  return {
    at: { x: 0, y: 0 },
    atoms: [
      { el: "O", x: xyz[0], y: xyz[1], z: xyz[2] },
      { el: "H", x: xyz[3], y: xyz[4], z: xyz[5] },
      { el: "H", x: xyz[6], y: xyz[7], z: xyz[8] },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    conformerSet: true,
    frames: gs.slice(1).map((_, k) => frameOf(k + 1)),
    energies: gs.map(() => -76.4),
    properties: gs.map((v, k) => ({ G: g(v, k) })),
    ...extra,
  };
}

function ensembled(molecules: Omit<Molecule3D, "id">[], options: Record<string, string>): WorkspaceDocument {
  let doc = emptyWorkspaceDocument();
  for (const m of molecules) doc = addMolecule3d(doc, m);
  doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
  doc = addStep(doc, "ensemble", 10, 0, options);
  return runStep(connect(doc, { set: 1 }, 2), 2, W);
}
const ran = (doc: WorkspaceDocument) => doc.steps!.find((s) => s.id === 2)!.ran;
const out = (doc: WorkspaceDocument, exit = "out") => setMolecules(doc, resultOf(doc, 2, exit)!);

describe("an Ensemble energy step", () => {
  it("writes each group's ensemble free energy on its lowest conformer, the others in the rest saying whose ensemble they are in", () => {
    // (G 1 and 0 kcal/mol at 298.15 K: -RT ln(1 + e^(-1/RT)) = -0.1005324 kcal/mol below the lowest)
    const doc = ensembled([waters([1, 0])], { property: "G", as: "G-ens" });
    expect(ran(doc)).toMatchObject({ ok: true, said: "1 ensemble from 2 entries · rest 1 (1: in an ensemble)" });
    const [kept] = out(doc);
    expect(kept.numbers).toEqual([2]);
    const ens = kept.properties![0]["G-ens"];
    expect(ens.value as number).toBeCloseTo(-0.1005324, 6);
    expect(ens.ensemble).toEqual({ of: 2 });
    expect(out(doc, "rest")[0].properties![0][SET_ASIDE]?.value).toBe("in the ensemble of a #2");
  });

  it("never counts a conformer that is no result: not converged, set aside saying so", () => {
    const doc = ensembled([waters([1, 0, 0.5], { failed: [null, { kind: "not-converged", why: "stopped" }, null] })], { property: "G", as: "G-ens" });
    expect(ran(doc)?.said).toBe("1 ensemble from 3 entries · rest 2 (1: in an ensemble; 1: not counted: not converged)");
    expect(out(doc)[0].properties![0]["G-ens"].ensemble).toEqual({ of: 2 });
  });

  it("says on its card what it takes, and what it still needs", () => {
    const info = kindInfo("ensemble");
    expect(howOf(info.options!, { property: "G", as: "G-ens" }, info.how)).toBe("G-ens = ensemble of G in each group");
    expect(needsOf({ kind: "ensemble", options: {} })).toBe("Name the value to take the ensemble of");
    expect(needsOf({ kind: "ensemble", options: { property: "G" } })).toBe("Name what the ensemble's value is written as");
  });
});
