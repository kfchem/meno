/**
 * Enumerate as a step, run from the store with a plugin standing in for
 * the checks and the stereoisomers (docs/WORKFLOWS-FOUNDATION.md, *Valence,
 * and stereocentres left open*): what it was checked on is what it makes,
 * and Stop stops it while its products are asked about.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Each request held until let go, where `hold` says so: the checks' and the stereoisomers'. */
const held = { analyse: false, open: false, asked: [] as string[] };
let letGo: Array<() => void> = [];
const waitTurn = (hold: boolean) => (hold ? new Promise<void>((go) => letGo.push(go)) : Promise.resolve());

vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  rolePlugin: () => ({ id: "stand-in", name: "Stand-in" }),
  chemAtHand: async () => true,
  chemWorker: async () => ({
    request: async (op: string) => {
      held.asked.push(op);
      if (op === "analyse") {
        await waitTurn(held.analyse);
        return { atoms: [], bonds: [] };
      }
      if (op === "open_stereo") {
        await waitTurn(held.open);
        return { atoms: [], bonds: [], isomers: 1 };
      }
      throw new Error(`no ${op} here`);
    },
  }),
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { template } from "../workflow/testdata/enumerationCases";

/** A phenyl R1 of the chemist's, wired into Enumerate with `lists`. */
function page(lists: string) {
  const doc = createWorkspaceDocument();
  doc.edit("draw", (d) => ({ ...d, model: template("*c1ccccc1"), nextId: 5000 }));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const set = st().addSet({ x0: -50, y0: -50, x1: 50, y1: 50 });
  const step = st().addStep("enumerate", "meno", 80, 0);
  st().updateStep(step, { options: { lists } });
  st().connect({ set }, step);
  return { st, step };
}

describe("Enumerate as a step, its checks at hand", () => {
  beforeEach(() => {
    Object.assign(held, { analyse: false, open: false, asked: [] });
    letGo = [];
  });

  it("makes what it checked: lists typed on while it is checked are not made, and the card says it has changed", async () => {
    held.analyse = true;
    const { st, step } = page("R1: Me\nCl");
    const run = st().runStep(step);
    await vi.waitFor(() => expect(letGo.length).toBeGreaterThan(0));
    // (an option added while the checks were asked: one they never saw)
    st().updateStep(step, { options: { lists: "R1: Me\nCl\nEt" } });
    held.analyse = false;
    while (letGo.length) letGo.shift()!();
    await run;
    const ran = st().steps.find((s) => s.id === step)!.ran!;
    expect(ran.ok).toBe(true);
    expect(ran.said).toMatch(/^2 made · Duplicates judged by Meno's identity/);
    expect(ran.said).toContain("Valence checked by Stand-in");
    expect(st().sets.find((b) => b.made?.step === step && b.made.exit === "out")!.members).toHaveLength(2);
  });

  it("is stopped while its products are asked about: nothing put in, and said to have stopped", async () => {
    held.open = true;
    const { st, step } = page("R1: Me\nCl\nBr");
    const run = st().runStep(step);
    await vi.waitFor(() => expect(st().menoWorking[step]).toBeDefined());
    await vi.waitFor(() => expect(letGo.length).toBe(1));
    st().stopStep(step);
    while (letGo.length) letGo.shift()!();
    await run;
    const ran = st().steps.find((s) => s.id === step)!.ran!;
    expect(ran).toMatchObject({ ok: false, stopped: true });
    expect(ran.said).toMatch(/^Stopped after /);
    // (asked of the first product alone: the others never)
    expect(held.asked.filter((op) => op === "open_stereo")).toHaveLength(1);
    expect(st().sets.some((b) => b.made?.step === step && (b.members?.length ?? 0) > 0)).toBe(false);
    expect(st().menoWorking[step]).toBeUndefined();
  });

  it("says how many it looked at and found none left open", async () => {
    const { st, step } = page("R1: Me\nCl");
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran!.said).toMatch(/ · No configuration left open \(Stand-in\)$/);
  });
});
