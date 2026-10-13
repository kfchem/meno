/**
 * Meno's Duplicates run from the page in turns (workflow/meno
 * `runMenoInTurns`): its card says it is running, and how far, while it
 * works; its results go in at the end as one edit; Run pressed again
 * meanwhile starts nothing more.
 */
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import type { Molecule3D } from "./types";

/** A conformer set of three frames of water - the first two alike. */
const waters = (): Omit<Molecule3D, "id"> => {
  const xyz = [0, 0, 0, 0.76, 0.59, 0, -0.76, 0.59, 0];
  return {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.76, y: 0.59, z: 0 },
      { el: "H", x: -0.76, y: 0.59, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    frames: [xyz.map((v, i) => v + (i === 3 ? 0.001 : 0)), xyz.map((v, i) => v + (i === 3 ? 0.4 : 0))],
    energies: [-76, -75.999, -75.99],
    conformerSet: true,
    at: { x: 0, y: 0 },
  };
};

describe("Meno's Duplicates, run from the page", () => {
  it("says it is running while it works, and puts its results in at the end, as one edit", async () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    doc.edit("water", (d) => ({ ...d, molecules3d: [{ ...waters(), id: 1 }], nextMolecule3dId: 2 }));
    const set = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
    const step = st().addStep("duplicates", "meno", 10, 0);
    st().connect({ set }, step);
    const ran = st().runStep(step);
    // (working: its card running, none of its entries through yet)
    expect(st().menoWorking[step]).toMatchObject({ done: 0, total: 3 });
    void st().runStep(step);
    await ran;
    expect(st().menoWorking[step]).toBeUndefined();
    const after = st().steps.find((s) => s.id === step)!;
    expect(after.ran).toMatchObject({ ok: true, said: "2 of 3 kept" });
    expect(st().sets.filter((b) => b.made?.step === step)).toHaveLength(1);
    expect(doc.history().undoLabel).toBe("run");
  });
});
