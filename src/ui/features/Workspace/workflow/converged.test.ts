import { describe, expect, it } from "vitest";
import type { ReaderOutput } from "../../../../lib/calc/output";
import { geometryKey } from "../../../../lib/entry";
import { entryOfSet, REFINED_SAID, setEntries, shadowedIn, type SetEntry } from "./entries";
import { CONVERGED_HOW, convergedAt, convergedIn, convergedOf } from "./converged";
import { framesMolecule } from "./setTable";
import { readCarried3D } from "../utils/copyPaste";
import type { Molecule3D } from "../store/types";
import { runMeno } from "./meno";
import { isFailure, workedOf } from "./programs";
import { resultsOf, type Worked } from "./run";

/** Water, as a step's entry, at `xyz`. */
const water = (xyz = [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0], extra: Partial<SetEntry> = {}): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz,
    ...extra,
  }) as unknown as SetEntry;

const MIN = [0, 0, 0, 0.97, 0, 0, -0.25, 0.94, 0];
/** What a reader gave back of a job on water: its geometries, the last its own, and whether it says it optimised them to their end. */
const output = (frames: readonly (readonly number[])[], more: Partial<ReaderOutput> = {}): ReaderOutput =>
  ({ schema: 1, program: "ORCA", method: "GFN2-xTB", atoms: ["O", "H", "H"], frames, energies: frames.map((_, k) => -5.07 - k * 0.001), ...more }) as unknown as ReaderOutput;

const worked = (w: Worked | ReturnType<typeof workedOf>): Worked => {
  if (isFailure(w)) throw new Error(w.why);
  return w as Worked;
};
/** The converged property of an entry, as its record shows it. */
const said = (e: SetEntry) => entryOfSet(e, "x").properties.converged?.value;

