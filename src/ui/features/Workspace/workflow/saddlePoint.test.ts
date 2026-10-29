import { describe, expect, it } from "vitest";
import type { ReaderOutput } from "../../../../lib/calc/output";
import type { SetEntry } from "./entries";
import { inputsOf } from "./kinds";
import { isFailure, pluginEntry, workedOf } from "./programs";
import type { Worked } from "./run";

/** Ammonia, its nitrogen out of the plane by `z`: a guess at its inversion's saddle point. */
const nh3 = (z = 0.1): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: [{ el: "N" }, { el: "H" }, { el: "H" }, { el: "H" }],
    bonds: [1, 2, 3].map((a2) => ({ a1: 0, a2, order: 1 })),
    xyz: [0, 0, z, 1.01, 0, 0, -0.505, 0.8747, 0, -0.505, -0.8747, 0],
  }) as unknown as SetEntry;

/** What ORCA's OptTS read back: its way there, frame by frame, its energies, and whether it converged. */
const optts = (frames: readonly (readonly number[])[], optimised: boolean): ReaderOutput =>
  ({ schema: 1, program: "ORCA", method: "GFN2-xTB", atoms: ["N", "H", "H", "H"], frames: frames.map((f) => [...f]), energies: frames.map((_, k) => -4.4169 + k * 1e-4), optimised }) as unknown as ReaderOutput;

describe("Optimise to a saddle point", () => {
  it("takes guesses, and a reactant and a product side - both or neither", () => {
    expect(inputsOf("saddle-point").map((p) => [p.id, p.optional ?? false, p.together ?? null])).toEqual([
      ["guesses", false, null],
      ["reactant", true, "product"],
      ["product", true, "reactant"],
    ]);
  });

  it("gives each guess its optimisation: its way there as frames, its last geometry its entry", () => {
    const frames = [nh3(0.1).xyz, nh3(0.05).xyz, nh3(0.0).xyz];
    const w = workedOf("saddle-point", nh3(), optts(frames, true), ["cclib 1.9rc1"]) as Worked;
    expect(isFailure(w)).toBe(false);
    expect([w.xyz[2], w.path?.length, w.failed]).toEqual([0, 2, undefined]);
  });

  it("keeps an optimisation that did not converge, at the last geometry it reached, out of Failed", () => {
    const frames = [nh3(0.1).xyz, nh3(0.07).xyz];
    const w = workedOf("saddle-point", nh3(), optts(frames, false), ["cclib 1.9rc1"]) as Worked;
    expect([w.xyz[2], w.failed?.kind]).toEqual([0.07, "not-converged"]);
  });

  it("gives a plugin each guess with its sides beside it, as they are", () => {
    const g = { ...nh3(), sides: { reactant: nh3(0.4), product: nh3(-0.4) } };
    const sent = pluginEntry(g) as unknown as { atoms: { z: number }[]; sides: { reactant: { atoms: { z: number }[] }; product: { atoms: { z: number }[] } } };
    expect([sent.atoms[0].z, sent.sides.reactant.atoms[0].z, sent.sides.product.atoms[0].z]).toEqual([0.1, 0.4, -0.4]);
  });
});
