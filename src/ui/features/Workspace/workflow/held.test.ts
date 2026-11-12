import { describe, expect, it } from "vitest";
import type { ReaderOutput } from "../../../../lib/calc/output";
import { calcLine } from "../../../../lib/calc/output";
import { acceptManifest } from "../../../../lib/plugins/manifest";
import type { Restraint } from "../../../../lib/entry";
import TIGHTBIND from "../../../../test/plugins/tightbind/manifest.json?raw";
import { optionsFor } from "./doers";
import { convergedIn, convergedOf, heldWhy } from "./converged";
import { readCarried3D } from "../utils/copyPaste";
import type { Molecule3D } from "../store/types";
import { notAllMinima } from "./meno";
import { fixedAtoms, isFailure, workedOf } from "./programs";
import type { SetEntry } from "./entries";
import type { Worked } from "./run";

// Restraints held (docs/WORKFLOWS.md, *Restraints wired in*): an optimisation that holds an entry's atoms fixed where they stand,
// the rows of a Restraints table wired in for it, where its plugin says its program can - on the made-up test plugins
// (src/test/plugins: Tightbind's optimisation says it can).

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

// (atom 2 moved, atoms 1 and 3 where they began)
const MIN = [0, 0, 0, 0.97, 0, 0, -0.24, 0.93, 0];
const output = (more: Partial<ReaderOutput> = {}): ReaderOutput =>
  ({ schema: 1, program: "Tightbind", method: "TB2", atoms: ["O", "H", "H"], frames: [[0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0], MIN], energies: [-5.07, -5.08], optimised: true, ...more }) as unknown as ReaderOutput;
/** The atoms fixed an entry is given to hold here: those its rows fix. */
const FIXED = (e: SetEntry): Restraint[] => {
  const v = e.properties?.restraints?.value;
  return typeof v === "object" && v !== null && "restraints" in v ? v.restraints : [];
};
const worked = (w: ReturnType<typeof workedOf>): Worked => {
  if (isFailure(w)) throw new Error(w.why);
  return w as Worked;
};

describe("holding an entry's restraints as it is optimised", () => {
  it("is declared by a plugin's step of a kind that may hold them, each kind of restraint it names - restrained or exact", () => {
    // (Tightbind's manifest, its steps said anew)
    const tightbind = JSON.parse(TIGHTBIND) as Record<string, unknown>;
    const m = acceptManifest({
      ...tightbind,
      steps: [
        { kinds: ["optimise", "saddle-point", "energy"], programs: ["tightbind"], restraints: ["fixed", "distance-exact", "angle"] },
        { kinds: ["frequencies", "minimise"], programs: ["tightbind"], restraints: ["fixed"] },
      ],
    })!;
    expect(m.steps.map((s) => [s.kind, s.restraints])).toEqual([
      ["optimise", ["fixed", "distance-exact"]],
      ["saddle-point", undefined],
      ["energy", undefined],
      ["frequencies", undefined],
      ["minimise", ["fixed"]],
    ]);
  });

  it("is asked on no card: what a step holds is what is wired into its Restraints input", () => {
    expect(optionsFor("optimise", "tightbind").some((o) => o.id === "hold")).toBe(false);
  });

  it("takes the atoms rows fix, from 0, each once", () => {
    const rows: Restraint[] = [
      { kind: "fixed", atoms: [2, 0] },
      { kind: "fixed", atoms: [0] },
      { kind: "distance", atoms: [1, 2], value: 1.5, strength: 500 },
    ];
    expect(fixedAtoms(rows)).toEqual([0, 2]);
    expect(fixedAtoms([])).toEqual([]);
  });

  it("says the atoms it held in its calculation's line, from 1, and how it converged - no stationary point", () => {
    const e = water([{ kind: "fixed", atoms: [0, 2] }]);
    const held = worked(workedOf("optimise", e, output(), ["tightbind 0.2.0"], undefined, fixedAtoms(FIXED(e))));
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

  it("fails an entry whose held atom moved, as its program gave it back - never passed on as held", () => {
    const e = water([{ kind: "fixed", atoms: [1] }]);
    // (atom 2 at the end where it began, to well within 1e-4 Å: held)
    const still = [0, 0, 0.001, 0.96, 0, 0.00005, -0.24, 0.93, 0];
    expect(isFailure(workedOf("optimise", e, output({ frames: [[...e.xyz], still] }), ["tightbind 0.2.0"], undefined, fixedAtoms(FIXED(e))))).toBe(false);
    // (moved by a thousandth of an ångström: not held)
    const moved = [0, 0, 0, 0.961, 0, 0, -0.24, 0.93, 0];
    expect(workedOf("optimise", e, output({ frames: [[...e.xyz], moved] }), ["tightbind 0.2.0"], undefined, fixedAtoms(FIXED(e)))).toEqual({ kind: "failed", why: "Atom 2 moved though held" });
  });

  it("goes through a file and back with the atoms it held - a record that does not say them as it must, none", () => {
    const e = water([{ kind: "fixed", atoms: [0, 2] }]);
    const held = worked(workedOf("optimise", e, output(), ["tightbind 0.2.0"], undefined, fixedAtoms(FIXED(e))));
    const m = { id: 1, at: { x: 0, y: 0 }, atoms: e.atoms.map((a, k) => ({ ...a, x: MIN[3 * k], y: MIN[3 * k + 1], z: MIN[3 * k + 2] })), bonds: e.bonds, converged: [held.converged] } as unknown as Molecule3D;
    const back = readCarried3D(JSON.parse(JSON.stringify(m)));
    expect(back?.converged).toEqual([{ how: "optimisation with atoms held", geometry: held.converged!.geometry, held: [0, 2] }]);
    // (what does not read: none - never one of a run that held atoms read back as a free one)
    const g = held.converged!.geometry;
    for (const bad of [[-1], [0.5], [], "0, 2", null]) expect(convergedIn({ how: "optimisation with atoms held", geometry: g, held: bad }), JSON.stringify(bad)).toBeNull();
    expect(convergedIn({ how: "optimisation with atoms held", geometry: g })).toBeNull();
    expect(convergedIn({ how: "optimisation", geometry: g, held: [0] })).toBeNull();
    expect(convergedIn({ how: "saddle point optimisation with atoms held", geometry: g, held: [3] })).toEqual({ how: "saddle point optimisation with atoms held", geometry: g, held: [3] });
  });

  it("is no minimum for a step that takes minima, until it is optimised free of them", () => {
    const e = water([{ kind: "fixed", atoms: [2] }]);
    const held = worked(workedOf("optimise", e, output(), ["tightbind 0.2.0"], undefined, fixedAtoms(FIXED(e))));
    expect(notAllMinima([held])).toBe("a #1: optimised with atom 3 held where it stood: no stationary point - optimise it free of it first");
    const again = worked(workedOf("optimise", held, output({ frames: [MIN, [0, 0, 0, 0.98, 0, 0, -0.25, 0.95, 0]] }), ["tightbind 0.2.0"]));
    expect(notAllMinima([again])).toBeNull();
  });
});
