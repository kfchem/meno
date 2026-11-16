/**
 * A step's results seen as what they came from (docs/WORKFLOWS.md, *Results*; workflow/run `viewKept`): a water a Filter passes through,
 * its atoms where they were, is turned as the water it came from - face-on in the Input, face-on in the Filter's set - and one the step
 * moved or made is seen as it is first seen.
 */
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import { setMolecules } from "../workflow/entries";
import type { Turn3D } from "./types";

/** Two waters in a set, wired into a Filter that keeps both; the first turned to be seen face-on. */
function page() {
  const doc = createWorkspaceDocument();
  for (const x of [0, 4])
    doc.edit("water", (d) =>
      addMolecule3d(d, {
        atoms: [
          { el: "O", x, y: 0, z: 0 },
          { el: "H", x, y: 0.76, z: 0.59 },
          { el: "H", x, y: -0.76, z: 0.59 },
        ],
        bonds: [
          { a1: 0, a2: 1, order: 1 },
          { a1: 0, a2: 2, order: 1 },
        ],
        at: { x: x - 1, y: 0 },
      }),
    );
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const input = st().addSet({ x0: -3, y0: -3, x1: 7, y1: 3 });
  const f = st().addStep("filter", "meno", 400, 0);
  st().updateStep(f, { options: { conditions: "number ≥ 1", match: "all" } });
  st().connect({ set: input }, f);
  return { st, f };
}

describe("a step's results, seen as what they came from", () => {
  it("turns a water a Filter passed through as the water it came from; one never turned stays as it is first seen (found in the GUI check)", async () => {
    const { st, f } = page();
    const [first, second] = st().molecules3d.map((m) => m.id);
    const faceOn: Turn3D = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    st().setTurn3d(first, faceOn);
    await st().runStep(f);
    const out = setMolecules(st(), st().sets.find((b) => b.made?.step === f && b.made.exit === "out")!);
    expect(out).toHaveLength(2);
    expect(out.map((m) => st().turns3d[m.id])).toEqual([faceOn, undefined]);
    expect(second).toBeDefined();
  });
});
