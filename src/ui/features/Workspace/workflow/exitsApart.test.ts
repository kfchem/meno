import { describe, expect, it } from "vitest";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import type { Frame } from "./entries";
import { resultOf } from "./flow";
import { exitsOf, type StepKind } from "./kinds";
import { BETWEEN } from "./look";
import { addSet, addStep, connect } from "./model";
import { fitResultSets, runStep, type RunWith } from "./run";

/** Each molecule reaching `r` Å about its middle, as a look draws it. */
const reaching = (r: number): RunWith["extentOf"] => () => ({ x0: -r, x1: r, y0: -r, y1: r });
const W = (r: number): RunWith => ({ extentOf: reaching(r), byOf: () => "meno", now: 1 });

/** A conformer set of water: its frames' energies as given, each frame a little apart from the last. */
function water(x: number, energies: number[]): Omit<Molecule3D, "id"> {
  return {
    at: { x, y: 0 },
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: -0.24, y: 0.93, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    frames: energies.slice(1).map((_, k) => [0, 0, 0, 0.97 + 0.03 * k, 0, 0, -0.24, 0.94, 0.2 * k]),
    conformerSet: true,
    energies,
  };
}

/** Two compounds - four conformers and two - into a step of `kind` (set 1 into step 2), run with each molecule reaching `r`. */
function ran(kind: StepKind, options: Record<string, string | number>, r: number): WorkspaceDocument {
  let doc = addMolecule3d(emptyWorkspaceDocument(), water(0, [-76.4, -76.398, -76.3, -76.4005]));
  doc = addMolecule3d(doc, water(8, [-76.4, -76.3]));
  doc = addSet(doc, { x0: -4, y0: -4, x1: 12, y1: 4 });
  doc = addStep(doc, kind, 16, 0, options);
  return runStep(connect(doc, { set: 1 }, 2), 2, W(r));
}

/** A step's exits' sets, top first: each clear of the one above it by `BETWEEN` at least, and each holding something. */
function apart(doc: WorkspaceDocument): Frame[] {
  const sets = exitsOf(doc.steps![0].kind).map((e) => resultOf(doc, 2, e.id)!);
  for (const s of sets) expect(s.members?.length).toBeGreaterThan(0);
  for (let k = 1; k < sets.length; k++) expect(sets[k].y1).toBeLessThanOrEqual(sets[k - 1].y0 - BETWEEN + 1e-9);
  return sets;
}

describe("a step's two exits, each a conformer set", () => {
  // (each setting aside conformers of a compound it keeps others of: both exits conformer sets)
  const KINDS: [StepKind, Record<string, string | number>][] = [
    ["energy-window", { window: 1 }],
    ["duplicates", { rmsd: 0.05 }],
    ["choose", { which: "lowest" }],
    ["filter", { conditions: "number \u2264 2" }],
  ];

  it.each(KINDS)("lie apart after %s runs - the second under the first, clear of it - in a small look and a big one", (kind, options) => {
    for (const r of [1.2, 3.6]) apart(ran(kind, options, r));
  });

  it.each(KINDS)("lie apart after %s's sets are laid out again in a bigger look, the first grown down onto the second", (kind, options) => {
    const small = ran(kind, options, 1.2);
    const [first] = apart(small);
    const big = fitResultSets(small, reaching(3.6));
    const [grown] = apart(big);
    // (it did grow: the second was taken down with it)
    expect(grown.y0).toBeLessThan(first.y0);
  });
});
