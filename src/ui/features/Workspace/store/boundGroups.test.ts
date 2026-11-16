/**
 * Options from a property on a plugin's step run as jobs (docs/WORKFLOWS.md, *Options from a property*): the entries grouped by the
 * values they take, one prepare for each group with its values; one that cannot take them refused before anything is sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Each prepare asked: its options and how many entries it was given - each answered with one job for all of them. */
const asked: { options: Record<string, unknown>; entries: number }[] = [];
vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  pluginClient: async () => ({
    version: "1",
    run: async () => {
      throw new Error("not asked at once");
    },
    prepare: async (_kind: string, entries: unknown[], options: Record<string, unknown>) => {
      asked.push({ options, entries: entries.length });
      return { jobs: [{ entries: entries.map((_, i) => i), program: "tb", args: ["in.xyz"], files: [], reads: [] }] };
    },
  }),
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import type { Molecule3D } from "./types";
import type { Property } from "../../../../lib/entry";
import { useReaders } from "../../../../lib/calc/workers";
import { PLUGINS } from "../../../../lib/calc/catalog";
import type { Option } from "../../../../lib/options";

useReaders.setState({ state: Object.fromEntries(PLUGINS.map((p) => [p.id, "added" as const])), problem: {} });

/** A water in 3D at `x`, carrying `n` (no unit) where given. */
const water = (id: number, x: number, n?: number): Molecule3D => ({
  id,
  atoms: [
    { el: "O", x, y: 0, z: 0 },
    { el: "H", x, y: 0.76, z: 0.59 },
    { el: "H", x, y: -0.76, z: 0.59 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  at: { x, y: 0 },
  ...(n != null ? { properties: [{ n: { value: n, unit: "none", status: "computed" } as Property }] } : {}),
});

/** Tightbind's Optimise given a number option of its own for the test, and that taken away after. */
function withSteps() {
  const decl = PLUGINS.find((p) => p.id === "tightbind")!.steps.find((s) => s.kind === "optimise") as unknown as { options?: Option[] };
  const was = decl.options;
  decl.options = [...(was ?? []), { id: "cycles", label: "Cycles", type: "number", default: 100, min: 1, whole: true }];
  return () => (decl.options = was);
}

describe("a plugin's step run as jobs, an option taken from a property", () => {
  beforeEach(() => void (asked.length = 0));
  let restore = () => {};
  afterEach(() => restore());

  it("is prepared once for each value, with that value; an entry with none refused before anything is sent", async () => {
    restore = withSteps();
    const doc = createWorkspaceDocument();
    doc.edit("waters", (d) => ({ ...d, molecules3d: [water(1, 0, 10), water(2, 20, 20), water(3, 40, 10), water(4, 60)], nextMolecule3dId: 5 }));
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const step = st().addStep("optimise", "tightbind", 200, 0);
    st().updateStep(step, { bound: { cycles: "n" } });
    st().connect({ set: st().addSet({ x0: -3, y0: -3, x1: 63, y1: 3 }) }, step);
    await st().runStep(step);
    // (two prepares: n = 10 for the first and third, 20 for the second - the fourth, with no n, never sent; the jobs then cannot
    //  start here, with no backend)
    expect(asked.map((a) => [a.options.cycles, a.entries])).toEqual([
      [10, 2],
      [20, 1],
    ]);
  });

  it("is said on the step's line as = n", async () => {
    restore = withSteps();
    const { howOf } = await import("../workflow/kinds");
    const decl = PLUGINS.find((p) => p.id === "tightbind")!.steps.find((s) => s.kind === "optimise") as unknown as { options: Option[] };
    expect(howOf(decl.options.filter((o) => o.id === "cycles"), {}, undefined, { cycles: "n" })).toBe("= n");
  });
});