describe("where a run ended converged", () => {
  it("is set by the run that converged, of the geometry it ended at: an optimisation, a saddle point's", () => {
    const opt = worked(workedOf("optimise", water(), output([water().xyz, MIN], { optimised: true }), ["cclib 1.9rc1"]));
    expect(opt.converged).toEqual({ how: "optimisation", geometry: geometryKey(MIN) });
    expect(said(opt)).toBe("optimisation");
    const ts = worked(workedOf("saddle-point", water(), output([water().xyz, MIN], { optimised: true }), ["cclib 1.9rc1"]));
    expect(said(ts)).toBe("saddle point optimisation");
    // (one the reader says did not converge, or cannot say: none)
    const not = worked(workedOf("optimise", water(), output([water().xyz, MIN], { optimised: false }), ["cclib 1.9rc1"]));
    expect([not.converged, said(not)]).toEqual([undefined, undefined]);
    expect(worked(workedOf("optimise", water(), output([water().xyz, MIN]), ["cclib 1.9rc1"])).converged).toBeUndefined();
    expect(worked(workedOf("saddle-point", water(), output([water().xyz, MIN]), ["cclib 1.9rc1"])).converged).toBeUndefined();
    // (a single point, frequencies of a geometry none converged at: none)
    expect(worked(workedOf("frequencies", water(), output([water().xyz]), ["cclib 1.9rc1"])).converged).toBeUndefined();
  });

  it("is carried by Frequencies and a single point at that geometry still, and kept with the molecule they make", () => {
    // (the optimisation's entry as the next step takes it: its own geometry, its way there kept with its molecule)
    const { path: _path, pathEnergies: _energies, ...opt } = worked(workedOf("optimise", water(), output([water().xyz, MIN], { optimised: true }), ["cclib 1.9rc1"]));
    // (frequencies given back the geometry as the program printed it - turned and moved, its shape the same)
    const turned = [1, 2, 3, 1, 2.97, 3, 1.94, 1.75, 3];
    const freq = worked(workedOf("frequencies", opt, output([turned]), ["cclib 1.9rc1"]));
    expect(freq.converged).toEqual({ how: "optimisation", geometry: geometryKey(turned) });
    expect(said(freq)).toBe("optimisation");
    const sp = worked(workedOf("energy", freq, output([turned]), ["cclib 1.9rc1"]));
    expect(said(sp)).toBe("optimisation");
    // (the molecule it makes, and the next step's entry of it)
    const [m] = resultsOf({ ok: true, holds: "molecules", kept: [sp], aside: [], said: "" }, "energy").molecules;
    expect(m.converged).toEqual([{ how: "optimisation", geometry: geometryKey(turned) }]);
    const [next] = setEntries([{ ...m, id: 1, at: { x: 0, y: 0 } }], "molecules");
    expect(said(next)).toBe("optimisation");
  });

  it("is dropped by what moves the geometry, and by a failed run: one started from its geometry stands on no converged run", () => {
    const opt = worked(workedOf("optimise", water(), output([water().xyz, MIN], { optimised: true }), ["cclib 1.9rc1"]));
    // (frequencies given back another shape: not of that geometry)
    const moved = [0, 0, 0, 1.05, 0, 0, -0.25, 0.94, 0];
    expect(worked(workedOf("frequencies", opt, output([moved]), ["cclib 1.9rc1"])).converged).toBeUndefined();
    // (a step of Meno's that moves the atoms, its entry as it came but at another geometry: the record of another counts for none)
    const displaced = { ...opt, xyz: moved };
    expect([convergedOf(displaced), said(displaced)]).toEqual([undefined, undefined]);
    // (a run that stopped, out of Failed - and Frequencies on it: none)
    const stopped = water(MIN, { failed: { kind: "program-error", why: "ORCA finished by error termination in SCF" } });
    expect(said(stopped)).toBeUndefined();
    expect(worked(workedOf("frequencies", stopped, output([MIN]), ["cclib 1.9rc1"])).converged).toBeUndefined();
    // (and a failed entry with a record still: none either)
    expect(convergedOf({ ...opt, failed: { kind: "failed", why: "x" } })).toBeUndefined();
  });

  it("marks a path search's point refined, and that frame alone", () => {
    const frames = [0.96, 1.1, 1.2, 1.4].map((d) => [0, 0, 0, d, 0, 0, -0.24, 0.93, 0]);
    const out = output(frames, {
      converged: [false, false, true, false],
      results: [{ id: "path.frame", on: "frames", group: "Path", label: "What it is", values: ["NEB image 1 of 3", "NEB image 2 of 3", REFINED_SAID, "NEB image 3 of 3"] }],
    } as never);
    const w = worked(workedOf("path-search", { ...water(frames[0], { calc: { readers: [], method: "GFN2-xTB", optimised: true } }), end: water(frames[3], { calc: { readers: [], method: "GFN2-xTB", optimised: true } }) }, out, ["orca"]));
    expect(w.converged).toEqual({ how: REFINED_SAID, geometry: geometryKey(frames[2]) });
    const [m] = resultsOf({ ok: true, holds: "molecules", kept: [w], aside: [], said: "" }, "path-search").molecules;
    expect(m.converged).toEqual([null, null, { how: REFINED_SAID, geometry: geometryKey(frames[2]) }, null]);
    expect(CONVERGED_HOW).toContain(REFINED_SAID);
  });

  it("is Meno's alone: an entry's own property of the name never stands, and Filter selects on it", () => {
    const own = { converged: { value: "optimisation", unit: "none" as const, status: "computed" as const } };
    const claimed = water(MIN, { properties: own });
    expect(said(claimed)).toBeUndefined();
    expect(shadowedIn(claimed)).toEqual(["converged"]);
    const opt = worked(workedOf("optimise", water(), output([water().xyz, MIN], { optimised: true }), ["cclib 1.9rc1"]));
    const o = runMeno("filter", [opt, water(MIN)], "molecules", { conditions: "converged = optimisation" });
    expect(o.ok && o.kept).toEqual([opt]);
    // (with an entry claiming it among them: which is meant is not guessed - Filter's rule for any name Meno gives)
    expect(runMeno("filter", [opt, claimed], "molecules", { conditions: "converged = optimisation" })).toEqual({ ok: false, said: `"converged" is Meno's own, and 1 entry carries one of its own by that name too: which is meant cannot be told` });
  });

  it("goes with the frames a step takes of a conformer set, each its own; and through a file and back", () => {
    const xyz = (d: number) => [0, 0, 0, d, 0, 0, -0.24, 0.93, 0];
    const m = { id: 1, at: { x: 0, y: 0 }, atoms: water(xyz(0.95)).atoms.map((a, k) => ({ ...a, x: xyz(0.95)[3 * k], y: xyz(0.95)[3 * k + 1], z: xyz(0.95)[3 * k + 2] })), bonds: water().bonds, frames: [xyz(0.96), xyz(0.97)], conformerSet: true, converged: [convergedAt("optimisation", xyz(0.95)), null, convergedAt("optimisation", xyz(0.97))] } as unknown as Molecule3D;
    const taken = framesMolecule(m, [2, 0]);
    expect(taken.converged).toEqual([convergedAt("optimisation", xyz(0.97)), convergedAt("optimisation", xyz(0.95))]);
    expect(setEntries([{ ...taken, id: 2, at: { x: 0, y: 0 } } as Molecule3D], "conformers").map(said)).toEqual(["optimisation", "optimisation"]);
    expect(framesMolecule(m, [1]).converged).toBeUndefined();
    const back = readCarried3D(JSON.parse(JSON.stringify(m)));
    expect(back?.converged).toEqual(m.converged);
    // (records that do not read: none - said - never one assumed)
    expect(readCarried3D({ ...JSON.parse(JSON.stringify(m)), converged: [{ how: "minimum", geometry: "g" }, null, null] })?.converged).toBeUndefined();
    expect(readCarried3D({ ...JSON.parse(JSON.stringify(m)), converged: [null] })?.converged).toBeUndefined();
  });

  it("reads back from a file as it was written, and nothing else", () => {
    expect(convergedIn({ how: "optimisation", geometry: "g1" })).toEqual({ how: "optimisation", geometry: "g1" });
    for (const bad of [{ how: "minimum", geometry: "g1" }, { how: "optimisation" }, { how: "optimisation", geometry: "" }, "optimisation", null]) expect(convergedIn(bad)).toBeNull();
  });
});
