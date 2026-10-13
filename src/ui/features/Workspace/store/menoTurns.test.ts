/**
 * Meno's Duplicates run from the page in turns (workflow/meno
 * `runMenoInTurns`): its card says it is running, and how far, while it
 * works; its results go in at the end as one edit; Run pressed again
 * meanwhile starts nothing more.
 */
import { describe, expect, it, vi } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import type { Molecule3D } from "./types";
import { stateOf } from "../workflow/flow";

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

/** A page of `m`, in a set wired to Meno's Duplicates: the store, and the step. */
function page(m: Omit<Molecule3D, "id">) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  doc.edit("water", (d) => ({ ...d, molecules3d: [{ ...m, id: 1 }], nextMolecule3dId: 2 }));
  const set = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
  const step = st().addStep("duplicates", "meno", 10, 0);
  st().connect({ set }, step);
  return { doc, st, step };
}

/** Five thousand frames of water, each a hair from the first: work for several turns. */
const many = (): Omit<Molecule3D, "id"> => {
  const w = waters();
  const xyz = w.atoms.flatMap((a) => [a.x, a.y, a.z]);
  const frames = Array.from({ length: 4_999 }, (_, k) => xyz.map((v, i) => v + (i === 3 ? (k % 7) * 1e-4 : 0)));
  return { ...w, frames, energies: Array.from({ length: 5_000 }, (_, k) => -76 + k * 1e-7) };
};

describe("Meno's Duplicates, run from the page", () => {
  it("is stopped from its menu at its next turn: nothing put in, and its card says it was stopped", async () => {
    const { st, step, doc } = page(many());
    const ran = st().runStep(step);
    await vi.waitFor(() => expect(st().menoWorking[step]?.done).toBeGreaterThan(0));
    st().stopStep(step);
    await ran;
    expect(st().menoWorking[step]).toBeUndefined();
    const after = st().steps.find((s) => s.id === step)!;
    expect(after.ran).toMatchObject({ ok: false, stopped: true, said: expect.stringMatching(/^Stopped after \d+:\d\d$/) });
    expect(stateOf(doc.getState(), after, "meno")).toBe("stopped");
    expect(st().sets.filter((b) => b.made?.step === step)).toHaveLength(0);
  });

  it("puts in nothing of what came in before, where that changed while it worked - it says so, and is changed", async () => {
    const { st, step, doc } = page(many());
    const ran = st().runStep(step);
    await vi.waitFor(() => expect(st().menoWorking[step]?.done).toBeGreaterThan(0));
    // (the molecule moved out of its set meanwhile)
    doc.edit("move", (d) => ({ ...d, molecules3d: d.molecules3d!.map((m) => ({ ...m, at: { x: 50, y: 50 } })) }));
    await ran;
    const after = st().steps.find((s) => s.id === step)!;
    expect(after.ran).toMatchObject({ ok: false, said: "What came into it changed while it ran" });
    expect(stateOf(doc.getState(), after, "meno")).toBe("changed");
    expect(st().sets.filter((b) => b.made?.step === step)).toHaveLength(0);
  });

  it("puts in nothing where it was deleted while it worked", async () => {
    const { st, step } = page(many());
    const ran = st().runStep(step);
    await vi.waitFor(() => expect(st().menoWorking[step]?.done).toBeGreaterThan(0));
    st().removeStep(step);
    await ran;
    expect(st().steps.some((s) => s.id === step)).toBe(false);
    expect(st().sets).toHaveLength(1);
    expect(st().menoWorking[step]).toBeUndefined();
  });

  it("says it is running while it works, and puts its results in at the end, as one edit", async () => {
    const { doc, st, step } = page(waters());
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
