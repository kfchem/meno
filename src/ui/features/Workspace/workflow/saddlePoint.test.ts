import { describe, expect, it } from "vitest";
import type { ReaderOutput } from "../../../../lib/calc/output";
import type { SetEntry } from "./entries";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { inputsOf, kindInfo } from "./kinds";
import { addSet, addStep, connect } from "./model";
import { MOST_PAIRS } from "./pairs";
import { isFailure, pluginEntry, programEntries, workedOf } from "./programs";
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

  it("never passes on as converged an optimisation whose reader could not say whether it converged", () => {
    const { optimised: _, ...unsaid } = optts([nh3(0.1).xyz, nh3(0.0).xyz], true) as ReaderOutput & { optimised?: boolean };
    const w = workedOf("saddle-point", nh3(), unsaid as ReaderOutput, ["cclib 1.9rc1"]) as Worked;
    expect([w.failed?.kind, w.failed?.why]).toEqual(["failed", "Whether the optimisation converged could not be read"]);
  });

  it("gives a plugin each guess with its sides beside it, as they are", () => {
    const g = { ...nh3(), sides: { reactant: nh3(0.4), product: nh3(-0.4) } };
    const sent = pluginEntry(g) as unknown as { atoms: { z: number }[]; sides: { reactant: { atoms: { z: number }[] }; product: { atoms: { z: number }[] } } };
    expect([sent.atoms[0].z, sent.sides.reactant.atoms[0].z, sent.sides.product.atoms[0].z]).toEqual([0.1, 0.4, -0.4]);
  });
});

describe("Optimise to a saddle point, paired each with each", () => {
  /** A page of three sets - 11 guesses, 10 reactant sides, 10 product sides, all ammonia - wired into a step of `kind`, paired each with each. */
  function page(kind: "saddle-point" | "path-search"): WorkspaceDocument {
    let doc = emptyWorkspaceDocument();
    const molecule = (x: number, y: number) => ({
      at: { x, y },
      atoms: [{ el: "N", x: 0, y: 0, z: 0.1 }, { el: "H", x: 1.01, y: 0, z: 0 }, { el: "H", x: -0.505, y: 0.8747, z: 0 }, { el: "H", x: -0.505, y: -0.8747, z: 0 }],
      bonds: [1, 2, 3].map((a2) => ({ a1: 0, a2, order: 1 })),
    });
    const counts = kind === "saddle-point" ? [11, 10, 10] : [11, 10];
    counts.forEach((n, s) => {
      for (let i = 0; i < n; i++) doc = addMolecule3d(doc, molecule(3 * i, 10 * s));
      doc = addSet(doc, { x0: -2, y0: 10 * s - 2, x1: 3 * n, y1: 10 * s + 2 });
    });
    const step = (doc.sets?.length ?? 0) + 1;
    doc = addStep(doc, kind, 100, 0, { pairs: "each" }, "orca");
    const ports = inputsOf(kind).map((p) => p.id);
    counts.forEach((_, s) => (doc = connect(doc, { set: s + 1 }, step, ports[s])));
    return doc;
  }

  it("pairs every guess with every side, as many as they make - At most is Path search's alone, as each of its pairs is a path search run", () => {
    const doc = page("saddle-point");
    const step = doc.steps![0].id;
    const out = programEntries(doc, step, "saddle-point", { pairs: "each" });
    expect(out && "entries" in out ? [out.entries.length, out.refused.length] : out).toEqual([11 * 10 * 10, 0]);
    expect(kindInfo("saddle-point").own?.map((o) => o.id)).toEqual(["pairs", "property"]);
  });

  it("while Path search still refuses more pairs than its At most", () => {
    const doc = page("path-search");
    const step = doc.steps![0].id;
    expect(programEntries(doc, step, "path-search", { pairs: "each" })).toEqual({ why: `Start holds 11 and End 10: each with each makes 110 pairs, and it makes at most ${MOST_PAIRS} - match them on a property instead, or raise At most` });
    expect(kindInfo("path-search").own?.map((o) => o.id)).toEqual(["pairs", "property", "most"]);
  });
});
