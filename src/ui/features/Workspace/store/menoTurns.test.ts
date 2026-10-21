/**
 * Meno's Duplicates run from the page in turns (workflow/meno
 * `runMenoInTurns`): its card says it is running, and how far, while it
 * works; its results go in at the end as one edit; Run pressed again
 * meanwhile starts nothing more.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Its turns, as the test has them: one an entry, each waiting to be let go where the gate is shut. */
const gate = { shut: false, waiting: [] as (() => void)[] };
vi.mock("../workflow/meno", async (actual) => {
  const meno = await actual<typeof import("../workflow/meno")>();
  return {
    ...meno,
    runMenoInTurns: (...args: Parameters<typeof meno.runMenoInTurns>) =>
      meno.runMenoInTurns(args[0], args[1], args[2], args[3], args[4], {
        ...args[5],
        slice: 0,
        tell: 0,
        pause: () => (gate.shut ? new Promise<void>((go) => gate.waiting.push(go)) : Promise.resolve()),
      }),
  };
});

/** The gate opened, and the turns waiting let go. */
function open() {
  gate.shut = false;
  for (const go of gate.waiting.splice(0)) go();
}
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
  beforeEach(() => {
    gate.shut = false;
    gate.waiting.length = 0;
  });

  it("is stopped from its menu at its next turn: nothing put in, and its card says it was stopped", async () => {
    const { st, step, doc } = page(many());
    gate.shut = true;
    const ran = st().runStep(step);
    // (held at a turn, part of the way through)
    await vi.waitFor(() => expect(gate.waiting).toHaveLength(1));
    expect(st().menoWorking[step]?.done).toBeGreaterThan(0);
    st().stopStep(step);
    open();
    await ran;
    expect(st().menoWorking[step]).toBeUndefined();
    const after = st().steps.find((s) => s.id === step)!;
    expect(after.ran).toMatchObject({ ok: false, stopped: true, said: expect.stringMatching(/^Stopped after \d+:\d\d$/) });
    expect(stateOf(doc.getState(), after, "meno")).toBe("stopped");
    // (its exits' sets as they were: not run)
    expect(st().sets.filter((b) => b.made?.step === step && b.made.holds)).toHaveLength(0);
  });

  it("puts in what it worked out of what came in when it started, where that changed while it worked - and is changed", async () => {
    const { st, step, doc } = page(many());
    gate.shut = true;
    const ran = st().runStep(step);
    // (held at a turn, part of the way through)
    await vi.waitFor(() => expect(gate.waiting).toHaveLength(1));
    expect(st().menoWorking[step]?.done).toBeGreaterThan(0);
    // (the molecule moved out of its set meanwhile)
    doc.edit("move", (d) => ({ ...d, molecules3d: d.molecules3d!.map((m) => ({ ...m, at: { x: 50, y: 50 } })) }));
    open();
    await ran;
    const after = st().steps.find((s) => s.id === step)!;
    expect(after.ran).toMatchObject({ ok: true });
    expect(stateOf(doc.getState(), after, "meno")).toBe("changed");
    // (both its exits' sets filled: what it kept, and what it set aside)
    expect(st().sets.filter((b) => b.made?.step === step && b.made.holds)).toHaveLength(2);
  });

  it("puts in nothing where it was deleted while it worked", async () => {
    const { st, step } = page(many());
    gate.shut = true;
    const ran = st().runStep(step);
    // (held at a turn, part of the way through)
    await vi.waitFor(() => expect(gate.waiting).toHaveLength(1));
    expect(st().menoWorking[step]?.done).toBeGreaterThan(0);
    st().removeStep(step);
    open();
    await ran;
    expect(st().steps.some((s) => s.id === step)).toBe(false);
    expect(st().sets).toHaveLength(1);
    expect(st().menoWorking[step]).toBeUndefined();
  });

  it("says it is running while it works, and puts its results in at the end, as one edit", async () => {
    const { doc, st, step } = page(waters());
    const ran = st().runStep(step);
    // (working: its card running, not all of its entries through yet)
    expect(st().menoWorking[step]).toMatchObject({ total: 3 });
    expect(st().menoWorking[step]!.done).toBeLessThan(3);
    void st().runStep(step);
    await ran;
    expect(st().menoWorking[step]).toBeUndefined();
    const after = st().steps.find((s) => s.id === step)!;
    expect(after.ran).toMatchObject({ ok: true, said: "0:00 \u00b7 2 of 3 kept" });
    expect(st().sets.filter((b) => b.made?.step === step && b.made.holds)).toHaveLength(2);
    expect(doc.history().undoLabel).toBe("run");
  });
});
