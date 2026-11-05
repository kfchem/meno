import { describe, expect, it } from "vitest";
import type { ReaderOutput } from "../../../../lib/calc/output";
import { calcLine } from "../../../../lib/calc/output";
import { acceptManifest } from "../../../../lib/plugins/manifest";
import type { Restraint } from "../../../../lib/entry";
import TIGHTBIND from "../../../../test/plugins/tightbind/manifest.json?raw";
import { optionsFor } from "./doers";
import { convergedOf, heldWhy } from "./converged";
import { HOLD_OPTION } from "./kinds";
import { notAllMinima } from "./meno";
import { fixedAtoms, heldAsked, heldRefused, isFailure, workedOf } from "./programs";
import type { SetEntry } from "./entries";
import type { Worked } from "./run";

// *Hold its restraints* (docs/WORKFLOWS.md): an optimisation that holds an entry's atoms fixed where they stand, where its
// plugin says its program can - on the made-up test plugins (src/test/plugins: Tightbind's optimisation says it can).

/** Water, as a step's entry, at `xyz`, with `restraints` where given. */
const water = (restraints: Restraint[] = [], xyz = [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0]): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz,
    ...(restraints.length ? { properties: { restraints: { value: { restraints }, unit: "none", status: "computed" } } } : {}),
  }) as unknown as SetEntry;

const MIN = [0, 0, 0, 0.97, 0, 0, -0.25, 0.94, 0];
const output = (more: Partial<ReaderOutput> = {}): ReaderOutput =>
  ({ schema: 1, program: "Tightbind", method: "TB2", atoms: ["O", "H", "H"], frames: [[0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0], MIN], energies: [-5.07, -5.08], optimised: true, ...more }) as unknown as ReaderOutput;
const worked = (w: ReturnType<typeof workedOf>): Worked => {
  if (isFailure(w)) throw new Error(w.why);
  return w as Worked;
};

describe("holding an entry's restraints as it is optimised", () => {
  it("is declared by a plugin's step of a kind that may hold them, and only atoms fixed", () => {
    // (Tightbind's manifest, its steps said anew)
    const tightbind = JSON.parse(TIGHTBIND) as Record<string, unknown>;
    const m = acceptManifest({
      ...tightbind,
      steps: [
        { kinds: ["optimise", "saddle-point", "energy"], programs: ["tightbind"], restraints: ["fixed", "distance"] },
        { kinds: ["frequencies"], programs: ["tightbind"], restraints: ["fixed"] },
      ],
    })!;
    expect(m.steps.map((s) => [s.kind, s.restraints])).toEqual([
      ["optimise", ["fixed"]],
      ["saddle-point", ["fixed"]],
      ["energy", undefined],
      ["frequencies", undefined],
    ]);
  });

  it("is offered on the step's card, Meno's, only where its plugin says its program can: no by default", () => {
    expect(optionsFor("optimise", "tightbind")[0]).toEqual(HOLD_OPTION);
    expect(HOLD_OPTION.default).toBe("no");
    expect(optionsFor("optimise", "confsweep").some((o) => o.id === HOLD_OPTION.id)).toBe(false);
    expect(optionsFor("energy", "quanta").some((o) => o.id === HOLD_OPTION.id)).toBe(false);
    expect(heldAsked("optimise", { hold: "fixed" })).toEqual(["fixed"]);
    expect(heldAsked("optimise", { hold: "no" })).toEqual([]);
    expect(heldAsked("energy", { hold: "fixed" })).toEqual([]);
  });

  it("takes an entry's atoms fixed, from 0, each once; and refuses one whose restraints hold what it does not, naming it", () => {
    const both = water([
      { kind: "fixed", atoms: [2, 0] },
      { kind: "fixed", atoms: [0] },
      { kind: "distance", atoms: [1, 2], value: 1.5, strength: 500 },
    ]);
    expect(fixedAtoms(both)).toEqual([0, 2]);
    expect(fixedAtoms(water())).toEqual([]);
    expect(heldRefused(both, ["fixed"])).toBe("Its restraints hold distances, which this step does not hold - only atoms fixed: take them off (Restraints), or hold none");
    expect(heldRefused(both, [])).toBeNull();
    expect(heldRefused(water([{ kind: "fixed", atoms: [1] }]), ["fixed"])).toBeNull();
  });

  it("says the atoms it held in its calculation's line, from 1, and how it converged - no stationary point", () => {
    const e = water([{ kind: "fixed", atoms: [0, 2] }]);
    const held = worked(workedOf("optimise", e, output(), ["tightbind 0.2.0"], undefined, fixedAtoms(e)));
    expect(calcLine(held.calc!)).toContain("atoms 1, 3 held");
    expect(convergedOf(held)).toMatchObject({ how: "optimisation with atoms held", held: [0, 2] });
    expect(heldWhy(convergedOf(held))).toBe("Optimised with atoms 1, 3 held where they stood: no stationary point - optimise it free of them first");
    // (asked to hold none: as ever)
    const free = worked(workedOf("optimise", e, output(), ["tightbind 0.2.0"]));
    expect(calcLine(free.calc!)).not.toContain("held");
    expect(convergedOf(free)?.how).toBe("optimisation");
    expect(heldWhy(convergedOf(free))).toBeNull();
    // (Frequencies at that geometry carry how it converged, and so what it held)
    const freq = worked(workedOf("frequencies", held, output({ frames: [MIN], optimised: undefined }), ["tightbind 0.2.0"]));
    expect(convergedOf(freq)?.held).toEqual([0, 2]);
  });

  it("is no minimum for a step that takes minima, until it is optimised free of them", () => {
    const e = water([{ kind: "fixed", atoms: [1] }]);
    const held = worked(workedOf("optimise", e, output(), ["tightbind 0.2.0"], undefined, fixedAtoms(e)));
    expect(notAllMinima([held])).toBe("a #1: optimised with atom 2 held where it stood: no stationary point - optimise it free of it first");
    const again = worked(workedOf("optimise", held, output({ frames: [MIN, [0, 0, 0, 0.98, 0, 0, -0.25, 0.95, 0]] }), ["tightbind 0.2.0"]));
    expect(notAllMinima([again])).toBeNull();
  });
});
