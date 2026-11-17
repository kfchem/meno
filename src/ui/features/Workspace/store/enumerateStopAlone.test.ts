/**
 * Enumerate stopped from the store while its products are made in their worker (workflow/enumerateOff): the step put in nothing
 * and said stopped, and another Enumerate step running at the same time on the same worker going on, its run not stopped with it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  rolePlugin: () => ({ id: "stand-in", name: "Stand-in" }),
  chemAtHand: async () => true,
  chemWorker: async () => ({ request: async () => ({ atoms: [], bonds: [] }) }),
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { template } from "../workflow/testdata/enumerationCases";
import { enumerateWorkerMade } from "../workflow/enumerateOff";

/** A worker that never answers: what it was sent, by message, and how many were made and ended. */
const seen = { made: 0, ended: 0, sent: [] as number[] };
class Silent {
  onmessage = null;
  onerror = null;
  constructor() {
    seen.made++;
  }
  postMessage(m: { id: number }) {
    seen.sent.push(m.id);
  }
  terminate() {
    seen.ended++;
  }
}

/** A phenyl R1, wired into two Enumerate steps. */
function page() {
  const doc = createWorkspaceDocument();
  doc.edit("draw", (d) => ({ ...d, model: template("*c1ccccc1"), nextId: 5000 }));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const set = st().addSet({ x0: -50, y0: -50, x1: 50, y1: 50 });
  const steps = [0, 1].map((k) => {
    const step = st().addStep("enumerate", "meno", 80, 300 * k);
    st().updateStep(step, { options: { lists: "R1: Me\nCl" } });
    st().connect({ set }, step);
    return step;
  });
  return { st, steps };
}

afterEach(() => {
  delete (globalThis as { Worker?: unknown }).Worker;
});

describe("Enumerate stopped while its worker makes its products", () => {
  it("puts nothing in and says it stopped; another Enumerate running on the same worker goes on", async () => {
    (globalThis as { Worker?: unknown }).Worker = Silent;
    enumerateWorkerMade(() => new Silent() as unknown as Worker);
    const { st, steps } = page();
    const [a, b] = steps;
    const runA = st().runStep(a);
    const runB = st().runStep(b);
    await vi.waitFor(() => expect(seen.sent).toHaveLength(2));
    st().stopStep(a);
    await runA;
    const ranA = st().steps.find((s) => s.id === a)!.ran!;
    expect(ranA).toMatchObject({ ok: false, stopped: true });
    expect(st().sets.find((x) => x.made?.step === a)?.members ?? []).toEqual([]);
    // (the other still running: its products asked again of a worker made anew, never said stopped)
    expect(st().menoWorking[b]).toBeDefined();
    expect(st().steps.find((s) => s.id === b)!.ran).toBeUndefined();
    expect([seen.made, seen.ended, seen.sent.length]).toEqual([2, 1, 3]);
    st().stopStep(b);
    await runB;
    expect(st().steps.find((s) => s.id === b)!.ran).toMatchObject({ ok: false, stopped: true });
  });
});
