import { describe, expect, it } from "vitest";
import type { ReaderOutput } from "../../../../lib/calc/output";
import { propertyIn } from "../../../../lib/entry";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import { setMolecules } from "./entries";
import { resultOf } from "./flow";
import { addSet, addStep, connect } from "./model";
import { isFailure, workedOf } from "./programs";
import { resultsOf, runStep, type RunWith, type Worked } from "./run";
import type { SetEntry } from "./entries";

/** Water, as a step's entry. */
const water = (): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz: [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0],
  }) as unknown as SetEntry;

const reading = (id: string, value: number | string, measure: Record<string, unknown> = { quantity: "energy" }) => ({ id, on: "molecule", group: "Thermochemistry", label: id, value, ...measure });

const worked = (w: Worked | ReturnType<typeof workedOf>): Worked => {
  if (isFailure(w)) throw new Error(w.why);
  return w as Worked;
};

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

describe("the symmetry a free energy was worked out with, from Frequencies through Energy to Add", () => {
  it("goes with its G correction: carried by the single point, copied into the sum's part", () => {
    // (Optimise -> Frequencies at GFN2-xTB, its box saying c2v and 2)
    const freqOut = {
      schema: 1,
      program: "xtb",
      method: "GFN2-xTB",
      solvation: "none",
      atoms: ["O", "H", "H"],
      frames: [water().xyz],
      energies: [-5.07],
      optimised: true,
      results: [
        reading("thermo.free-energy", -5.05),
        reading("thermo.g-correction", 0.02),
        reading("thermo.temperature", 298.15, { unit: "K" }),
        reading("thermo.treatment", "rotor cutoff 50 cm-1, imag. cutoff -20 cm-1, scaling factor 1"),
        reading("thermo.point-group", "c2v", {}),
        reading("thermo.symmetry-number", 2, { unit: "none" }),
      ],
    } as unknown as ReaderOutput;
    const f = worked(workedOf("frequencies", water(), freqOut, ["xtb 6.7.1"]));
    // (-> Energy at DFT: its single point carries the frequencies' G correction, with its sigma)
    const spOut = { schema: 1, program: "ORCA", method: "B3LYP", basis: "def2-TZVP", solvation: "none", atoms: ["O", "H", "H"], frames: [f.xyz], energies: [-76.4] } as unknown as ReaderOutput;
    const sp = worked(workedOf("energy", f, spOut, ["cclib 1.9rc1"]));
    // (its point group as Meno writes one, whatever case it was printed in: results `symmetryText`)
    expect(sp.properties?.["thermo.g-correction"]?.by).toMatchObject({ method: "GFN2-xTB", pointGroup: "C2v", symmetryNumber: 2 });
    // (-> Add: energy + thermo.g-correction, each part as it was - its sigma in its by)
    const [m] = resultsOf({ ok: true, holds: "molecules", kept: [sp], aside: [], said: "" }, "energy").molecules;
    let doc = addMolecule3d(emptyWorkspaceDocument(), { ...m, at: { x: 0, y: 0 } } as never);
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    doc = addStep(doc, "add", 10, 0, { parts: "energy; thermo.g-correction", as: "G" });
    const add = doc.steps![0].id;
    doc = connect(doc, { set: 1 }, add, "in");
    const done = runStep(doc, add, W);
    const g = setMolecules(done, resultOf(done, add)!)[0].properties![0].G;
    expect(g.value as number).toBeCloseTo(-76.4 + 0.02, 9);
    const correction = g.parts?.find((p) => p.property === "thermo.g-correction");
    expect(correction?.by).toMatchObject({ method: "GFN2-xTB", pointGroup: "C2v", symmetryNumber: 2 });
    // (the electronic energy's part has none: it counts no rotation)
    expect(g.parts?.find((p) => p.property === "energy")?.by).not.toHaveProperty("symmetryNumber");
    // (and through the workspace's file and back)
    const back = propertyIn(JSON.parse(JSON.stringify(g)));
    expect(back?.parts?.find((p) => p.property === "thermo.g-correction")?.by).toMatchObject({ pointGroup: "C2v", symmetryNumber: 2 });
  });
});
